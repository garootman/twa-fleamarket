import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * Comprehensive Marketplace Database Schema
 *
 * This schema defines all the tables needed for the Telegram marketplace application.
 * It includes users, listings, categories, moderation, and all supporting entities.
 */

// Enhanced Users table with marketplace features
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),
    lastActiveAt: text('lastActiveAt').notNull().$defaultFn(() => new Date().toISOString()),

    // Telegram user data
    telegramId: integer('telegramId').notNull().unique(),
    username: text('username'),
    firstName: text('firstName'),
    lastName: text('lastName'),
    languageCode: text('languageCode'),
    isPremium: integer('isPremium', { mode: 'boolean' }).default(false),
    photoUrl: text('photoUrl'),
    profilePhotoUrl: text('profilePhotoUrl'), // For marketplace profile

    // Marketplace user features
    isVerified: integer('isVerified', { mode: 'boolean' }).default(false),
    rating: real('rating').default(0.0),
    ratingCount: integer('ratingCount').default(0),
    totalListings: integer('totalListings').default(0),
    activeListing: integer('activeListing').default(0),
    soldListings: integer('soldListings').default(0),

    // Admin and moderation
    isAdmin: integer('isAdmin', { mode: 'boolean' }).default(false),
    isBanned: integer('isBanned', { mode: 'boolean' }).default(false),
    banReason: text('banReason'),
    bannedAt: text('bannedAt'),
    bannedUntil: text('bannedUntil'),
    warningCount: integer('warningCount').default(0),

    // Preferences
    notificationsEnabled: integer('notificationsEnabled', { mode: 'boolean' }).default(true),
    emailNotifications: integer('emailNotifications', { mode: 'boolean' }).default(false),
    locationSharing: integer('locationSharing', { mode: 'boolean' }).default(false),
  },
  table => ({
    telegramIdIdx: index('telegramIdIndex').on(table.telegramId),
    usernameIdx: index('usernameIndex').on(table.username),
    verifiedIdx: index('verifiedIndex').on(table.isVerified),
    ratingIdx: index('ratingIndex').on(table.rating),
  })
);

// Categories table with hierarchical structure
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    iconUrl: text('iconUrl'),

    // Hierarchy
    parentId: integer('parentId'),
    level: integer('level').notNull().default(0),
    sortOrder: integer('sortOrder').default(0),

    // Status
    isActive: integer('isActive', { mode: 'boolean' }).default(true),
    isVisible: integer('isVisible', { mode: 'boolean' }).default(true),

    // Stats
    listingCount: integer('listingCount').default(0),
  },
  table => ({
    slugIdx: uniqueIndex('categorySlugIndex').on(table.slug),
    parentIdIdx: index('categoryParentIndex').on(table.parentId),
    levelIdx: index('categoryLevelIndex').on(table.level),
    activeIdx: index('categoryActiveIndex').on(table.isActive),
  })
);

