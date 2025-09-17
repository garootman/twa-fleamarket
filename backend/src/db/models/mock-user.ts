import { eq, and, desc, asc, count, sql, gte, lte, like, isNull, isNotNull } from 'drizzle-orm';
import {
  mockUsers,
  type MockUser,
  type NewMockUser,
  type CreateMockUser,
  MockUserRole,
  getDefaultMockUsers,
  mockUserToTelegramUser,
  MOCK_USER_CONSTRAINTS
} from '../../src/db/schema/sessions';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * MockUser Model - T049
 *
 * Provides business logic layer for mock user management in local development.
 * Handles test user creation, role assignment, authentication bypass, and test scenario setup.
 */

export interface MockUserWithDetails extends MockUser {
  daysSinceCreated: number;
  realUser?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
    isAdmin: boolean;
  };
  testScenariosUsed: string[];
  lastUsedInTest?: string;
}

export interface MockUserSearchFilters {
  role?: MockUserRole;
  isActive?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  searchTerm?: string; // Search in username, firstName, lastName
  hasRealUser?: boolean;
  telegramIdRange?: { min?: number; max?: number };
}

export interface MockUserListResponse {
  users: MockUserWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    totalUsers: number;
    activeUsers: number;
    usersByRole: Record<MockUserRole, number>;
    usersWithRealAccount: number;
  };
}

export interface TestScenario {
  name: string;
  description: string;
  requiredRoles: MockUserRole[];
  setupSteps: string[];
  mockUsers: CreateMockUser[];
}

export interface MockUserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersByRole: Record<MockUserRole, number>;
  usersWithRealAccount: number;
  averageUsagePerScenario: number;
  recentUsers: MockUser[];
  mostUsedUsers: Array<{ user: MockUser; usageCount: number }>;
}

