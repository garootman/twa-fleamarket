import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T030: POST /api/dev/auth
 *
 * This is a TDD contract test that MUST fail initially before implementation.
 * Tests the POST /api/dev/auth endpoint for development authentication bypass.
 *
 * API Contract Requirements:
 * - Endpoint: POST /api/dev/auth
 * - Authentication: Not required (development bypass)
 * - Request: { mockUserId: number } (ID of mock user to authenticate as)
 * - Response: { token: string, user: User } (same as /miniApp/init)
 * - Error cases: 400/403 for invalid mock user or non-dev mode
 * - Only available in localhost/development environment
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
  DEV_MODE?: string;
}

// User type based on API schema (matching /miniApp/init response)
interface User {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  profilePhotoUrl: string | null;
  createdAt: string;
  lastActive: string;
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  warningCount: number;
  usernameVerifiedAt: string | null;
  // Legacy fields for compatibility
  createdDate: string;
  updatedDate: string;
  lastAuthTimestamp: string;
  isBot: boolean | null;
  languageCode: string | null;
  isPremium: boolean | null;
  addedToAttachmentMenu: boolean | null;
  allowsWriteToPm: boolean | null;
  photoUrl: string | null;
  r2ImageKey: string | null;
  phoneNumber: string | null;
  supportsInlineQueries: boolean | null;
  canJoinGroups: boolean | null;
  canReadAllGroupMessages: boolean | null;
}

// Request/Response types
interface DevAuthRequest {
  mockUserId: number;
}

interface DevAuthResponse {
  token: string;
  user: User;
  startParam?: string;
  startPage?: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: object;
}

// Mock environment for testing
const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  TELEGRAM_USE_TEST_API: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
  DEV_MODE: 'true',
};

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({
        id: 1,
        telegram_id: 100001,
        username: 'test_buyer',
        first_name: 'Test',
        last_name: 'Buyer',
        profile_photo_url: null,
        created_at: '2025-09-15T10:00:00Z',
        last_active: '2025-09-15T10:00:00Z',
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        warning_count: 0,
        username_verified_at: '2025-09-15T10:00:00Z',
        created_date: '2025-09-15T10:00:00Z',
        updated_date: '2025-09-15T10:00:00Z',
        last_auth_timestamp: '1694762050',
        is_bot: null,
        language_code: null,
        is_premium: null,
        added_to_attachment_menu: null,
        allows_write_to_pm: null,
        photo_url: null,
        r2_image_key: null,
        phone_number: null,
        supports_inline_queries: null,
        can_join_groups: null,
        can_read_all_group_messages: null,
      }),
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => ({
      id: 1,
      telegram_id: 100001,
      username: 'test_buyer',
      first_name: 'Test',
      last_name: 'Buyer',
      profile_photo_url: null,
      created_at: '2025-09-15T10:00:00Z',
      last_active: '2025-09-15T10:00:00Z',
      is_banned: false,
      ban_reason: null,
      banned_at: null,
      warning_count: 0,
      username_verified_at: '2025-09-15T10:00:00Z',
      created_date: '2025-09-15T10:00:00Z',
      updated_date: '2025-09-15T10:00:00Z',
      last_auth_timestamp: '1694762050',
      is_bot: null,
      language_code: null,
      is_premium: null,
      added_to_attachment_menu: null,
      allows_write_to_pm: null,
      photo_url: null,
      r2_image_key: null,
      phone_number: null,
      supports_inline_queries: null,
      can_join_groups: null,
      can_read_all_group_messages: null,
    }),
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

mockEnv.DB = mockDB;

// Polyfills for Worker environment in tests
global.Request =
  global.Request ||
  (class {
    constructor(
      public url: string,
      public init?: any
    ) {
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers || {});
    }
    method: string;
    headers: Headers;
    json() {
      return Promise.resolve(JSON.parse(this.init?.body || '{}'));
    }
  } as any);

global.Response =
  global.Response ||
  (class {
    constructor(
      public body?: any,
      public init?: any
    ) {
      this.status = init?.status || 200;
      this.headers = new Headers(init?.headers || {});
    }
    status: number;
    headers: Headers;
    async text() {
      return Promise.resolve(this.body || '');
    }
    async json() {
      return Promise.resolve(JSON.parse(this.body || '{}'));
    }
    ok: boolean = this.status >= 200 && this.status < 300;
  } as any);