// Listings table - the core marketplace entity
export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(), // UUID string
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    // Basic listing data
    title: text('title').notNull(),
    description: text('description').notNull(),
    priceUsd: real('priceUsd').notNull(),
    currency: text('currency').default('USD'),

    // Categorization
    categoryId: integer('categoryId').notNull(),
    subcategoryId: integer('subcategoryId'),
    tags: text('tags'), // JSON array of strings

    // Media
    images: text('images'), // JSON array of URLs
    thumbnail: text('thumbnail'),

    // Location (optional)
    location: text('location'),
    latitude: real('latitude'),
    longitude: real('longitude'),

    // User
    userId: integer('userId').notNull(),

    // Status and workflow
    status: text('status').notNull().default('draft'), // draft, active, sold, expired, archived, banned
    isDraft: integer('isDraft', { mode: 'boolean' }).default(true),
    isPublished: integer('isPublished', { mode: 'boolean' }).default(false),
    publishedAt: text('publishedAt'),
    expiresAt: text('expiresAt'),

    // Premium features
    isFeatured: integer('isFeatured', { mode: 'boolean' }).default(false),
    isPremium: integer('isPremium', { mode: 'boolean' }).default(false),
    isUrgent: integer('isUrgent', { mode: 'boolean' }).default(false),
    featuredUntil: text('featuredUntil'),
    bumpedAt: text('bumpedAt'),
    lastBumpAt: text('lastBumpAt'),

    // Engagement metrics
    viewCount: integer('viewCount').default(0),
    favoriteCount: integer('favoriteCount').default(0),
    messageCount: integer('messageCount').default(0),

    // Moderation
    moderationStatus: text('moderationStatus').default('pending'), // pending, approved, rejected
    moderatedAt: text('moderatedAt'),
    moderatedBy: integer('moderatedBy'),
    moderationNotes: text('moderationNotes'),
    flagCount: integer('flagCount').default(0),
  },
  table => ({
    userIdIdx: index('listingUserIndex').on(table.userId),
    categoryIdx: index('listingCategoryIndex').on(table.categoryId),
    statusIdx: index('listingStatusIndex').on(table.status),
    publishedIdx: index('listingPublishedIndex').on(table.isPublished),
    featuredIdx: index('listingFeaturedIndex').on(table.isFeatured),
    priceIdx: index('listingPriceIndex').on(table.priceUsd),
    locationIdx: index('listingLocationIndex').on(table.latitude, table.longitude),
    createdIdx: index('listingCreatedIndex').on(table.createdDate),
    bumpedIdx: index('listingBumpedIndex').on(table.bumpedAt),
    viewsIdx: index('listingViewsIndex').on(table.viewCount),
  })
);

// User sessions for authentication
export const userSessions = sqliteTable(
  'userSessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    userId: integer('userId').notNull(),
    token: text('token').notNull().unique(),
    tokenHash: text('tokenHash').notNull().unique(),

    expiresAt: text('expiresAt').notNull(),
    isActive: integer('isActive', { mode: 'boolean' }).default(true),

    // Session metadata
    userAgent: text('userAgent'),
    ipAddress: text('ipAddress'),
    deviceInfo: text('deviceInfo'),

    // Revocation
    revokedAt: text('revokedAt'),
    revokedBy: integer('revokedBy'),
    revokeReason: text('revokeReason'),
  },
  table => ({
    tokenIdx: uniqueIndex('sessionTokenIndex').on(table.token),
    tokenHashIdx: uniqueIndex('sessionTokenHashIndex').on(table.tokenHash),
    userIdIdx: index('sessionUserIndex').on(table.userId),
    activeIdx: index('sessionActiveIndex').on(table.isActive),
    expiresIdx: index('sessionExpiresIndex').on(table.expiresAt),
  })
);

// Content moderation flags
export const flags = sqliteTable(
  'flags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),

    // What's being flagged
    targetType: text('targetType').notNull(), // listing, user, message
    targetId: text('targetId').notNull(),

    // Who flagged it
    reportedBy: integer('reportedBy').notNull(),

    // Flag details
    reason: text('reason').notNull(), // spam, inappropriate, scam, etc.
    category: text('category').notNull(),
    description: text('description'),
    severity: text('severity').default('medium'), // low, medium, high, critical

    // Resolution
    status: text('status').default('pending'), // pending, reviewed, resolved, dismissed
    resolvedAt: text('resolvedAt'),
    resolvedBy: integer('resolvedBy'),
    resolution: text('resolution'),
    moderatorNotes: text('moderatorNotes'),
  },
  table => ({
    targetIdx: index('flagTargetIndex').on(table.targetType, table.targetId),
    reporterIdx: index('flagReporterIndex').on(table.reportedBy),
    statusIdx: index('flagStatusIndex').on(table.status),
    severityIdx: index('flagSeverityIndex').on(table.severity),
    createdIdx: index('flagCreatedIndex').on(table.createdDate),
  })
);

