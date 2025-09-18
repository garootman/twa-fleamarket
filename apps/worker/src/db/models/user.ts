import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: text('telegram_id').notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  languageCode: text('language_code'),
  isBot: integer('is_bot', { mode: 'boolean' }).default(false),
  isPremium: integer('is_premium', { mode: 'boolean' }).default(false),

  // User status and verification
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isBanned: integer('is_banned', { mode: 'boolean' }).default(false),
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false),

  // Premium features
  premiumUntil: text('premium_until'), // ISO date string
  premiumTier: text('premium_tier').default('basic'), // basic, premium, vip

  // User preferences
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  preferredLanguage: text('preferred_language').default('en'),
  timezone: text('timezone'),

  // Statistics
  totalListings: integer('total_listings').default(0),
  totalSales: integer('total_sales').default(0),
  totalPurchases: integer('total_purchases').default(0),
  rating: real('rating').default(5.0),
  ratingCount: integer('rating_count').default(0),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  lastActiveAt: text('last_active_at').default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;