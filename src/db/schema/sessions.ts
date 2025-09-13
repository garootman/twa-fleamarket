import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { users } from './users';

// User Sessions table - represents authentication sessions for web app access
export const userSessions = sqliteTable(
  'user_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull().unique(), // JWT-like session token
    userId: integer('user_id')
      .notNull()
      .references(() => users.telegramId),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at').notNull(),
    lastUsed: text('last_used')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    userAgent: text('user_agent'), // Browser/client information
    ipAddress: text('ip_address'), // For security tracking
    revokedAt: text('revoked_at'), // Manual revocation timestamp
  },
  table => ({
    tokenIdx: index('user_sessions_token_idx').on(table.token),
    userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('user_sessions_expires_at_idx').on(table.expiresAt),
    lastUsedIdx: index('user_sessions_last_used_idx').on(table.lastUsed),
    isActiveIdx: index('user_sessions_is_active_idx').on(table.isActive),
    // Composite index for active sessions cleanup
    activeExpiresIdx: index('user_sessions_active_expires_idx').on(table.isActive, table.expiresAt),
  })
);

// Mock Users table - represents mock users for local development and testing
export const mockUsers = sqliteTable(
  'mock_users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull().unique(), // Fake Telegram ID for testing
    username: text('username').notNull().unique(), // Mock username
    firstName: text('first_name').notNull(), // Mock first name
    lastName: text('last_name'), // Mock last name
    role: text('role', { enum: ['buyer', 'seller', 'admin'] }).notNull(), // Test user role
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => ({
    telegramIdIdx: index('mock_users_telegram_id_idx').on(table.telegramId),
    usernameIdx: index('mock_users_username_idx').on(table.username),
    roleIdx: index('mock_users_role_idx').on(table.role),
    isActiveIdx: index('mock_users_is_active_idx').on(table.isActive),
  })
);

// Cache Entries table - represents KV cache entries for CQRS-style caching
export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(), // Cache key (e.g., "category:123:listings")
    value: text('value', { mode: 'json' }).notNull().$type<any>(), // Cached data
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAt: text('expires_at').notNull(), // Cache expiration
    invalidatedAt: text('invalidated_at'), // Manual invalidation timestamp
    hitCount: integer('hit_count').notNull().default(0), // Usage tracking
    lastHit: text('last_hit'), // Last access time
  },
  table => ({
    keyIdx: index('cache_entries_key_idx').on(table.key),
    expiresAtIdx: index('cache_entries_expires_at_idx').on(table.expiresAt),
    invalidatedAtIdx: index('cache_entries_invalidated_at_idx').on(table.invalidatedAt),
    createdAtIdx: index('cache_entries_created_at_idx').on(table.createdAt),
    hitCountIdx: index('cache_entries_hit_count_idx').on(table.hitCount),
  })
);

// Relations
export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.telegramId],
  }),
}));

export const mockUsersRelations = relations(mockUsers, ({ one }) => ({
  // Mock users link to regular user table via telegram_id in test scenarios
  realUser: one(users, {
    fields: [mockUsers.telegramId],
    references: [users.telegramId],
  }),
}));

// No relations for cacheEntries as it's managed by KV service

