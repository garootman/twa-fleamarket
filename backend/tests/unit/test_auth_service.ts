import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, TelegramAuthData, MockAuthData } from '../../src/services/auth-service';
import { createHmac } from 'node:crypto';

/**
 * Unit Tests for AuthService - T104
 *
 * Tests authentication service functionality:
 * - Telegram WebApp authentication
 * - Mock user authentication (development)
 * - Session validation and management
 * - User session lifecycle
 * - Admin authorization
 * - Security validations
 */

// Mock dependencies
const mockDB = {
  prepare: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
  get: vi.fn(),
} as any;

const mockUserModel = {
  createOrUpdate: vi.fn(),
  exists: vi.fn(),
  findByTelegramId: vi.fn(),
  updateLastActive: vi.fn(),
  isAdmin: vi.fn(),
};

const mockSessionModel = {
  create: vi.fn(),
  validateAndRefresh: vi.fn(),
  findByToken: vi.fn(),
  revoke: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  getUserSessions: vi.fn(),
  extend: vi.fn(),
  cleanupExpired: vi.fn(),
  getQuickStats: vi.fn(),
  search: vi.fn(),
};

const mockMockUserModel = {
  authenticate: vi.fn(),
  initializeDefaults: vi.fn(),
  resetAll: vi.fn(),
};

// Mock the models
vi.mock('../../src/db/models/user', () => ({
  UserModel: vi.fn().mockImplementation(() => mockUserModel),
}));

vi.mock('../../src/db/models/user-session', () => ({
  UserSessionModel: vi.fn().mockImplementation(() => mockSessionModel),
}));

vi.mock('../../src/db/models/mock-user', () => ({
  MockUserModel: vi.fn().mockImplementation(() => mockMockUserModel),
}));

