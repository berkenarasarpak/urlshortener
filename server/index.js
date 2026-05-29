const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const useragent = require('useragent');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const memoryCache = new Map();
const rateLimitStore = new Map();

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'urlshortener',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

function toBase62(num) {
  if (num === 0) return '0';
  let result = '';
  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

function fromBase62(str) {
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    result = result * 62 + BASE62_CHARS.indexOf(str[i]);
  }
  return result;
}

function generateShortCode() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return toBase62(timestamp + random);
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function getCache(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlSeconds = 300) {
  memoryCache.set(key, {
    value,
    expiry: Date.now() + (ttlSeconds * 1000)
  });
}

function deleteCache(key) {
  memoryCache.delete(key);
}

function clearExpiredCache() {
  const now = Date.now();
  for (const [key, item] of memoryCache.entries()) {
    if (now > item.expiry) {
      memoryCache.delete(key);
    }
  }
}

setInterval(clearExpiredCache, 60000);

async function checkRateLimit(identifier, type, limit, windowMinutes = 60) {
  const windowKey = `${identifier}:${type}:${Math.floor(Date.now() / (windowMinutes * 60000))}`;
  const current = rateLimitStore.get(windowKey) || 0;
  
  if (current >= limit) {
    return { allowed: false, remaining: 0, resetTime: new Date(Math.ceil(Date.now() / (windowMinutes * 60000)) * windowMinutes * 60000) };
  }
  
  rateLimitStore.set(windowKey, current + 1);
  
  setTimeout(() => {
    rateLimitStore.delete(windowKey);
  }, windowMinutes * 60000);
  
  return { allowed: true, remaining: limit - current - 1 };
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const [users] = await pool.query('SELECT id, email, name, tier, daily_limit, is_active FROM users WHERE id = ?', [user.userId]);
    if (users.length === 0 || !users[0].is_active) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }
    req.user = { ...user, ...users[0] };
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  try {
    const [users] = await pool.query('SELECT id, email, name, tier, daily_limit, is_active FROM users WHERE api_key = ?', [apiKey]);
    if (users.length === 0 || !users[0].is_active) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    req.user = users[0];
    next();
  } catch {
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

const rateLimitMiddleware = (type = 'ip', limits = {}) => async (req, res, next) => {
  const identifier = type === 'ip' ? req.ip : req.user?.id;
  if (!identifier) return next();
  
  const tier = req.user?.tier || 'free';
  const limit = limits[tier] || limits.default || 10;
  
  const rateLimit = await checkRateLimit(identifier, type, limit, 60);
  
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimit.resetTime.toISOString());
  
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  next();
};

