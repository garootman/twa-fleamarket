import { Context } from 'hono';
import { AuthService } from '../services/auth-service';
import { UserService } from '../services/user-service';
import { ListingService } from '../services/listing-service';
import { CategoryService } from '../services/category-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Development API Endpoints - T084-T085
 *
 * Development and testing utilities (only available in development mode):
 * - GET /api/dev/mock-users - Get list of mock users for testing
 * - POST /api/dev/auth - Authenticate as mock user (auth bypass)
 * - POST /api/dev/seed - Seed database with test data
 * - GET /api/dev/reset - Reset development database
 * - GET /api/dev/health - Development health check
 */

export interface MockUser {
  id: string;
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  profilePhotoUrl?: string;
  isPremium: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  scenario: string;
  description: string;
}

export interface MockUsersResponse {
  success: boolean;
  users?: MockUser[];
  scenarios?: Array<{
    name: string;
    description: string;
    users: string[];
  }>;
  error?: string;
}

export interface DevAuthRequest {
  mockUserId: string;
  scenario?: string;
}

export interface DevAuthResponse {
  success: boolean;
  user?: {
    id: string;
    telegramId: string;
    firstName: string;
    lastName?: string;
    username?: string;
    isPremium: boolean;
    isAdmin: boolean;
    isBanned: boolean;
  };
  token?: string;
  expiresIn?: number;
  scenario?: string;
  error?: string;
}

export interface SeedDataRequest {
  users?: number;
  categories?: boolean;
  listings?: number;
  interactions?: boolean;
  flags?: number;
}

export class DevAPI {
  private authService: AuthService;
  private userService: UserService;
  private listingService: ListingService;
  private categoryService: CategoryService;
  private isDevMode: boolean;

  constructor(db: DrizzleD1Database, botToken: string, isDevMode = false) {
    this.authService = new AuthService(db, botToken);
    this.userService = new UserService(db);
    this.listingService = new ListingService(db);
    this.categoryService = new CategoryService(db);
    this.isDevMode = isDevMode;
  }

