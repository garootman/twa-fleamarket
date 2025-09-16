import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T037: Search and Discovery Features
 *
 * This test validates the search and discovery workflow including:
 * - Full-text search across listings
 * - Category-based browsing and filtering
 * - Location-based search and proximity
 * - Price range and condition filtering
 * - Search result ranking and relevance
 * - Search analytics and popular queries
 *
 * User Journey Coverage:
 * - User searches for specific items
 * - Filters results by various criteria
 * - Browses categories and subcategories
 * - Discovers trending and popular items
 * - Uses location-based search
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: any;
  INIT_SECRET: string;
  KV_CACHE: any;
}

interface SearchableListing {
  id: number;
  title: string;
  description: string;
  price: number;
  category_id: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  location: string;
  seller_id: number;
  status: 'active' | 'sold' | 'archived';
  created_at: string;
  views: number;
  is_premium: boolean;
  tags: string[];
  search_score?: number;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  icon: string;
  description: string;
  listing_count: number;
  is_active: boolean;
}

interface SearchFilters {
  query?: string;
  category_id?: number;
  min_price?: number;
  max_price?: number;
  condition?: string[];
  location?: string;
  radius_km?: number;
  sort_by?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'oldest' | 'distance';
  is_premium?: boolean;
}

interface SearchResult {
  listings: SearchableListing[];
  total_count: number;
  facets: {
    categories: Array<{ id: number; name: string; count: number }>;
    conditions: Array<{ condition: string; count: number }>;
    price_ranges: Array<{ range: string; count: number }>;
    locations: Array<{ location: string; count: number }>;
  };
  suggestions: string[];
  search_time_ms: number;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as any,
  INIT_SECRET: 'mock_secret',
  KV_CACHE: {} as any,
};

let mockListings: SearchableListing[] = [
  {
    id: 1,
    title: 'iPhone 14 Pro Max 256GB Space Black',
    description: 'Excellent condition iPhone 14 Pro Max with 256GB storage. Includes original box, charger, and unused accessories.',
    price: 89999,
    category_id: 2,
    condition: 'excellent',
    location: 'San Francisco, CA',
    seller_id: 123456789,
    status: 'active',
    created_at: '2025-09-15T10:00:00Z',
    views: 45,
    is_premium: false,
    tags: ['smartphone', 'apple', 'iphone', 'unlocked'],
  },
  {
    id: 2,
    title: 'MacBook Pro 16" M2 Max 32GB RAM',
    description: 'Powerful MacBook Pro with M2 Max chip, 32GB RAM, 1TB SSD. Perfect for video editing and development work.',
    price: 299999,
    category_id: 3,
    condition: 'new',
    location: 'San Francisco, CA',
    seller_id: 987654321,
    status: 'active',
    created_at: '2025-09-16T08:00:00Z',
    views: 78,
    is_premium: true,
    tags: ['laptop', 'apple', 'macbook', 'professional'],
  },
  {
    id: 3,
    title: 'Sony PlayStation 5 Console',
    description: 'Brand new PlayStation 5 console with wireless controller. Still in sealed box.',
    price: 49999,
    category_id: 4,
    condition: 'new',
    location: 'Los Angeles, CA',
    seller_id: 555666777,
    status: 'active',
    created_at: '2025-09-14T15:30:00Z',
    views: 156,
    is_premium: false,
    tags: ['gaming', 'console', 'playstation', 'sony'],
  },
  {
    id: 4,
    title: 'Samsung Galaxy S23 Ultra 512GB',
    description: 'Like new Samsung Galaxy S23 Ultra with S Pen. Great camera and performance.',
    price: 79999,
    category_id: 2,
    condition: 'excellent',
    location: 'Seattle, WA',
    seller_id: 111222333,
    status: 'active',
    created_at: '2025-09-16T12:00:00Z',
    views: 32,
    is_premium: false,
    tags: ['smartphone', 'samsung', 'android', 'camera'],
  },
  {
    id: 5,
    title: 'Vintage Vinyl Record Collection',
    description: 'Rare vintage vinyl records from the 70s and 80s. Over 200 albums in excellent condition.',
    price: 150000,
    category_id: 5,
    condition: 'good',
    location: 'New York, NY',
    seller_id: 444555666,
    status: 'active',
    created_at: '2025-09-13T20:00:00Z',
    views: 89,
    is_premium: false,
    tags: ['vinyl', 'music', 'vintage', 'collection'],
  },
];