app.post('/api/auth/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().isLength({ min: 1 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password, name } = req.body;
    
    try {
      const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existingUsers.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      
      const hashedPassword = await bcrypt.hash(password, 12);
      const apiKey = generateApiKey();
      
      const [result] = await pool.query(
        'INSERT INTO users (email, password, name, api_key, tier, daily_limit) VALUES (?, ?, ?, ?, ?, ?)',
        [email, hashedPassword, name, apiKey, 'free', 10]
      );
      
      const token = jwt.sign(
        { userId: result.insertId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      res.status(201).json({
        token,
        apiKey,
        user: {
          id: result.insertId,
          email,
          name,
          tier: 'free',
          dailyLimit: 10
        }
      });
    } catch {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

app.post('/api/auth/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    try {
      const [users] = await pool.query(
        'SELECT id, email, password, name, api_key, tier, daily_limit, is_active FROM users WHERE email = ?',
        [email]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const user = users[0];
      if (!user.is_active) {
        return res.status(401).json({ error: 'Account disabled' });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      res.json({
        token,
        apiKey: user.api_key,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          dailyLimit: user.daily_limit
        }
      });
    } catch {
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, name, api_key, tier, daily_limit, monthly_clicks_limit, created_at, last_login FROM users WHERE id = ?',
      [req.user.userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[0];
    
    const [urlCount] = await pool.query('SELECT COUNT(*) as count FROM urls WHERE user_id = ?', [user.id]);
    const [clickCount] = await pool.query('SELECT SUM(clicks) as total FROM urls WHERE user_id = ?', [user.id]);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      apiKey: user.api_key,
      tier: user.tier,
      dailyLimit: user.daily_limit,
      monthlyClicksLimit: user.monthly_clicks_limit,
      urlCount: urlCount[0].count,
      totalClicks: clickCount[0].total || 0,
      createdAt: user.created_at,
      lastLogin: user.last_login
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/auth/refresh-api-key', authenticateToken, async (req, res) => {
  try {
    const newApiKey = generateApiKey();
    await pool.query('UPDATE users SET api_key = ? WHERE id = ?', [newApiKey, req.user.userId]);
    res.json({ apiKey: newApiKey });
  } catch {
    res.status(500).json({ error: 'Failed to refresh API key' });
  }
});

app.post('/api/urls',
  authenticateToken,
  rateLimitMiddleware('user', { free: 10, pro: 100, enterprise: 1000, default: 10 }),
  [
    body('originalUrl').isURL(),
    body('customSlug').optional().trim().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_-]+$/)
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { originalUrl, customSlug, title, description, expiresAt, password, tags } = req.body;
    
    try {
      let shortCode;
      
      if (customSlug) {
        const [existing] = await pool.query('SELECT id FROM urls WHERE custom_slug = ? OR short_code = ?', [customSlug, customSlug]);
        if (existing.length > 0) {
          return res.status(409).json({ error: 'Custom slug already in use' });
        }
        shortCode = customSlug;
      } else {
        shortCode = generateShortCode();
        let attempts = 0;
        while (attempts < 5) {
          const [existing] = await pool.query('SELECT id FROM urls WHERE short_code = ?', [shortCode]);
          if (existing.length === 0) break;
          shortCode = generateShortCode();
          attempts++;
        }
      }
      
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const expiryDate = expiresAt ? new Date(expiresAt) : null;
      
      const [result] = await pool.query(
        `INSERT INTO urls (user_id, original_url, short_code, custom_slug, title, description, 
         expires_at, password_hash, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, originalUrl, shortCode, customSlug || null, title, description, expiryDate, passwordHash, JSON.stringify(tags || [])]
      );
      
      const shortUrl = `${BASE_URL}/${shortCode}`;
      
      setCache(`url:${shortCode}`, {
        id: result.insertId,
        originalUrl,
        shortCode,
        passwordHash
      }, 300);
      
      res.status(201).json({
        id: result.insertId,
        shortCode,
        shortUrl,
        originalUrl,
        customSlug: customSlug || null,
        title,
        description,
        expiresAt: expiryDate,
        hasPassword: !!password,
        createdAt: new Date()
      });
    } catch {
      res.status(500).json({ error: 'Failed to create short URL' });
    }
  }
);

app.post('/api/urls/public',
  rateLimitMiddleware('ip', { default: 5 }),
  [body('originalUrl').isURL()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { originalUrl } = req.body;
    
    try {
      const shortCode = generateShortCode();
      
      const [result] = await pool.query(
        'INSERT INTO urls (original_url, short_code) VALUES (?, ?)',
        [originalUrl, shortCode]
      );
      
      const shortUrl = `${BASE_URL}/${shortCode}`;
      
      setCache(`url:${shortCode}`, {
        id: result.insertId,
        originalUrl,
        shortCode,
        passwordHash: null
      }, 300);
      
      res.status(201).json({
        id: result.insertId,
        shortCode,
        shortUrl,
        originalUrl
      });
    } catch {
      res.status(500).json({ error: 'Failed to create short URL' });
    }
  }
);

app.get('/api/urls', authenticateToken, async (req, res) => {
  const { page = 1, limit = 20, search, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
  
  try {
    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.userId];
    
    if (search) {
      whereClause += ' AND (original_url LIKE ? OR title LIKE ? OR short_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const validSortColumns = ['created_at', 'clicks', 'original_url', 'short_code'];
    const orderColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const orderDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    const offset = (page - 1) * limit;
    
    const [urls] = await pool.query(
      `SELECT id, original_url, short_code, custom_slug, title, description, 
       clicks, unique_clicks, is_active, created_at, expires_at, qr_code_url
       FROM urls ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM urls ${whereClause}`,
      params
    );
    
    res.json({
      urls: urls.map(url => ({
        ...url,
        shortUrl: `${BASE_URL}/${url.custom_slug || url.short_code}`,
        tags: url.tags ? JSON.parse(url.tags) : []
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch URLs' });
  }
});

app.get('/api/urls/:id/analytics', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { period = '7d' } = req.query;
  
  try {
    const [urls] = await pool.query(
      'SELECT id, user_id, short_code, custom_slug, clicks FROM urls WHERE id = ?',
      [id]
    );
    
    if (urls.length === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }
    
    const url = urls[0];
    if (url.user_id !== req.user.userId && req.user.tier !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const periodDays = parseInt(period) || 7;
    
    const [totalClicks] = await pool.query(
      'SELECT COUNT(*) as total FROM clicks WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
      [id, periodDays]
    );
    
    const [uniqueClicks] = await pool.query(
      'SELECT COUNT(DISTINCT ip_address) as total FROM clicks WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
      [id, periodDays]
    );
    
    const [clicksByDay] = await pool.query(
      `SELECT DATE(clicked_at) as date, COUNT(*) as count 
       FROM clicks WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(clicked_at) ORDER BY date`,
      [id, periodDays]
    );
    
    const [clicksByCountry] = await pool.query(
      `SELECT country, COUNT(*) as count FROM clicks 
       WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND country IS NOT NULL
       GROUP BY country ORDER BY count DESC LIMIT 10`,
      [id, periodDays]
    );
    
    const [clicksByDevice] = await pool.query(
      `SELECT device_type, COUNT(*) as count FROM clicks 
       WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY device_type`,
      [id, periodDays]
    );
    
    const [clicksByBrowser] = await pool.query(
      `SELECT browser, COUNT(*) as count FROM clicks 
       WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND browser IS NOT NULL
       GROUP BY browser ORDER BY count DESC LIMIT 5`,
      [id, periodDays]
    );
    
    const [clicksByOs] = await pool.query(
      `SELECT os, COUNT(*) as count FROM clicks 
       WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND os IS NOT NULL
       GROUP BY os ORDER BY count DESC LIMIT 5`,
      [id, periodDays]
    );
    
    const [referrers] = await pool.query(
      `SELECT referrer_domain, COUNT(*) as count FROM clicks 
       WHERE url_id = ? AND clicked_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND referrer_domain IS NOT NULL
       GROUP BY referrer_domain ORDER BY count DESC LIMIT 10`,
      [id, periodDays]
    );
    
    const [recentClicks] = await pool.query(
      `SELECT ip_address, country, city, browser, os, device_type, referrer_domain, clicked_at
       FROM clicks WHERE url_id = ? ORDER BY clicked_at DESC LIMIT 50`,
      [id]
    );
    
    res.json({
      urlId: id,
      shortCode: url.short_code,
      customSlug: url.custom_slug,
      totalClicks: url.clicks,
      periodClicks: totalClicks[0].total,
      periodUniqueClicks: uniqueClicks[0].total,
      clicksByDay,
      clicksByCountry,
      clicksByDevice,
      clicksByBrowser,
      clicksByOs,
      referrers,
      recentClicks
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

app.put('/api/urls/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, description, isActive, tags } = req.body;
  
  try {
    const [urls] = await pool.query('SELECT user_id FROM urls WHERE id = ?', [id]);
    if (urls.length === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }
    if (urls[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await pool.query(
      'UPDATE urls SET title = ?, description = ?, is_active = ?, tags = ? WHERE id = ?',
      [title, description, isActive, JSON.stringify(tags || []), id]
    );
    
    deleteCache(`url:${urls[0].short_code}`);
    if (urls[0].custom_slug) {
      deleteCache(`url:${urls[0].custom_slug}`);
    }
    
    res.json({ message: 'URL updated' });
  } catch {
    res.status(500).json({ error: 'Failed to update URL' });
  }
});

app.delete('/api/urls/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [urls] = await pool.query('SELECT short_code, custom_slug FROM urls WHERE id = ? AND user_id = ?', [id, req.user.userId]);
    if (urls.length === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }
    
    await pool.query('DELETE FROM urls WHERE id = ?', [id]);
    
    deleteCache(`url:${urls[0].short_code}`);
    if (urls[0].custom_slug) {
      deleteCache(`url:${urls[0].custom_slug}`);
    }
    
    res.json({ message: 'URL deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete URL' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [urlStats] = await pool.query(
      `SELECT 
        COUNT(*) as totalUrls,
        SUM(clicks) as totalClicks,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as urlsLast24h,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN clicks END) as clicksLast24h
       FROM urls WHERE user_id = ?`,
      [req.user.userId]
    );
    
    const [topUrls] = await pool.query(
      `SELECT short_code, custom_slug, original_url, title, clicks 
       FROM urls WHERE user_id = ? ORDER BY clicks DESC LIMIT 5`,
      [req.user.userId]
    );
    
    const [recentUrls] = await pool.query(
      `SELECT short_code, custom_slug, original_url, title, clicks, created_at 
       FROM urls WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      [req.user.userId]
    );
    
    const [clicksByDay] = await pool.query(
      `SELECT DATE(c.clicked_at) as date, COUNT(*) as count 
       FROM clicks c
       JOIN urls u ON c.url_id = u.id
       WHERE u.user_id = ? AND c.clicked_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(c.clicked_at) ORDER BY date`,
      [req.user.userId]
    );
    
    res.json({
      totalUrls: urlStats[0].totalUrls,
      totalClicks: urlStats[0].totalClicks || 0,
      urlsLast24h: urlStats[0].urlsLast24h,
      clicksLast24h: urlStats[0].clicksLast24h || 0,
      topUrls: topUrls.map(u => ({
        ...u,
        shortUrl: `${BASE_URL}/${u.custom_slug || u.short_code}`
      })),
      recentUrls: recentUrls.map(u => ({
        ...u,
        shortUrl: `${BASE_URL}/${u.custom_slug || u.short_code}`
      })),
      clicksByDay
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

app.get('/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  const password = req.query.p;
  
  try {
    let urlData = getCache(`url:${shortCode}`);
    
    if (!urlData) {
      const [urls] = await pool.query(
        `SELECT id, original_url, short_code, custom_slug, password_hash, is_active, expires_at 
         FROM urls WHERE short_code = ? OR custom_slug = ?`,
        [shortCode, shortCode]
      );
      
      if (urls.length === 0) {
        return res.status(404).json({ error: 'URL not found' });
      }
      
      urlData = urls[0];
      setCache(`url:${shortCode}`, urlData, 300);
    }
    
    if (!urlData.is_active) {
      return res.status(410).json({ error: 'URL has been disabled' });
    }
    
    if (urlData.expires_at && new Date(urlData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'URL has expired' });
    }
    
    if (urlData.password_hash && !password) {
      return res.status(403).json({ error: 'Password required' });
    }
    
    if (urlData.password_hash && password) {
      const isValidPassword = await bcrypt.compare(password, urlData.password_hash);
      if (!isValidPassword) {
        return res.status(403).json({ error: 'Invalid password' });
      }
    }
    
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const geo = geoip.lookup(ip);
    const ua = useragent.parse(req.headers['user-agent']);
    
    const deviceType = ua.isMobile ? 'mobile' : ua.isTablet ? 'tablet' : ua.isBot ? 'bot' : 'desktop';
    
    const referrer = req.headers.referer || req.headers.referrer;
    const referrerDomain = referrer ? new URL(referrer).hostname : null;
    
    const queryParams = new URL(req.url, BASE_URL).searchParams;
    
    pool.query(
      `INSERT INTO clicks (url_id, ip_address, user_agent, browser, browser_version, 
       os, os_version, device_type, country, city, region, referrer, referrer_domain,
       utm_source, utm_medium, utm_campaign) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        urlData.id,
        ip,
        req.headers['user-agent'],
        ua.family,
        ua.major,
        ua.os.family,
        ua.os.major,
        deviceType,
        geo?.country,
        geo?.city,
        geo?.region,
        referrer,
        referrerDomain,
        queryParams.get('utm_source'),
        queryParams.get('utm_medium'),
        queryParams.get('utm_campaign')
      ]
    ).catch(() => {});
    
    res.redirect(urlData.original_url);
  } catch {
    res.status(500).json({ error: 'Redirect failed' });
  }
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {});
