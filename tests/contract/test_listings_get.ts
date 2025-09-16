import { describe, it, expect, beforeEach } from 'vitest';

/**
 * T012: Contract Test GET /api/listings
 *
 * This is a TDD contract test that validates the GET /api/listings endpoint
 * according to the API contract specification. This test MUST FAIL initially
 * because the endpoint doesn't exist yet.
 *
 * Contract Requirements:
 * - Endpoint: GET /api/listings
 * - Security: No authentication required (public endpoint)
 * - Query Parameters: q, category_id, min_price, max_price, sort, limit, offset
 * - Response: { listings: Listing[], total: number, has_more: boolean }
 * - Status codes: 200 (success), 400 (invalid parameters)
 */

// TypeScript interfaces matching the API schema
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

interface PremiumFeature {
  type: 'sticky_listing' | 'color_highlight' | 'auto_bump';
  expires_at: string;
}

interface Listing {
  id: string; // UUID format
  user_id: number;
  category_id: number;
  title: string;
  description: string;
  price_usd: number;
  images: string[]; // Array of image URLs, 1-9 items
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
  premium_features: PremiumFeature[];
}

interface ListingsResponse {
  listings: Listing[];
  total: number;
  has_more: boolean;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: object;
}

// Mock environment setup
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  TELEGRAM_USE_TEST_API: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
};

// Mock D1Database for testing
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => null,
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

mockEnv.DB = mockDB;

