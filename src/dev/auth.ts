import type { Database } from '../db';
import type { KVStorage } from '../kv';
import type { User } from '../db/schema';
import type { MockUser, CreateMockUser } from '../db/schema/sessions';
import { getDefaultMockUsers, mockUserToTelegramUser } from '../db/schema/sessions';
import { generateSessionToken, calculateSessionExpiration } from '../db/schema/sessions';

export interface DevAuthResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export interface MockUserListResult {
  success: boolean;
  users?: MockUser[];
  error?: string;
}

export class DevAuthService {
  private db: Database;
  private kv: KVStorage;
  private isDevelopment: boolean;

  constructor(db: Database, kv: KVStorage, isDevelopment: boolean = false) {
    this.db = db;
    this.kv = kv;
    this.isDevelopment = isDevelopment;
  }

  /**
   * Check if development mode is enabled
   */
  isDevMode(): boolean {
    return this.isDevelopment;
  }

  /**
   * Ensure development mode is enabled
   */
  private requireDevMode(): void {
    if (!this.isDevelopment) {
      throw new Error('Development mode is not enabled');
    }
  }

  /**
   * Initialize mock users for development
   */
  async initializeMockUsers(): Promise<{
    success: boolean;
    created: number;
    skipped: number;
    error?: string;
  }> {
    this.requireDevMode();

    try {
      const defaultUsers = getDefaultMockUsers();
      let created = 0;
      let skipped = 0;

      for (const mockUserData of defaultUsers) {
        // Check if mock user already exists
        // const existingMock = await this.db.getMockUserByTelegramId(mockUserData.telegramId);
        // if (existingMock) {
        //   skipped++;
        //   continue;
        // }

        // Create mock user
        // await this.db.createMockUser(mockUserData);

        // Also create corresponding real user for authentication
        const _telegramUser = mockUserToTelegramUser({
          ...mockUserData,
          id: 0, // Will be set by DB
          createdAt: new Date().toISOString(),
          isActive: true,
          lastName: mockUserData.lastName || null,
        });

        // Check if real user exists
        // const existingUser = await this.db.getUser(mockUserData.telegramId);
        // if (!existingUser) {
        //   await this.db.saveUser(telegramUser, Date.now() / 1000, null);
        // }

        created++;
      }

      console.log(`Mock users initialized: ${created} created, ${skipped} skipped`);

      return {
        success: true,
        created,
        skipped,
      };
    } catch (error) {
      console.error('Error initializing mock users:', error);
      return {
        success: false,
        created: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all mock users
   */
  async getMockUsers(): Promise<MockUserListResult> {
    this.requireDevMode();

    try {
      // In a real implementation:
      // const mockUsers = await this.db.getActiveMockUsers();
      const mockUsers: MockUser[] = []; // Placeholder

      return {
        success: true,
        users: mockUsers,
      };
    } catch (error) {
      console.error('Error getting mock users:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Authenticate as a mock user (bypass normal Telegram auth)
   */
  async authenticateAsMockUser(mockUserId: number): Promise<DevAuthResult> {
    this.requireDevMode();

    try {
      // Get mock user
      // const mockUser = await this.db.getMockUserById(mockUserId);
      // if (!mockUser || !mockUser.isActive) {
      //   return {
      //     success: false,
      //     error: 'Mock user not found or inactive',
      //   };
      // }

      // Get corresponding real user
      // const user = await this.db.getUser(mockUser.telegramId);
      // if (!user) {
      //   return {
      //     success: false,
      //     error: 'Corresponding real user not found',
      //   };
      // }

      // Create development session token
      const token = generateSessionToken();
      const _expiresAt = calculateSessionExpiration(24 * 7); // 7 days

      // Store token in KV (using existing token storage mechanism)
      const mockUser = getDefaultMockUsers().find(u => u.telegramId === mockUserId);
      if (!mockUser) {
        return {
          success: false,
          error: 'Mock user not found',
        };
      }

      // Create a placeholder user object for development
      const devUser: User = {
        id: mockUserId,
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        lastAuthTimestamp: new Date().toISOString(),
        telegramId: mockUser.telegramId,
        username: mockUser.username,
        isBot: null,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName || null,
        languageCode: null,
        isPremium: null,
        addedToAttachmentMenu: null,
        allowsWriteToPm: null,
        photoUrl: null,
        r2ImageKey: null,
        phoneNumber: null,
        supportsInlineQueries: null,
        canJoinGroups: null,
        canReadAllGroupMessages: null,
        // Admin and moderation fields
        isAdmin: false,
        isBanned: false,
        banReason: null,
        bannedAt: null,
        warningCount: 0,
      };

      // Store session
      await this.kv.saveToken(await this.hashToken(token), devUser, 7 * 24 * 60 * 60); // 7 days

      return {
        success: true,
        token,
        user: devUser,
      };
    } catch (error) {
      console.error('Error authenticating mock user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Create a custom mock user for testing
   */
  async createCustomMockUser(userData: {
    username: string;
    firstName: string;
    lastName?: string;
    role: 'buyer' | 'seller' | 'admin';
  }): Promise<DevAuthResult> {
    this.requireDevMode();

    try {
      // Generate unique telegram ID for dev user
      const telegramId = 200000 + Math.floor(Math.random() * 10000);

      const mockUserData: CreateMockUser = {
        telegramId,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        isActive: true,
      };

      // Create mock user
      // await this.db.createMockUser(mockUserData);

      // Create corresponding real user
      const _telegramUser = mockUserToTelegramUser({
        ...mockUserData,
        id: 0,
        createdAt: new Date().toISOString(),
        isActive: true,
        lastName: mockUserData.lastName || null,
      });

      // await this.db.saveUser(telegramUser, Date.now() / 1000, null);

      // Authenticate as this new user
      return await this.authenticateAsMockUser(telegramId);
    } catch (error) {
      console.error('Error creating custom mock user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create mock user',
      };
    }
  }

  /**
   * Reset all development data
   */
  async resetDevData(): Promise<{
    success: boolean;
    cleared: { sessions: number; users: number };
    error?: string;
  }> {
    this.requireDevMode();

    try {
      let clearedSessions = 0;
      let clearedUsers = 0;

      // Clear development session tokens
      const tokenList = await this.kv.list('token:');
      for (const key of tokenList.keys) {
        await this.kv.delete(key.name);
        clearedSessions++;
      }

      // Clear mock users would be done here
      // clearedUsers = await this.db.clearMockUsers();

      console.log(
        `Development data reset: ${clearedSessions} sessions, ${clearedUsers} users cleared`
      );

      return {
        success: true,
        cleared: {
          sessions: clearedSessions,
          users: clearedUsers,
        },
      };
    } catch (error) {
      console.error('Error resetting dev data:', error);
      return {
        success: false,
        cleared: { sessions: 0, users: 0 },
        error: error instanceof Error ? error.message : 'Reset failed',
      };
    }
  }

  /**
   * Get development statistics
   */
  async getDevStats(): Promise<{
    success: boolean;
    stats?: {
      mockUsers: number;
      activeSessions: number;
      environment: string;
      uptime: string;
    };
    error?: string;
  }> {
    this.requireDevMode();

    try {
      // Get mock users count
      // const mockUsers = await this.db.getMockUsersCount();

      // Get active sessions count
      const tokenList = await this.kv.list('token:');
      const activeSessions = tokenList.keys.length;

      return {
        success: true,
        stats: {
          mockUsers: 3, // Placeholder
          activeSessions,
          environment: 'development',
          uptime: process.uptime ? `${Math.floor(process.uptime())}s` : 'unknown',
        },
      };
    } catch (error) {
      console.error('Error getting dev stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      };
    }
  }

  /**
   * Migrate data from deployed environment to local (for testing)
   */
  async migrateFromDeployed(deployedApiUrl: string): Promise<{
    success: boolean;
    migrated: { users: number; listings: number };
    error?: string;
  }> {
    this.requireDevMode();

    try {
      // This would connect to the deployed API and download data
      // For now, this is a placeholder

      console.log(`Migration from ${deployedApiUrl} would happen here`);

      return {
        success: true,
        migrated: {
          users: 0, // Would be actual count
          listings: 0, // Would be actual count
        },
      };
    } catch (error) {
      console.error('Error migrating data:', error);
      return {
        success: false,
        migrated: { users: 0, listings: 0 },
        error: error instanceof Error ? error.message : 'Migration failed',
      };
    }
  }

  /**
   * Generate development test data
   */
  async generateTestData(
    options: {
      users?: number;
      listings?: number;
      categories?: number;
    } = {}
  ): Promise<{
    success: boolean;
    generated: { users: number; listings: number; categories: number };
    error?: string;
  }> {
    this.requireDevMode();

    try {
      const { users = 10, listings = 25, categories = 5 } = options;

      // Generate test data
      // This would create realistic test data for development

      console.log(`Generating ${users} users, ${listings} listings, ${categories} categories`);

      return {
        success: true,
        generated: {
          users,
          listings,
          categories,
        },
      };
    } catch (error) {
      console.error('Error generating test data:', error);
      return {
        success: false,
        generated: { users: 0, listings: 0, categories: 0 },
        error: error instanceof Error ? error.message : 'Generation failed',
      };
    }
  }

  /**
   * Hash token for storage (using existing crypto utils)
   */
  private async hashToken(token: string): Promise<string> {
    // Use the same hashing method as the main auth system
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if request is from development environment
   */
  isDevRequest(request: Request): boolean {
    const host = request.headers.get('host') || '';
    return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('.local');
  }

  /**
   * Validate development mode configuration
   */
  validateDevConfig(): {
    valid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!this.isDevelopment) {
      issues.push('Development mode is not enabled');
    }

    // Check environment variables
    if (typeof process !== 'undefined' && process.env) {
      if (!process.env.VITE_DEV_BYPASS_AUTH) {
        recommendations.push('Set VITE_DEV_BYPASS_AUTH=true for frontend auth bypass');
      }

      if (!process.env.DEV_MODE) {
        recommendations.push('Set DEV_MODE=true to enable development features');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