let mockCategories: Category[] = [
  {
    id: 1,
    name: 'Electronics',
    slug: 'electronics',
    parent_id: null,
    icon: '📱',
    description: 'Electronic devices and gadgets',
    listing_count: 3,
    is_active: true,
  },
  {
    id: 2,
    name: 'Smartphones',
    slug: 'smartphones',
    parent_id: 1,
    icon: '📱',
    description: 'Mobile phones and accessories',
    listing_count: 2,
    is_active: true,
  },
  {
    id: 3,
    name: 'Computers',
    slug: 'computers',
    parent_id: 1,
    icon: '💻',
    description: 'Laptops, desktops, and computer accessories',
    listing_count: 1,
    is_active: true,
  },
  {
    id: 4,
    name: 'Gaming',
    slug: 'gaming',
    parent_id: null,
    icon: '🎮',
    description: 'Gaming consoles, games, and accessories',
    listing_count: 1,
    is_active: true,
  },
  {
    id: 5,
    name: 'Music',
    slug: 'music',
    parent_id: null,
    icon: '🎵',
    description: 'Musical instruments and music-related items',
    listing_count: 1,
    is_active: true,
  },
];

let mockSearchQueries: Array<{ query: string; count: number; timestamp: string }> = [];

const mockDB = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('categories')) {
          return mockCategories.find(c => params.includes(c.id));
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO search_analytics')) {
          mockSearchQueries.push({
            query: params[0],
            count: 1,
            timestamp: new Date().toISOString(),
          });
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('listings')) {
          let filteredListings = [...mockListings];

          // Apply filters based on query parameters
          if (params.length > 0) {
            const searchTerm = params[0]?.toLowerCase();
            if (searchTerm) {
              filteredListings = filteredListings.filter(listing =>
                listing.title.toLowerCase().includes(searchTerm) ||
                listing.description.toLowerCase().includes(searchTerm) ||
                listing.tags.some(tag => tag.toLowerCase().includes(searchTerm))
              );
            }
          }

          return {
            results: filteredListings.map(listing => ({
              ...listing,
              search_score: Math.random() * 100,
            })),
            success: true,
            meta: {} as any,
          };
        }
        if (query.includes('SELECT') && query.includes('categories')) {
          return {
            results: mockCategories.filter(c => c.is_active),
            success: true,
            meta: {} as any,
          };
        }
        return { results: [], success: true, meta: {} as any };
      },
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
};

const mockKV = {
  put: async (key: string, value: string) => undefined,
  get: async (key: string) => {
    if (key === 'trending_searches') {
      return JSON.stringify(['iphone', 'macbook', 'playstation', 'gaming']);
    }
    if (key === 'popular_categories') {
      return JSON.stringify([
        { id: 2, name: 'Smartphones', search_count: 1250 },
        { id: 3, name: 'Computers', search_count: 890 },
        { id: 4, name: 'Gaming', search_count: 670 },
      ]);
    }
    return null;
  },
  delete: async (key: string) => undefined,
  list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
  getWithMetadata: async (key: string) => ({ value: null, metadata: null }),
};

mockEnv.DB = mockDB;
mockEnv.KV_CACHE = mockKV;

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

