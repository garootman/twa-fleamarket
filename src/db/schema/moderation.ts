import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { users } from './users';
import { listings } from './listings';

// Flags table - represents user reports of inappropriate content
export const flags = sqliteTable(
  'flags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id),
    reporterId: integer('reporter_id')
      .notNull()
      .references(() => users.telegramId),
    reason: text('reason', { enum: ['spam', 'inappropriate', 'fake', 'other'] }).notNull(),
    description: text('description'), // Additional details, required if reason is "other"
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    reviewedAt: text('reviewed_at'), // Admin review time
    status: text('status', { enum: ['pending', 'upheld', 'dismissed'] })
      .notNull()
      .default('pending'),
    reviewedBy: integer('reviewed_by').references(() => users.telegramId), // Admin who reviewed
  },
  table => ({
    listingIdIdx: index('flags_listing_id_idx').on(table.listingId),
    reporterIdIdx: index('flags_reporter_id_idx').on(table.reporterId),
    statusIdx: index('flags_status_idx').on(table.status),
    createdAtIdx: index('flags_created_at_idx').on(table.createdAt),
    reviewedByIdx: index('flags_reviewed_by_idx').on(table.reviewedBy),
    // Unique constraint: user cannot flag same listing twice
    uniqueFlagIdx: index('flags_unique_flag_idx').on(table.listingId, table.reporterId),
  })
);

// Moderation Actions table - represents administrative actions on users or content
export const moderationActions = sqliteTable(
  'moderation_actions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetUserId: integer('target_user_id')
      .notNull()
      .references(() => users.telegramId),
    targetListingId: text('target_listing_id').references(() => listings.id), // Optional
    adminId: integer('admin_id')
      .notNull()
      .references(() => users.telegramId),
    actionType: text('action_type', {
      enum: ['warning', 'ban', 'content_removal', 'unban'],
    }).notNull(),
    reason: text('reason').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at'), // For temporary bans
  },
  table => ({
    targetUserIdIdx: index('moderation_target_user_id_idx').on(table.targetUserId),
    targetListingIdIdx: index('moderation_target_listing_id_idx').on(table.targetListingId),
    adminIdIdx: index('moderation_admin_id_idx').on(table.adminId),
    actionTypeIdx: index('moderation_action_type_idx').on(table.actionType),
    createdAtIdx: index('moderation_created_at_idx').on(table.createdAt),
    expiresAtIdx: index('moderation_expires_at_idx').on(table.expiresAt),
  })
);

// Appeals table - represents user appeals of moderation actions
export const appeals = sqliteTable(
  'appeals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.telegramId),
    moderationActionId: integer('moderation_action_id')
      .notNull()
      .references(() => moderationActions.id),
    message: text('message', { length: 500 }).notNull(), // Appeal message from user
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    reviewedAt: text('reviewed_at'), // Admin review time
    status: text('status', { enum: ['pending', 'approved', 'denied'] })
      .notNull()
      .default('pending'),
    adminResponse: text('admin_response'), // Admin response message
    reviewedBy: integer('reviewed_by').references(() => users.telegramId), // Admin who reviewed
  },
  table => ({
    userIdIdx: index('appeals_user_id_idx').on(table.userId),
    moderationActionIdIdx: index('appeals_moderation_action_id_idx').on(table.moderationActionId),
    statusIdx: index('appeals_status_idx').on(table.status),
    createdAtIdx: index('appeals_created_at_idx').on(table.createdAt),
    reviewedByIdx: index('appeals_reviewed_by_idx').on(table.reviewedBy),
    // Unique constraint: user can only appeal each action once
    uniqueAppealIdx: index('appeals_unique_appeal_idx').on(table.userId, table.moderationActionId),
  })
);

// Blocked Words table - admin-managed profanity and content blocklist
export const blockedWords = sqliteTable(
  'blocked_words',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    word: text('word').notNull().unique(), // Blocked word or phrase (lowercase)
    severity: text('severity', { enum: ['warning', 'block'] }).notNull(), // Action to take
    addedBy: integer('added_by')
      .notNull()
      .references(() => users.telegramId), // Admin who added
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  table => ({
    wordIdx: index('blocked_words_word_idx').on(table.word),
    severityIdx: index('blocked_words_severity_idx').on(table.severity),
    addedByIdx: index('blocked_words_added_by_idx').on(table.addedBy),
    isActiveIdx: index('blocked_words_is_active_idx').on(table.isActive),
  })
);

// Relations
export const flagsRelations = relations(flags, ({ one }) => ({
  listing: one(listings, {
    fields: [flags.listingId],
    references: [listings.id],
  }),
  reporter: one(users, {
    fields: [flags.reporterId],
    references: [users.telegramId],
    relationName: 'userFlags',
  }),
  reviewer: one(users, {
    fields: [flags.reviewedBy],
    references: [users.telegramId],
    relationName: 'reviewedFlags',
  }),
}));

export const moderationActionsRelations = relations(moderationActions, ({ one, many }) => ({
  targetUser: one(users, {
    fields: [moderationActions.targetUserId],
    references: [users.telegramId],
    relationName: 'userModerationActions',
  }),
  targetListing: one(listings, {
    fields: [moderationActions.targetListingId],
    references: [listings.id],
    relationName: 'listingModerationActions',
  }),
  admin: one(users, {
    fields: [moderationActions.adminId],
    references: [users.telegramId],
    relationName: 'adminModerationActions',
  }),
  appeals: many(appeals),
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
    relationName: 'reviewedAppeals',
  }),
}));