describe('Contract Test: GET /api/listings', () => {
  let worker: any;
  const BASE_URL = 'http://localhost:8787';

  beforeEach(async () => {
    // Import the worker module
    const workerModule = await import('../../../src/index');
    worker = workerModule.default;
  });

  describe('Basic endpoint functionality', () => {
    it('should respond to GET /api/listings without authentication', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // This test MUST FAIL initially because the endpoint doesn't exist
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should return proper JSON structure for listings response', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();

      // Validate response structure
      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('has_more');

      expect(Array.isArray(data.listings)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.has_more).toBe('boolean');
    });
  });

  describe('Query parameter validation', () => {
    it('should handle search query parameter', async () => {
      const request = new Request(`${BASE_URL}/api/listings?q=test+search`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();
      expect(data).toHaveProperty('listings');
    });

    it('should handle category_id filter parameter', async () => {
      const request = new Request(`${BASE_URL}/api/listings?category_id=123`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();
      expect(data).toHaveProperty('listings');
    });

    it('should handle price range parameters', async () => {
      const request = new Request(`${BASE_URL}/api/listings?min_price=10.50&max_price=100.99`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();
      expect(data).toHaveProperty('listings');
    });

    it('should handle sorting parameters', async () => {
      const sortOptions = ['newest', 'oldest', 'price_asc', 'price_desc', 'expiring'];

      for (const sort of sortOptions) {
        const request = new Request(`${BASE_URL}/api/listings?sort=${sort}`, {
          method: 'GET',
        });

        const response = await worker.fetch(request, mockEnv, {
          waitUntil: () => {},
          passThroughOnException: () => {},
        });

        expect(response.status).toBe(200);
        const data: ListingsResponse = await response.json();
        expect(data).toHaveProperty('listings');
      }
    });

    it('should handle pagination parameters', async () => {
      const request = new Request(`${BASE_URL}/api/listings?limit=10&offset=20`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();
      expect(data).toHaveProperty('listings');
    });

    it('should validate limit parameter bounds', async () => {
      // Test minimum limit (1)
      const minRequest = new Request(`${BASE_URL}/api/listings?limit=1`, {
        method: 'GET',
      });
      const minResponse = await worker.fetch(minRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      expect(minResponse.status).toBe(200);

      // Test maximum limit (50)
      const maxRequest = new Request(`${BASE_URL}/api/listings?limit=50`, {
        method: 'GET',
      });
      const maxResponse = await worker.fetch(maxRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      expect(maxResponse.status).toBe(200);

      // Test invalid limit (above 50)
      const invalidRequest = new Request(`${BASE_URL}/api/listings?limit=100`, {
        method: 'GET',
      });
      const invalidResponse = await worker.fetch(invalidRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      // Should return 400 for invalid parameters according to contract
      expect(invalidResponse.status).toBe(400);
      const errorData: ErrorResponse = await invalidResponse.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
    });

    it('should validate offset parameter', async () => {
      // Valid offset
      const validRequest = new Request(`${BASE_URL}/api/listings?offset=0`, {
        method: 'GET',
      });
      const validResponse = await worker.fetch(validRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      expect(validResponse.status).toBe(200);

      // Invalid negative offset
      const invalidRequest = new Request(`${BASE_URL}/api/listings?offset=-1`, {
        method: 'GET',
      });
      const invalidResponse = await worker.fetch(invalidRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
      expect(invalidResponse.status).toBe(400);
    });
  });

  describe('Response structure validation', () => {
    it('should validate individual listing structure', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();

      // If listings exist, validate their structure
      if (data.listings.length > 0) {
        const listing = data.listings[0];

        // Required listing fields
        expect(listing).toHaveProperty('id');
        expect(listing).toHaveProperty('user_id');
        expect(listing).toHaveProperty('category_id');
        expect(listing).toHaveProperty('title');
        expect(listing).toHaveProperty('description');
        expect(listing).toHaveProperty('price_usd');
        expect(listing).toHaveProperty('images');
        expect(listing).toHaveProperty('created_at');
        expect(listing).toHaveProperty('expires_at');
        expect(listing).toHaveProperty('status');

        // Validate field types
        expect(typeof listing.id).toBe('string');
        expect(typeof listing.user_id).toBe('number');
        expect(typeof listing.category_id).toBe('number');
        expect(typeof listing.title).toBe('string');
        expect(typeof listing.description).toBe('string');
        expect(typeof listing.price_usd).toBe('number');
        expect(Array.isArray(listing.images)).toBe(true);

        // Validate status enum
        expect(['draft', 'active', 'expired', 'sold', 'archived', 'hidden'])
          .toContain(listing.status);

        // Validate UUID format for id
        expect(listing.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        // Validate images array constraints (1-9 items)
        expect(listing.images.length).toBeGreaterThanOrEqual(1);
        expect(listing.images.length).toBeLessThanOrEqual(9);

        // Validate title and description length constraints
        expect(listing.title.length).toBeLessThanOrEqual(100);
        expect(listing.description.length).toBeLessThanOrEqual(1000);

        // Validate nested user object
        expect(listing).toHaveProperty('user');
        expect(listing.user).toHaveProperty('telegram_id');
        expect(listing.user).toHaveProperty('first_name');
        expect(typeof listing.user.telegram_id).toBe('number');
        expect(typeof listing.user.first_name).toBe('string');

        // Validate nested category object
        expect(listing).toHaveProperty('category');
        expect(listing.category).toHaveProperty('id');
        expect(listing.category).toHaveProperty('name');
        expect(typeof listing.category.id).toBe('number');
        expect(typeof listing.category.name).toBe('string');

        // Validate premium_features array
        expect(listing).toHaveProperty('premium_features');
        expect(Array.isArray(listing.premium_features)).toBe(true);
      }
    });
  });

  describe('Error handling', () => {
    it('should return 400 for invalid sort parameter', async () => {
      const request = new Request(`${BASE_URL}/api/listings?sort=invalid_sort`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
    });

    it('should return 400 for invalid price parameters', async () => {
      const request = new Request(`${BASE_URL}/api/listings?min_price=invalid&max_price=not_a_number`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
    });
  });

  describe('Default parameter behavior', () => {
    it('should use default values when parameters are omitted', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const data: ListingsResponse = await response.json();

      // When no limit is specified, should default to 20
      // When no offset is specified, should default to 0
      // When no sort is specified, should default to 'newest'
      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('has_more');
    });
  });

  describe('CORS headers', () => {
    it('should include proper CORS headers for public endpoint', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(mockEnv.FRONTEND_URL);
    });

    it('should handle OPTIONS preflight request', async () => {
      const request = new Request(`${BASE_URL}/api/listings`, {
        method: 'OPTIONS',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(mockEnv.FRONTEND_URL);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });
  });
});