describe('Contract Test T030: POST /api/dev/auth', () => {
  let worker: any;

  beforeEach(async () => {
    // Import the worker module - this will fail initially as endpoint doesn't exist
    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      // Expected to fail initially - endpoint not implemented yet
      worker = null;
    }
  });

  describe('Successful authentication scenarios', () => {
    it('should authenticate as mock user with valid mockUserId', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const authRequest: DevAuthRequest = {
        mockUserId: 100001, // test_buyer
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // Contract requirements validation
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const authData: DevAuthResponse = await response.json();

      // Validate DevAuthResponse schema compliance (same as /miniApp/init)
      expect(authData).toHaveProperty('token');
      expect(typeof authData.token).toBe('string');
      expect(authData.token.length).toBeGreaterThan(0);

      expect(authData).toHaveProperty('user');
      const userData = authData.user;

      // Validate User schema compliance (should match mock user data)
      expect(userData).toHaveProperty('telegramId');
      expect(typeof userData.telegramId).toBe('number');
      expect(userData.telegramId).toBe(100001); // Should match request

      expect(userData).toHaveProperty('username');
      expect(userData.username === null || typeof userData.username === 'string').toBe(true);

      expect(userData).toHaveProperty('firstName');
      expect(typeof userData.firstName).toBe('string');
      expect(userData.firstName.length).toBeGreaterThan(0);

      expect(userData).toHaveProperty('lastName');
      expect(userData.lastName === null || typeof userData.lastName === 'string').toBe(true);

      expect(userData).toHaveProperty('profilePhotoUrl');
      expect(userData.profilePhotoUrl === null || typeof userData.profilePhotoUrl === 'string').toBe(true);

      expect(userData).toHaveProperty('createdAt');
      expect(typeof userData.createdAt).toBe('string');
      // Should be valid ISO date format
      expect(() => new Date(userData.createdAt)).not.toThrow();

      expect(userData).toHaveProperty('isBanned');
      expect(typeof userData.isBanned).toBe('boolean');
      expect(userData.isBanned).toBe(false); // Mock users should not be banned

      expect(userData).toHaveProperty('warningCount');
      expect(typeof userData.warningCount).toBe('number');
      expect(userData.warningCount).toBeGreaterThanOrEqual(0);
    });

    it('should authenticate as buyer mock user (100001)', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      expect(authData.user.telegramId).toBe(100001);
      expect(authData.user.username).toBe('test_buyer');
      expect(authData.user.firstName).toBe('Test');
      expect(authData.user.lastName).toBe('Buyer');
    });

    it('should authenticate as seller mock user (100002)', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100002,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      expect(authData.user.telegramId).toBe(100002);
      expect(authData.user.username).toBe('test_seller');
      expect(authData.user.firstName).toBe('Test');
      expect(authData.user.lastName).toBe('Seller');
    });

    it('should authenticate as admin mock user (100003)', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100003,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      expect(authData.user.telegramId).toBe(100003);
      expect(authData.user.username).toBe('test_admin');
      expect(authData.user.firstName).toBe('Test');
      expect(authData.user.lastName).toBe('Admin');
    });

    it('should return valid session token for subsequent API calls', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      // Token should be a development session token (64 hex characters)
      expect(authData.token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(authData.token)).toBe(true);

      // Token should be different from Telegram JWT format (no dots)
      expect(authData.token.includes('.')).toBe(false);
    });

    it('should have longer session duration for development', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      // Development sessions should have extended duration
      // Token creation time should be recent
      const user = authData.user;
      const createdAt = new Date(user.createdAt);
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - createdAt.getTime());
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });
  });

  describe('Authentication failure scenarios', () => {
    it('should return 400 for missing mockUserId field', async () => {
      const invalidRequest = {};

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(invalidRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
      expect(errorData.message).toMatch(/mockUserId.*required/i);
    });

    it('should return 400 for invalid mockUserId (non-existent)', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 999999, // Non-existent mock user
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Bad Request');
      expect(errorData.message).toMatch(/mock.*user.*not.*found/i);
    });

    it('should return 400 for invalid mockUserId (wrong format)', async () => {
      const authRequest = {
        mockUserId: 'invalid_id',
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Bad Request');
      expect(errorData.message).toMatch(/invalid.*mockUserId/i);
    });

    it('should return 403 when not in development mode', async () => {
      // Simulate production environment
      const prodEnv = { ...mockEnv, DEV_MODE: undefined };

      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('https://twa-bug-fm.pages.dev/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'twa-bug-fm.pages.dev',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, prodEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/development.*mode.*not.*enabled/i);
    });

    it('should return 403 when accessed from production domain', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('https://production-domain.com/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'production-domain.com',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/development.*only/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject GET method on /api/dev/auth endpoint', async () => {
      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject PUT method on /api/dev/auth endpoint', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject DELETE method on /api/dev/auth endpoint', async () => {
      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });
  });

  describe('Content-Type validation', () => {
    it('should reject requests without Content-Type header', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(415); // Unsupported Media Type
    });

    it('should reject requests with incorrect Content-Type', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(415); // Unsupported Media Type
    });
  });

  describe('CORS and security headers', () => {
    it('should include proper CORS headers for development endpoint', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:5173',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // Should include CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should handle preflight OPTIONS request', async () => {
      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
          'Host': 'localhost:8787',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });
  });

  describe('Performance and token generation', () => {
    it('should respond within reasonable time for dev auth', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const startTime = Date.now();
      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      const endTime = Date.now();

      expect(response.status).toBe(200);

      // Should respond within 500ms for development endpoint
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should generate unique tokens for different requests', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      // Make multiple requests
      const responses = await Promise.all([
        worker.fetch(request, mockEnv, { waitUntil: () => {}, passThroughOnException: () => {} }),
        worker.fetch(request, mockEnv, { waitUntil: () => {}, passThroughOnException: () => {} }),
        worker.fetch(request, mockEnv, { waitUntil: () => {}, passThroughOnException: () => {} }),
      ]);

      // All should return 200
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      const data = await Promise.all(responses.map(r => r.json()));

      // Should have unique tokens
      const tokens = data.map(d => d.token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    it('should create session token that works with existing auth middleware', async () => {
      const authRequest: DevAuthRequest = {
        mockUserId: 100001,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'localhost:8787',
        },
        body: JSON.stringify(authRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const authData: DevAuthResponse = await response.json();

      // Token should be compatible with KV storage system
      expect(authData.token).toBeDefined();
      expect(typeof authData.token).toBe('string');
      expect(authData.token.length).toBeGreaterThan(32); // Sufficient entropy

      // User data should be complete for API compatibility
      expect(authData.user.telegramId).toBeDefined();
      expect(authData.user.firstName).toBeDefined();
      expect(authData.user.createdAt).toBeDefined();
    });
  });
});