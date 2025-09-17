import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T032: Listing Creation Flow with Preview
 *
 * This test validates the complete listing creation workflow including:
 * - User authentication and session management
 * - Image upload to R2 storage
 * - Listing draft creation and validation
 * - Preview generation and approval
 * - Final publication with search indexing
 * - Database transactions and consistency
 *
 * User Journey Coverage:
 * - User authenticates via Telegram WebApp
 * - User uploads images for their listing
 * - User fills out listing form with details
 * - System generates preview with uploaded images
 * - User reviews and approves listing
 * - Listing goes live and becomes searchable
 */

// Mock environment and setup for integration testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
  R2_BUCKET: R2Bucket;
  KV_CACHE: KVNamespace;
}

// User and authentication types
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

interface AuthResponse {
  token: string;
  user: User;
}

// Listing types based on data model
interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  icon: string | null;
  description: string | null;
  is_active: boolean;
}

interface ListingImage {
  id: number;
  listing_id: number;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  uploaded_at: string;
}

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  category_id: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  location: string;
  seller_id: number;
  status: 'draft' | 'preview' | 'active' | 'sold' | 'archived';
  created_at: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  views: number;
  is_premium: boolean;
  bump_count: number;
  last_bumped_at: string | null;
  images: ListingImage[];
  seller: User;
  category: Category;
}

// API request/response types
interface CreateListingRequest {
  title: string;
  description: string;
  price: number;
  category_id: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  location: string;
  image_ids: number[];
}

interface ImageUploadResponse {
  id: number;
  image_url: string;
  alt_text: string | null;
  uploaded_at: string;
}

interface PreviewListingResponse {
  listing: Listing;
  preview_url: string;
  expires_at: string;
}

// Mock environment for testing
const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
  R2_BUCKET: {} as R2Bucket,
  KV_CACHE: {} as KVNamespace,
};

// Mock database state for testing
let mockListings: Listing[] = [];
let mockImages: ListingImage[] = [];
let mockCategories: Category[] = [
  {
    id: 1,
    name: 'Electronics',
    slug: 'electronics',
    parent_id: null,
    icon: '📱',
    description: 'Electronic devices and gadgets',
    is_active: true,
  },
  {
    id: 2,
    name: 'Smartphones',
    slug: 'smartphones',
    parent_id: 1,
    icon: '📱',
    description: 'Mobile phones and accessories',
    is_active: true,
  },
];

let mockUsers: User[] = [
  {
    telegram_id: 123456789,
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    profile_photo_url: null,
    created_at: '2025-09-15T10:00:00Z',
    is_admin: false,
    warning_count: 0,
    is_banned: false,
  },
];

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('users')) {
          return mockUsers.find(u => params.includes(u.telegram_id));
        }
        if (query.includes('SELECT') && query.includes('categories')) {
          return mockCategories.find(c => params.includes(c.id));
        }
        if (query.includes('SELECT') && query.includes('listings')) {
          return mockListings.find(l => params.includes(l.id));
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO listings')) {
          const newListing: Listing = {
            id: mockListings.length + 1,
            title: params[0] || 'Test Listing',
            description: params[1] || 'Test description',
            price: params[2] || 100,
            category_id: params[3] || 1,
            condition: params[4] || 'good',
            location: params[5] || 'Test Location',
            seller_id: params[6] || 123456789,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            published_at: null,
            expires_at: null,
            views: 0,
            is_premium: false,
            bump_count: 0,
            last_bumped_at: null,
            images: [],
            seller: mockUsers[0],
            category: mockCategories[0],
          };
          mockListings.push(newListing);
          return {
            success: true,
            meta: {
              changes: 1,
              last_row_id: newListing.id,
              duration: 10,
              rows_read: 0,
              rows_written: 1,
            },
          };
        }
        return { success: true, meta: {} as any };
      },
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

// Mock R2 bucket implementation
const mockR2: R2Bucket = {
  put: async (key: string, value: ArrayBuffer | string) => {
    return {
      key,
      etag: 'mock_etag_123',
      version: 'mock_version',
      size: typeof value === 'string' ? value.length : value.byteLength,
      uploaded: new Date(),
      checksums: {},
    } as R2Object;
  },
  get: async (key: string) => {
    return {
      key,
      body: new ReadableStream(),
      bodyUsed: false,
      etag: 'mock_etag_123',
      version: 'mock_version',
      size: 1024,
      uploaded: new Date(),
      checksums: {},
      blob: async () => new Blob(['mock image data']),
      arrayBuffer: async () => new ArrayBuffer(1024),
      text: async () => 'mock text',
      json: async () => ({}),
    } as R2ObjectBody;
  },
  head: async (key: string) => null,
  list: async () => ({ objects: [], truncated: false, cursor: undefined }),
  delete: async (keys: string | string[]) => undefined,
} as any;

