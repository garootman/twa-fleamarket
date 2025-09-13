import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { users } from './schema';
import type { TelegramUser, User, NewUser } from './schema';

export class Database {
  private db: ReturnType<typeof drizzle>;
  private d1: D1Database;

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema });
    this.d1 = d1Database;
  }

  // Legacy methods that still use raw SQL (these are deprecated and removed now)
  async getSetting(_settingName: string): Promise<string | null> {
    throw new Error('Settings table removed - use environment variables or KV instead');
  }

  async setSetting(_settingName: string, _settingValue: string): Promise<D1Result> {
    throw new Error('Settings table removed - use environment variables or KV instead');
  }

  async addMessage(_message: string, _updateId: number): Promise<D1Result> {
    throw new Error('Messages table removed - use logging instead');
  }

  async getLatestUpdateId(): Promise<number> {
    throw new Error('Messages table removed - store update ID elsewhere');
  }

  // Calendar methods removed - functionality not needed

  // New Drizzle-based methods
  async getUser(telegramId: number): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    return result[0];
  }

  async saveUser(
    user: TelegramUser,
    authTimestamp: number,
    r2ImageKey?: string | null
  ): Promise<User> {
    const userData: NewUser = {
      lastAuthTimestamp: new Date(authTimestamp * 1000).toISOString(),
      telegramId: user.id,
      username: user.username || undefined,
      isBot: user.is_bot ?? false,
      firstName: user.first_name || undefined,
      lastName: user.last_name || undefined,
      languageCode: user.language_code || undefined,
      isPremium: user.is_premium ?? false,
      addedToAttachmentMenu: user.added_to_attachment_menu ?? false,
      allowsWriteToPm: user.allows_write_to_pm ?? false,
      photoUrl: user.photo_url || undefined, // Always store Telegram URL
      r2ImageKey: r2ImageKey || undefined,
      phoneNumber: user.phone_number || undefined,
      supportsInlineQueries: user.supports_inline_queries ?? false,
      canJoinGroups: user.can_join_groups ?? false,
      canReadAllGroupMessages: user.can_read_all_group_messages ?? false,
    };

    const existingUser = await this.getUser(user.id);

    if (existingUser) {
      // Update existing user
      const [updatedUser] = await this.db
        .update(users)
        .set({
          ...userData,
          updatedDate: new Date().toISOString(),
        })
        .where(eq(users.telegramId, user.id))
        .returning();

      return updatedUser;
    } else {
      // Insert new user
      const [newUser] = await this.db.insert(users).values(userData).returning();

      return newUser;
    }
  }

  // Token methods removed - now handled by KV storage

  // Helper method to get the correct image URL for a user
  getUserImageUrl(user: User, baseUrl: string): string | null {
    // Prioritize Telegram photo URL over R2 (for backward compatibility, R2 images still work)
    if (user.photoUrl) {
      return user.photoUrl;
    }
    if (user.r2ImageKey) {
      return `${baseUrl}/image/${user.r2ImageKey}`;
    }
    return null;
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string; timestamp: string }> {
    try {
      // Simple time query to test database connectivity
      const result = await this.d1.prepare('SELECT datetime("now") as current_time').first();
      const timestamp = ((result as any)?.current_time as string) || new Date().toISOString();

      return {
        status: 'ok',
        message: 'Database connection successful',
        timestamp,
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export * from './schema';
export type { TelegramUser, User, NewUser };
