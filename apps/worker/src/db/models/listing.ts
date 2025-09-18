import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { users } from './user';
import { categories } from './category';

export const listings = sqliteTable('listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Basic listing information
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: real('price').notNull(),
  currency: text('currency').default('USD'),

  // Relationships
  userId: integer('user_id').notNull().references(() => users.id),
  categoryId: integer('category_id').notNull().references(() => categories.id),

  // Status and visibility
  status: text('status').default('draft'), // draft, active, sold, archived, banned
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  isPromoted: integer('is_promoted', { mode: 'boolean' }).default(false),
  isSticky: integer('is_sticky', { mode: 'boolean' }).default(false),

  // Location (optional)
  location: text('location'),
  latitude: real('latitude'),
  longitude: real('longitude'),

  // Images and media
  images: text('images'), // JSON array of image URLs
  thumbnailUrl: text('thumbnail_url'),

  // Contact information
  contactMethod: text('contact_method').default('telegram'), // telegram, phone, email
  contactValue: text('contact_value'),

  // Moderation
  isFlagged: integer('is_flagged', { mode: 'boolean' }).default(false),
  flagReason: text('flag_reason'),
  moderationStatus: text('moderation_status').default('pending'), // pending, approved, rejected
  moderatedBy: integer('moderated_by').references(() => users.id),
  moderationNotes: text('moderation_notes'),

  // Engagement metrics
  viewCount: integer('view_count').default(0),
  saveCount: integer('save_count').default(0),
  shareCount: integer('share_count').default(0),

  // Premium features
  bumpCount: integer('bump_count').default(0),
  lastBumpedAt: text('last_bumped_at'),
  promotedUntil: text('promoted_until'), // ISO date string

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  publishedAt: text('published_at'),
  soldAt: text('sold_at'),
  expiresAt: text('expires_at'),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;