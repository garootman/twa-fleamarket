import { CacheEntryModel } from '../db/models/cache-entry';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * KVCacheService - T056
 *
 * Provides CQRS-style caching with automatic invalidation and performance optimization.
 * Handles cache operations, TTL management, and cache warming strategies.
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for group invalidation
  compression?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  cacheSize: number;
  evictionCount: number;
}

export interface CacheWarmupResult {
  warmedUp: number;
  failed: number;
  duration: number;
  errors: string[];
}

export class KVCacheService {
  private cacheModel: CacheEntryModel;
  private kvNamespace?: any; // CloudFlare KV namespace
  private stats: {
    requests: number;
    hits: number;
    misses: number;
    totalResponseTime: number;
  };

  constructor(db: DrizzleD1Database, kvNamespace?: any) {
    this.cacheModel = new CacheEntryModel(db);
    this.kvNamespace = kvNamespace;
    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Get value from cache with fallback to database
   */
  async get<T>(
    key: string,
    fallback?: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    this.stats.requests++;

    try {
      // Try KV first (fastest)
      if (this.kvNamespace) {
        const kvValue = await this.kvNamespace.get(key, { type: 'json' });
        if (kvValue !== null) {
          this.recordHit(Date.now() - startTime);
          return kvValue;
        }
      }

      // Try database cache
      const cacheEntry = await this.cacheModel.get(key);
      if (cacheEntry) {
        // Warm KV cache
        if (this.kvNamespace) {
          await this.kvNamespace.put(key, JSON.stringify(cacheEntry.value), {
            expirationTtl: Math.max(
              1,
              Math.floor((new Date(cacheEntry.expiresAt).getTime() - Date.now()) / 1000)
            ),
          });
        }

        this.recordHit(Date.now() - startTime);
        return cacheEntry.value;
      }

      // Cache miss - call fallback if provided
      if (fallback) {
        const value = await fallback();
        if (value !== null && value !== undefined) {
          await this.set(key, value, options);
        }
        this.recordMiss(Date.now() - startTime);
        return value;
      }

      this.recordMiss(Date.now() - startTime);
      return null;
    } catch (error) {
      this.recordMiss(Date.now() - startTime);
      console.error('Cache get error:', error);

      // If fallback exists, try it even on cache error
      if (fallback) {
        return await fallback();
      }

      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheType = key.split(':')[0] || 'default';
      const ttl = options.ttl || this.cacheModel.getTTL(cacheType);

      // Set in database cache
      await this.cacheModel.set({
        key,
        value,
        ttlSeconds: ttl,
        cacheType,
      });

      // Set in KV cache
      if (this.kvNamespace) {
        await this.kvNamespace.put(key, JSON.stringify(value), {
          expirationTtl: ttl,
          metadata: {
            tags: options.tags || [],
            priority: options.priority || 'normal',
            setAt: Date.now(),
          },
        });
      }

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
      // Delete from database
      await this.cacheModel.delete(key);

      // Delete from KV
      if (this.kvNamespace) {
        await this.kvNamespace.delete(key);
      }

      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<{
    invalidated: number;
    errors: string[];
  }> {
    try {
      // Invalidate in database
      const dbResult = await this.cacheModel.invalidatePattern(pattern);

      // For KV, we'd need to track keys by pattern (simplified here)
      // In production, use KV metadata or a separate index

      return {
        invalidated: dbResult.invalidated,
        errors: [],
      };
    } catch (error) {
      return {
        invalidated: 0,
        errors: [error instanceof Error ? error.message : 'Invalidation failed'],
      };
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<{
    invalidated: number;
    errors: string[];
  }> {
    try {
      // This would require a tag-to-key mapping in production
      // For now, invalidate by pattern matching tag names
      let totalInvalidated = 0;
      const errors: string[] = [];

      for (const tag of tags) {
        try {
          const result = await this.invalidatePattern(`*${tag}*`);
          totalInvalidated += result.invalidated;
        } catch (error) {
          errors.push(`Failed to invalidate tag ${tag}: ${error}`);
        }
      }

      return { invalidated: totalInvalidated, errors };
    } catch (error) {
      return {
        invalidated: 0,
        errors: [error instanceof Error ? error.message : 'Tag invalidation failed'],
      };
    }
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache(
    warmupTasks: Array<{
      key: string;
      loader: () => Promise<any>;
      options?: CacheOptions;
    }>
  ): Promise<CacheWarmupResult> {
    const startTime = Date.now();
    let warmedUp = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const task of warmupTasks) {
      try {
        const value = await task.loader();
        const success = await this.set(task.key, value, task.options);
        if (success) {
          warmedUp++;
        } else {
          failed++;
          errors.push(`Failed to cache key: ${task.key}`);
        }
      } catch (error) {
        failed++;
        errors.push(`Error loading ${task.key}: ${error}`);
      }
    }

    return {
      warmedUp,
      failed,
      duration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<{
    expiredRemoved: number;
    invalidatedRemoved: number;
    lruRemoved: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let expiredRemoved = 0;
    let invalidatedRemoved = 0;
    let lruRemoved = 0;

    try {
      // Clean expired entries
      expiredRemoved = await this.cacheModel.cleanupExpired();
    } catch (error) {
      errors.push(`Expired cleanup failed: ${error}`);
    }

    try {
      // Clean invalidated entries
      invalidatedRemoved = await this.cacheModel.cleanupInvalidated();
    } catch (error) {
      errors.push(`Invalidated cleanup failed: ${error}`);
    }

    try {
      // LRU cleanup (keep top 10000 entries)
      lruRemoved = await this.cacheModel.cleanupLRU(10000);
    } catch (error) {
      errors.push(`LRU cleanup failed: ${error}`);
    }

    return {
      expiredRemoved,
      invalidatedRemoved,
      lruRemoved,
      errors,
    };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const dbStats = await this.cacheModel.getStats();

    const hitRate = this.stats.requests > 0 ? (this.stats.hits / this.stats.requests) * 100 : 0;
    const missRate = 100 - hitRate;
    const averageResponseTime =
      this.stats.requests > 0 ? this.stats.totalResponseTime / this.stats.requests : 0;

    return {
      hitRate: Math.round(hitRate * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      totalRequests: this.stats.requests,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      cacheSize: dbStats.totalEntries,
      evictionCount: 0, // Would track evictions in production
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      // Check KV first
      if (this.kvNamespace) {
        const kvValue = await this.kvNamespace.get(key);
        if (kvValue !== null) return true;
      }

      // Check database cache
      const entry = await this.cacheModel.peek(key);
      return entry !== null && this.cacheModel.isValid(entry);
    } catch {
      return false;
    }
  }

  /**
   * Get multiple values at once
   */
  async getMultiple<T>(
    keys: string[],
    fallbacks?: Record<string, () => Promise<T>>
  ): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};

    await Promise.all(
      keys.map(async key => {
        const fallback = fallbacks?.[key];
        results[key] = await this.get(key, fallback);
      })
    );

    return results;
  }

  /**
   * Set multiple values at once
   */
  async setMultiple<T>(
    entries: Record<string, T>,
    options: CacheOptions = {}
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      Object.entries(entries).map(async ([key, value]) => {
        const result = await this.set(key, value, options);
        if (result) {
          success.push(key);
        } else {
          failed.push(key);
        }
      })
    );

    return { success, failed };
  }

  /**
   * Cache wrapper for functions
   */
  async cached<T>(key: string, fn: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as T;
    }

    const result = await fn();
    await this.set(key, result, options);
    return result;
  }

  /**
   * Cache with mutex to prevent cache stampede
   */
  private readonly pendingRequests = new Map<string, Promise<any>>();

  async getWithMutex<T>(key: string, fn: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    // Check cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as T;
    }

    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      return await this.pendingRequests.get(key);
    }

    // Create pending request
    const promise = this.executeFunctionWithCache(key, fn, options);
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Execute function and cache result
   */
  private async executeFunctionWithCache<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    // Double-check cache (another request might have filled it)
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as T;
    }

    const result = await fn();
    await this.set(key, result, options);
    return result;
  }

  /**
   * Generate cache key with namespace
   */
  generateKey(namespace: string, ...parts: (string | number)[]): string {
    return this.cacheModel.generateKey(namespace, ...parts);
  }

  /**
   * Record cache hit
   */
  private recordHit(responseTime: number): void {
    this.stats.hits++;
    this.stats.totalResponseTime += responseTime;
  }

  /**
   * Record cache miss
   */
  private recordMiss(responseTime: number): void {
    this.stats.misses++;
    this.stats.totalResponseTime += responseTime;
  }

  /**
   * Preload common cache keys
   */
  async preloadCommonKeys(): Promise<CacheWarmupResult> {
    const commonTasks = [
      {
        key: this.generateKey('categories', 'all'),
        loader: async () => {
          // Would load categories from database
          return [];
        },
        options: { ttl: 3600 }, // 1 hour
      },
      {
        key: this.generateKey('featured', 'listings'),
        loader: async () => {
          // Would load featured listings
          return [];
        },
        options: { ttl: 900 }, // 15 minutes
      },
    ];

    return await this.warmCache(commonTasks);
  }
}