export class MockUserModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new mock user
   */
  async create(userData: CreateMockUser): Promise<MockUser> {
    // Validate Telegram ID range
    if (userData.telegramId < MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID ||
        userData.telegramId > MOCK_USER_CONSTRAINTS.MAX_TELEGRAM_ID) {
      throw new Error(`Telegram ID must be between ${MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID} and ${MOCK_USER_CONSTRAINTS.MAX_TELEGRAM_ID}`);
    }

    // Check if Telegram ID already exists
    const existingUser = await this.findByTelegramId(userData.telegramId);
    if (existingUser) {
      throw new Error(`Mock user with Telegram ID ${userData.telegramId} already exists`);
    }

    // Check if username already exists
    const existingUsername = await this.findByUsername(userData.username);
    if (existingUsername) {
      throw new Error(`Mock user with username ${userData.username} already exists`);
    }

    // Validate lengths
    if (userData.username.length > MOCK_USER_CONSTRAINTS.MAX_USERNAME_LENGTH) {
      throw new Error(`Username cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_USERNAME_LENGTH} characters`);
    }

    if (userData.firstName.length > MOCK_USER_CONSTRAINTS.MAX_FIRST_NAME_LENGTH) {
      throw new Error(`First name cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_FIRST_NAME_LENGTH} characters`);
    }

    if (userData.lastName && userData.lastName.length > MOCK_USER_CONSTRAINTS.MAX_LAST_NAME_LENGTH) {
      throw new Error(`Last name cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_LAST_NAME_LENGTH} characters`);
    }

    const [user] = await this.db
      .insert(mockUsers)
      .values({
        telegramId: userData.telegramId,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName || null,
        role: userData.role,
        isActive: userData.isActive ?? true,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return user;
  }

  /**
   * Find mock user by ID
   */
  async findById(id: number): Promise<MockUser | null> {
    const [user] = await this.db
      .select()
      .from(mockUsers)
      .where(eq(mockUsers.id, id))
      .limit(1);

    return user || null;
  }

  /**
   * Find mock user by Telegram ID
   */
  async findByTelegramId(telegramId: number): Promise<MockUser | null> {
    const [user] = await this.db
      .select()
      .from(mockUsers)
      .where(eq(mockUsers.telegramId, telegramId))
      .limit(1);

    return user || null;
  }

  /**
   * Find mock user by username
   */
  async findByUsername(username: string): Promise<MockUser | null> {
    const [user] = await this.db
      .select()
      .from(mockUsers)
      .where(eq(mockUsers.username, username))
      .limit(1);

    return user || null;
  }

  /**
   * Get mock user with detailed information
   */
  async getWithDetails(id: number): Promise<MockUserWithDetails | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const now = new Date();
    const createdDate = new Date(user.createdAt);

    const userWithDetails: MockUserWithDetails = {
      ...user,
      daysSinceCreated: Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)),
      testScenariosUsed: [], // Would be tracked in test logs
      lastUsedInTest: undefined, // Would be tracked in test logs
    };

    return userWithDetails;
  }

  /**
   * Update mock user
   */
  async update(id: number, updates: {
    username?: string;
    firstName?: string;
    lastName?: string;
    role?: MockUserRole;
    isActive?: boolean;
  }): Promise<MockUser | null> {
    // Validate username uniqueness if updating
    if (updates.username) {
      const existingUser = await this.findByUsername(updates.username);
      if (existingUser && existingUser.id !== id) {
        throw new Error(`Username ${updates.username} is already taken`);
      }
    }

    const [user] = await this.db
      .update(mockUsers)
      .set(updates)
      .where(eq(mockUsers.id, id))
      .returning();

    return user || null;
  }

  /**
   * Toggle mock user active status
   */
  async toggle(id: number): Promise<MockUser | null> {
    const user = await this.findById(id);
    if (!user) {
      throw new Error('Mock user not found');
    }

    return await this.update(id, { isActive: !user.isActive });
  }

  /**
   * Delete mock user
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db
      .delete(mockUsers)
      .where(eq(mockUsers.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Get users by role
   */
  async getByRole(role: MockUserRole, activeOnly = true): Promise<MockUser[]> {
    let query = this.db
      .select()
      .from(mockUsers)
      .where(eq(mockUsers.role, role));

    if (activeOnly) {
      query = query.where(and(
        eq(mockUsers.role, role),
        eq(mockUsers.isActive, true)
      ));
    }

    return await query.orderBy(asc(mockUsers.username));
  }

  /**
   * Get all active mock users
   */
  async getActive(): Promise<MockUser[]> {
    return await this.db
      .select()
      .from(mockUsers)
      .where(eq(mockUsers.isActive, true))
      .orderBy(asc(mockUsers.role), asc(mockUsers.username));
  }

  /**
   * Search and filter mock users
   */
  async search(
    filters: MockUserSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<MockUserListResponse> {
    let query = this.db.select().from(mockUsers);
    let countQuery = this.db.select({ count: count() }).from(mockUsers);

    const conditions = [];

    // Role filter
    if (filters.role) {
      conditions.push(eq(mockUsers.role, filters.role));
    }

    // Active filter
    if (filters.isActive !== undefined) {
      conditions.push(eq(mockUsers.isActive, filters.isActive));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(mockUsers.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(mockUsers.createdAt, filters.createdBefore));
    }

    // Search term filter
    if (filters.searchTerm) {
      conditions.push(
        sql`(
          ${mockUsers.username} LIKE ${`%${filters.searchTerm}%`} OR
          ${mockUsers.firstName} LIKE ${`%${filters.searchTerm}%`} OR
          ${mockUsers.lastName} LIKE ${`%${filters.searchTerm}%`}
        )`
      );
    }

    // Telegram ID range filter
    if (filters.telegramIdRange) {
      if (filters.telegramIdRange.min !== undefined) {
        conditions.push(gte(mockUsers.telegramId, filters.telegramIdRange.min));
      }
      if (filters.telegramIdRange.max !== undefined) {
        conditions.push(lte(mockUsers.telegramId, filters.telegramIdRange.max));
      }
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(asc(mockUsers.role), asc(mockUsers.username))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const userList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const usersWithDetails: MockUserWithDetails[] = await Promise.all(
      userList.map(async user => {
        const details = await this.getWithDetails(user.id);
        return details!;
      })
    );

    return {
      users: usersWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Initialize default mock users
   */
  async initializeDefaults(): Promise<{
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const defaultUsers = getDefaultMockUsers();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userData of defaultUsers) {
      try {
        // Check if user already exists
        const existing = await this.findByTelegramId(userData.telegramId);
        if (existing) {
          skipped++;
          continue;
        }

        await this.create(userData);
        created++;
      } catch (error) {
        errors.push(`Error creating user ${userData.username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        skipped++;
      }
    }

    return { created, skipped, errors };
  }

  /**
   * Create users for specific test scenario
   */
  async createForScenario(scenario: TestScenario): Promise<{
    created: MockUser[];
    errors: string[];
  }> {
    const created: MockUser[] = [];
    const errors: string[] = [];

    for (const userData of scenario.mockUsers) {
      try {
        // Check if user already exists
        const existing = await this.findByTelegramId(userData.telegramId);
        if (existing) {
          created.push(existing);
          continue;
        }

        const user = await this.create(userData);
        created.push(user);
      } catch (error) {
        errors.push(`Error creating user ${userData.username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { created, errors };
  }

  /**
   * Convert mock user to Telegram user format
   */
  toTelegramUser(mockUser: MockUser) {
    return mockUserToTelegramUser(mockUser);
  }

  /**
   * Authenticate mock user (bypass normal auth)
   */
  async authenticate(telegramId: number): Promise<{
    success: boolean;
    user?: MockUser;
    telegramUser?: any;
    error?: string;
  }> {
    const mockUser = await this.findByTelegramId(telegramId);

    if (!mockUser) {
      return {
        success: false,
        error: 'Mock user not found',
      };
    }

    if (!mockUser.isActive) {
      return {
        success: false,
        user: mockUser,
        error: 'Mock user is inactive',
      };
    }

    const telegramUser = this.toTelegramUser(mockUser);

    return {
      success: true,
      user: mockUser,
      telegramUser,
    };
  }

  /**
   * Reset all mock users (for test cleanup)
   */
  async resetAll(): Promise<number> {
    const result = await this.db
      .delete(mockUsers);

    return result.rowsAffected;
  }

  /**
   * Reset mock users by role
   */
  async resetByRole(role: MockUserRole): Promise<number> {
    const result = await this.db
      .delete(mockUsers)
      .where(eq(mockUsers.role, role));

    return result.rowsAffected;
  }

  /**
   * Get next available Telegram ID
   */
  async getNextTelegramId(): Promise<number> {
    const [lastUser] = await this.db
      .select({ telegramId: mockUsers.telegramId })
      .from(mockUsers)
      .orderBy(desc(mockUsers.telegramId))
      .limit(1);

    if (!lastUser) {
      return MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID;
    }

    const nextId = lastUser.telegramId + 1;
    return nextId > MOCK_USER_CONSTRAINTS.MAX_TELEGRAM_ID ?
      MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID : nextId;
  }

  /**
   * Generate random mock user
   */
  async generateRandom(role: MockUserRole): Promise<MockUser> {
    const telegramId = await this.getNextTelegramId();
    const randomSuffix = Math.floor(Math.random() * 1000);

    const userData: CreateMockUser = {
      telegramId,
      username: `test_${role}_${randomSuffix}`,
      firstName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      lastName: `User ${randomSuffix}`,
      role,
      isActive: true,
    };

    return await this.create(userData);
  }

  /**
   * Bulk create mock users
   */
  async bulkCreate(users: CreateMockUser[]): Promise<{
    created: MockUser[];
    errors: string[];
  }> {
    const created: MockUser[] = [];
    const errors: string[] = [];

    for (const userData of users) {
      try {
        const user = await this.create(userData);
        created.push(user);
      } catch (error) {
        errors.push(`Error creating user ${userData.username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { created, errors };
  }

  /**
   * Get comprehensive mock user statistics
   */
  async getStats(): Promise<MockUserStats> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(mockUsers);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(mockUsers)
      .where(eq(mockUsers.isActive, true));

    const [inactiveResult] = await this.db
      .select({ count: count() })
      .from(mockUsers)
      .where(eq(mockUsers.isActive, false));

    // Users by role
    const usersByRoleResults = await this.db
      .select({
        role: mockUsers.role,
        count: count(),
      })
      .from(mockUsers)
      .groupBy(mockUsers.role);

    const usersByRole = Object.values(MockUserRole).reduce((acc, role) => {
      acc[role] = usersByRoleResults.find(r => r.role === role)?.count || 0;
      return acc;
    }, {} as Record<MockUserRole, number>);

    const recentUsers = await this.db
      .select()
      .from(mockUsers)
      .orderBy(desc(mockUsers.createdAt))
      .limit(10);

    return {
      totalUsers: totalResult.count,
      activeUsers: activeResult.count,
      inactiveUsers: inactiveResult.count,
      usersByRole,
      usersWithRealAccount: 0, // Would be calculated with joins to real users table
      averageUsagePerScenario: 0, // Would be calculated from usage logs
      recentUsers,
      mostUsedUsers: [], // Would be calculated from usage logs
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    usersByRole: Record<MockUserRole, number>;
    usersWithRealAccount: number;
  }> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(mockUsers);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(mockUsers)
      .where(eq(mockUsers.isActive, true));

    // Users by role
    const usersByRoleResults = await this.db
      .select({
        role: mockUsers.role,
        count: count(),
      })
      .from(mockUsers)
      .groupBy(mockUsers.role);

    const usersByRole = Object.values(MockUserRole).reduce((acc, role) => {
      acc[role] = usersByRoleResults.find(r => r.role === role)?.count || 0;
      return acc;
    }, {} as Record<MockUserRole, number>);

    return {
      totalUsers: totalResult.count,
      activeUsers: activeResult.count,
      usersByRole,
      usersWithRealAccount: 0, // Would be calculated with joins
    };
  }

  /**
   * Check if mock user exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(mockUsers)
      .where(eq(mockUsers.id, id));

    return result.count > 0;
  }

  /**
   * Validate mock user data
   */
  validateUserData(userData: CreateMockUser): string[] {
    const errors: string[] = [];

    if (userData.telegramId < MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID ||
        userData.telegramId > MOCK_USER_CONSTRAINTS.MAX_TELEGRAM_ID) {
      errors.push(`Telegram ID must be between ${MOCK_USER_CONSTRAINTS.MIN_TELEGRAM_ID} and ${MOCK_USER_CONSTRAINTS.MAX_TELEGRAM_ID}`);
    }

    if (userData.username.length === 0) {
      errors.push('Username is required');
    }

    if (userData.username.length > MOCK_USER_CONSTRAINTS.MAX_USERNAME_LENGTH) {
      errors.push(`Username cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_USERNAME_LENGTH} characters`);
    }

    if (userData.firstName.length === 0) {
      errors.push('First name is required');
    }

    if (userData.firstName.length > MOCK_USER_CONSTRAINTS.MAX_FIRST_NAME_LENGTH) {
      errors.push(`First name cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_FIRST_NAME_LENGTH} characters`);
    }

    if (userData.lastName && userData.lastName.length > MOCK_USER_CONSTRAINTS.MAX_LAST_NAME_LENGTH) {
      errors.push(`Last name cannot exceed ${MOCK_USER_CONSTRAINTS.MAX_LAST_NAME_LENGTH} characters`);
    }

    if (!Object.values(MockUserRole).includes(userData.role)) {
      errors.push('Invalid user role');
    }

    return errors;
  }

  /**
   * Get predefined test scenarios
   */
  getTestScenarios(): TestScenario[] {
    return [
      {
        name: 'basic_marketplace',
        description: 'Basic marketplace functionality with buyer and seller',
        requiredRoles: [MockUserRole.BUYER, MockUserRole.SELLER],
        setupSteps: [
          'Create buyer and seller accounts',
          'Seller creates a listing',
          'Buyer contacts seller',
        ],
        mockUsers: [
          {
            telegramId: 100101,
            username: 'scenario_buyer',
            firstName: 'Scenario',
            lastName: 'Buyer',
            role: MockUserRole.BUYER,
            isActive: true,
          },
          {
            telegramId: 100102,
            username: 'scenario_seller',
            firstName: 'Scenario',
            lastName: 'Seller',
            role: MockUserRole.SELLER,
            isActive: true,
          },
        ],
      },
      {
        name: 'moderation_workflow',
        description: 'Content moderation and admin actions',
        requiredRoles: [MockUserRole.BUYER, MockUserRole.SELLER, MockUserRole.ADMIN],
        setupSteps: [
          'Create problematic listing',
          'User flags content',
          'Admin reviews and takes action',
        ],
        mockUsers: [
          {
            telegramId: 100201,
            username: 'mod_buyer',
            firstName: 'Mod',
            lastName: 'Buyer',
            role: MockUserRole.BUYER,
            isActive: true,
          },
          {
            telegramId: 100202,
            username: 'mod_seller',
            firstName: 'Mod',
            lastName: 'Seller',
            role: MockUserRole.SELLER,
            isActive: true,
          },
          {
            telegramId: 100203,
            username: 'mod_admin',
            firstName: 'Mod',
            lastName: 'Admin',
            role: MockUserRole.ADMIN,
            isActive: true,
          },
        ],
      },
    ];
  }

  /**
   * Helper functions
   */
  getDefaultUsers(): CreateMockUser[] {
    return getDefaultMockUsers();
  }

  getConstraints() {
    return MOCK_USER_CONSTRAINTS;
  }
}

// Export types and enums for use in other modules
export {
  MockUser,
  NewMockUser,
  CreateMockUser,
  MockUserRole,
  getDefaultMockUsers,
  mockUserToTelegramUser,
  MOCK_USER_CONSTRAINTS
};
export type {
  MockUserWithDetails,
  MockUserSearchFilters,
  MockUserListResponse,
  TestScenario,
  MockUserStats
};