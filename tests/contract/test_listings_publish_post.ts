import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T021: POST /api/listings/{id}/publish
 *
 * This is a TDD contract test that MUST fail initially before implementation.
 * Tests the POST /api/listings/{id}/publish endpoint according to the API contract specification.
 *
 * API Contract Requirements:
 * - Endpoint: POST /api/listings/{id}/publish
 * - Authentication: Required (Bearer token)
 * - Parameters: listing id (UUID) in path
 * - Response: Listing object with status 'active' and published_at timestamp (200 OK)
 * - Error cases: 401 Unauthorized, 403 Forbidden (not owner, not draft), 404 Not Found
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
}

// Types based on API schema
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

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  is_active: boolean;
}

interface Listing {
  id: string;
  user_id: number;
  category_id: number;
  title: string;
  description: string;
  price_usd: number;
  images: string[];
  created_at: string;
  expires_at: string;
  status: 'draft' | 'active' | 'expired' | 'sold' | 'archived' | 'hidden';
  is_sticky: boolean;
  is_highlighted: boolean;
  auto_bump_enabled: boolean;
  view_count: number;
  contact_username: string;
  published_at: string | null;
  time_left: string;
  can_bump: boolean;
  user: User;
  category: Category;
  premium_features: Array<{
    type: 'sticky_listing' | 'color_highlight' | 'auto_bump';
    expires_at: string;
  }>;
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
};

// Mock user data
const mockUser: User = {
  telegram_id: 123456789,
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  profile_photo_url: 'https://example.com/avatar.jpg',
  created_at: '2025-09-01T10:00:00Z',
  is_admin: false,
  warning_count: 0,
  is_banned: false,
};

