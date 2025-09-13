import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { users } from './users';
import { listings } from './listings';

// Premium Features table - represents paid premium features purchased by users
export const premiumFeatures = sqliteTable(
  'premium_features',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.telegramId),
    listingId: text('listing_id').references(() => listings.id), // Optional, for listing-specific features
    featureType: text('feature_type', {
      enum: ['sticky_listing', 'color_highlight', 'auto_bump'],
    }).notNull(),
    starsPaid: integer('stars_paid').notNull(), // Telegram Stars amount paid
    purchasedAt: text('purchased_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at').notNull(), // Feature expiration
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    autoRenewedCount: integer('auto_renewed_count').notNull().default(0), // For auto_bump tracking
    cancelledAt: text('cancelled_at'), // When user cancelled auto-renewing feature
  },
  table => ({
    userIdIdx: index('premium_features_user_id_idx').on(table.userId),
    listingIdIdx: index('premium_features_listing_id_idx').on(table.listingId),
    featureTypeIdx: index('premium_features_feature_type_idx').on(table.featureType),
    expiresAtIdx: index('premium_features_expires_at_idx').on(table.expiresAt),
    isActiveIdx: index('premium_features_is_active_idx').on(table.isActive),
    purchasedAtIdx: index('premium_features_purchased_at_idx').on(table.purchasedAt),
    // Composite indexes for common queries
    userActiveIdx: index('premium_features_user_active_idx').on(table.userId, table.isActive),
    listingActiveIdx: index('premium_features_listing_active_idx').on(
      table.listingId,
      table.isActive
    ),
    typeActiveIdx: index('premium_features_type_active_idx').on(table.featureType, table.isActive),
  })
);

// Relations
export const premiumFeaturesRelations = relations(premiumFeatures, ({ one }) => ({
  user: one(users, {
    fields: [premiumFeatures.userId],
    references: [users.telegramId],
  }),
  listing: one(listings, {
    fields: [premiumFeatures.listingId],
    references: [listings.id],
  }),
}));

// Zod schemas for validation
export const PremiumFeatureSchema = z.object({
  id: z.number(),
  userId: z.number(),
  listingId: z.string().uuid().nullable(),
  featureType: z.enum(['sticky_listing', 'color_highlight', 'auto_bump']),
  starsPaid: z.number().positive(),
  purchasedAt: z.string(),
  expiresAt: z.string(),
  isActive: z.boolean(),
  autoRenewedCount: z.number().min(0),
  cancelledAt: z.string().nullable(),
});

export const CreatePremiumFeatureSchema = z
  .object({
    userId: z.number(),
    listingId: z.string().uuid().optional(), // Required for sticky_listing and color_highlight
    featureType: z.enum(['sticky_listing', 'color_highlight', 'auto_bump']),
    starsPaid: z.number().positive(),
  })
  .refine(
    data => {
      // sticky_listing and color_highlight require a listing ID
      if (data.featureType === 'sticky_listing' || data.featureType === 'color_highlight') {
        return !!data.listingId;
      }
      return true;
    },
    {
      message: 'Listing ID is required for sticky_listing and color_highlight features',
      path: ['listingId'],
    }
  );

export const UpdatePremiumFeatureSchema = z.object({
  isActive: z.boolean().optional(),
  cancelledAt: z.string().optional(),
  autoRenewedCount: z.number().min(0).optional(),
});

// Inferred types
export type PremiumFeature = typeof premiumFeatures.$inferSelect;
export type NewPremiumFeature = typeof premiumFeatures.$inferInsert;
export type CreatePremiumFeature = z.infer<typeof CreatePremiumFeatureSchema>;
export type UpdatePremiumFeature = z.infer<typeof UpdatePremiumFeatureSchema>;

// Feature types enum
export enum PremiumFeatureType {
  STICKY_LISTING = 'sticky_listing',
  COLOR_HIGHLIGHT = 'color_highlight',
  AUTO_BUMP = 'auto_bump',
}

// Helper functions
export function calculateFeatureExpiration(
  featureType: PremiumFeatureType,
  purchaseDate: Date
): Date {
  const expiration = new Date(purchaseDate);

  switch (featureType) {
    case PremiumFeatureType.STICKY_LISTING:
    case PremiumFeatureType.COLOR_HIGHLIGHT:
      // 7 days for sticky and highlight
      expiration.setDate(expiration.getDate() + 7);
      break;
    case PremiumFeatureType.AUTO_BUMP:
      // 21 days for auto-bump
      expiration.setDate(expiration.getDate() + 21);
      break;
    default:
      throw new Error(`Unknown feature type: ${featureType}`);
  }

  return expiration;
}

