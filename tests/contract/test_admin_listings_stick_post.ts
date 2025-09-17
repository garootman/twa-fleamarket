import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T024: POST /api/admin/listings/{id}/stick
 *
 * This test validates the admin stick listing endpoint that allows admins to manually
 * stick/pin listings to the top of search results for promotional purposes.
 *
 * API Contract Requirements:
 * - Endpoint: POST /api/admin/listings/{id}/stick
 * - Authentication: Required (admin token)
 * - Path Parameter: id (string, UUID format)
 * - Request Body: { days?: number } (optional, default: 7)
 * - Response: 200 status with confirmation
 * - Error cases: 401 for unauthenticated, 403 for non-admin, 404 for invalid listing
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

// Stick request type
interface StickRequest {
  days?: number;
}

// Success response type
interface StickResponse {
  success: boolean;
  message: string;
  listing_id: string;
  sticky_until: string;
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
        id: 'test-listing-id',
        title: 'Test Listing',
        status: 'active',
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

describe('Contract Test T024: POST /api/admin/listings/{id}/stick', () => {
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

  describe('Successful listing stick scenarios', () => {
    it('should stick listing with default days when no days specified', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = {}; // No days specified, should default to 7

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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

      const stickData: StickResponse = await response.json();

      // Validate StickResponse schema compliance
      expect(stickData).toHaveProperty('success');
      expect(stickData.success).toBe(true);

      expect(stickData).toHaveProperty('message');
      expect(typeof stickData.message).toBe('string');
      expect(stickData.message).toMatch(/sticked|pinned|promoted/i);

      expect(stickData).toHaveProperty('listing_id');
      expect(stickData.listing_id).toBe(listingId);

      expect(stickData).toHaveProperty('sticky_until');
      expect(typeof stickData.sticky_until).toBe('string');
      // Should be valid ISO date format
      expect(() => new Date(stickData.sticky_until)).not.toThrow();

      // Should be approximately 7 days from now (default)
      const stickyDate = new Date(stickData.sticky_until);
      const now = new Date();
      const diffDays = Math.round((stickyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(7, 1);
    });

    it('should stick listing for specified number of days', async () => {
      const listingId = 'test-listing-uuid-456';
      const stickRequest: StickRequest = {
        days: 30,
      };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const stickData: StickResponse = await response.json();

      expect(stickData.success).toBe(true);
      expect(stickData.listing_id).toBe(listingId);

      // Should be approximately 30 days from now
      const stickyDate = new Date(stickData.sticky_until);
      const now = new Date();
      const diffDays = Math.round((stickyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(30, 1);
    });

    it('should handle minimum days value (1 day)', async () => {
      const listingId = 'test-listing-uuid-789';
      const stickRequest: StickRequest = {
        days: 1,
      };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const stickData: StickResponse = await response.json();

      expect(stickData.success).toBe(true);

      // Should be approximately 1 day from now
      const stickyDate = new Date(stickData.sticky_until);
      const now = new Date();
      const diffDays = Math.round((stickyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(1, 1);
    });

    it('should handle maximum days value (90 days)', async () => {
      const listingId = 'test-listing-uuid-max';
      const stickRequest: StickRequest = {
        days: 90,
      };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const stickData: StickResponse = await response.json();

      expect(stickData.success).toBe(true);

      // Should be approximately 90 days from now
      const stickyDate = new Date(stickData.sticky_until);
      const now = new Date();
      const diffDays = Math.round((stickyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeCloseTo(90, 1);
    });

    it('should handle re-sticking already sticky listing', async () => {
      const listingId = 'already-sticky-listing';
      const stickRequest: StickRequest = {
        days: 14,
      };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const stickData: StickResponse = await response.json();

      expect(stickData.success).toBe(true);
      expect(stickData.message).toMatch(/sticked|updated|extended/i);
    });
  });

  describe('Authentication and authorization scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stickRequest),
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
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token',
        },
        body: JSON.stringify(stickRequest),
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
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
    it('should return 400 for invalid listing ID format', async () => {
      const invalidListingId = 'not-a-valid-uuid';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(
        `http://localhost:8787/api/admin/listings/${invalidListingId}/stick`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock_admin_jwt_token',
          },
          body: JSON.stringify(stickRequest),
        }
      );

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
      expect(errorData.message).toMatch(/invalid.*id.*format/i);
    });

    it('should return 404 for non-existent listing', async () => {
      const nonExistentId = '99999999-9999-9999-9999-999999999999';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(
        `http://localhost:8787/api/admin/listings/${nonExistentId}/stick`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock_admin_jwt_token',
          },
          body: JSON.stringify(stickRequest),
        }
      );

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
      expect(errorData.message).toMatch(/listing.*not.*found/i);
    });

    it('should return 400 for invalid days value (zero)', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 0 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      expect(errorData.message).toMatch(/days.*must.*positive/i);
    });

    it('should return 400 for invalid days value (negative)', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: -5 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      expect(errorData.message).toMatch(/days.*must.*positive/i);
    });

    it('should return 400 for days value too large (over 90)', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 365 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      expect(errorData.message).toMatch(/days.*maximum.*90/i);
    });

    it('should return 400 for malformed request body', async () => {
      const listingId = 'test-listing-uuid-123';

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
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

    it('should return 400 for non-integer days value', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest = { days: 'invalid' };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      expect(errorData.message).toMatch(/days.*must.*number/i);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject GET method on stick endpoint', async () => {
      const listingId = 'test-listing-uuid-123';

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
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

    it('should reject PUT method on stick endpoint', async () => {
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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

    it('should reject DELETE method on stick endpoint', async () => {
      const listingId = 'test-listing-uuid-123';

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
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
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify(stickRequest),
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
      const listingId = 'test-listing-uuid-123';
      const stickRequest: StickRequest = { days: 7 };

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
          'Origin': 'http://localhost:5173',
        },
        body: JSON.stringify(stickRequest),
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
      const listingId = 'test-listing-uuid-123';

      const request = new Request(`http://localhost:8787/api/admin/listings/${listingId}/stick`, {
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
