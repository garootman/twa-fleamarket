import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { listings } from './listings';
import { flags } from './moderation';
import { moderationActions } from './moderation';
import { appeals } from './moderation';
import { premiumFeatures } from './premium';
import { userSessions } from './sessions';

// Users table - represents Telegram users with marketplace-specific data
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull().unique(), // Primary key from Telegram
    username: text('username'), // Telegram username (must exist and be accessible)
    firstName: text('first_name').notNull(), // Telegram first name
    lastName: text('last_name'), // Telegram last name
    profilePhotoUrl: text('profile_photo_url'), // Telegram profile photo
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastActive: text('last_active')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
    banReason: text('ban_reason'),
    bannedAt: text('banned_at'),
    warningCount: integer('warning_count').notNull().default(0),
    usernameVerifiedAt: text('username_verified_at'), // Last verification of username accessibility

    // Legacy fields for compatibility (can be removed in future migrations)
    createdDate: text('createdDate')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastAuthTimestamp: text('lastAuthTimestamp').notNull(),
    isBot: integer('isBot', { mode: 'boolean' }),
    languageCode: text('languageCode'),
    isPremium: integer('isPremium', { mode: 'boolean' }),
    addedToAttachmentMenu: integer('addedToAttachmentMenu', { mode: 'boolean' }),
    allowsWriteToPm: integer('allowsWriteToPm', { mode: 'boolean' }),
    photoUrl: text('photoUrl'),
    r2ImageKey: text('r2ImageKey'),
    phoneNumber: text('phoneNumber'),
    supportsInlineQueries: integer('supportsInlineQueries', { mode: 'boolean' }),
    canJoinGroups: integer('canJoinGroups', { mode: 'boolean' }),
    canReadAllGroupMessages: integer('canReadAllGroupMessages', { mode: 'boolean' }),
  },
  table => ({
    telegramIdIdx: index('users_telegram_id_idx').on(table.telegramId),
    usernameIdx: index('users_username_idx').on(table.username),
    isBannedIdx: index('users_is_banned_idx').on(table.isBanned),
    lastActiveIdx: index('users_last_active_idx').on(table.lastActive),
  })
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  flags: many(flags, { relationName: 'userFlags' }),
  moderationActions: many(moderationActions, { relationName: 'userModerationActions' }),
  appeals: many(appeals),
  premiumFeatures: many(premiumFeatures),
  userSessions: many(userSessions),
}));

// Zod schemas for validation
export const TelegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  added_to_attachment_menu: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.string().optional(),
  phone_number: z.string().optional(),
  supports_inline_queries: z.boolean().optional(),
  can_join_groups: z.boolean().optional(),
  can_read_all_group_messages: z.boolean().optional(),
});

export const UserSchema = z.object({
  id: z.number(),
  telegramId: z.number(),
  username: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  profilePhotoUrl: z.string().nullable(),
  createdAt: z.string(),
  lastActive: z.string(),
  isBanned: z.boolean(),
  banReason: z.string().nullable(),
  bannedAt: z.string().nullable(),
  warningCount: z.number(),
  usernameVerifiedAt: z.string().nullable(),
});

export const CreateUserSchema = z.object({
  telegramId: z.number().positive(),
  username: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  profilePhotoUrl: z.string().url().optional(),
});

export const UpdateUserSchema = z.object({
  username: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  profilePhotoUrl: z.string().url().optional(),
  isBanned: z.boolean().optional(),
  banReason: z.string().optional(),
  warningCount: z.number().min(0).optional(),
});

// Inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TelegramUser = z.infer<typeof TelegramUserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

// Helper function to check if user is admin (based on ADMIN_ID environment variable)
export function isUserAdmin(user: User, adminId?: string): boolean {
  if (!adminId) return false;
  return user.telegramId.toString() === adminId;
}

// User state transitions
export enum UserStatus {
  ACTIVE = 'active',
  WARNED = 'warned',
  BANNED = 'banned',
}

export function getUserStatus(user: User): UserStatus {
  if (user.isBanned) return UserStatus.BANNED;
  if (user.warningCount > 0) return UserStatus.WARNED;
  return UserStatus.ACTIVE;
}