export function getFeaturePrice(featureType: PremiumFeatureType): number {
  // Prices in Telegram Stars
  switch (featureType) {
    case PremiumFeatureType.STICKY_LISTING:
      return 50; // 50 stars for 7 days sticky
    case PremiumFeatureType.COLOR_HIGHLIGHT:
      return 30; // 30 stars for 7 days highlight
    case PremiumFeatureType.AUTO_BUMP:
      return 100; // 100 stars for 21 days auto-bump
    default:
      throw new Error(`Unknown feature type: ${featureType}`);
  }
}

export function isFeatureActive(feature: PremiumFeature): boolean {
  if (!feature.isActive) return false;
  if (feature.cancelledAt) return false;

  const now = new Date();
  const expiration = new Date(feature.expiresAt);

  return expiration > now;
}

export function canUserPurchaseFeature(
  userId: number,
  featureType: PremiumFeatureType,
  listingId: string | null,
  existingFeatures: PremiumFeature[]
): { canPurchase: boolean; reason?: string } {
  const activeFeatures = existingFeatures.filter(
    f => f.userId === userId && f.featureType === featureType && isFeatureActive(f)
  );

  switch (featureType) {
    case PremiumFeatureType.STICKY_LISTING:
    case PremiumFeatureType.COLOR_HIGHLIGHT:
      if (!listingId) {
        return { canPurchase: false, reason: 'Listing ID is required' };
      }

      // Check if listing already has this feature active
      const listingFeatures = activeFeatures.filter(f => f.listingId === listingId);
      if (listingFeatures.length > 0) {
        return { canPurchase: false, reason: 'Listing already has this feature active' };
      }
      break;

    case PremiumFeatureType.AUTO_BUMP:
      // User can only have one active auto-bump feature at a time
      if (activeFeatures.length > 0) {
        return { canPurchase: false, reason: 'User already has an active auto-bump feature' };
      }
      break;

    default:
      return { canPurchase: false, reason: 'Unknown feature type' };
  }

  return { canPurchase: true };
}

export function getFeatureDisplayName(featureType: PremiumFeatureType): string {
  switch (featureType) {
    case PremiumFeatureType.STICKY_LISTING:
      return 'Sticky Listing';
    case PremiumFeatureType.COLOR_HIGHLIGHT:
      return 'Color Highlight';
    case PremiumFeatureType.AUTO_BUMP:
      return 'Auto Bump';
    default:
      return 'Unknown Feature';
  }
}

export function getFeatureDescription(featureType: PremiumFeatureType): string {
  switch (featureType) {
    case PremiumFeatureType.STICKY_LISTING:
      return 'Keep your listing at the top of search results for 7 days';
    case PremiumFeatureType.COLOR_HIGHLIGHT:
      return 'Highlight your listing with color for better visibility for 7 days';
    case PremiumFeatureType.AUTO_BUMP:
      return 'Automatically refresh your listing expiration for 21 days';
    default:
      return 'Unknown feature';
  }
}

// Enhanced feature type with computed fields
export interface PremiumFeatureWithDetails extends PremiumFeature {
  displayName: string;
  description: string;
  isCurrentlyActive: boolean;
  timeRemaining: string | undefined;
  listing?: {
    id: string;
    title: string;
    status: string;
  };
}

export function enrichPremiumFeature(feature: PremiumFeature): PremiumFeatureWithDetails {
  const isCurrentlyActive = isFeatureActive(feature);
  let timeRemaining: string | undefined;

  if (isCurrentlyActive) {
    const now = new Date();
    const expiration = new Date(feature.expiresAt);
    const diff = expiration.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      timeRemaining = `${days}d ${hours}h`;
    } else if (hours > 0) {
      timeRemaining = `${hours}h`;
    } else {
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      timeRemaining = `${minutes}m`;
    }
  }

  return {
    ...feature,
    displayName: getFeatureDisplayName(feature.featureType as PremiumFeatureType),
    description: getFeatureDescription(feature.featureType as PremiumFeatureType),
    isCurrentlyActive,
    timeRemaining,
  };
}

// Premium feature constraints
export const PREMIUM_FEATURE_CONSTRAINTS = {
  STICKY_DURATION_DAYS: 7,
  HIGHLIGHT_DURATION_DAYS: 7,
  AUTO_BUMP_DURATION_DAYS: 21,
  STICKY_PRICE_STARS: 50,
  HIGHLIGHT_PRICE_STARS: 30,
  AUTO_BUMP_PRICE_STARS: 100,
  MAX_AUTO_RENEWALS: 100, // Prevent infinite loops
} as const;
