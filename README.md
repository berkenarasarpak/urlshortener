# ShortLink - Professional URL Shortener

A Bitly-like URL shortener with advanced analytics, custom slugs, rate limiting, and JWT authentication. Built with Next.js, Node.js, Express, and MySQL.

## Features

- URL Shortening (Base62 encoding)
- Custom Slugs
- Detailed Analytics (clicks, countries, devices, browsers, referrers)
- JWT Authentication
- Rate Limiting (tier-based)
- Click Tracking (IP, User-Agent, GeoIP)
- In-Memory Cache (Redis-like logic)
- API Key Authentication
- Real-time Dashboard
- Device & Browser Detection
- Geographic Tracking

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: MySQL
- **Cache**: In-Memory (Redis-like logic)
- **Auth**: JWT + API Keys
- **GeoIP**: geoip-lite
- **Rate Limiting**: Custom implementation

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up MySQL database:
   ```bash
   mysql -u root -p < database.sql
   ```

4. Create `.env.local` file:
   ```
   JWT_SECRET=your-secret-key
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your-password
   DB_NAME=urlshortener
   BASE_URL=http://localhost:5000
   FRONTEND_URL=http://localhost:3000
   ```

5. Start the servers:
   
   Backend (Terminal 1):
   ```bash
   npm run server
   ```
   
   Frontend (Terminal 2):
   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`

## Default Admin Account

- Email: `admin@urlshortener.com`
- Password: `password`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get user info
- `POST /api/auth/refresh-api-key` - Refresh API key

### URL Management
- `POST /api/urls` - Create short URL (Auth)
- `POST /api/urls/public` - Create public URL (Rate limited)
- `GET /api/urls` - List user URLs
- `GET /api/urls/:id/analytics` - Get analytics
- `PUT /api/urls/:id` - Update URL
- `DELETE /api/urls/:id` - Delete URL

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Redirect
- `GET /:shortCode` - Redirect to original URL

## Database Schema

### Users
- id, email, password, name, api_key, tier, daily_limit

### URLs
- id, user_id, original_url, short_code, custom_slug, clicks, unique_clicks, is_active

### Clicks
- id, url_id, ip_address, user_agent, browser, os, device_type, country, city, referrer

### Rate Limits
- id, identifier, type, requests, window_start, window_end

## Rate Limits

- **Free Tier**: 10 URLs/day
- **Pro Tier**: 100 URLs/day
- **Enterprise**: 1000 URLs/day

## Cache Strategy

In-memory cache with TTL (Time To Live) for:
- URL lookups (5 minutes)
- Rate limit tracking (sliding window)

## Analytics Tracked

- Total clicks
- Unique clicks (by IP)
- Geographic data (country, city)
- Device type (desktop, mobile, tablet, bot)
- Browser & OS
- Referrer domains
- UTM parameters
- Click timestamps

## Project Structure

```
urlshortener/
├── src/
│   ├── app/              # Next.js pages
│   │   ├── page.tsx      # Landing page
│   │   ├── login/        # Login page
│   │   ├── register/     # Register page
│   │   ├── dashboard/    # Dashboard
│   │   └── analytics/    # Analytics page
│   ├── lib/             # Utilities
│   └── ...
├── server/
│   └── index.js         # Express backend
├── database.sql         # MySQL schema
└── package.json
```