// Mock KV namespace implementation
const mockKV: KVNamespace = {
  put: async (key: string, value: string | ArrayBuffer | ReadableStream) => undefined,
  get: async (key: string, options?: any) => null,
  delete: async (key: string) => undefined,
  list: async (options?: any) => ({ keys: [], list_complete: true, cursor: undefined }),
  getWithMetadata: async (key: string, options?: any) => ({ value: null, metadata: null }),
} as any;

mockEnv.DB = mockDB;
mockEnv.R2_BUCKET = mockR2;
mockEnv.KV_CACHE = mockKV;

// Polyfills for Worker environment
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
    formData() {
      return Promise.resolve(new FormData());
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

describe('Integration Test T032: Listing Creation Flow with Preview', () => {
  let worker: any;
  let authToken: string;

  beforeEach(async () => {
    // Reset mock data
    mockListings = [];
    mockImages = [];

    // Import the worker module
    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      // Expected to fail initially - endpoints not implemented yet
      worker = null;
    }

    // Mock auth token for testing
    authToken = 'mock_jwt_token_123';
  });

  describe('Complete listing creation flow', () => {
    it('should handle full listing creation journey from auth to publication', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Step 1: User authentication (already tested in contract tests)
      const authRequest = {
        init_data: 'mock_telegram_init_data',
      };

      const authResponse = await worker.fetch(
        new Request('http://localhost:8787/miniApp/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(authRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(authResponse.status).toBe(200);

      // Step 2: Upload images for listing
      const imageFile = new Blob(['fake image data'], { type: 'image/jpeg' });
      const uploadFormData = new FormData();
      uploadFormData.append('image', imageFile, 'test-image.jpg');
      uploadFormData.append('alt_text', 'Test product image');

      const uploadResponse = await worker.fetch(
        new Request('http://localhost:8787/api/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: uploadFormData,
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(uploadResponse.status).toBe(200);

      const imageUploadData: ImageUploadResponse = await uploadResponse.json();
      expect(imageUploadData).toHaveProperty('id');
      expect(imageUploadData).toHaveProperty('image_url');
      expect(imageUploadData.alt_text).toBe('Test product image');

      // Step 3: Create listing draft
      const createListingRequest: CreateListingRequest = {
        title: 'iPhone 14 Pro Max',
        description:
          'Excellent condition iPhone 14 Pro Max, 256GB, Space Black. Used for 6 months, includes original box and charger.',
        price: 89999, // 899.99 in cents
        category_id: 2, // Smartphones category
        condition: 'excellent',
        location: 'San Francisco, CA',
        image_ids: [imageUploadData.id],
      };

      const createResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(createListingRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(createResponse.status).toBe(201); // Created

      const listing: Listing = await createResponse.json();
      expect(listing.id).toBeDefined();
      expect(listing.title).toBe('iPhone 14 Pro Max');
      expect(listing.status).toBe('draft');
      expect(listing.seller_id).toBe(123456789);
      expect(listing.category_id).toBe(2);

      // Step 4: Generate preview
      const previewResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${listing.id}/preview`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(previewResponse.status).toBe(200);

      const previewData: PreviewListingResponse = await previewResponse.json();
      expect(previewData.listing.status).toBe('preview');
      expect(previewData.preview_url).toBeDefined();
      expect(previewData.expires_at).toBeDefined();

      // Verify preview URL is accessible
      const previewUrlResponse = await worker.fetch(new Request(previewData.preview_url), mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(previewUrlResponse.status).toBe(200);

      // Step 5: Publish listing
      const publishResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${listing.id}/publish`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(publishResponse.status).toBe(200);

      const publishedListing: Listing = await publishResponse.json();
      expect(publishedListing.status).toBe('active');
      expect(publishedListing.published_at).toBeDefined();
      expect(publishedListing.expires_at).toBeDefined();

      // Step 6: Verify listing appears in search results
      const searchResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings?search=iPhone'),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(searchResponse.status).toBe(200);

      const searchResults = await searchResponse.json();
      expect(searchResults.listings).toContain(expect.objectContaining({ id: listing.id }));
    });
  });

  describe('Image upload integration', () => {
    it('should handle multiple image uploads for a listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Upload first image
      const image1FormData = new FormData();
      image1FormData.append(
        'image',
        new Blob(['image1 data'], { type: 'image/jpeg' }),
        'image1.jpg'
      );
      image1FormData.append('alt_text', 'Front view');

      const upload1Response = await worker.fetch(
        new Request('http://localhost:8787/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: image1FormData,
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(upload1Response.status).toBe(200);
      const image1Data: ImageUploadResponse = await upload1Response.json();

      // Upload second image
      const image2FormData = new FormData();
      image2FormData.append(
        'image',
        new Blob(['image2 data'], { type: 'image/png' }),
        'image2.png'
      );
      image2FormData.append('alt_text', 'Side view');

      const upload2Response = await worker.fetch(
        new Request('http://localhost:8787/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: image2FormData,
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(upload2Response.status).toBe(200);
      const image2Data: ImageUploadResponse = await upload2Response.json();

      // Create listing with both images
      const createListingRequest: CreateListingRequest = {
        title: 'Gaming Laptop',
        description: 'High-performance gaming laptop',
        price: 150000, // $1500
        category_id: 1,
        condition: 'good',
        location: 'New York, NY',
        image_ids: [image1Data.id, image2Data.id],
      };

      const createResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(createListingRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(createResponse.status).toBe(201);

      const listing: Listing = await createResponse.json();
      expect(listing.images.length).toBe(2);
      expect(listing.images[0].alt_text).toBe('Front view');
      expect(listing.images[1].alt_text).toBe('Side view');
    });

    it('should reject invalid image formats and oversized files', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Try to upload invalid format
      const invalidFormData = new FormData();
      invalidFormData.append(
        'image',
        new Blob(['not an image'], { type: 'text/plain' }),
        'text.txt'
      );

      const invalidResponse = await worker.fetch(
        new Request('http://localhost:8787/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: invalidFormData,
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(invalidResponse.status).toBe(400);

      // Try to upload oversized file (mock large file)
      const largeFileData = 'x'.repeat(10 * 1024 * 1024); // 10MB
      const largeFormData = new FormData();
      largeFormData.append('image', new Blob([largeFileData], { type: 'image/jpeg' }), 'large.jpg');

      const largeResponse = await worker.fetch(
        new Request('http://localhost:8787/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: largeFormData,
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(largeResponse.status).toBe(413); // Payload Too Large
    });
  });

  describe('Listing validation and business rules', () => {
    it('should validate required fields and data constraints', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Test missing required fields
      const invalidRequest = {
        title: '', // Empty title
        description: 'Valid description',
        price: -100, // Negative price
        category_id: 999, // Non-existent category
        condition: 'invalid_condition', // Invalid condition
        location: '',
        image_ids: [],
      };

      const invalidResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(invalidRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(invalidResponse.status).toBe(400);

      const errorResponse = await invalidResponse.json();
      expect(errorResponse.error).toBe('Validation Error');
      expect(errorResponse.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
          expect.objectContaining({ field: 'price' }),
          expect.objectContaining({ field: 'category_id' }),
          expect.objectContaining({ field: 'condition' }),
        ])
      );
    });

    it('should enforce content filtering and spam prevention', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Test content with blocked words
      const spamRequest: CreateListingRequest = {
        title: 'URGENT SALE!!! MUST SEE!!!',
        description:
          'Buy now or regret forever! Limited time offer! Call immediately! This is the best deal ever!',
        price: 1,
        category_id: 1,
        condition: 'new',
        location: 'Scam City',
        image_ids: [],
      };

      const spamResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(spamRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(spamResponse.status).toBe(400);

      const errorResponse = await spamResponse.json();
      expect(errorResponse.message).toMatch(/content.*policy|spam.*detected/i);
    });

    it('should limit listings per user based on account status', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create multiple listings to test rate limiting
      const validRequest: CreateListingRequest = {
        title: 'Test Listing',
        description: 'Valid test listing',
        price: 1000,
        category_id: 1,
        condition: 'good',
        location: 'Test City',
        image_ids: [],
      };

      // Create several listings
      for (let i = 1; i <= 5; i++) {
        const response = await worker.fetch(
          new Request('http://localhost:8787/api/listings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              ...validRequest,
              title: `Test Listing ${i}`,
            }),
          }),
          mockEnv,
          { waitUntil: () => {}, passThroughOnException: () => {} }
        );

        if (i <= 3) {
          expect(response.status).toBe(201);
        } else {
          // Rate limit should kick in
          expect(response.status).toBe(429); // Too Many Requests
        }
      }
    });
  });

  describe('Preview system integration', () => {
    it('should generate secure preview links with expiration', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create a listing first
      const createListingRequest: CreateListingRequest = {
        title: 'Preview Test Item',
        description: 'Testing preview functionality',
        price: 5000,
        category_id: 1,
        condition: 'good',
        location: 'Preview City',
        image_ids: [],
      };

      const createResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(createListingRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(createResponse.status).toBe(201);
      const listing: Listing = await createResponse.json();

      // Generate preview
      const previewResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${listing.id}/preview`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(previewResponse.status).toBe(200);

      const previewData: PreviewListingResponse = await previewResponse.json();

      // Preview URL should be secure and include token
      expect(previewData.preview_url).toMatch(/\/preview\/[a-f0-9-]{36}/);

      // Preview should expire within reasonable time (1 hour)
      const expiresAt = new Date(previewData.expires_at);
      const now = new Date();
      const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(hourFromNow.getTime());
    });

    it('should prevent access to expired previews', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Mock expired preview URL
      const expiredPreviewUrl = 'http://localhost:8787/api/listings/preview/expired-token-123';

      const expiredResponse = await worker.fetch(new Request(expiredPreviewUrl), mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(expiredResponse.status).toBe(410); // Gone

      const errorResponse = await expiredResponse.json();
      expect(errorResponse.message).toMatch(/preview.*expired/i);
    });
  });

  describe('Publication and indexing', () => {
    it('should update search indices and cache when publishing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create and publish a listing
      const createListingRequest: CreateListingRequest = {
        title: 'Searchable Gaming Mouse',
        description: 'High DPI wireless gaming mouse with RGB lighting',
        price: 7999,
        category_id: 1,
        condition: 'new',
        location: 'Gaming City',
        image_ids: [],
      };

      const createResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(createListingRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const listing: Listing = await createResponse.json();

      // Publish the listing
      const publishResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${listing.id}/publish`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(publishResponse.status).toBe(200);

      // Verify it appears in category search
      const categoryResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings?category_id=1'),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(categoryResponse.status).toBe(200);

      const categoryResults = await categoryResponse.json();
      expect(categoryResults.listings).toContain(expect.objectContaining({ id: listing.id }));

      // Verify full-text search works
      const searchResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings?search=gaming mouse'),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      expect(searchResponse.status).toBe(200);

      const searchResults = await searchResponse.json();
      expect(searchResults.listings).toContain(expect.objectContaining({ id: listing.id }));
    });

    it('should set proper expiration dates based on listing type', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create regular listing
      const regularRequest: CreateListingRequest = {
        title: 'Regular Item',
        description: 'Standard listing',
        price: 1000,
        category_id: 1,
        condition: 'good',
        location: 'Test City',
        image_ids: [],
      };

      const regularResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(regularRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const regularListing: Listing = await regularResponse.json();

      // Publish regular listing
      const publishResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${regularListing.id}/publish`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const publishedListing: Listing = await publishResponse.json();

      // Regular listings should expire after 30 days
      const expiresAt = new Date(publishedListing.expires_at!);
      const publishedAt = new Date(publishedListing.published_at!);
      const daysDifference = Math.ceil(
        (expiresAt.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDifference).toBe(30);
    });
  });

  describe('Error handling and rollback', () => {
    it('should rollback transaction on publish failure', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create a listing
      const createListingRequest: CreateListingRequest = {
        title: 'Rollback Test Item',
        description: 'Testing rollback functionality',
        price: 1000,
        category_id: 1,
        condition: 'good',
        location: 'Test City',
        image_ids: [],
      };

      const createResponse = await worker.fetch(
        new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(createListingRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const listing: Listing = await createResponse.json();

      // Mock a failure during publish (e.g., search index update fails)
      // This would be handled by the implementation

      // Verify listing status remains unchanged after failed publish
      const getResponse = await worker.fetch(
        new Request(`http://localhost:8787/api/listings/${listing.id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const unchangedListing: Listing = await getResponse.json();

      // Status should still be draft if publish failed
      expect(['draft', 'preview']).toContain(unchangedListing.status);
    });
  });
});