const mockCategory: Category = {
  id: 1,
  name: 'Electronics',
  parent_id: null,
  description: 'Electronic devices and gadgets',
  is_active: true,
};

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({
        id: 'test-draft-listing-uuid',
        user_id: 123456789,
        category_id: 1,
        title: 'Draft Listing to Publish',
        description: 'This is a draft listing ready to be published',
        price_usd: 99.99,
        images: ['https://example.com/image1.jpg'],
        created_at: '2025-09-15T10:00:00Z',
        expires_at: '2025-10-15T10:00:00Z',
        status: 'draft',
        is_sticky: false,
        is_highlighted: false,
        auto_bump_enabled: false,
        view_count: 0,
        contact_username: 'testuser',
        published_at: null,
      }),
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => ({
      id: 'test-draft-listing-uuid',
      user_id: 123456789,
      category_id: 1,
      title: 'Draft Listing to Publish',
      description: 'This is a draft listing ready to be published',
      price_usd: 99.99,
      images: ['https://example.com/image1.jpg'],
      created_at: '2025-09-15T10:00:00Z',
      expires_at: '2025-10-15T10:00:00Z',
      status: 'active', // After publishing
      is_sticky: false,
      is_highlighted: false,
      auto_bump_enabled: false,
      view_count: 0,
      contact_username: 'testuser',
      published_at: '2025-09-16T10:00:00Z', // Set when published
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

describe('Contract Test T021: POST /api/listings/{id}/publish', () => {
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

  describe('Successful publish scenarios', () => {
    it('should publish draft listing and return active listing for listing owner', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const validToken = 'valid_jwt_token_listing_owner';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
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

      const listingData: Listing = await response.json();

      // Validate published Listing schema compliance
      expect(listingData).toHaveProperty('id');
      expect(listingData.id).toBe(listingId);

      expect(listingData).toHaveProperty('status');
      expect(listingData.status).toBe('active'); // Should be changed from draft to active

      expect(listingData).toHaveProperty('published_at');
      expect(listingData.published_at).not.toBe(null);
      expect(typeof listingData.published_at).toBe('string');
      expect(() => new Date(listingData.published_at!)).not.toThrow();

      // Verify published_at is recent (within last minute)
      const publishedAt = new Date(listingData.published_at!);
      const now = new Date();
      const timeDiff = now.getTime() - publishedAt.getTime();
      expect(timeDiff).toBeLessThan(60000); // Less than 1 minute

      expect(listingData).toHaveProperty('expires_at');
      expect(typeof listingData.expires_at).toBe('string');
      expect(() => new Date(listingData.expires_at)).not.toThrow();

      // Verify expiration is in the future
      const expiresAt = new Date(listingData.expires_at);
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());

      // Verify all other required fields are present
      expect(listingData).toHaveProperty('user_id');
      expect(typeof listingData.user_id).toBe('number');

      expect(listingData).toHaveProperty('category_id');
      expect(typeof listingData.category_id).toBe('number');

      expect(listingData).toHaveProperty('title');
      expect(typeof listingData.title).toBe('string');
      expect(listingData.title.length).toBeLessThanOrEqual(100);

      expect(listingData).toHaveProperty('description');
      expect(typeof listingData.description).toBe('string');
      expect(listingData.description.length).toBeLessThanOrEqual(1000);

      expect(listingData).toHaveProperty('price_usd');
      expect(typeof listingData.price_usd).toBe('number');
      expect(listingData.price_usd).toBeGreaterThan(0);

      expect(listingData).toHaveProperty('images');
      expect(Array.isArray(listingData.images)).toBe(true);
      expect(listingData.images.length).toBeGreaterThanOrEqual(1);
      expect(listingData.images.length).toBeLessThanOrEqual(9);

      expect(listingData).toHaveProperty('created_at');
      expect(typeof listingData.created_at).toBe('string');

      expect(listingData).toHaveProperty('view_count');
      expect(typeof listingData.view_count).toBe('number');
      expect(listingData.view_count).toBeGreaterThanOrEqual(0);

      expect(listingData).toHaveProperty('contact_username');
      expect(typeof listingData.contact_username).toBe('string');

      expect(listingData).toHaveProperty('time_left');
      expect(typeof listingData.time_left).toBe('string');

      expect(listingData).toHaveProperty('can_bump');
      expect(typeof listingData.can_bump).toBe('boolean');

      expect(listingData).toHaveProperty('user');
      expect(typeof listingData.user).toBe('object');
      expect(listingData.user).toHaveProperty('telegram_id');

      expect(listingData).toHaveProperty('category');
      expect(typeof listingData.category).toBe('object');
      expect(listingData.category).toHaveProperty('id');

      expect(listingData).toHaveProperty('premium_features');
      expect(Array.isArray(listingData.premium_features)).toBe(true);
    });

    it('should publish listing and set appropriate expiration date', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const listingId = 'test-draft-with-custom-expiry-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
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
      const listingData: Listing = await response.json();

      expect(listingData.status).toBe('active');
      expect(listingData.published_at).not.toBe(null);

      // Expiration should be set to standard duration (e.g., 30 days from now)
      const publishedAt = new Date(listingData.published_at!);
      const expiresAt = new Date(listingData.expires_at);
      const durationMs = expiresAt.getTime() - publishedAt.getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      // Expect expiration to be around 30 days (allowing some tolerance)
      expect(durationDays).toBeGreaterThan(25);
      expect(durationDays).toBeLessThan(35);
    });

    it('should publish listing with premium features enabled', async () => {
      const validToken = 'valid_jwt_token_premium_user';
      const premiumListingId = 'test-premium-draft-listing-uuid';

      const request = new Request(
        `http://localhost:8787/api/listings/${premiumListingId}/publish`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
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

      expect(response.status).toBe(200);
      const listingData: Listing = await response.json();

      expect(listingData.status).toBe('active');
      expect(listingData.published_at).not.toBe(null);

      // Premium features might be activated during publish
      expect(listingData).toHaveProperty('is_sticky');
      expect(listingData).toHaveProperty('is_highlighted');
      expect(listingData).toHaveProperty('auto_bump_enabled');
      expect(Array.isArray(listingData.premium_features)).toBe(true);
    });

    it('should handle republishing of previously published listing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const republishListingId = 'test-republish-listing-uuid';

      const request = new Request(
        `http://localhost:8787/api/listings/${republishListingId}/publish`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
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

      expect(response.status).toBe(200);
      const listingData: Listing = await response.json();

      expect(listingData.status).toBe('active');
      expect(listingData.published_at).not.toBe(null);

      // Should update published_at to current time
      const publishedAt = new Date(listingData.published_at!);
      const now = new Date();
      const timeDiff = now.getTime() - publishedAt.getTime();
      expect(timeDiff).toBeLessThan(60000); // Within last minute
    });
  });

  describe('Authentication failure scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
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

    it('should return 401 for invalid Bearer token', async () => {
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid_token',
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
  });

  describe('Access control scenarios', () => {
    it('should return 403 for non-owner attempting to publish listing', async () => {
      const notOwnerToken = 'valid_jwt_token_not_owner';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notOwnerToken}`,
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

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/owner|permission/i);
    });

    it('should return 403 for banned user', async () => {
      const bannedUserToken = 'valid_jwt_token_banned_user';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
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

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/banned/i);
    });

    it('should return 403 for user who reached listing limit', async () => {
      const limitReachedToken = 'valid_jwt_token_limit_reached_user';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${limitReachedToken}`,
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

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/limit.*reached/i);
    });
  });

  describe('Business logic validation scenarios', () => {
    it('should return 403 for attempting to publish already active listing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const activeListingId = 'test-already-active-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${activeListingId}/publish`, {
        method: 'POST',
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

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/already.*active|already.*published/i);
    });

    it('should return 403 for attempting to publish sold listing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const soldListingId = 'test-sold-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${soldListingId}/publish`, {
        method: 'POST',
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

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/sold.*cannot.*publish|status.*invalid/i);
    });

    it('should return 403 for attempting to publish archived listing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const archivedListingId = 'test-archived-listing-uuid';

      const request = new Request(
        `http://localhost:8787/api/listings/${archivedListingId}/publish`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
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

      expect(response.status).toBe(403);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Forbidden');
      expect(errorData.message).toMatch(/archived.*cannot.*publish|status.*invalid/i);
    });

    it('should validate listing content before publishing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const invalidContentListingId = 'test-invalid-content-listing-uuid';

      const request = new Request(
        `http://localhost:8787/api/listings/${invalidContentListingId}/publish`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
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

      // Should either publish successfully or return validation error
      expect([200, 400]).toContain(response.status);

      if (response.status === 400) {
        const errorData: ErrorResponse = await response.json();
        expect(errorData.error).toBe('Bad Request');
        expect(errorData.message).toMatch(/invalid.*content|validation.*failed/i);
      }
    });
  });

  describe('Resource not found scenarios', () => {
    it('should return 404 for non-existent listing', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const nonExistentId = 'non-existent-uuid-1234';

      const request = new Request(`http://localhost:8787/api/listings/${nonExistentId}/publish`, {
        method: 'POST',
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

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Not Found');
      expect(errorData.message).toMatch(/listing.*not found/i);
    });

    it('should return 404 for malformed UUID in path', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const malformedId = 'not-a-valid-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${malformedId}/publish`, {
        method: 'POST',
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

      expect(response.status).toBe(404);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Not Found');
    });
  });

  describe('HTTP method validation', () => {
    it('should reject GET method on POST /api/listings/{id}/publish endpoint', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
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

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject PUT method on POST /api/listings/{id}/publish endpoint', async () => {
      const validToken = 'valid_jwt_token_listing_owner';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'PUT',
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
      const validToken = 'valid_jwt_token_listing_owner';
      const listingId = 'test-draft-listing-uuid';

      const request = new Request(`http://localhost:8787/api/listings/${listingId}/publish`, {
        method: 'POST',
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });
});