// Zod schemas for validation
export const UserSessionSchema = z.object({
  id: z.number(),
  token: z.string(),
  userId: z.number(),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsed: z.string(),
  isActive: z.boolean(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

export const CreateUserSessionSchema = z.object({
  token: z.string().min(32, 'Token must be at least 32 characters'),
  userId: z.number(),
  expiresAt: z.string(),
  userAgent: z.string().max(500).optional(),
  ipAddress: z.string().max(45).optional(), // IPv6 max length
});

export const MockUserSchema = z.object({
  id: z.number(),
  telegramId: z.number(),
  username: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  role: z.enum(['buyer', 'seller', 'admin']),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const CreateMockUserSchema = z.object({
  telegramId: z.number().positive(),
  username: z.string().min(1, 'Username is required').max(32),
  firstName: z.string().min(1, 'First name is required').max(64),
  lastName: z.string().max(64).optional(),
  role: z.enum(['buyer', 'seller', 'admin']),
  isActive: z.boolean().default(true),
});

export const CacheEntrySchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.any(),
  createdAt: z.string(),
  expiresAt: z.string(),
  invalidatedAt: z.string().nullable(),
  hitCount: z.number().min(0),
  lastHit: z.string().nullable(),
});

export const CreateCacheEntrySchema = z.object({
  key: z.string().min(1, 'Cache key is required').max(200),
  value: z.any(),
  expiresAt: z.string(),
});

// Inferred types
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
export type CreateUserSession = z.infer<typeof CreateUserSessionSchema>;

export type MockUser = typeof mockUsers.$inferSelect;
export type NewMockUser = typeof mockUsers.$inferInsert;
export type CreateMockUser = z.infer<typeof CreateMockUserSchema>;

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type NewCacheEntry = typeof cacheEntries.$inferInsert;
export type CreateCacheEntry = z.infer<typeof CreateCacheEntrySchema>;

// Enums
export enum MockUserRole {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

// Helper functions for sessions
export function generateSessionToken(): string {
  // Generate a secure random token (32 bytes = 64 hex characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function calculateSessionExpiration(durationHours: number = 24 * 7): Date {
  // Default: 7 days from now
  return new Date(Date.now() + durationHours * 60 * 60 * 1000);
}

export function isSessionValid(session: UserSession): boolean {
  if (!session.isActive) return false;
  if (session.revokedAt) return false;

  const now = new Date();
  const expiration = new Date(session.expiresAt);

  return expiration > now;
}

export function isSessionExpiredButActive(session: UserSession): boolean {
  if (!session.isActive || session.revokedAt) return false;

  const now = new Date();
  const expiration = new Date(session.expiresAt);

  return expiration <= now;
}

// Helper functions for mock users
export function getDefaultMockUsers(): CreateMockUser[] {
  return [
    {
      telegramId: 100001,
      username: 'test_buyer',
      firstName: 'Test',
      lastName: 'Buyer',
      role: MockUserRole.BUYER,
      isActive: true,
    },
    {
      telegramId: 100002,
      username: 'test_seller',
      firstName: 'Test',
      lastName: 'Seller',
      role: MockUserRole.SELLER,
      isActive: true,
    },
    {
      telegramId: 100003,
      username: 'test_admin',
      firstName: 'Test',
      lastName: 'Admin',
      role: MockUserRole.ADMIN,
      isActive: true,
    },
  ];
}

export function mockUserToTelegramUser(mockUser: MockUser) {
  return {
    id: mockUser.telegramId,
    first_name: mockUser.firstName,
    last_name: mockUser.lastName || undefined,
    username: mockUser.username,
    is_bot: false,
  };
}

// Helper functions for cache
export function generateCacheKey(type: string, ...parts: (string | number)[]): string {
  return `${type}:${parts.join(':')}`;
}

export function getCacheTTL(type: string): number {
  // TTL in seconds
  switch (type) {
    case 'listings':
      return 5 * 60; // 5 minutes
    case 'categories':
      return 60 * 60; // 1 hour
    case 'search':
      return 10 * 60; // 10 minutes
    case 'user':
      return 15 * 60; // 15 minutes
    default:
      return 5 * 60; // 5 minutes default
  }
}

export function isCacheEntryValid(entry: CacheEntry): boolean {
  if (entry.invalidatedAt) return false;

  const now = new Date();
  const expiration = new Date(entry.expiresAt);

  return expiration > now;
}

// Session and cache constraints
export const SESSION_CONSTRAINTS = {
  MIN_TOKEN_LENGTH: 32,
  MAX_TOKEN_LENGTH: 128,
  DEFAULT_EXPIRATION_HOURS: 24 * 7, // 7 days
  MAX_USER_AGENT_LENGTH: 500,
  MAX_IP_ADDRESS_LENGTH: 45, // IPv6
  SESSION_CLEANUP_BATCH_SIZE: 100,
} as const;

export const CACHE_CONSTRAINTS = {
  MAX_KEY_LENGTH: 200,
  DEFAULT_TTL_SECONDS: 5 * 60, // 5 minutes
  MAX_VALUE_SIZE_KB: 1024, // 1MB
  CLEANUP_BATCH_SIZE: 100,
  MAX_HIT_COUNT: 2147483647, // INT_MAX
} as const;

export const MOCK_USER_CONSTRAINTS = {
  MIN_TELEGRAM_ID: 100000,
  MAX_TELEGRAM_ID: 999999,
  MAX_USERNAME_LENGTH: 32,
  MAX_FIRST_NAME_LENGTH: 64,
  MAX_LAST_NAME_LENGTH: 64,
} as const;
