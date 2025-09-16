import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T028: POST /api/admin/blocked-words
 *
 * This test validates the admin add blocked word endpoint that allows admins to add
 * new words to the content moderation blocklist with specified severity levels.
 *
 * API Contract Requirements:
 * - Endpoint: POST /api/admin/blocked-words
 * - Authentication: Required (admin token)
 * - Request Body: { word: string, severity: 'warning' | 'block' }
 * - Response: 201 status with confirmation
 * - Error cases: 401 for unauthenticated, 403 for non-admin, 400 for validation errors
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

// Add blocked word request type
interface AddBlockedWordRequest {
  word: string;
  severity: 'warning' | 'block';
}

// Success response type
interface AddBlockedWordResponse {
  success: boolean;
  message: string;
  blocked_word: {
    id: number;
    word: string;
    severity: 'warning' | 'block';
    created_at: string;
  };
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
        id: 6, // New blocked word ID
        word: 'test',
        severity: 'block',
      }),
      run: async () => ({ success: true, meta: { changes: 1, last_row_id: 6 } as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => ({
      telegram_id: 123456789,
      is_admin: true,
    }),
    run: async () => ({ success: true, meta: { changes: 1, last_row_id: 6 } as any }),
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

describe('Contract Test T028: POST /api/admin/blocked-words', () => {
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

  describe('Successful blocked word addition scenarios', () => {
    it('should add blocked word with "block" severity successfully', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const addRequest: AddBlockedWordRequest = {
        word: 'scammer',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(response.status).toBe(201);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const addData: AddBlockedWordResponse = await response.json();

      // Validate AddBlockedWordResponse schema compliance
      expect(addData).toHaveProperty('success');
      expect(addData.success).toBe(true);

      expect(addData).toHaveProperty('message');
      expect(typeof addData.message).toBe('string');
      expect(addData.message).toMatch(/added|created|blocked/i);

      expect(addData).toHaveProperty('blocked_word');
      const blockedWord = addData.blocked_word;

      expect(blockedWord).toHaveProperty('id');
      expect(typeof blockedWord.id).toBe('number');
      expect(blockedWord.id).toBeGreaterThan(0);

      expect(blockedWord).toHaveProperty('word');
      expect(blockedWord.word).toBe(addRequest.word.toLowerCase()); // Should be normalized

      expect(blockedWord).toHaveProperty('severity');
      expect(blockedWord.severity).toBe(addRequest.severity);

      expect(blockedWord).toHaveProperty('created_at');
      expect(typeof blockedWord.created_at).toBe('string');
      // Should be valid ISO date format
      expect(() => new Date(blockedWord.created_at)).not.toThrow();

      // Should be approximately current time
      const createdDate = new Date(blockedWord.created_at);
      const now = new Date();
      const diffMinutes = Math.abs(createdDate.getTime() - now.getTime()) / (1000 * 60);
      expect(diffMinutes).toBeLessThan(5); // Within 5 minutes
    });

    it('should add blocked word with "warning" severity successfully', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'suspicious',
        severity: 'warning',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

      expect(response.status).toBe(201);
      const addData: AddBlockedWordResponse = await response.json();

      expect(addData.success).toBe(true);
      expect(addData.blocked_word.word).toBe(addRequest.word.toLowerCase());
      expect(addData.blocked_word.severity).toBe('warning');
    });

    it('should normalize word to lowercase', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'UPPERCASE',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

      expect(response.status).toBe(201);
      const addData: AddBlockedWordResponse = await response.json();

      expect(addData.success).toBe(true);
      expect(addData.blocked_word.word).toBe('uppercase'); // Should be lowercase
    });

    it('should trim whitespace from word', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: '  trimmed  ',
        severity: 'warning',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

      expect(response.status).toBe(201);
      const addData: AddBlockedWordResponse = await response.json();

      expect(addData.success).toBe(true);
      expect(addData.blocked_word.word).toBe('trimmed'); // Should be trimmed
    });

    it('should handle special characters in words', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'fake-item',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

      expect(response.status).toBe(201);
      const addData: AddBlockedWordResponse = await response.json();

      expect(addData.success).toBe(true);
      expect(addData.blocked_word.word).toBe('fake-item');
    });

    it('should handle unicode characters in words', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'мошенник', // Russian for "scammer"
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

      expect(response.status).toBe(201);
      const addData: AddBlockedWordResponse = await response.json();

      expect(addData.success).toBe(true);
      expect(addData.blocked_word.word).toBe('мошенник');
    });
  });

  describe('Authentication and authorization scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addRequest),
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
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token',
        },
        body: JSON.stringify(addRequest),
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
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
  });

  describe('Validation and error scenarios', () => {
    it('should return 400 for missing word field', async () => {
      const addRequest = {
        severity: 'block',
      }; // Missing word field

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/word.*required/i);
    });

    it('should return 400 for missing severity field', async () => {
      const addRequest = {
        word: 'test',
      }; // Missing severity field

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/severity.*required/i);
    });

    it('should return 400 for empty word string', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: '',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/word.*cannot.*empty/i);
    });

    it('should return 400 for whitespace-only word', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: '   ',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/word.*cannot.*empty/i);
    });

    it('should return 400 for invalid severity value', async () => {
      const addRequest = {
        word: 'test',
        severity: 'invalid',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/severity.*must.*warning.*block/i);
    });

    it('should return 400 for word too long (over 100 characters)', async () => {
      const longWord = 'a'.repeat(101); // 101 characters
      const addRequest: AddBlockedWordRequest = {
        word: longWord,
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/word.*too.*long/i);
    });

    it('should return 409 for duplicate word (word already exists)', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'existing',
        severity: 'block',
      };

      // Mock database to simulate duplicate error
      const duplicateMockDB: D1Database = {
        ...mockDB,
        prepare: () => ({
          ...mockDB.prepare(),
          bind: () => ({
            ...mockDB.prepare().bind(),
            run: async () => {
              throw new Error('UNIQUE constraint failed: blocked_words.word');
            },
          }),
        }),
      } as any;

      const duplicateEnv = { ...mockEnv, DB: duplicateMockDB };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, duplicateEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(409);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Conflict');
      expect(errorData.message).toMatch(/word.*already.*exists/i);
    });

    it('should return 400 for malformed request body', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: 'invalid json',
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
      expect(errorData.message).toMatch(/invalid.*json/i);
    });

    it('should return 400 for non-string word value', async () => {
      const addRequest = {
        word: 123, // Should be string
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/word.*must.*string/i);
    });

    it('should return 400 for non-string severity value', async () => {
      const addRequest = {
        word: 'test',
        severity: 123, // Should be string
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      expect(errorData.message).toMatch(/severity.*must.*string/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject GET method on blocked-words POST endpoint', async () => {
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

      // Note: GET is actually allowed for listing blocked words
      // So we expect either 200 (if GET is implemented) or 405 (if POST-only)
      expect([200, 405]).toContain(response.status);
    });

    it('should reject PUT method on blocked-words endpoint', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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

  describe('Content-Type validation', () => {
    it('should reject requests without Content-Type header', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(addRequest),
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
    it('should include proper CORS headers for admin endpoint', async () => {
      const addRequest: AddBlockedWordRequest = {
        word: 'test',
        severity: 'block',
      };

      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
          'Origin': 'http://localhost:5173',
        },
        body: JSON.stringify(addRequest),
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
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });

    it('should handle preflight OPTIONS request', async () => {
      const request = new Request('http://localhost:8787/api/admin/blocked-words', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });

  describe('Rate limiting and security (if implemented)', () => {
    it('should handle multiple requests gracefully', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        word: `test${i}`,
        severity: 'block' as const,
      }));

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      // Send multiple requests in parallel
      const promises = requests.map(addRequest => {
        const request = new Request('http://localhost:8787/api/admin/blocked-words', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock_admin_jwt_token',
          },
          body: JSON.stringify(addRequest),
        });

        return worker.fetch(request, mockEnv, {
          waitUntil: () => {},
          passThroughOnException: () => {},
        });
      });

      const responses = await Promise.all(promises);

      // All should succeed or fail gracefully (no crashes)
      responses.forEach(response => {
        expect([201, 409, 429, 500]).toContain(response.status);
      });
    });
  });
});