import { createHmac } from 'node:crypto';
import { Database } from '../db/index';
import { users, type User } from '../db/models/user';
import { eq } from 'drizzle-orm';

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface MockAuthData {
  mockUserId: number;
  secret?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  sessionToken?: string;
  error?: string;
}

export interface SessionData {
  id: number;
  token: string;
  userId: number;
  expiresAt: Date;
}

export class AuthService {
  private db: any; // Support both Database and mock DB
  private botToken: string;
  private isDevelopment: boolean;

  constructor(db: any, botToken: string, isDevelopment: boolean = false) {
    this.db = db;
    this.botToken = botToken;
    this.isDevelopment = isDevelopment;
  }

  /**
   * Validate Telegram WebApp authentication data
   */
  async authenticateTelegram(authData: TelegramAuthData): Promise<AuthResult> {
    try {
      // Validate hash
      if (!this.validateTelegramHash(authData)) {
        return { success: false, error: 'Invalid authentication hash' };
      }

      // Check auth date (should be within last 24 hours)
      const authTime = authData.auth_date * 1000;
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;

      if (now - authTime > dayInMs) {
        return { success: false, error: 'Authentication data expired' };
      }

      // Find or create user
      let user = await this.findUserByTelegramId(authData.id);

      if (!user) {
        // Create new user
        if (this.db.prepare) {
          // Mock DB - create mock user
          user = {
            id: authData.id,
            telegramId: authData.id.toString(),
            username: authData.username || null,
            firstName: authData.first_name || null,
            lastName: authData.last_name || null,
            languageCode: null,
            isBot: false,
            isPremium: false,
            isActive: true,
            isBanned: false,
            isVerified: false,
            premiumUntil: null,
            premiumTier: 'basic',
            notificationsEnabled: true,
            preferredLanguage: 'en',
            timezone: null,
            totalListings: 0,
            totalSales: 0,
            totalPurchases: 0,
            rating: 5.0,
            ratingCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
          };
        } else {
          // Real DB
          const [newUser] = await this.db.insert(users).values({
            telegramId: authData.id.toString(),
            username: authData.username || null,
            firstName: authData.first_name || null,
            lastName: authData.last_name || null,
            lastActiveAt: new Date().toISOString()
          }).returning();
          user = newUser;
        }
      } else {
        // Update existing user
        if (this.db.prepare) {
          // Mock DB - just update the user object
          user = {
            ...user,
            username: authData.username || null,
            firstName: authData.first_name || null,
            lastName: authData.last_name || null,
            lastActiveAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        } else {
          // Real DB
          await this.db.update(users)
            .set({
              username: authData.username,
              firstName: authData.first_name,
              lastName: authData.last_name,
              lastActiveAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
            .where(eq(users.id, user.id));

          // Get updated user
          const updatedUser = await this.findUserByTelegramId(authData.id);
          if (updatedUser) {
            user = updatedUser;
          }
        }
      }

      if (!user) {
        return { success: false, error: 'Failed to create or update user' };
      }

      // Check if user is banned
      if (user.isBanned) {
        return { success: false, error: 'User is banned' };
      }

      // Create session token
      const sessionToken = this.generateSessionToken();

      return {
        success: true,
        user,
        sessionToken
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Authenticate mock user (development only)
   */
  async authenticateMock(mockData: MockAuthData): Promise<AuthResult> {
    if (!this.isDevelopment) {
      return { success: false, error: 'Mock authentication not available in production' };
    }

    try {
      // Find or create mock user
      let user = await this.findUserByTelegramId(mockData.mockUserId);

      if (!user) {
        // Create mock user
        if (this.db.prepare) {
          // Mock DB
          user = {
            id: mockData.mockUserId,
            telegramId: mockData.mockUserId.toString(),
            username: `mock_user_${mockData.mockUserId}`,
            firstName: 'Mock',
            lastName: 'User',
            languageCode: null,
            isBot: false,
            isPremium: false,
            isActive: true,
            isBanned: false,
            isVerified: false,
            premiumUntil: null,
            premiumTier: 'basic',
            notificationsEnabled: true,
            preferredLanguage: 'en',
            timezone: null,
            totalListings: 0,
            totalSales: 0,
            totalPurchases: 0,
            rating: 5.0,
            ratingCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
          };
        } else {
          // Real DB
          const [newUser] = await this.db.insert(users).values({
            telegramId: mockData.mockUserId.toString(),
            username: `mock_user_${mockData.mockUserId}`,
            firstName: 'Mock',
            lastName: 'User',
            lastActiveAt: new Date().toISOString()
          }).returning();
          user = newUser;
        }
      }

      const sessionToken = this.generateSessionToken();

      return {
        success: true,
        user,
        sessionToken
      };
    } catch (error) {
      console.error('Mock authentication error:', error);
      return { success: false, error: 'Mock authentication failed' };
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<{ valid: boolean; user?: User }> {
    try {
      // For now, we'll use a simple token validation
      // In production, this should check against a sessions table
      if (!token || token.length < 32) {
        return { valid: false };
      }

      // Extract user ID from token (simplified approach)
      const decoded = this.decodeSessionToken(token);
      if (!decoded) {
        return { valid: false };
      }

      const user = await this.findUserByTelegramId(decoded.userId);
      if (!user || user.isBanned) {
        return { valid: false };
      }

      return { valid: true, user };
    } catch (error) {
      console.error('Session validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Find user by Telegram ID
   */
  private async findUserByTelegramId(telegramId: number): Promise<User | null> {
    try {
      // Check if this is a mock DB (has prepare method)
      if (this.db.prepare) {
        // Mock DB interface - just return null for now
        return null;
      }

      // Real Drizzle DB
      const result = await this.db.select()
        .from(users)
        .where(eq(users.telegramId, telegramId.toString()))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding user:', error);
      return null;
    }
  }

  /**
   * Validate Telegram authentication hash
   */
  private validateTelegramHash(authData: TelegramAuthData): boolean {
    try {
      const { hash, ...data } = authData;

      // Create data check string
      const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key as keyof typeof data]}`)
        .join('\n');

      // Create secret key
      const secretKey = createHmac('sha256', 'WebAppData')
        .update(this.botToken)
        .digest();

      // Calculate expected hash
      const expectedHash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      return hash === expectedHash;
    } catch (error) {
      console.error('Hash validation error:', error);
      return false;
    }
  }

  /**
   * Generate session token
   */
  private generateSessionToken(): string {
    return crypto.randomUUID() + '_' + Date.now().toString(36);
  }

  /**
   * Decode session token (simplified)
   */
  private decodeSessionToken(token: string): { userId: number } | null {
    try {
      // This is a simplified implementation
      // In production, use proper JWT or signed tokens
      const parts = token.split('_');
      if (parts.length >= 2) {
        return { userId: 123456789 }; // Mock for now
      }
      return null;
    } catch {
      return null;
    }
  }
}