export const blockedWordsRelations = relations(blockedWords, ({ one }) => ({
  addedBy: one(users, {
    fields: [blockedWords.addedBy],
    references: [users.telegramId],
    relationName: 'addedBlockedWords',
  }),
}));

// Zod schemas for validation
export const CreateFlagSchema = z
  .object({
    listingId: z.string().uuid(),
    reporterId: z.number(),
    reason: z.enum(['spam', 'inappropriate', 'fake', 'other']),
    description: z.string().max(500).optional(),
  })
  .refine(data => data.reason !== 'other' || (data.description && data.description.length > 0), {
    message: 'Description is required when reason is "other"',
    path: ['description'],
  });

export const CreateModerationActionSchema = z.object({
  targetUserId: z.number(),
  targetListingId: z.string().uuid().optional(),
  adminId: z.number(),
  actionType: z.enum(['warning', 'ban', 'content_removal', 'unban']),
  reason: z.string().min(1, 'Reason is required').max(1000),
  expiresAt: z.string().optional(), // ISO string for temporary bans
});

export const CreateAppealSchema = z.object({
  userId: z.number(),
  moderationActionId: z.number(),
  message: z.string().min(1, 'Appeal message is required').max(500, 'Appeal message too long'),
});

export const CreateBlockedWordSchema = z.object({
  word: z.string().min(1, 'Word is required').max(100),
  severity: z.enum(['warning', 'block']),
  addedBy: z.number(),
  isActive: z.boolean().default(true),
});

export const ReviewFlagSchema = z.object({
  status: z.enum(['upheld', 'dismissed']),
  reviewedBy: z.number(),
});

export const ReviewAppealSchema = z.object({
  status: z.enum(['approved', 'denied']),
  adminResponse: z.string().max(1000).optional(),
  reviewedBy: z.number(),
});

// Inferred types
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type CreateFlag = z.infer<typeof CreateFlagSchema>;

export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type CreateModerationAction = z.infer<typeof CreateModerationActionSchema>;

export type Appeal = typeof appeals.$inferSelect;
export type NewAppeal = typeof appeals.$inferInsert;
export type CreateAppeal = z.infer<typeof CreateAppealSchema>;

export type BlockedWord = typeof blockedWords.$inferSelect;
export type NewBlockedWord = typeof blockedWords.$inferInsert;
export type CreateBlockedWord = z.infer<typeof CreateBlockedWordSchema>;

// Enums
export enum FlagReason {
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  FAKE = 'fake',
  OTHER = 'other',
}

export enum FlagStatus {
  PENDING = 'pending',
  UPHELD = 'upheld',
  DISMISSED = 'dismissed',
}

export enum ModerationActionType {
  WARNING = 'warning',
  BAN = 'ban',
  CONTENT_REMOVAL = 'content_removal',
  UNBAN = 'unban',
}

export enum AppealStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
}

export enum BlockedWordSeverity {
  WARNING = 'warning',
  BLOCK = 'block',
}

// Helper functions
export function canUserFlag(reporterId: number, listingOwnerId: number): boolean {
  // User cannot flag their own listings
  return reporterId !== listingOwnerId;
}

export function canAppealAction(action: ModerationAction): boolean {
  // Can appeal actions created within last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const actionDate = new Date(action.createdAt);
  return actionDate >= thirtyDaysAgo;
}

export function isBanActive(action: ModerationAction): boolean {
  if (action.actionType !== ModerationActionType.BAN) return false;

  // Permanent ban if no expiration
  if (!action.expiresAt) return true;

  // Check if temporary ban is still active
  const expiration = new Date(action.expiresAt);
  return expiration > new Date();
}

export function filterProfanity(
  text: string,
  blockedWords: BlockedWord[]
): {
  hasViolations: boolean;
  violations: string[];
  filteredText: string;
  shouldBlock: boolean;
} {
  const violations: string[] = [];
  let filteredText = text;
  let shouldBlock = false;

  const activeWords = blockedWords.filter(word => word.isActive);

  for (const blockedWord of activeWords) {
    const regex = new RegExp(blockedWord.word, 'gi');
    if (regex.test(text)) {
      violations.push(blockedWord.word);

      if (blockedWord.severity === BlockedWordSeverity.BLOCK) {
        shouldBlock = true;
      }

      // Replace with asterisks for warning level
      filteredText = filteredText.replace(regex, '*'.repeat(blockedWord.word.length));
    }
  }

  return {
    hasViolations: violations.length > 0,
    violations,
    filteredText,
    shouldBlock,
  };
}

// Moderation constraints
export const MODERATION_CONSTRAINTS = {
  MAX_FLAG_DESCRIPTION_LENGTH: 500,
  MAX_APPEAL_MESSAGE_LENGTH: 500,
  MAX_ADMIN_RESPONSE_LENGTH: 1000,
  MAX_BLOCKED_WORD_LENGTH: 100,
  APPEAL_DEADLINE_DAYS: 30,
} as const;