describe('AuthService', () => {
  let authService: AuthService;
  const mockBotToken = 'test_bot_token_123';
  const mockUser = {
    telegramId: 123456789,
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isBanned: false,
    profilePhotoUrl: 'https://example.com/photo.jpg',
  };
  const mockSession = {
    id: 1,
    token: 'test_session_token',
    userId: 123456789,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create auth service
    authService = new AuthService(mockDB, mockBotToken, false);
  });

  describe('Constructor', () => {
    it('should initialize with provided database and bot token', () => {
      const service = new AuthService(mockDB, mockBotToken);
      expect(service).toBeDefined();
    });

    it('should accept development mode flag', () => {
      const devService = new AuthService(mockDB, mockBotToken, true);
      expect(devService).toBeDefined();
    });
  });

  describe('Telegram Authentication', () => {
    function createValidAuthData(botToken: string, userData: Partial<TelegramAuthData> = {}): TelegramAuthData {
      const data = {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        auth_date: Math.floor(Date.now() / 1000),
        ...userData,
      };

      // Create sorted query string
      const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${(data as any)[key]}`)
        .join('\n');

      // Create secret key and hash
      const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
      const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      return { ...data, hash };
    }

    describe('Valid Authentication', () => {
      it('should authenticate valid Telegram data for new user', async () => {
        const authData = createValidAuthData(mockBotToken);

        mockUserModel.exists.mockResolvedValue(false);
        mockUserModel.createOrUpdate.mockResolvedValue(mockUser);
        mockSessionModel.create.mockResolvedValue(mockSession);
        mockUserModel.updateLastActive.mockResolvedValue(true);

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(true);
        expect(result.user).toEqual(mockUser);
        expect(result.session).toEqual(mockSession);
        expect(result.token).toBe(mockSession.token);
        expect(result.isNewUser).toBe(true);
      });

      it('should authenticate valid Telegram data for existing user', async () => {
        const authData = createValidAuthData(mockBotToken);

        mockUserModel.exists.mockResolvedValue(true);
        mockUserModel.createOrUpdate.mockResolvedValue(mockUser);
        mockSessionModel.create.mockResolvedValue(mockSession);
        mockUserModel.updateLastActive.mockResolvedValue(true);

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(true);
        expect(result.isNewUser).toBe(false);
      });

      it('should pass user agent and IP address to session', async () => {
        const authData = createValidAuthData(mockBotToken);
        const userAgent = 'TestApp/1.0';
        const ipAddress = '192.168.1.1';

        mockUserModel.exists.mockResolvedValue(false);
        mockUserModel.createOrUpdate.mockResolvedValue(mockUser);
        mockSessionModel.create.mockResolvedValue(mockSession);
        mockUserModel.updateLastActive.mockResolvedValue(true);

        await authService.authenticateTelegram(authData, userAgent, ipAddress);

        expect(mockSessionModel.create).toHaveBeenCalledWith({
          userId: mockUser.telegramId,
          userAgent,
          ipAddress,
          expirationHours: 24 * 7,
        });
      });
    });

    describe('Invalid Authentication', () => {
      it('should reject invalid hash', async () => {
        const authData = createValidAuthData(mockBotToken);
        authData.hash = 'invalid_hash';

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid authentication hash');
      });

      it('should reject tampered user data', async () => {
        const authData = createValidAuthData(mockBotToken);
        authData.id = 999999999; // Change user ID but keep original hash

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid authentication hash');
      });

      it('should reject old authentication data', async () => {
        const authData = createValidAuthData(mockBotToken, {
          auth_date: Math.floor(Date.now() / 1000) - (25 * 60 * 60), // 25 hours ago
        });

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Authentication data is too old');
      });

      it('should reject banned users', async () => {
        const authData = createValidAuthData(mockBotToken);
        const bannedUser = { ...mockUser, isBanned: true };

        mockUserModel.createOrUpdate.mockResolvedValue(bannedUser);

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('User account is banned');
        expect(result.user).toEqual(bannedUser);
      });

      it('should handle database errors gracefully', async () => {
        const authData = createValidAuthData(mockBotToken);

        mockUserModel.createOrUpdate.mockRejectedValue(new Error('Database error'));

        const result = await authService.authenticateTelegram(authData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database error');
      });
    });
  });

  describe('Mock Authentication', () => {
    beforeEach(() => {
      authService = new AuthService(mockDB, mockBotToken, true); // Enable development mode
    });

    describe('Development Mode', () => {
      it('should authenticate mock user successfully', async () => {
        const mockData: MockAuthData = { telegramId: 123456789 };
        const mockAuthResult = {
          success: true,
          user: {
            telegramId: 123456789,
            username: 'mockuser',
            firstName: 'Mock',
            lastName: 'User',
          },
        };

        mockMockUserModel.authenticate.mockResolvedValue(mockAuthResult);
        mockUserModel.exists.mockResolvedValue(false);
        mockUserModel.createOrUpdate.mockResolvedValue(mockUser);
        mockSessionModel.create.mockResolvedValue(mockSession);

        const result = await authService.authenticateMock(mockData);

        expect(result.success).toBe(true);
        expect(result.user).toEqual(mockUser);
        expect(result.session).toEqual(mockSession);
        expect(result.token).toBe(mockSession.token);
      });

      it('should reject invalid mock user', async () => {
        const mockData: MockAuthData = { telegramId: 999999999 };

        mockMockUserModel.authenticate.mockResolvedValue({
          success: false,
          error: 'Mock user not found',
        });

        const result = await authService.authenticateMock(mockData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Mock user not found');
      });

      it('should use default user agent and IP for mock sessions', async () => {
        const mockData: MockAuthData = { telegramId: 123456789 };
        const mockAuthResult = {
          success: true,
          user: { telegramId: 123456789, username: 'mockuser', firstName: 'Mock' },
        };

        mockMockUserModel.authenticate.mockResolvedValue(mockAuthResult);
        mockUserModel.createOrUpdate.mockResolvedValue(mockUser);
        mockSessionModel.create.mockResolvedValue(mockSession);

        await authService.authenticateMock(mockData);

        expect(mockSessionModel.create).toHaveBeenCalledWith({
          userId: mockUser.telegramId,
          userAgent: 'MockClient/1.0',
          ipAddress: '127.0.0.1',
          expirationHours: 24,
        });
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        authService = new AuthService(mockDB, mockBotToken, false); // Disable development mode
      });

      it('should reject mock authentication in production', async () => {
        const mockData: MockAuthData = { telegramId: 123456789 };

        const result = await authService.authenticateMock(mockData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Mock authentication is only available in development mode');
      });
    });
  });

  describe('Session Validation', () => {
    describe('Valid Sessions', () => {
      it('should validate active session successfully', async () => {
        const token = 'valid_token';

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);

        const result = await authService.validateSession(token);

        expect(result.valid).toBe(true);
        expect(result.user).toEqual(mockUser);
        expect(result.session).toEqual(mockSession);
      });

      it('should return user data with session', async () => {
        const token = 'valid_token';

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);

        const result = await authService.validateSession(token);

        expect(mockUserModel.findByTelegramId).toHaveBeenCalledWith(mockSession.userId);
        expect(result.user).toEqual(mockUser);
      });
    });

    describe('Invalid Sessions', () => {
      it('should reject invalid session token', async () => {
        const token = 'invalid_token';

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: false,
          reason: 'Session expired',
        });

        const result = await authService.validateSession(token);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Session expired');
      });

      it('should reject session for non-existent user', async () => {
        const token = 'valid_token';

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(null);

        const result = await authService.validateSession(token);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('User not found');
      });

      it('should reject session for banned user', async () => {
        const token = 'valid_token';
        const bannedUser = { ...mockUser, isBanned: true };

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(bannedUser);

        const result = await authService.validateSession(token);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('User account is banned');
        expect(result.user).toEqual(bannedUser);
      });

      it('should handle database errors gracefully', async () => {
        const token = 'valid_token';

        mockSessionModel.validateAndRefresh.mockRejectedValue(new Error('Database connection failed'));

        const result = await authService.validateSession(token);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Database connection failed');
      });
    });
  });

  describe('Session Management', () => {
    describe('Session Refresh', () => {
      it('should refresh valid session successfully', async () => {
        const token = 'valid_token';
        const extendedSession = { ...mockSession, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) };

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
        mockSessionModel.extend.mockResolvedValue(extendedSession);

        const result = await authService.refreshSession(token);

        expect(result.success).toBe(true);
        expect(result.user).toEqual(mockUser);
        expect(result.session).toEqual(extendedSession);
        expect(result.token).toBe(extendedSession.token);
      });

      it('should use custom extension hours', async () => {
        const token = 'valid_token';
        const customHours = 48;

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: true,
          session: mockSession,
        });
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
        mockSessionModel.extend.mockResolvedValue(mockSession);

        await authService.refreshSession(token, customHours);

        expect(mockSessionModel.extend).toHaveBeenCalledWith(mockSession.id, customHours);
      });

      it('should reject refresh for invalid session', async () => {
        const token = 'invalid_token';

        mockSessionModel.validateAndRefresh.mockResolvedValue({
          valid: false,
          reason: 'Session not found',
        });

        const result = await authService.refreshSession(token);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Session not found');
      });
    });

    describe('Logout', () => {
      it('should logout successfully', async () => {
        const token = 'valid_token';

        mockSessionModel.findByToken.mockResolvedValue(mockSession);
        mockSessionModel.revoke.mockResolvedValue(true);

        const result = await authService.logout(token);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should handle non-existent session', async () => {
        const token = 'invalid_token';

        mockSessionModel.findByToken.mockResolvedValue(null);

        const result = await authService.logout(token);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Session not found');
      });

      it('should handle revocation failure', async () => {
        const token = 'valid_token';

        mockSessionModel.findByToken.mockResolvedValue(mockSession);
        mockSessionModel.revoke.mockResolvedValue(false);

        const result = await authService.logout(token);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to revoke session');
      });
    });

    describe('Logout All', () => {
      it('should logout all user sessions', async () => {
        const userId = 123456789;
        const revokedCount = 3;

        mockSessionModel.revokeAllUserSessions.mockResolvedValue(revokedCount);

        const result = await authService.logoutAll(userId);

        expect(result.success).toBe(true);
        expect(result.revokedCount).toBe(revokedCount);
      });

      it('should logout all except current session', async () => {
        const userId = 123456789;
        const exceptToken = 'current_token';
        const revokedCount = 2;

        mockSessionModel.revokeAllUserSessions.mockResolvedValue(revokedCount);

        const result = await authService.logoutAll(userId, exceptToken);

        expect(mockSessionModel.revokeAllUserSessions).toHaveBeenCalledWith(userId, exceptToken);
        expect(result.success).toBe(true);
        expect(result.revokedCount).toBe(revokedCount);
      });

      it('should handle logout all errors', async () => {
        const userId = 123456789;

        mockSessionModel.revokeAllUserSessions.mockRejectedValue(new Error('Database error'));

        const result = await authService.logoutAll(userId);

        expect(result.success).toBe(false);
        expect(result.revokedCount).toBe(0);
        expect(result.error).toBe('Database error');
      });
    });
  });

  describe('Admin Authorization', () => {
    it('should correctly identify admin user', async () => {
      const userId = 123456789;
      const adminId = 'admin_123';

      mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
      mockUserModel.isAdmin.mockResolvedValue(true);

      const result = await authService.isAdmin(userId, adminId);

      expect(result).toBe(true);
      expect(mockUserModel.isAdmin).toHaveBeenCalledWith(mockUser, adminId);
    });

    it('should correctly identify non-admin user', async () => {
      const userId = 123456789;

      mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
      mockUserModel.isAdmin.mockResolvedValue(false);

      const result = await authService.isAdmin(userId);

      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      const userId = 999999999;

      mockUserModel.findByTelegramId.mockResolvedValue(null);

      const result = await authService.isAdmin(userId);

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      const userId = 123456789;

      mockUserModel.findByTelegramId.mockRejectedValue(new Error('Database error'));

      const result = await authService.isAdmin(userId);

      expect(result).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    describe('Session Info', () => {
      it('should return session info without validation', async () => {
        const token = 'valid_token';

        mockSessionModel.findByToken.mockResolvedValue(mockSession);

        const result = await authService.getSessionInfo(token);

        expect(result.userId).toBe(mockSession.userId);
        expect(result.sessionId).toBe(mockSession.id);
        expect(result.error).toBeUndefined();
      });

      it('should handle non-existent session', async () => {
        const token = 'invalid_token';

        mockSessionModel.findByToken.mockResolvedValue(null);

        const result = await authService.getSessionInfo(token);

        expect(result.userId).toBeUndefined();
        expect(result.sessionId).toBeUndefined();
        expect(result.error).toBe('Session not found');
      });
    });

    describe('Session Cleanup', () => {
      it('should cleanup expired sessions', async () => {
        const cleanedCount = 5;

        mockSessionModel.cleanupExpired.mockResolvedValue(cleanedCount);

        const result = await authService.cleanupSessions();

        expect(result).toBe(cleanedCount);
      });
    });

    describe('Authentication Statistics', () => {
      it('should return auth statistics', async () => {
        const sessionStats = {
          activeSessions: 10,
          expiredSessions: 5,
          revokedSessions: 3,
          uniqueUsers: 8,
        };
        const recentSessions = { totalCount: 2 };

        mockSessionModel.getQuickStats.mockResolvedValue(sessionStats);
        mockSessionModel.search.mockResolvedValue(recentSessions);

        const result = await authService.getAuthStats();

        expect(result.totalSessions).toBe(18); // 10 + 5 + 3
        expect(result.activeSessions).toBe(10);
        expect(result.uniqueUsers).toBe(8);
        expect(result.recentLogins).toBe(2);
      });
    });

    describe('User Sessions', () => {
      it('should get user sessions', async () => {
        const userId = 123456789;
        const sessions = [mockSession];

        mockSessionModel.getUserSessions.mockResolvedValue(sessions);

        const result = await authService.getUserSessions(userId);

        expect(result).toEqual(sessions);
        expect(mockSessionModel.getUserSessions).toHaveBeenCalledWith(userId, true);
      });

      it('should get all user sessions including inactive', async () => {
        const userId = 123456789;
        const sessions = [mockSession];

        mockSessionModel.getUserSessions.mockResolvedValue(sessions);

        const result = await authService.getUserSessions(userId, false);

        expect(result).toEqual(sessions);
        expect(mockSessionModel.getUserSessions).toHaveBeenCalledWith(userId, false);
      });
    });
  });

  describe('Development Helpers', () => {
    beforeEach(() => {
      authService = new AuthService(mockDB, mockBotToken, true); // Enable development mode
    });

    describe('Mock User Initialization', () => {
      it('should initialize mock users in development mode', async () => {
        const initResult = { created: 5, errors: [] };

        mockMockUserModel.initializeDefaults.mockResolvedValue(initResult);

        const result = await authService.initializeMockUsers();

        expect(result).toEqual(initResult);
      });

      it('should reject initialization in production mode', async () => {
        authService = new AuthService(mockDB, mockBotToken, false);

        const result = await authService.initializeMockUsers();

        expect(result.created).toBe(0);
        expect(result.errors).toContain('Mock users only available in development mode');
      });
    });

    describe('Mock Auth Reset', () => {
      it('should reset mock authentication in development mode', async () => {
        const deletedCount = 10;
        const initResult = { created: 5, errors: [] };

        mockMockUserModel.resetAll.mockResolvedValue(deletedCount);
        mockMockUserModel.initializeDefaults.mockResolvedValue(initResult);

        const result = await authService.resetMockAuth();

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject reset in production mode', async () => {
        authService = new AuthService(mockDB, mockBotToken, false);

        const result = await authService.resetMockAuth();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Mock reset only available in development mode');
      });

      it('should handle reset errors gracefully', async () => {
        mockMockUserModel.resetAll.mockRejectedValue(new Error('Reset failed'));

        const result = await authService.resetMockAuth();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Reset failed');
      });
    });
  });
});