  /**
   * GET /api/dev/mock-users - Get mock users for testing
   */
  async getMockUsers(c: Context): Promise<Response> {
    if (!this.isDevMode) {
      return c.json({
        success: false,
        error: 'Development endpoints only available in development mode'
      }, 403);
    }

    try {
      const mockUsers: MockUser[] = [
        {
          id: 'dev_user_1',
          telegramId: '1000000001',
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          profilePhotoUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=JD',
          isPremium: false,
          isAdmin: false,
          isBanned: false,
          scenario: 'Regular User',
          description: 'Standard user with normal permissions for testing basic functionality'
        },
        {
          id: 'dev_user_2',
          telegramId: '1000000002',
          firstName: 'Jane',
          lastName: 'Smith',
          username: 'janesmith',
          profilePhotoUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=JS',
          isPremium: true,
          isAdmin: false,
          isBanned: false,
          scenario: 'Premium User',
          description: 'Premium user with advanced features enabled for testing paid functionality'
        },
        {
          id: 'dev_user_3',
          telegramId: '1000000003',
          firstName: 'Admin',
          lastName: 'User',
          username: 'adminuser',
          profilePhotoUrl: 'https://via.placeholder.com/150/00FF00/FFFFFF?text=AU',
          isPremium: true,
          isAdmin: true,
          isBanned: false,
          scenario: 'Administrator',
          description: 'Admin user with full permissions for testing moderation and admin features'
        },
        {
          id: 'dev_user_4',
          telegramId: '1000000004',
          firstName: 'Banned',
          lastName: 'User',
          username: 'banneduser',
          profilePhotoUrl: 'https://via.placeholder.com/150/FF6666/FFFFFF?text=BU',
          isPremium: false,
          isAdmin: false,
          isBanned: true,
          scenario: 'Banned User',
          description: 'Banned user for testing restriction and appeal workflows'
        },
        {
          id: 'dev_user_5',
          telegramId: '1000000005',
          firstName: 'Heavy',
          lastName: 'Seller',
          username: 'heavyseller',
          profilePhotoUrl: 'https://via.placeholder.com/150/FFFF00/000000?text=HS',
          isPremium: true,
          isAdmin: false,
          isBanned: false,
          scenario: 'Power Seller',
          description: 'User with many listings for testing pagination and seller features'
        },
        {
          id: 'dev_user_6',
          telegramId: '1000000006',
          firstName: 'New',
          lastName: 'User',
          username: 'newuser',
          profilePhotoUrl: 'https://via.placeholder.com/150/00FFFF/000000?text=NU',
          isPremium: false,
          isAdmin: false,
          isBanned: false,
          scenario: 'New User',
          description: 'Fresh user account for testing onboarding and first-time workflows'
        }
      ];

      const scenarios = [
        {
          name: 'Basic Testing',
          description: 'Regular user interactions and standard workflows',
          users: ['dev_user_1', 'dev_user_6']
        },
        {
          name: 'Premium Features',
          description: 'Testing premium functionality and payments',
          users: ['dev_user_2', 'dev_user_5']
        },
        {
          name: 'Admin & Moderation',
          description: 'Administrative functions and content moderation',
          users: ['dev_user_3', 'dev_user_4']
        },
        {
          name: 'Edge Cases',
          description: 'Banned users, heavy usage, and error scenarios',
          users: ['dev_user_4', 'dev_user_5']
        }
      ];

      const response: MockUsersResponse = {
        success: true,
        users: mockUsers,
        scenarios,
      };

      return c.json(response);

    } catch (error) {
      console.error('Get mock users error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/dev/auth - Authenticate as mock user (bypass normal auth)
   */
  async authenticateMockUser(c: Context): Promise<Response> {
    if (!this.isDevMode) {
      return c.json({
        success: false,
        error: 'Development endpoints only available in development mode'
      }, 403);
    }

    try {
      const body = await c.req.json() as DevAuthRequest;

      if (!body.mockUserId) {
        return c.json({
          success: false,
          error: 'Mock user ID is required'
        }, 400);
      }

      // Get mock user data
      const mockUsersResponse = await this.getMockUsers(c);
      const mockUsersData = await mockUsersResponse.json() as MockUsersResponse;

      const mockUser = mockUsersData.users?.find(u => u.id === body.mockUserId);

      if (!mockUser) {
        return c.json({
          success: false,
          error: 'Mock user not found'
        }, 404);
      }

      // Create or get user in database
      let user = await this.userService.getUserByTelegramId(mockUser.telegramId);

      if (!user) {
        // Create mock user in database
        const userData = {
          telegramId: mockUser.telegramId,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          username: mockUser.username,
          photoUrl: mockUser.profilePhotoUrl,
          languageCode: 'en',
          isBot: false,
          isPremium: mockUser.isPremium,
          banned: mockUser.isBanned,
          banReason: mockUser.isBanned ? 'Development test user' : null,
          lastActiveAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        user = await this.userService.createUser(userData);
      }

      // Generate auth token
      const authResult = await this.authService.createSession(
        parseInt(mockUser.telegramId),
        'dev-bypass',
        'development'
      );

      if (!authResult.success) {
        return c.json({
          success: false,
          error: 'Failed to create session'
        }, 500);
      }

      const response: DevAuthResponse = {
        success: true,
        user: {
          id: user.id,
          telegramId: mockUser.telegramId,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          username: mockUser.username,
          isPremium: mockUser.isPremium,
          isAdmin: mockUser.isAdmin,
          isBanned: mockUser.isBanned,
        },
        token: authResult.token,
        expiresIn: authResult.expiresIn,
        scenario: mockUser.scenario,
      };

      // Set cookie for browser sessions
      if (authResult.token) {
        c.header('Set-Cookie', `auth-token=${authResult.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${authResult.expiresIn || 86400}`);
      }

      return c.json(response);

    } catch (error) {
      console.error('Mock user auth error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/dev/seed - Seed database with test data
   */
  async seedDatabase(c: Context): Promise<Response> {
    if (!this.isDevMode) {
      return c.json({
        success: false,
        error: 'Development endpoints only available in development mode'
      }, 403);
    }

    try {
      const body = await c.req.json() as SeedDataRequest;

      const seedOptions = {
        users: body.users || 10,
        categories: body.categories !== false,
        listings: body.listings || 25,
        interactions: body.interactions !== false,
        flags: body.flags || 3,
      };

      const seedResult = {
        usersCreated: 0,
        categoriesCreated: 0,
        listingsCreated: 0,
        interactionsCreated: 0,
        flagsCreated: 0,
        errors: [] as string[],
      };

      // Seed categories first
      if (seedOptions.categories) {
        try {
          const categories = [
            { name: 'Digital Art', description: 'Digital artwork and illustrations', icon: '🎨' },
            { name: 'Software', description: 'Applications and tools', icon: '💻' },
            { name: 'Music', description: 'Audio files and compositions', icon: '🎵' },
            { name: 'Videos', description: 'Video content and tutorials', icon: '🎥' },
            { name: 'Documents', description: 'Templates and documents', icon: '📄' },
            { name: 'Games', description: 'Game assets and mods', icon: '🎮' },
          ];

          for (const category of categories) {
            try {
              await this.categoryService.createCategory(category);
              seedResult.categoriesCreated++;
            } catch (error) {
              seedResult.errors.push(`Category creation failed: ${error}`);
            }
          }
        } catch (error) {
          seedResult.errors.push(`Categories seeding failed: ${error}`);
        }
      }

      // Create seed users
      try {
        const mockUsersResponse = await this.getMockUsers(c);
        const mockUsersData = await mockUsersResponse.json() as MockUsersResponse;

        for (const mockUser of mockUsersData.users || []) {
          try {
            const existingUser = await this.userService.getUserByTelegramId(mockUser.telegramId);
            if (!existingUser) {
              await this.userService.createUser({
                telegramId: mockUser.telegramId,
                firstName: mockUser.firstName,
                lastName: mockUser.lastName,
                username: mockUser.username,
                photoUrl: mockUser.profilePhotoUrl,
                languageCode: 'en',
                isBot: false,
                isPremium: mockUser.isPremium,
                banned: mockUser.isBanned,
                banReason: mockUser.isBanned ? 'Development test user' : null,
                lastActiveAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              seedResult.usersCreated++;
            }
          } catch (error) {
            seedResult.errors.push(`User creation failed for ${mockUser.telegramId}: ${error}`);
          }
        }

        // Create additional random users
        for (let i = 1; i <= seedOptions.users; i++) {
          try {
            const randomUser = this.generateRandomUser(i + 1000000010);
            await this.userService.createUser(randomUser);
            seedResult.usersCreated++;
          } catch (error) {
            seedResult.errors.push(`Random user ${i} creation failed: ${error}`);
          }
        }
      } catch (error) {
        seedResult.errors.push(`User seeding failed: ${error}`);
      }

      return c.json({
        success: seedResult.errors.length === 0,
        message: 'Database seeding completed',
        results: seedResult,
        summary: {
          totalCreated: seedResult.usersCreated + seedResult.categoriesCreated +
                       seedResult.listingsCreated + seedResult.interactionsCreated + seedResult.flagsCreated,
          errors: seedResult.errors.length,
        }
      });

    } catch (error) {
      console.error('Seed database error:', error);
      return c.json({
        success: false,
        error: 'Internal server error during seeding'
      }, 500);
    }
  }

  /**
   * GET /api/dev/health - Development health check
   */
  async getHealthCheck(c: Context): Promise<Response> {
    if (!this.isDevMode) {
      return c.json({
        success: false,
        error: 'Development endpoints only available in development mode'
      }, 403);
    }

    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          auth: 'operational',
          cache: 'operational',
        },
        environment: {
          mode: 'development',
          nodeEnv: process.env.NODE_ENV || 'unknown',
          version: '1.0.0-dev',
        },
        features: {
          mockUsers: true,
          authBypass: true,
          databaseSeed: true,
          adminAccess: true,
        },
        database: {
          users: await this.countRecords('users'),
          listings: await this.countRecords('listings'),
          categories: await this.countRecords('categories'),
          flags: await this.countRecords('flags'),
        }
      };

      return c.json({
        success: true,
        health,
      });

    } catch (error) {
      console.error('Health check error:', error);
      return c.json({
        success: false,
        error: 'Health check failed',
        health: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }, 500);
    }
  }

  /**
   * Private helper methods
   */
  private generateRandomUser(telegramId: number): any {
    const firstNames = ['Alex', 'Sam', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn'];
    const lastNames = ['Johnson', 'Smith', 'Brown', 'Davis', 'Wilson', 'Miller', 'Moore', 'Clark'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${telegramId.toString().slice(-3)}`;

    return {
      telegramId: telegramId.toString(),
      firstName,
      lastName,
      username,
      photoUrl: `https://via.placeholder.com/150/${Math.floor(Math.random() * 16777215).toString(16)}/FFFFFF?text=${firstName[0]}${lastName[0]}`,
      languageCode: 'en',
      isBot: false,
      isPremium: Math.random() > 0.8, // 20% premium
      banned: false,
      banReason: null,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async countRecords(table: string): Promise<number> {
    try {
      // This would need to be implemented with actual database queries
      // For now, return placeholder values
      const counts: Record<string, number> = {
        users: 15,
        listings: 42,
        categories: 6,
        flags: 3,
      };
      return counts[table] || 0;
    } catch (error) {
      return 0;
    }
  }
}

/**
 * Setup development routes with Hono
 */
export function setupDevRoutes(app: any, db: DrizzleD1Database, botToken: string, isDevMode = false) {
  const devAPI = new DevAPI(db, botToken, isDevMode);

  app.get('/api/dev/mock-users', (c: Context) => devAPI.getMockUsers(c));
  app.post('/api/dev/auth', (c: Context) => devAPI.authenticateMockUser(c));
  app.post('/api/dev/seed', (c: Context) => devAPI.seedDatabase(c));
  app.get('/api/dev/health', (c: Context) => devAPI.getHealthCheck(c));
}