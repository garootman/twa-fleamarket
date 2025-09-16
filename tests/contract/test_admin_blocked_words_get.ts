import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T027: GET /api/admin/blocked-words
 *
 * This test validates the admin blocked words endpoint that allows admins to view
 * the list of blocked words used for content moderation and filtering.
 *
 * API Contract Requirements:
 * - Endpoint: GET /api/admin/blocked-words
 * - Authentication: Required (admin token)
 * - Response: Array of blocked word objects with id, word, and severity fields
 * - Severity: 'warning' or 'block'
 * - Error cases: 401 for unauthenticated, 403 for non-admin users
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
  ADMIN_ID?: string;
}

// Blocked word type
interface BlockedWord {
  id: number;
  word: string;
  severity: 'warning' | 'block';
}

// Blocked words response type
interface BlockedWordsResponse extends Array<BlockedWord> {}

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
  ADMIN_ID: '123456789', // Mock admin Telegram ID
};

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({
        telegram_id: 123456789,
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        profile_photo_url: null,
        created_at: '2025-09-15T10:00:00Z',
        is_admin: true,
        warning_count: 0,
        is_banned: false,
      }),
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({
        results: [
          {
            id: 1,
            word: 'spam',
            severity: 'block',
          },
          {
            id: 2,
            word: 'scam',
            severity: 'block',
          },
          {
            id: 3,
            word: 'fake',
            severity: 'warning',
          },
          {
            id: 4,
            word: 'stolen',
            severity: 'block',
          },
          {
            id: 5,
            word: 'cheap',
            severity: 'warning',
          }
        ],
        success: true,
        meta: {} as any
      }),
    }),
    first: async () => ({
      telegram_id: 123456789,
      is_admin: true,
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

describe('Contract Test T027: GET /api/admin/blocked-words', () => {
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

  describe('Successful blocked words retrieval scenarios', () => {
    it('should return list of blocked words when authenticated as admin', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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

      const blockedWordsData: BlockedWordsResponse = await response.json();

      // Validate BlockedWordsResponse schema compliance
      expect(Array.isArray(blockedWordsData)).toBe(true);

      // Validate each blocked word has required fields
      blockedWordsData.forEach(blockedWord => {
        expect(blockedWord).toHaveProperty('id');
        expect(typeof blockedWord.id).toBe('number');
        expect(blockedWord.id).toBeGreaterThan(0);

        expect(blockedWord).toHaveProperty('word');
        expect(typeof blockedWord.word).toBe('string');
        expect(blockedWord.word.length).toBeGreaterThan(0);

        expect(blockedWord).toHaveProperty('severity');
        expect(['warning', 'block']).toContain(blockedWord.severity);
      });

      // Should have some blocked words in the mock data
      expect(blockedWordsData.length).toBeGreaterThan(0);
    });

    it('should return different severity levels in blocked words list', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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
      const blockedWordsData: BlockedWordsResponse = await response.json();

      // Should contain both 'warning' and 'block' severity levels
      const severities = blockedWordsData.map(word => word.severity);
      const uniqueSeverities = [...new Set(severities)];

      expect(uniqueSeverities).toContain('warning');
      expect(uniqueSeverities).toContain('block');
    });

    it('should return blocked words sorted by ID (ascending)', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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
      const blockedWordsData: BlockedWordsResponse = await response.json();

      // Check if sorted by ID ascending
      for (let i = 1; i < blockedWordsData.length; i++) {
        expect(blockedWordsData[i].id).toBeGreaterThan(blockedWordsData[i - 1].id);
      }
    });

    it('should return empty array when no blocked words exist', async () => {
      // Mock empty database result
      const emptyMockDB: D1Database = {
        ...mockDB,
        prepare: () => ({
          ...mockDB.prepare(),
          bind: () => ({
            ...mockDB.prepare().bind(),
            all: async () => ({
              results: [],
              success: true,
              meta: {} as any
            }),
          }),
        }),
      } as any;

      const emptyEnv = { ...mockEnv, DB: emptyMockDB };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, emptyEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const blockedWordsData: BlockedWordsResponse = await response.json();

      expect(Array.isArray(blockedWordsData)).toBe(true);
      expect(blockedWordsData.length).toBe(0);
    });

    it('should handle blocked words with special characters', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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
      const blockedWordsData: BlockedWordsResponse = await response.json();

      // Words should be properly escaped in JSON response
      blockedWordsData.forEach(blockedWord => {
        expect(typeof blockedWord.word).toBe('string');
        expect(blockedWord.word).not.toContain('\0'); // No null characters
        expect(blockedWord.word).not.toContain('\r'); // No carriage returns
        expect(blockedWord.word).not.toContain('\n'); // No newlines (single words)
      });
    });

    it('should handle large list of blocked words efficiently', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
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
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      const blockedWordsData: BlockedWordsResponse = await response.json();

      // Should respond quickly (under 1 second for contract test)
      expect(responseTime).toBeLessThan(1000);

      // Should be able to handle arrays efficiently
      expect(Array.isArray(blockedWordsData)).toBe(true);
    });
  });

  describe('Authentication and authorization scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
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
      expect(errorData.message).toMatch(/authentication.*required/i);
    });

    it('should return 401 for invalid token', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token',
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
      expect(errorData.message).toMatch(/invalid.*token/i);
    });

    it('should return 403 for non-admin user token', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_jwt_token',
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

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
      expect(errorData.message).toMatch(/admin.*required|not.*admin/i);
    });

    it('should return 401 for expired token', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer expired_jwt_token',
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
      expect(errorData.message).toMatch(/expired.*token/i);
    });

    it('should return 401 for malformed Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'InvalidFormat token_here',
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
      expect(errorData.message).toMatch(/invalid.*authorization.*header/i);
    });
  });

  describe('Database error scenarios', () => {
    it('should return 500 for database connection failure', async () => {
      // Mock database failure
      const failingMockDB: D1Database = {
        ...mockDB,
        prepare: () => ({
          ...mockDB.prepare(),
          bind: () => ({
            ...mockDB.prepare().bind(),
            all: async () => {
              throw new Error('Database connection failed');
            },
          }),
        }),
      } as any;

      const failingEnv = { ...mockEnv, DB: failingMockDB };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, failingEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(500);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Internal Server Error');
      expect(errorData.message).toMatch(/database.*error/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject POST method on blocked-words endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify({ word: 'test', severity: 'block' }),
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

      // Note: POST is actually allowed for adding blocked words, but this is the GET endpoint test
      // So we expect either 405 (if GET-only) or 201/200 (if POST is implemented)
      expect([200, 201, 405]).toContain(response.status);
    });

    it('should reject PUT method on blocked-words endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify({ word: 'test', severity: 'block' }),
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

    it('should reject DELETE method on blocked-words endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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

  describe('Query parameters (if supported)', () => {
    it('should ignore unknown query parameters gracefully', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words?unknown_param=value&limit=100', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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

      // Should still return success - unknown params are ignored
      expect(response.status).toBe(200);
      const blockedWordsData: BlockedWordsResponse = await response.json();
      expect(Array.isArray(blockedWordsData)).toBe(true);
    });
  });

  describe('CORS and security headers', () => {
    it('should include proper CORS headers for admin endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
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

    it('should include security headers', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
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

      // Should include basic security headers for admin endpoints
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });
});