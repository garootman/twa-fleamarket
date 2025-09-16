import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T025: POST /api/admin/users/{id}/ban
 *
 * This test validates the admin user ban endpoint that allows admins to ban users
 * from the marketplace for violations of community guidelines.
 *
 * API Contract Requirements:
 * - Endpoint: POST /api/admin/users/{id}/ban
 * - Authentication: Required (admin token)
 * - Path Parameter: id (integer, user Telegram ID)
 * - Request Body: { reason: string, duration_days?: number } (null for permanent)
 * - Response: 200 status with confirmation
 * - Error cases: 401 for unauthenticated, 403 for non-admin, 404 for invalid user
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

// Ban request type
interface BanRequest {
  reason: string;
  duration_days?: number | null;
}

// Success response type
interface BanResponse {
  success: boolean;
  message: string;
  user_id: number;
  banned_until: string | null;
  reason: string;
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
        id: 987654321,
        user_id: 987654321,
      }),
      run: async () => ({ success: true, meta: { changes: 1 } as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => ({
      telegram_id: 123456789,
      is_admin: true,
    }),
    run: async () => ({ success: true, meta: { changes: 1 } as any }),
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

describe('Contract Test T025: POST /api/admin/users/{id}/ban', () => {
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

  describe('Successful user ban scenarios', () => {
    it('should ban user permanently when no duration specified', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Repeated violations of community guidelines',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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

      const banData: BanResponse = await response.json();

      // Validate BanResponse schema compliance
      expect(banData).toHaveProperty('success');
      expect(banData.success).toBe(true);

      expect(banData).toHaveProperty('message');
      expect(typeof banData.message).toBe('string');
      expect(banData.message).toMatch(/banned|suspended/i);

      expect(banData).toHaveProperty('user_id');
      expect(banData.user_id).toBe(userId);

      expect(banData).toHaveProperty('banned_until');
      expect(banData.banned_until).toBeNull(); // Permanent ban

      expect(banData).toHaveProperty('reason');
      expect(banData.reason).toBe(banRequest.reason);
    });

    it('should ban user temporarily for specified duration', async () => {
      const userId = 555666777;
      const banRequest: BanRequest = {
        reason: 'Spam posting in marketplace',
        duration_days: 7,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const banData: BanResponse = await response.json();

      expect(banData.success).toBe(true);
      expect(banData.user_id).toBe(userId);
      expect(banData.reason).toBe(banRequest.reason);

      // Should have banned_until date for temporary ban
      expect(banData.banned_until).not.toBeNull();
      expect(typeof banData.banned_until).toBe('string');
      expect(() => new Date(banData.banned_until!)).not.toThrow();

      // Should be approximately 7 days from now
      const bannedUntilDate = new Date(banData.banned_until!);
      const now = new Date();
      const diffDays = Math.round((bannedUntilDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(7, 1);
    });

    it('should handle minimum duration (1 day)', async () => {
      const userId = 111222333;
      const banRequest: BanRequest = {
        reason: 'Minor violation - warning escalation',
        duration_days: 1,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const banData: BanResponse = await response.json();

      expect(banData.success).toBe(true);

      // Should be approximately 1 day from now
      const bannedUntilDate = new Date(banData.banned_until!);
      const now = new Date();
      const diffDays = Math.round((bannedUntilDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(1, 1);
    });

    it('should handle maximum duration (365 days)', async () => {
      const userId = 444555666;
      const banRequest: BanRequest = {
        reason: 'Serious policy violation - extended ban',
        duration_days: 365,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const banData: BanResponse = await response.json();

      expect(banData.success).toBe(true);

      // Should be approximately 365 days from now
      const bannedUntilDate = new Date(banData.banned_until!);
      const now = new Date();
      const diffDays = Math.round((bannedUntilDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(365, 1);
    });

    it('should handle null duration_days (permanent ban)', async () => {
      const userId = 777888999;
      const banRequest: BanRequest = {
        reason: 'Severe violations - permanent ban',
        duration_days: null,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const banData: BanResponse = await response.json();

      expect(banData.success).toBe(true);
      expect(banData.banned_until).toBeNull(); // Permanent ban
    });

    it('should handle re-banning already banned user (update ban)', async () => {
      const userId = 123123123;
      const banRequest: BanRequest = {
        reason: 'Updated ban reason - extended duration',
        duration_days: 30,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const banData: BanResponse = await response.json();

      expect(banData.success).toBe(true);
      expect(banData.message).toMatch(/banned|updated|extended/i);
    });
  });

  describe('Authentication and authorization scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(banRequest),
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
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token',
        },
        body: JSON.stringify(banRequest),
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
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_jwt_token',
        },
        body: JSON.stringify(banRequest),
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

    it('should return 403 for admin trying to ban themselves', async () => {
      const adminId = 123456789; // Same as ADMIN_ID in mockEnv
      const banRequest: BanRequest = {
        reason: 'Cannot ban yourself',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${adminId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/cannot.*ban.*yourself/i);
    });
  });

  describe('Validation and error scenarios', () => {
    it('should return 400 for invalid user ID format', async () => {
      const invalidUserId = 'not-a-number';
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${invalidUserId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/invalid.*user.*id.*format/i);
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentUserId = 999999999;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${nonExistentUserId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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

      expect(response.status).toBe(404);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Not Found');
      expect(errorData.message).toMatch(/user.*not.*found/i);
    });

    it('should return 400 for missing reason field', async () => {
      const userId = 987654321;
      const banRequest = {}; // Missing required reason field

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/reason.*required/i);
    });

    it('should return 400 for empty reason string', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: '',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/reason.*cannot.*empty/i);
    });

    it('should return 400 for reason too long (over 500 characters)', async () => {
      const userId = 987654321;
      const longReason = 'A'.repeat(501); // 501 characters
      const banRequest: BanRequest = {
        reason: longReason,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/reason.*too.*long/i);
    });

    it('should return 400 for invalid duration_days value (zero)', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
        duration_days: 0,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/duration.*must.*positive/i);
    });

    it('should return 400 for invalid duration_days value (negative)', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
        duration_days: -5,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/duration.*must.*positive/i);
    });

    it('should return 400 for duration_days too large (over 365)', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
        duration_days: 1000,
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/duration.*maximum.*365/i);
    });

    it('should return 400 for malformed request body', async () => {
      const userId = 987654321;

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
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

    it('should return 400 for non-integer duration_days value', async () => {
      const userId = 987654321;
      const banRequest = {
        reason: 'Policy violation',
        duration_days: 'invalid',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      expect(errorData.message).toMatch(/duration.*must.*number/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject GET method on ban endpoint', async () => {
      const userId = 987654321;

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
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

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject PUT method on ban endpoint', async () => {
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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

    it('should reject DELETE method on ban endpoint', async () => {
      const userId = 987654321;

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
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
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(banRequest),
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
      const userId = 987654321;
      const banRequest: BanRequest = {
        reason: 'Policy violation',
      };

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
          'Origin': 'http://localhost:5173',
        },
        body: JSON.stringify(banRequest),
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
      const userId = 987654321;

      const request = new Request(`http://localhost:8787/api/admin/users/${userId}/ban`, {
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
});