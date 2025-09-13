import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

// Users table
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdDate: text('createdDate')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedDate: text('updatedDate')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastAuthTimestamp: text('lastAuthTimestamp').notNull(),
    telegramId: integer('telegramId').notNull().unique(),
    username: text('username'),
    isBot: integer('isBot', { mode: 'boolean' }),
    firstName: text('firstName'),
    lastName: text('lastName'),
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
    telegramIdIdx: index('telegramIdIndex').on(table.telegramId),
  })
);

// Tokens table removed - now handled by KV storage

// Relations - tokens relations removed
export const usersRelations = relations(users, ({ many: _many }) => ({
  // tokens relation removed - now in KV
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

export const UserInsertSchema = z.object({
  lastAuthTimestamp: z.string(),
  telegramId: z.number(),
  username: z.string().optional(),
  isBot: z.boolean().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
  isPremium: z.boolean().optional(),
  addedToAttachmentMenu: z.boolean().optional(),
  allowsWriteToPm: z.boolean().optional(),
  photoUrl: z.string().optional(),
  r2ImageKey: z.string().optional(),
  phoneNumber: z.string().optional(),
  supportsInlineQueries: z.boolean().optional(),
  canJoinGroups: z.boolean().optional(),
  canReadAllGroupMessages: z.boolean().optional(),
});

// TokenInsertSchema removed - now handled by KV

// Inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TelegramUser = z.infer<typeof TelegramUserSchema>;
// Token types removed - now handled by KV
