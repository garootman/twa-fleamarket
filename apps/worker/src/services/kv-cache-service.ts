export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  metadata?: Record<string, any>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export class KVCacheService {
  private kv: KVNamespace;
  private defaultTTL: number;

  constructor(kv: KVNamespace, defaultTTL: number = 3600) {
    this.kv = kv;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.kv.get(key, 'json');
      return value as T | null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Get value as text from cache
   */
  async getText(key: string): Promise<string | null> {
    try {
      return await this.kv.get(key, 'text');
    } catch (error) {
      console.error('Cache getText error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    try {
      const ttl = options?.ttl || this.defaultTTL;

      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: ttl,
        metadata: options?.metadata,
      });

      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Get or set pattern - get from cache, or compute and cache if missing
   */
  async getOrSet<T>(
    key: string,
    computeFn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Compute value if not in cache
      const value = await computeFn();

      // Cache the computed value
      await this.set(key, value, options);

      return value;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      // If cache fails, still return computed value
      return await computeFn();
    }
  }

  /**
   * Cache listings search results
   */
  async cacheListingsSearch(
    searchParams: any,
    results: any[],
    ttl: number = 300
  ): Promise<boolean> {
    const key = this.generateSearchKey('listings', searchParams);
    return await this.set(
      key,
      {
        results,
        count: results.length,
        cachedAt: new Date().toISOString(),
      },
      { ttl }
    );
  }

  /**
   * Get cached listings search results
   */
  async getCachedListingsSearch(searchParams: any): Promise<any[] | null> {
    const key = this.generateSearchKey('listings', searchParams);
    const cached = await this.get<{
      results: any[];
      count: number;
      cachedAt: string;
    }>(key);

    return cached?.results || null;
  }

  /**
   * Cache categories
   */
  async cacheCategories(categories: any[], ttl: number = 7200): Promise<boolean> {
    return await this.set('categories:all', categories, { ttl });
  }

  /**
   * Get cached categories
   */
  async getCachedCategories(): Promise<any[] | null> {
    return await this.get<any[]>('categories:all');
  }

  /**
   * Cache user profile
   */
  async cacheUserProfile(userId: number, profile: any, ttl: number = 1800): Promise<boolean> {
    return await this.set(`user:${userId}:profile`, profile, { ttl });
  }

  /**
   * Get cached user profile
   */
  async getCachedUserProfile(userId: number): Promise<any | null> {
    return await this.get(`user:${userId}:profile`);
  }

  /**
   * Cache listing details
   */
  async cacheListingDetails(listingId: number, listing: any, ttl: number = 900): Promise<boolean> {
    return await this.set(`listing:${listingId}`, listing, { ttl });
  }

  /**
   * Get cached listing details
   */
  async getCachedListingDetails(listingId: number): Promise<any | null> {
    return await this.get(`listing:${listingId}`);
  }

  /**
   * Invalidate listing cache when updated
   */
  async invalidateListingCache(listingId: number): Promise<boolean> {
    return await this.delete(`listing:${listingId}`);
  }

  /**
   * Invalidate user cache when updated
   */
  async invalidateUserCache(userId: number): Promise<boolean> {
    return await this.delete(`user:${userId}:profile`);
  }

  /**
   * Generate cache key for search queries
   */
  private generateSearchKey(type: string, params: any): string {
    // Sort params for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result: any, key) => {
        if (params[key] !== undefined && params[key] !== null) {
          result[key] = params[key];
        }
        return result;
      }, {});

    const paramsString = JSON.stringify(sortedParams);
    const hash = this.simpleHash(paramsString);

    return `search:${type}:${hash}`;
  }

  /**
   * Simple hash function for generating cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Bulk delete keys by pattern (for cache cleanup)
   */
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      let deletedCount = 0;
      let cursor: string | undefined;

      do {
        const listResult = await this.kv.list({
          prefix: pattern,
          ...(cursor && { cursor }),
          limit: 1000,
        });

        const deletePromises = listResult.keys.map(async (key) => {
          try {
            await this.kv.delete(key.name);
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete key ${key.name}:`, error);
          }
        });

        await Promise.all(deletePromises);
        cursor = listResult.list_complete ? undefined : 'continue';
      } while (cursor);

      return deletedCount;
    } catch (error) {
      console.error('Error deleting by pattern:', error);
      return 0;
    }
  }

  /**
   * Clear all search caches
   */
  async clearSearchCaches(): Promise<number> {
    return await this.deleteByPattern('search:');
  }

  /**
   * Warm up common caches
   */
  async warmUpCaches(computeFunctions: {
    categories?: () => Promise<any[]>;
    popularListings?: () => Promise<any[]>;
  }): Promise<void> {
    try {
      const warmupPromises: Promise<any>[] = [];

      if (computeFunctions.categories) {
        warmupPromises.push(
          this.getOrSet('categories:all', computeFunctions.categories, { ttl: 7200 })
        );
      }

      if (computeFunctions.popularListings) {
        warmupPromises.push(
          this.getOrSet('listings:popular', computeFunctions.popularListings, { ttl: 1800 })
        );
      }

      await Promise.all(warmupPromises);
    } catch (error) {
      console.error('Error warming up caches:', error);
    }
  }

  /**
   * Get cache statistics (simplified)
   */
  async getStats(): Promise<{ keyCount: number }> {
    try {
      const listResult = await this.kv.list({ limit: 1 });
      // Note: KV doesn't provide detailed stats, this is a simple implementation
      return {
        keyCount: listResult.keys.length,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { keyCount: 0 };
    }
  }
}