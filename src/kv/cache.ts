import { generateCacheKey, getCacheTTL } from '../db/schema/sessions';
import type { Listing, Category, ListingSearch } from '../db/schema/index';

export interface CacheOptions {
  ttl?: number; // TTL in seconds
  bypassCache?: boolean; // Skip cache read/write
}

export interface CachedResult<T> {
  data: T;
  fromCache: boolean;
  cachedAt?: string;
  expiresAt?: string;
}

export interface ListingSearchResult {
  listings: Listing[];
  total: number;
  hasMore: boolean;
  searchParams: ListingSearch;
}

export interface CategoryListingsResult {
  listings: Listing[];
  total: number;
  hasMore: boolean;
  categoryId: number;
}

export class CacheService {
  private kv: KVNamespace;

  constructor(kvNamespace: KVNamespace) {
    this.kv = kvNamespace;
  }

  /**
   * CQRS-style cache for category listings
   * Key pattern: "category:{categoryId}:listings"
   */
  async getCategoryListings(
    categoryId: number,
    options: CacheOptions = {}
  ): Promise<CachedResult<CategoryListingsResult> | null> {
    if (options.bypassCache) return null;

    const key = generateCacheKey('category', categoryId, 'listings');
    return await this.getCachedData<CategoryListingsResult>(key);
  }

  async setCategoryListings(
    categoryId: number,
    data: CategoryListingsResult,
    options: CacheOptions = {}
  ): Promise<void> {
    if (options.bypassCache) return;

    const key = generateCacheKey('category', categoryId, 'listings');
    const ttl = options.ttl || getCacheTTL('listings');

    await this.setCachedData(key, data, ttl);
  }

  async invalidateCategoryListings(categoryId?: number): Promise<void> {
    if (categoryId !== undefined) {
      // Invalidate specific category
      const key = generateCacheKey('category', categoryId, 'listings');
      await this.kv.delete(key);
    } else {
      // Invalidate all category listing caches
      const prefix = generateCacheKey('category');
      await this.invalidateByPrefix(prefix);
    }
  }

  /**
   * Search results cache
   * Key pattern: "search:{hash}:results"
   */
  async getSearchResults(
    searchParams: ListingSearch,
    options: CacheOptions = {}
  ): Promise<CachedResult<ListingSearchResult> | null> {
    if (options.bypassCache) return null;

    const searchHash = this.hashSearchParams(searchParams);
    const key = generateCacheKey('search', searchHash, 'results');

    return await this.getCachedData<ListingSearchResult>(key);
  }

  async setSearchResults(
    searchParams: ListingSearch,
    data: ListingSearchResult,
    options: CacheOptions = {}
  ): Promise<void> {
    if (options.bypassCache) return;

    const searchHash = this.hashSearchParams(searchParams);
    const key = generateCacheKey('search', searchHash, 'results');
    const ttl = options.ttl || getCacheTTL('search');

    await this.setCachedData(key, data, ttl);
  }

  async invalidateSearchResults(): Promise<void> {
    // Invalidate all search result caches
    const prefix = generateCacheKey('search');
    await this.invalidateByPrefix(prefix);
  }

  /**
   * Categories cache
   * Key pattern: "categories:all"
   */
  async getCategories(options: CacheOptions = {}): Promise<CachedResult<Category[]> | null> {
    if (options.bypassCache) return null;

    const key = generateCacheKey('categories', 'all');
    return await this.getCachedData<Category[]>(key);
  }

  async setCategories(data: Category[], options: CacheOptions = {}): Promise<void> {
    if (options.bypassCache) return;

    const key = generateCacheKey('categories', 'all');
    const ttl = options.ttl || getCacheTTL('categories');

    await this.setCachedData(key, data, ttl);
  }

  async invalidateCategories(): Promise<void> {
    const key = generateCacheKey('categories', 'all');
    await this.kv.delete(key);
  }

  /**
   * User profile cache
   * Key pattern: "user:{userId}:profile"
   */
  async getUserProfile(
    userId: number,
    options: CacheOptions = {}
  ): Promise<CachedResult<any> | null> {
    if (options.bypassCache) return null;

    const key = generateCacheKey('user', userId, 'profile');
    return await this.getCachedData<any>(key);
  }

  async setUserProfile(userId: number, data: any, options: CacheOptions = {}): Promise<void> {
    if (options.bypassCache) return;

    const key = generateCacheKey('user', userId, 'profile');
    const ttl = options.ttl || getCacheTTL('user');

    await this.setCachedData(key, data, ttl);
  }

  async invalidateUserProfile(userId: number): Promise<void> {
    const key = generateCacheKey('user', userId, 'profile');
    await this.kv.delete(key);
  }

