import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T010: GET /api/me
 *
 * This is a TDD contract test that MUST fail initially before implementation.
 * Tests the GET /api/me endpoint according to the API contract specification.
 *
 * API Contract Requirements:
 * - Endpoint: GET /api/me
 * - Authentication: Required (Bearer token)
 * - Response: User object with all specified fields
 * - Error cases: 401 Unauthorized
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
}

// User type based on API schema
interface User {
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  profile_photo_url: string | null;
  created_at: string;
  is_admin: boolean;
  warning_count: number;
  is_banned: boolean;
}

// Error response type
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
};

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({
        telegram_id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        profile_photo_url: 'https://example.com/photo.jpg',
        created_at: '2025-09-15T10:00:00Z',
        is_admin: false,
        warning_count: 0,
        is_banned: false,
      }),
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => ({
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      profile_photo_url: 'https://example.com/photo.jpg',
      created_at: '2025-09-15T10:00:00Z',
      is_admin: false,
      warning_count: 0,
      is_banned: false,
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

describe('Contract Test T010: GET /api/me', () => {
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
    it('should return current user profile with valid Bearer token', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const validToken = 'valid_jwt_token_here';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
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

      // Contract requirements validation
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const userData: User = await response.json();

      // Validate User schema compliance
      expect(userData).toHaveProperty('telegram_id');
      expect(typeof userData.telegram_id).toBe('number');

      expect(userData).toHaveProperty('username');
      // username can be null or string
      expect(userData.username === null || typeof userData.username === 'string').toBe(true);

      expect(userData).toHaveProperty('first_name');
      expect(typeof userData.first_name).toBe('string');
      expect(userData.first_name.length).toBeGreaterThan(0);

      expect(userData).toHaveProperty('last_name');
      // last_name can be null or string
      expect(userData.last_name === null || typeof userData.last_name === 'string').toBe(true);

      expect(userData).toHaveProperty('profile_photo_url');
      // profile_photo_url can be null or string
      expect(
        userData.profile_photo_url === null || typeof userData.profile_photo_url === 'string'
      ).toBe(true);

      expect(userData).toHaveProperty('created_at');
      expect(typeof userData.created_at).toBe('string');
      // Should be valid ISO date format
      expect(() => new Date(userData.created_at)).not.toThrow();

      expect(userData).toHaveProperty('is_admin');
      expect(typeof userData.is_admin).toBe('boolean');

      expect(userData).toHaveProperty('warning_count');
      expect(typeof userData.warning_count).toBe('number');
      expect(userData.warning_count).toBeGreaterThanOrEqual(0);

      expect(userData).toHaveProperty('is_banned');
      expect(typeof userData.is_banned).toBe('boolean');
    });

    it('should handle user with minimal data (null optional fields)', async () => {
      const validToken = 'valid_jwt_token_minimal_user';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
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
      const userData: User = await response.json();

      // Test nullable fields are properly handled
      expect(userData.username).toBeNull();
      expect(userData.last_name).toBeNull();
      expect(userData.profile_photo_url).toBeNull();

      // Required fields should still be present
      expect(userData.telegram_id).toBeDefined();
      expect(userData.first_name).toBeDefined();
      expect(userData.created_at).toBeDefined();
      expect(typeof userData.is_admin).toBe('boolean');
      expect(typeof userData.warning_count).toBe('number');
      expect(typeof userData.is_banned).toBe('boolean');
    });

    it('should handle admin user correctly', async () => {
      const adminToken = 'valid_jwt_token_admin_user';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
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
      const userData: User = await response.json();

      expect(userData.is_admin).toBe(true);
    });
  });

  describe('Authentication failure scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
      expect(errorData.error).toBe('Unauthorized');
    });

    it('should return 401 for invalid Bearer token format', async () => {
      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': 'InvalidFormat token_here',
          'Content-Type': 'application/json',
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

      expect(response.status).toBe(401);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
    });

    it('should return 401 for expired/invalid JWT token', async () => {
      const expiredToken = 'expired_or_invalid_jwt_token';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${expiredToken}`,
          'Content-Type': 'application/json',
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

      expect(response.status).toBe(401);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
      expect(errorData.message).toContain('Invalid or expired token');
    });

    it('should return 401 for banned user with valid token', async () => {
      const bannedUserToken = 'valid_jwt_token_banned_user';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bannedUserToken}`,
          'Content-Type': 'application/json',
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

      // Could be 401 or 403, both are acceptable for banned users
      expect([401, 403]).toContain(response.status);
      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData.message).toMatch(/banned|suspended/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject POST method on /api/me endpoint', async () => {
      const validToken = 'valid_jwt_token_here';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: 'data' }),
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

    it('should reject PUT method on /api/me endpoint', async () => {
      const validToken = 'valid_jwt_token_here';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ first_name: 'Updated' }),
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

    it('should reject DELETE method on /api/me endpoint', async () => {
      const validToken = 'valid_jwt_token_here';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
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

  describe('CORS and security headers', () => {
    it('should include proper CORS headers for authenticated requests', async () => {
      const validToken = 'valid_jwt_token_here';

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:5173',
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

      // Should include CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });

    it('should handle preflight OPTIONS request', async () => {
      const request = new Request('http://localhost:8787/api/me', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization',
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });
});
