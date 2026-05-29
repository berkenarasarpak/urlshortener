CREATE DATABASE IF NOT EXISTS urlshortener;
USE urlshortener;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  api_key VARCHAR(64) UNIQUE,
  tier ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
  daily_limit INT DEFAULT 10,
  monthly_clicks_limit INT DEFAULT 1000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  INDEX idx_email (email),
  INDEX idx_api_key (api_key)
);

CREATE TABLE urls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  original_url TEXT NOT NULL,
  short_code VARCHAR(20) UNIQUE NOT NULL,
  custom_slug VARCHAR(50),
  title VARCHAR(255),
  description TEXT,
  clicks INT DEFAULT 0,
  unique_clicks INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP NULL,
  password_hash VARCHAR(255),
  qr_code_url VARCHAR(500),
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_short_code (short_code),
  INDEX idx_user_id (user_id),
  INDEX idx_custom_slug (custom_slug),
  INDEX idx_created_at (created_at),
  INDEX idx_is_active (is_active)
);

CREATE TABLE clicks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  url_id BIGINT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  browser VARCHAR(100),
  browser_version VARCHAR(50),
  os VARCHAR(100),
  os_version VARCHAR(50),
  device_type ENUM('desktop', 'mobile', 'tablet', 'bot', 'unknown') DEFAULT 'unknown',
  country VARCHAR(100),
  city VARCHAR(100),
  region VARCHAR(100),
  referrer TEXT,
  referrer_domain VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
  INDEX idx_url_id (url_id),
  INDEX idx_clicked_at (clicked_at),
  INDEX idx_country (country),
  INDEX idx_device_type (device_type),
  INDEX idx_referrer_domain (referrer_domain)
);

CREATE TABLE rate_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  type ENUM('ip', 'user', 'api_key') NOT NULL,
  requests INT DEFAULT 0,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  window_end TIMESTAMP,
  UNIQUE KEY unique_limit (identifier, type, window_start),
  INDEX idx_identifier (identifier),
  INDEX idx_window_end (window_end)
);

CREATE TABLE api_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INT,
  response_time_ms INT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

INSERT INTO users (email, password, name, api_key, tier, daily_limit) VALUES
('admin@urlshortener.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin User', 'admin_api_key_12345', 'enterprise', 10000);

DELIMITER //

CREATE TRIGGER update_url_clicks AFTER INSERT ON clicks
FOR EACH ROW
BEGIN
  UPDATE urls SET clicks = clicks + 1 WHERE id = NEW.url_id;
END //

DELIMITER ;
