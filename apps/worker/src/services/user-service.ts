import { Database } from '../db/index';
import { users, type User, type NewUser } from '../db/models/user';
import { eq } from 'drizzle-orm';

export interface UserUpdateData {
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  timezone?: string;
  preferredLanguage?: string;
  notificationsEnabled?: boolean;
}

export class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create or update user from Telegram data
   */
  async createOrUpdate(telegramId: number, userData: Partial<NewUser>): Promise<User> {
    const existingUser = await this.findByTelegramId(telegramId);

    if (existingUser) {
      // Update existing user
      const [updatedUser] = await this.db.update(users)
        .set({
          ...userData,
          updatedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString()
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return updatedUser;
    } else {
      // Create new user
      const [newUser] = await this.db.insert(users)
        .values({
          telegramId: telegramId.toString(),
          ...userData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString()
        })
        .returning();

      return newUser;
    }
  }

  /**
   * Find user by Telegram ID
   */
  async findByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const result = await this.db.select()
        .from(users)
        .where(eq(users.telegramId, telegramId.toString()))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding user by Telegram ID:', error);
      return null;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<User | null> {
    try {
      const result = await this.db.select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: number, updateData: UserUpdateData): Promise<User | null> {
    try {
      const [updatedUser] = await this.db.update(users)
        .set({
          ...updateData,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId))
        .returning();

      return updatedUser || null;
    } catch (error) {
      console.error('Error updating user profile:', error);
      return null;
    }
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(userId: number): Promise<void> {
    try {
      await this.db.update(users)
        .set({
          lastActiveAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error('Error updating last active:', error);
    }
  }

  /**
   * Check if user exists
   */
  async exists(telegramId: number): Promise<boolean> {
    const user = await this.findByTelegramId(telegramId);
    return user !== null;
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: number): Promise<boolean> {
    try {
      const user = await this.findById(userId);
      // For now, we'll check against environment variable
      // In production, this could be a database field or role system
      return user?.telegramId === process.env.ADMIN_TELEGRAM_ID;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Ban user
   */
  async ban(userId: number, reason?: string): Promise<boolean> {
    try {
      await this.db.update(users)
        .set({
          isBanned: true,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));

      return true;
    } catch (error) {
      console.error('Error banning user:', error);
      return false;
    }
  }

  /**
   * Unban user
   */
  async unban(userId: number): Promise<boolean> {
    try {
      await this.db.update(users)
        .set({
          isBanned: false,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));

      return true;
    } catch (error) {
      console.error('Error unbanning user:', error);
      return false;
    }
  }
}