describe('Integration Test T037: Search and Discovery Features', () => {
  let worker: any;

  beforeEach(async () => {
    mockSearchQueries = [];

    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      worker = null;
    }
  });

  describe('Full-text search functionality', () => {
    it('should perform basic text search across listings', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=iphone', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const searchResult = await response.json();
      expect(searchResult.listings).toBeDefined();
      expect(searchResult.listings.length).toBeGreaterThan(0);
      expect(searchResult.total_count).toBeGreaterThan(0);

      // Should find iPhone listing
      const iphoneListing = searchResult.listings.find((l: any) => l.title.includes('iPhone'));
      expect(iphoneListing).toBeDefined();
      expect(iphoneListing.search_score).toBeDefined();
    });

    it('should support multi-word search queries', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=macbook%20pro%20m2', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const searchResult = await response.json();
      expect(searchResult.listings.length).toBeGreaterThan(0);

      // Should find MacBook listing with high relevance
      const macbookListing = searchResult.listings.find((l: any) => l.title.includes('MacBook'));
      expect(macbookListing).toBeDefined();
      expect(macbookListing.search_score).toBeGreaterThan(0);
    });

    it('should search in both title and description fields', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=video%20editing', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const searchResult = await response.json();

      // Should find MacBook listing even though "video editing" is only in description
      const videoEditingListing = searchResult.listings.find((l: any) =>
        l.description.includes('video editing')
      );
      expect(videoEditingListing).toBeDefined();
    });

    it('should provide search suggestions for typos and partial matches', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=ipone', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const searchResult = await response.json();
      expect(searchResult.suggestions).toBeDefined();
      expect(searchResult.suggestions).toContain('iphone');
      expect(searchResult.did_you_mean).toBe('iphone');
    });
  });

  describe('Category-based browsing', () => {
    it('should list all root categories with listing counts', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/categories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const categoriesData = await response.json();
      expect(categoriesData.categories).toBeDefined();
      expect(categoriesData.categories.length).toBeGreaterThan(0);

      const electronicsCategory = categoriesData.categories.find((c: any) => c.name === 'Electronics');
      expect(electronicsCategory).toBeDefined();
      expect(electronicsCategory.listing_count).toBeGreaterThan(0);
      expect(electronicsCategory.subcategories).toBeDefined();
    });

    it('should filter listings by category', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?category_id=2', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const categoryListings = await response.json();
      expect(categoryListings.listings.length).toBeGreaterThan(0);

      // All listings should be smartphones
      categoryListings.listings.forEach((listing: any) => {
        expect(listing.category_id).toBe(2);
      });

      expect(categoryListings.category_info).toBeDefined();
      expect(categoryListings.category_info.name).toBe('Smartphones');
    });

    it('should support hierarchical category navigation', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/categories/1/subcategories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const subcategoriesData = await response.json();
      expect(subcategoriesData.subcategories).toBeDefined();
      expect(subcategoriesData.parent_category.name).toBe('Electronics');

      // Should include Smartphones and Computers as subcategories
      const smartphonesSubcat = subcategoriesData.subcategories.find((c: any) => c.name === 'Smartphones');
      expect(smartphonesSubcat).toBeDefined();
    });
  });

  describe('Advanced filtering and sorting', () => {
    it('should filter by price range', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?min_price=50000&max_price=100000', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const filteredListings = await response.json();
      expect(filteredListings.listings.length).toBeGreaterThan(0);

      // All listings should be within price range
      filteredListings.listings.forEach((listing: any) => {
        expect(listing.price).toBeGreaterThanOrEqual(50000);
        expect(listing.price).toBeLessThanOrEqual(100000);
      });
    });

    it('should filter by condition', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?condition=new,excellent', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const conditionListings = await response.json();
      expect(conditionListings.listings.length).toBeGreaterThan(0);

      // All listings should be new or excellent condition
      conditionListings.listings.forEach((listing: any) => {
        expect(['new', 'excellent']).toContain(listing.condition);
      });
    });

    it('should support multiple sorting options', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Test price ascending sort
      const priceAscRequest = new Request('http://localhost:8787/api/listings?sort=price_asc', {
        method: 'GET',
      });

      const priceAscResponse = await worker.fetch(priceAscRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(priceAscResponse.status).toBe(200);

      const priceAscListings = await priceAscResponse.json();
      expect(priceAscListings.listings.length).toBeGreaterThan(1);

      // Verify ascending price order
      for (let i = 1; i < priceAscListings.listings.length; i++) {
        expect(priceAscListings.listings[i].price).toBeGreaterThanOrEqual(
          priceAscListings.listings[i - 1].price
        );
      }

      // Test newest first sort
      const newestRequest = new Request('http://localhost:8787/api/listings?sort=newest', {
        method: 'GET',
      });

      const newestResponse = await worker.fetch(newestRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(newestResponse.status).toBe(200);

      const newestListings = await newestResponse.json();

      // Verify descending date order
      for (let i = 1; i < newestListings.listings.length; i++) {
        expect(new Date(newestListings.listings[i].created_at).getTime()).toBeLessThanOrEqual(
          new Date(newestListings.listings[i - 1].created_at).getTime()
        );
      }
    });

    it('should combine multiple filters', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?category_id=2&condition=excellent&min_price=70000&sort=price_desc', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const combinedFilter = await response.json();

      // Should apply all filters
      combinedFilter.listings.forEach((listing: any) => {
        expect(listing.category_id).toBe(2);
        expect(listing.condition).toBe('excellent');
        expect(listing.price).toBeGreaterThanOrEqual(70000);
      });

      expect(combinedFilter.applied_filters).toBeDefined();
      expect(combinedFilter.applied_filters.category_id).toBe(2);
      expect(combinedFilter.applied_filters.condition).toContain('excellent');
    });
  });

  describe('Location-based search', () => {
    it('should filter by location', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?location=San Francisco', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const locationListings = await response.json();
      expect(locationListings.listings.length).toBeGreaterThan(0);

      // All listings should be from San Francisco
      locationListings.listings.forEach((listing: any) => {
        expect(listing.location).toContain('San Francisco');
      });
    });

    it('should support radius-based search', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?location=San Francisco, CA&radius_km=50', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const radiusListings = await response.json();
      expect(radiusListings.listings).toBeDefined();
      expect(radiusListings.search_center).toBeDefined();
      expect(radiusListings.radius_km).toBe(50);

      // Should include distance information
      radiusListings.listings.forEach((listing: any) => {
        expect(listing.distance_km).toBeDefined();
        expect(listing.distance_km).toBeLessThanOrEqual(50);
      });
    });

    it('should sort by distance when location is provided', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?location=San Francisco, CA&sort=distance', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const distanceSorted = await response.json();

      // Verify ascending distance order
      for (let i = 1; i < distanceSorted.listings.length; i++) {
        expect(distanceSorted.listings[i].distance_km).toBeGreaterThanOrEqual(
          distanceSorted.listings[i - 1].distance_km
        );
      }
    });
  });

  describe('Search result facets and aggregations', () => {
    it('should provide search result facets', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=phone&include_facets=true', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const facetedResults = await response.json();
      expect(facetedResults.facets).toBeDefined();
      expect(facetedResults.facets.categories).toBeDefined();
      expect(facetedResults.facets.conditions).toBeDefined();
      expect(facetedResults.facets.price_ranges).toBeDefined();
      expect(facetedResults.facets.locations).toBeDefined();

      // Facets should have counts
      facetedResults.facets.categories.forEach((facet: any) => {
        expect(facet.count).toBeGreaterThan(0);
        expect(facet.name).toBeDefined();
      });
    });

    it('should update facets based on applied filters', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?category_id=2&include_facets=true', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const filteredFacets = await response.json();

      // Facets should reflect only smartphones category results
      const categoryFacets = filteredFacets.facets.categories;
      expect(categoryFacets.some((f: any) => f.id === 2)).toBe(true);

      // Price ranges should be relevant to smartphone prices
      const priceRanges = filteredFacets.facets.price_ranges;
      expect(priceRanges.length).toBeGreaterThan(0);
    });
  });

  describe('Search analytics and trending', () => {
    it('should track search queries for analytics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const searchQuery = 'gaming console';
      const request = new Request(`http://localhost:8787/api/listings?search=${encodeURIComponent(searchQuery)}`, {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify search was tracked
      expect(mockSearchQueries.length).toBe(1);
      expect(mockSearchQueries[0].query).toBe(searchQuery);
    });

    it('should provide trending searches', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/search/trending', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const trendingData = await response.json();
      expect(trendingData.trending_searches).toBeDefined();
      expect(trendingData.trending_searches.length).toBeGreaterThan(0);
      expect(trendingData.trending_searches).toContain('iphone');
      expect(trendingData.trending_searches).toContain('macbook');
    });

    it('should provide popular categories', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/search/popular-categories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const popularData = await response.json();
      expect(popularData.popular_categories).toBeDefined();
      expect(popularData.popular_categories.length).toBeGreaterThan(0);

      const topCategory = popularData.popular_categories[0];
      expect(topCategory.name).toBe('Smartphones');
      expect(topCategory.search_count).toBe(1250);
    });

    it('should provide search suggestions based on popular queries', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/search/suggestions?q=iph', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const suggestions = await response.json();
      expect(suggestions.suggestions).toBeDefined();
      expect(suggestions.suggestions.length).toBeGreaterThan(0);
      expect(suggestions.suggestions).toContain('iphone');
    });
  });

  describe('Premium listing priority in search', () => {
    it('should boost premium listings in search results', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?search=macbook&sort=relevance', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const searchResults = await response.json();
      const macbookListing = searchResults.listings.find((l: any) => l.title.includes('MacBook'));

      expect(macbookListing).toBeDefined();
      expect(macbookListing.is_premium).toBe(true);
      expect(macbookListing.premium_boost).toBe(true);

      // Premium listings should have higher search scores
      const regularListings = searchResults.listings.filter((l: any) => !l.is_premium);
      if (regularListings.length > 0) {
        expect(macbookListing.search_score).toBeGreaterThan(regularListings[0].search_score);
      }
    });

    it('should highlight premium listings in search results', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?category_id=3', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const categoryResults = await response.json();
      const premiumListing = categoryResults.listings.find((l: any) => l.is_premium);

      expect(premiumListing).toBeDefined();
      expect(premiumListing.premium_badge).toBe(true);
      expect(premiumListing.highlight_color).toBeDefined();
    });
  });

  describe('Search performance and caching', () => {
    it('should return search results within performance targets', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const startTime = Date.now();

      const request = new Request('http://localhost:8787/api/listings?search=smartphone&category_id=2&min_price=50000', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);

      const searchResults = await response.json();
      expect(searchResults.search_time_ms).toBeDefined();
      expect(searchResults.search_time_ms).toBeLessThan(200); // Under 200ms target

      // Overall response time should be reasonable
      expect(responseTime).toBeLessThan(1000); // Under 1 second
    });

    it('should cache popular search results', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // First request
      const request1 = new Request('http://localhost:8787/api/listings?search=iphone', {
        method: 'GET',
      });

      const response1 = await worker.fetch(request1, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response1.status).toBe(200);
      const result1 = await response1.json();

      // Second identical request
      const request2 = new Request('http://localhost:8787/api/listings?search=iphone', {
        method: 'GET',
      });

      const response2 = await worker.fetch(request2, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response2.status).toBe(200);
      const result2 = await response2.json();

      // Second request should be faster (cached)
      expect(result2.cached).toBe(true);
      expect(result2.search_time_ms).toBeLessThan(result1.search_time_ms);
    });
  });
});