  /**
   * Generic cache operations
   */
  private async getCachedData<T>(key: string): Promise<CachedResult<T> | null> {
    try {
      const cachedItem = await this.kv.get(key, { type: 'json', cacheTtl: 60 });

      if (!cachedItem) return null;

      const { data, cachedAt, expiresAt } = cachedItem as {
        data: T;
        cachedAt: string;
        expiresAt: string;
      };

      // Check if cache is still valid
      if (new Date(expiresAt) <= new Date()) {
        await this.kv.delete(key);
        return null;
      }

      return {
        data,
        fromCache: true,
        cachedAt,
        expiresAt,
      };
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  private async setCachedData<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const cacheItem = {
        data,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await this.kv.put(key, JSON.stringify(cacheItem), {
        expirationTtl: ttlSeconds,
      });
    } catch (error) {
      console.error('Cache write error:', error);
      // Don't throw - cache failures shouldn't break the application
    }
  }

  /**
   * Invalidate cache entries by prefix
   */
  private async invalidateByPrefix(prefix: string): Promise<void> {
    try {
      const listResult = await this.kv.list({ prefix, limit: 1000 });

      const deletePromises = listResult.keys.map(keyInfo => this.kv.delete(keyInfo.name));

      await Promise.all(deletePromises);

      // Handle pagination if there are more keys
      if (!listResult.list_complete && listResult.cursor) {
        await this.invalidateByPrefixCursor(prefix, listResult.cursor);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  private async invalidateByPrefixCursor(prefix: string, cursor: string): Promise<void> {
    try {
      const listResult = await this.kv.list({ prefix, cursor, limit: 1000 });

      const deletePromises = listResult.keys.map(keyInfo => this.kv.delete(keyInfo.name));

      await Promise.all(deletePromises);

      // Continue pagination if needed
      if (!listResult.list_complete && listResult.cursor) {
        await this.invalidateByPrefixCursor(prefix, listResult.cursor);
      }
    } catch (error) {
      console.error('Cache invalidation pagination error:', error);
    }
  }

  /**
   * Hash search parameters for consistent cache keys
   */
  private hashSearchParams(params: ListingSearch): string {
    // Create a consistent hash from search parameters
    const normalized = {
      q: params.q || '',
      categoryId: params.categoryId || 0,
      minPrice: params.minPrice || 0,
      maxPrice: params.maxPrice || 0,
      sort: params.sort,
      limit: params.limit,
      offset: params.offset,
      userId: params.userId || 0,
      status: params.status,
    };

    // Simple hash function for cache key
    const str = JSON.stringify(normalized);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Cache invalidation on data changes
   */
  async onListingChange(listing: Listing): Promise<void> {
    // Invalidate category listings
    await this.invalidateCategoryListings(listing.categoryId);

    // Invalidate search results (since listing data changed)
    await this.invalidateSearchResults();

    // Invalidate user profile cache if needed
    await this.invalidateUserProfile(listing.userId);
  }

  async onCategoryChange(category: Category): Promise<void> {
    // Invalidate categories cache
    await this.invalidateCategories();

    // Invalidate category listings
    await this.invalidateCategoryListings(category.id);

    // If parent category changed, also invalidate parent
    if (category.parentId) {
      await this.invalidateCategoryListings(category.parentId);
    }
  }

  async onUserChange(userId: number): Promise<void> {
    // Invalidate user profile cache
    await this.invalidateUserProfile(userId);
  }

  /**
   * Cache statistics and monitoring
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    keysByPrefix: Record<string, number>;
  }> {
    try {
      const listResult = await this.kv.list({ limit: 10000 });
      const totalKeys = listResult.keys.length;

      const keysByPrefix: Record<string, number> = {};

      listResult.keys.forEach(keyInfo => {
        const prefix = keyInfo.name.split(':')[0];
        keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
      });

      return {
        totalKeys,
        keysByPrefix,
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        totalKeys: 0,
        keysByPrefix: {},
      };
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredEntries(): Promise<{ deleted: number }> {
    let deleted = 0;

    try {
      // This is handled automatically by Cloudflare KV TTL
      // But we can implement manual cleanup if needed
      console.log('Cache cleanup: KV automatically handles TTL expiration');
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }

    return { deleted };
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string; timestamp: string }> {
    const testKey = 'health-check-cache-test';
    const testValue = { timestamp: new Date().toISOString(), test: true };

    try {
      // Test cache write
      await this.setCachedData(testKey, testValue, 60);

      // Test cache read
      const cachedResult = await this.getCachedData<typeof testValue>(testKey);

      if (!cachedResult || !cachedResult.fromCache) {
        throw new Error('Failed to retrieve test data from cache');
      }

      // Clean up test data
      await this.kv.delete(testKey);

      return {
        status: 'ok',
        message: 'Cache service read/write successful',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Try to clean up on error
      try {
        await this.kv.delete(testKey);
      } catch {}

      return {
        status: 'error',
        message: `Cache service error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
