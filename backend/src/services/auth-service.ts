import { createHmac } from 'node:crypto';
import { UserModel } from '../db/models/user';
import { UserSessionModel } from '../db/models/user-session';
import { MockUserModel } from '../db/models/mock-user';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * AuthService - T051
 *
 * Handles Telegram WebApp authentication, session management, and user validation.
 * Provides secure authentication flow with JWT-like tokens and development bypass.
 */

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AuthResult {
  success: boolean;
  user?: any;
  session?: any;
  token?: string;
  error?: string;
  isNewUser?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  user?: any;
  session?: any;
  error?: string;
  needsRefresh?: boolean;
}

export interface MockAuthData {
  telegramId: number;
  bypassAuth?: boolean;
}

export class AuthService {
  private userModel: UserModel;
  private sessionModel: UserSessionModel;
  private mockUserModel: MockUserModel;
  private botToken: string;
  private isDevelopment: boolean;

  constructor(db: DrizzleD1Database, botToken: string, isDevelopment = false) {
    this.userModel = new UserModel(db);
    this.sessionModel = new UserSessionModel(db);
    this.mockUserModel = new MockUserModel(db);
    this.botToken = botToken;
    this.isDevelopment = isDevelopment;
  }

  /**
   * Authenticate user with Telegram WebApp data
   */
  async authenticateTelegram(
    authData: TelegramAuthData,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthResult> {
    try {
      // Validate Telegram auth data
      const validationResult = this.validateTelegramAuth(authData);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error || 'Invalid Telegram authentication data',
        };
      }

      // Check if auth data is recent (within 24 hours)
      const authAge = Date.now() / 1000 - authData.auth_date;
      if (authAge > 24 * 60 * 60) {
        return {
          success: false,
          error: 'Authentication data is too old',
        };
      }

      // Create or update user
      const userData = {
        telegramId: authData.id,
        username: authData.username,
        firstName: authData.first_name,
        lastName: authData.last_name,
        profilePhotoUrl: authData.photo_url,
      };

      const user = await this.userModel.createOrUpdate(userData);
      const isNewUser = !(await this.userModel.exists(authData.id));

      // Check if user is banned
      if (user.isBanned) {
        return {
          success: false,
          error: 'User account is banned',
          user,
        };
      }

      // Create session
      const session = await this.sessionModel.create({
        userId: user.telegramId,
        userAgent,
        ipAddress,
        expirationHours: 24 * 7, // 7 days
      });

      // Update last active
      await this.userModel.updateLastActive(user.telegramId);

      return {
        success: true,
        user,
        session,
        token: session.token,
        isNewUser,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Authenticate mock user for development
   */
  async authenticateMock(
    mockData: MockAuthData,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthResult> {
    if (!this.isDevelopment) {
      return {
        success: false,
        error: 'Mock authentication is only available in development mode',
      };
    }

    try {
      // Get mock user
      const mockAuthResult = await this.mockUserModel.authenticate(mockData.telegramId);
      if (!mockAuthResult.success) {
        return {
          success: false,
          error: mockAuthResult.error || 'Mock user authentication failed',
        };
      }

      const mockUser = mockAuthResult.user!;

      // Create or update real user from mock user
      const userData = {
        telegramId: mockUser.telegramId,
        username: mockUser.username,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
      };

      const user = await this.userModel.createOrUpdate(userData);
      const isNewUser = !(await this.userModel.exists(mockUser.telegramId));

      // Create session
      const session = await this.sessionModel.create({
        userId: user.telegramId,
        userAgent: userAgent || 'MockClient/1.0',
        ipAddress: ipAddress || '127.0.0.1',
        expirationHours: 24, // 1 day for mock sessions
      });

      return {
        success: true,
        user,
        session,
        token: session.token,
        isNewUser,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mock authentication failed',
      };
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<ValidationResult> {
    try {
      const validationResult = await this.sessionModel.validateAndRefresh(token);

      if (!validationResult.valid) {
        return {
          valid: false,
          error: validationResult.reason || 'Invalid session',
        };
      }

      const session = validationResult.session!;

      // Get user data
      const user = await this.userModel.findByTelegramId(session.userId);
      if (!user) {
        return {
          valid: false,
          error: 'User not found',
        };
      }

      // Check if user is banned
      if (user.isBanned) {
        return {
          valid: false,
          error: 'User account is banned',
          user,
        };
      }

      return {
        valid: true,
        user,
        session,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Session validation failed',
      };
    }
  }

  /**
   * Refresh session (extend expiration)
   */
  async refreshSession(token: string, additionalHours = 24 * 7): Promise<AuthResult> {
    try {
      const validationResult = await this.validateSession(token);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error,
        };
      }

      const session = validationResult.session!;
      const user = validationResult.user!;

      // Extend session
      const extendedSession = await this.sessionModel.extend(session.id, additionalHours);
      if (!extendedSession) {
        return {
          success: false,
          error: 'Failed to refresh session',
        };
      }

      return {
        success: true,
        user,
        session: extendedSession,
        token: extendedSession.token,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session refresh failed',
      };
    }
  }

  /**
   * Logout user (revoke session)
   */
  async logout(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      const session = await this.sessionModel.findByToken(token);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const revokedSession = await this.sessionModel.revoke(session.id);
      if (!revokedSession) {
        return { success: false, error: 'Failed to revoke session' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      };
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(
    userId: number,
    exceptToken?: string
  ): Promise<{ success: boolean; revokedCount: number; error?: string }> {
    try {
      const revokedCount = await this.sessionModel.revokeAllUserSessions(userId, exceptToken);

      return {
        success: true,
        revokedCount,
      };
    } catch (error) {
      return {
        success: false,
        revokedCount: 0,
        error: error instanceof Error ? error.message : 'Logout all failed',
      };
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId: number, activeOnly = true): Promise<any[]> {
    return await this.sessionModel.getUserSessions(userId, activeOnly);
  }

  /**
   * Validate Telegram WebApp authentication data
   */
  private validateTelegramAuth(authData: TelegramAuthData): { valid: boolean; error?: string } {
    try {
      // Extract hash and create data string
      const { hash, ...data } = authData;

      // Create sorted query string
      const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${(data as any)[key]}`)
        .join('\n');

      // Create secret key from bot token
      const secretKey = createHmac('sha256', 'WebAppData').update(this.botToken).digest();

      // Calculate expected hash
      const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      // Compare hashes
      if (hash !== expectedHash) {
        return { valid: false, error: 'Invalid authentication hash' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Hash validation failed',
      };
    }
  }

  /**
   * Extract user info from session token without validation (for middleware)
   */
  async getSessionInfo(
    token: string
  ): Promise<{ userId?: number; sessionId?: number; error?: string }> {
    try {
      const session = await this.sessionModel.findByToken(token);
      if (!session) {
        return { error: 'Session not found' };
      }

      return {
        userId: session.userId,
        sessionId: session.id,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to get session info',
      };
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: number, adminId?: string): Promise<boolean> {
    try {
      const user = await this.userModel.findByTelegramId(userId);
      if (!user) return false;

      return this.userModel.isAdmin(user, adminId);
    } catch {
      return false;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupSessions(): Promise<number> {
    return await this.sessionModel.cleanupExpired();
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    uniqueUsers: number;
    recentLogins: number;
  }> {
    const sessionStats = await this.sessionModel.getQuickStats();

    // Get recent logins (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentSessions = await this.sessionModel.search({ createdAfter: yesterday }, 1, 1000);

    return {
      totalSessions:
        sessionStats.activeSessions + sessionStats.expiredSessions + sessionStats.revokedSessions,
      activeSessions: sessionStats.activeSessions,
      uniqueUsers: sessionStats.uniqueUsers,
      recentLogins: recentSessions.totalCount,
    };
  }

  /**
   * Development helper - initialize mock users
   */
  async initializeMockUsers(): Promise<{ created: number; errors: string[] }> {
    if (!this.isDevelopment) {
      return { created: 0, errors: ['Mock users only available in development mode'] };
    }

    return await this.mockUserModel.initializeDefaults();
  }

  /**
   * Development helper - reset mock authentication
   */
  async resetMockAuth(): Promise<{ success: boolean; error?: string }> {
    if (!this.isDevelopment) {
      return { success: false, error: 'Mock reset only available in development mode' };
    }

    try {
      const deletedCount = await this.mockUserModel.resetAll();
      await this.initializeMockUsers();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mock reset failed',
      };
    }
  }
}