// Moderation actions taken by admins
export const moderationActions = sqliteTable(
  'moderationActions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),

    // What action was taken
    action: text('action').notNull(), // ban, warn, delete, approve, reject
    targetType: text('targetType').notNull(), // user, listing, flag
    targetId: text('targetId').notNull(),

    // Who performed the action
    moderatorId: integer('moderatorId').notNull(),

    // Action details
    reason: text('reason'),
    details: text('details'),
    duration: text('duration'), // For temporary actions
    severity: text('severity').default('medium'),

    // Related entities
    relatedFlagId: integer('relatedFlagId'),
    relatedUserId: integer('relatedUserId'),
  },
  table => ({
    moderatorIdx: index('moderationModeratorIndex').on(table.moderatorId),
    targetIdx: index('moderationTargetIndex').on(table.targetType, table.targetId),
    actionIdx: index('moderationActionIndex').on(table.action),
    createdIdx: index('moderationCreatedIndex').on(table.createdDate),
  })
);

// User appeals for moderation decisions
export const appeals = sqliteTable(
  'appeals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    userId: integer('userId').notNull(),
    moderationActionId: integer('moderationActionId').notNull(),

    // Appeal content
    reason: text('reason').notNull(),
    explanation: text('explanation').notNull(),
    evidence: text('evidence'), // URLs, additional info

    // Status
    status: text('status').default('pending'), // pending, approved, rejected
    reviewedAt: text('reviewedAt'),
    reviewedBy: integer('reviewedBy'),
    reviewerNotes: text('reviewerNotes'),
    resolution: text('resolution'),
  },
  table => ({
    userIdx: index('appealUserIndex').on(table.userId),
    actionIdx: index('appealActionIndex').on(table.moderationActionId),
    statusIdx: index('appealStatusIndex').on(table.status),
    createdIdx: index('appealCreatedIndex').on(table.createdDate),
  })
);

// Premium features and payments
export const premiumFeatures = sqliteTable(
  'premiumFeatures',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),

    userId: integer('userId').notNull(),
    listingId: text('listingId'),

    // Feature details
    featureType: text('featureType').notNull(), // bump, featured, urgent, premium
    duration: integer('duration').notNull(), // Duration in hours
    priceStars: integer('priceStars').notNull(), // Price in Telegram Stars

    // Status
    isActive: integer('isActive', { mode: 'boolean' }).default(true),
    activatedAt: text('activatedAt').$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expiresAt').notNull(),

    // Payment
    paymentId: text('paymentId'),
    paymentStatus: text('paymentStatus').default('pending'), // pending, completed, failed, refunded
    paymentDate: text('paymentDate'),
    refundDate: text('refundDate'),
  },
  table => ({
    userIdx: index('premiumUserIndex').on(table.userId),
    listingIdx: index('premiumListingIndex').on(table.listingId),
    featureIdx: index('premiumFeatureIndex').on(table.featureType),
    activeIdx: index('premiumActiveIndex').on(table.isActive),
    expiresIdx: index('premiumExpiresIndex').on(table.expiresAt),
  })
);

// Blocked words for content filtering
export const blockedWords = sqliteTable(
  'blockedWords',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    word: text('word').notNull().unique(),
    pattern: text('pattern'), // Regex pattern
    category: text('category').notNull(), // profanity, spam, scam, etc.
    severity: text('severity').default('medium'), // low, medium, high
    action: text('action').default('flag'), // flag, block, warn

    isActive: integer('isActive', { mode: 'boolean' }).default(true),
    isRegex: integer('isRegex', { mode: 'boolean' }).default(false),

    // Admin info
    addedBy: integer('addedBy'),
    notes: text('notes'),
  },
  table => ({
    wordIdx: uniqueIndex('blockedWordIndex').on(table.word),
    categoryIdx: index('blockedWordCategoryIndex').on(table.category),
    severityIdx: index('blockedWordSeverityIndex').on(table.severity),
    activeIdx: index('blockedWordActiveIndex').on(table.isActive),
  })
);

