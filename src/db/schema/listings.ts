import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { users } from './users';
import { categories } from './categories';
import { flags, moderationActions } from './moderation';
import { premiumFeatures } from './premium';

// Listings table - represents items for sale in the marketplace
export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(), // UUID
    userId: integer('user_id')
      .notNull()
      .references(() => users.telegramId),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    title: text('title', { length: 100 }).notNull(),
    description: text('description', { length: 1000 }).notNull(),
    priceUsd: real('price_usd').notNull(), // Price in USD with 2 decimal places
    images: text('images', { mode: 'json' }).notNull().$type<string[]>(), // JSON array of image URLs
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at')
      .notNull()
      .$defaultFn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()), // 7 days from creation
    bumpedAt: text('bumped_at'), // Last bump timestamp
    status: text('status', { enum: ['draft', 'active', 'expired', 'sold', 'archived', 'hidden'] })
      .notNull()
      .default('draft'),
    isSticky: integer('is_sticky', { mode: 'boolean' }).notNull().default(false), // Premium sticky status
    isHighlighted: integer('is_highlighted', { mode: 'boolean' }).notNull().default(false), // Premium highlighting
    autoBumpEnabled: integer('auto_bump_enabled', { mode: 'boolean' }).notNull().default(false), // Auto-bump feature
    viewCount: integer('view_count').notNull().default(0),
    contactUsername: text('contact_username').notNull(), // Contact @username from user
    adminNotes: text('admin_notes'), // Admin-only notes
    publishedAt: text('published_at'), // When moved from draft to active
    archivedAt: text('archived_at'), // When archived by user or admin
  },
  table => ({
    userIdIdx: index('listings_user_id_idx').on(table.userId),
    categoryIdIdx: index('listings_category_id_idx').on(table.categoryId),
    statusIdx: index('listings_status_idx').on(table.status),
    createdAtIdx: index('listings_created_at_idx').on(table.createdAt),
    expiresAtIdx: index('listings_expires_at_idx').on(table.expiresAt),
    bumpedAtIdx: index('listings_bumped_at_idx').on(table.bumpedAt),
    priceIdx: index('listings_price_idx').on(table.priceUsd),
    stickyIdx: index('listings_sticky_idx').on(table.isSticky),
    highlightedIdx: index('listings_highlighted_idx').on(table.isHighlighted),
    // Composite indexes for common queries
    categoryStatusIdx: index('listings_category_status_idx').on(table.categoryId, table.status),
    userStatusIdx: index('listings_user_status_idx').on(table.userId, table.status),
    statusExpiresIdx: index('listings_status_expires_idx').on(table.status, table.expiresAt),
    stickyStatusIdx: index('listings_sticky_status_idx').on(table.isSticky, table.status),
  })
);

// Relations
export const listingsRelations = relations(listings, ({ one, many }) => ({
  user: one(users, {
    fields: [listings.userId],
    references: [users.telegramId],
  }),
  category: one(categories, {
    fields: [listings.categoryId],
    references: [categories.id],
  }),
  flags: many(flags),
  moderationActions: many(moderationActions, { relationName: 'listingModerationActions' }),
  premiumFeatures: many(premiumFeatures),
}));

