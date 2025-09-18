-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  is_bot INTEGER DEFAULT 0,
  is_premium INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_banned INTEGER DEFAULT 0,
  is_verified INTEGER DEFAULT 0,
  premium_until TEXT,
  premium_tier TEXT DEFAULT 'basic',
  notifications_enabled INTEGER DEFAULT 1,
  preferred_language TEXT DEFAULT 'en',
  timezone TEXT,
  total_listings INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  total_purchases INTEGER DEFAULT 0,
  rating REAL DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_active_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id INTEGER REFERENCES categories(id),
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  icon TEXT,
  color TEXT,
  listing_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create listings table
CREATE TABLE listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  user_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  status TEXT DEFAULT 'draft',
  is_active INTEGER DEFAULT 0,
  is_promoted INTEGER DEFAULT 0,
  is_sticky INTEGER DEFAULT 0,
  location TEXT,
  latitude REAL,
  longitude REAL,
  images TEXT,
  thumbnail_url TEXT,
  contact_method TEXT DEFAULT 'telegram',
  contact_value TEXT,
  is_flagged INTEGER DEFAULT 0,
  flag_reason TEXT,
  moderation_status TEXT DEFAULT 'pending',
  moderated_by INTEGER REFERENCES users(id),
  moderation_notes TEXT,
  view_count INTEGER DEFAULT 0,
  save_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  bump_count INTEGER DEFAULT 0,
  last_bumped_at TEXT,
  promoted_until TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  sold_at TEXT,
  expires_at TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_listings_user_id ON listings(user_id);
CREATE INDEX idx_listings_category_id ON listings(category_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_is_active ON listings(is_active);
CREATE INDEX idx_listings_created_at ON listings(created_at);

-- Insert default categories
INSERT INTO categories (name, slug, description, display_order) VALUES
  ('Electronics', 'electronics', 'Electronic devices and gadgets', 1),
  ('Clothing', 'clothing', 'Fashion and apparel', 2),
  ('Home & Garden', 'home-garden', 'Home improvement and garden items', 3),
  ('Sports & Recreation', 'sports-recreation', 'Sports equipment and recreational items', 4),
  ('Books & Education', 'books-education', 'Books, courses, and educational materials', 5),
  ('Vehicles', 'vehicles', 'Cars, motorcycles, and other vehicles', 6),
  ('Services', 'services', 'Professional and personal services', 7),
  ('Other', 'other', 'Items that don\'t fit other categories', 8);