import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),

  // Hierarchy support
  parentId: integer('parent_id'),

  // Display and status
  displayOrder: integer('display_order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),

  // Metadata
  icon: text('icon'), // Icon name or emoji
  color: text('color'), // Hex color code

  // Statistics
  listingCount: integer('listing_count').default(0),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;