// Zod schemas for validation
export const ListingSchema = z.object({
  id: z.string().uuid(),
  userId: z.number(),
  categoryId: z.number(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  priceUsd: z.number().positive().multipleOf(0.01),
  images: z.array(z.string().url()).min(1).max(9),
  createdAt: z.string(),
  expiresAt: z.string(),
  bumpedAt: z.string().nullable(),
  status: z.enum(['draft', 'active', 'expired', 'sold', 'archived', 'hidden']),
  isSticky: z.boolean(),
  isHighlighted: z.boolean(),
  autoBumpEnabled: z.boolean(),
  viewCount: z.number().min(0),
  contactUsername: z.string(),
  adminNotes: z.string().nullable(),
  publishedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export const CreateListingSchema = z.object({
  categoryId: z.number().positive(),
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description too long'),
  priceUsd: z
    .number()
    .positive('Price must be positive')
    .multipleOf(0.01, 'Price must have at most 2 decimal places')
    .min(0.01, 'Minimum price is $0.01'),
  images: z
    .array(z.string().url('Invalid image URL'))
    .min(1, 'At least one image is required')
    .max(9, 'Maximum 9 images allowed'),
});

export const UpdateListingSchema = z.object({
  categoryId: z.number().positive().optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  priceUsd: z.number().positive().multipleOf(0.01).min(0.01).optional(),
  images: z.array(z.string().url()).min(1).max(9).optional(),
  status: z.enum(['draft', 'active', 'sold', 'archived']).optional(),
  adminNotes: z.string().max(1000).optional(), // Admin-only field
});

export const ListingSearchSchema = z.object({
  q: z.string().optional(), // Search query
  categoryId: z.number().positive().optional(),
  minPrice: z.number().positive().multipleOf(0.01).optional(),
  maxPrice: z.number().positive().multipleOf(0.01).optional(),
  sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'expiring']).default('newest'),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
  userId: z.number().optional(), // For user's own listings
  status: z.enum(['draft', 'active', 'expired', 'sold', 'archived', 'all']).default('active'),
});

// Inferred types
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type CreateListing = z.infer<typeof CreateListingSchema>;
export type UpdateListing = z.infer<typeof UpdateListingSchema>;
export type ListingSearch = z.infer<typeof ListingSearchSchema>;

// Enhanced listing type with related data
export interface ListingWithRelations extends Listing {
  user?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
    profilePhotoUrl?: string | null;
    isAdmin?: boolean;
  };
  category?: {
    id: number;
    name: string;
    parentId: number | null;
    fullPath?: string;
  };
  flagCount?: number;
  premiumFeatures?: Array<{
    type: string;
    expiresAt: string;
    isActive: boolean;
  }>;
  timeLeft?: string; // Human-readable time until expiration
  canBump?: boolean; // Whether user can bump this listing
  canEdit?: boolean; // Whether user can edit this listing
}

// Listing status types
export enum ListingStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  SOLD = 'sold',
  ARCHIVED = 'archived',
  HIDDEN = 'hidden', // Admin action
}

// Helper functions
export function generateListingId(): string {
  return crypto.randomUUID();
}

export function isListingExpired(listing: Listing): boolean {
  return new Date(listing.expiresAt) <= new Date();
}

export function canBumpListing(listing: Listing): boolean {
  if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.EXPIRED) {
    return false;
  }

  // Can bump if not bumped in last 24 hours
  if (listing.bumpedAt) {
    const lastBump = new Date(listing.bumpedAt);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastBump <= dayAgo;
  }

  return true;
}

export function getTimeLeft(listing: Listing): string {
  const now = new Date();
  const expires = new Date(listing.expiresAt);
  const diff = expires.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m`;
}

export function validateListingOwnership(listing: Listing, userId: number): boolean {
  return listing.userId === userId;
}

export function canUserCreateListing(userListingsCount: number, isAdmin: boolean): boolean {
  const MAX_LISTINGS_PER_USER = 20;
  return isAdmin || userListingsCount < MAX_LISTINGS_PER_USER;
}

// State transitions
export const VALID_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  [ListingStatus.DRAFT]: [ListingStatus.ACTIVE, ListingStatus.ARCHIVED],
  [ListingStatus.ACTIVE]: [
    ListingStatus.EXPIRED,
    ListingStatus.SOLD,
    ListingStatus.ARCHIVED,
    ListingStatus.HIDDEN,
  ],
  [ListingStatus.EXPIRED]: [ListingStatus.ACTIVE, ListingStatus.ARCHIVED], // Via bump
  [ListingStatus.SOLD]: [ListingStatus.ARCHIVED],
  [ListingStatus.ARCHIVED]: [], // Terminal state for users
  [ListingStatus.HIDDEN]: [ListingStatus.ACTIVE, ListingStatus.ARCHIVED], // Admin only
};

export function isValidStatusTransition(from: ListingStatus, to: ListingStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

// Listing constraints
export const LISTING_CONSTRAINTS = {
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 1000,
  MIN_PRICE: 0.01,
  MAX_PRICE: 999999.99,
  MIN_IMAGES: 1,
  MAX_IMAGES: 9,
  MAX_LISTINGS_PER_USER: 20,
  EXPIRATION_DAYS: 7,
  MIN_BUMP_INTERVAL_HOURS: 24,
} as const;