// Mock users for development
export const mockUsers = sqliteTable(
  'mockUsers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),

    telegramId: integer('telegramId').notNull().unique(),
    username: text('username'),
    firstName: text('firstName'),
    lastName: text('lastName'),

    // Mock-specific fields
    isAdmin: integer('isAdmin', { mode: 'boolean' }).default(false),
    scenario: text('scenario'), // buyer, seller, admin, banned, etc.
    description: text('description'),

    isActive: integer('isActive', { mode: 'boolean' }).default(true),
  },
  table => ({
    telegramIdIdx: uniqueIndex('mockUserTelegramIndex').on(table.telegramId),
    usernameIdx: index('mockUserUsernameIndex').on(table.username),
    scenarioIdx: index('mockUserScenarioIndex').on(table.scenario),
  })
);

// Cache entries for KV fallback
export const cacheEntries = sqliteTable(
  'cacheEntries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate').notNull().$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate').notNull().$defaultFn(() => new Date().toISOString()),

    key: text('key').notNull().unique(),
    value: text('value').notNull(), // JSON serialized
    ttl: integer('ttl'), // Time to live in seconds
    expiresAt: text('expiresAt'),

    // Metadata
    namespace: text('namespace'),
    tags: text('tags'), // JSON array for cache invalidation
  },
  table => ({
    keyIdx: uniqueIndex('cacheKeyIndex').on(table.key),
    namespaceIdx: index('cacheNamespaceIndex').on(table.namespace),
    expiresIdx: index('cacheExpiresIndex').on(table.expiresAt),
  })
);

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  sessions: many(userSessions),
  flags: many(flags),
  moderationActions: many(moderationActions),
  appeals: many(appeals),
  premiumFeatures: many(premiumFeatures),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  children: many(categories),
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  user: one(users, {
    fields: [listings.userId],
    references: [users.telegramId],
  }),
  category: one(categories, {
    fields: [listings.categoryId],
    references: [categories.id],
  }),
  subcategory: one(categories, {
    fields: [listings.subcategoryId],
    references: [categories.id],
  }),
  flags: many(flags),
  premiumFeatures: many(premiumFeatures),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.telegramId],
  }),
}));

export const flagsRelations = relations(flags, ({ one }) => ({
  reporter: one(users, {
    fields: [flags.reportedBy],
    references: [users.telegramId],
  }),
  resolver: one(users, {
    fields: [flags.resolvedBy],
    references: [users.telegramId],
  }),
}));

export const moderationActionsRelations = relations(moderationActions, ({ one }) => ({
  moderator: one(users, {
    fields: [moderationActions.moderatorId],
    references: [users.telegramId],
  }),
  relatedFlag: one(flags, {
    fields: [moderationActions.relatedFlagId],
    references: [flags.id],
  }),
}));

export const appealsRelations = relations(appeals, ({ one }) => ({
  user: one(users, {
    fields: [appeals.userId],
    references: [users.telegramId],
  }),
  moderationAction: one(moderationActions, {
    fields: [appeals.moderationActionId],
    references: [moderationActions.id],
  }),
  reviewer: one(users, {
    fields: [appeals.reviewedBy],
    references: [users.telegramId],
  }),
}));

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

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type Appeal = typeof appeals.$inferSelect;
export type NewAppeal = typeof appeals.$inferInsert;
export type PremiumFeature = typeof premiumFeatures.$inferSelect;
export type NewPremiumFeature = typeof premiumFeatures.$inferInsert;
export type BlockedWord = typeof blockedWords.$inferSelect;
export type NewBlockedWord = typeof blockedWords.$inferInsert;
export type MockUser = typeof mockUsers.$inferSelect;
export type NewMockUser = typeof mockUsers.$inferInsert;
export type CacheEntry = typeof cacheEntries.$inferSelect;
export type NewCacheEntry = typeof cacheEntries.$inferInsert;