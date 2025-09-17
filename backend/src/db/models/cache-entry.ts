import { eq, and, desc, asc, count, sql, gte, lte, like, isNull, isNotNull } from 'drizzle-orm';
import {
  cacheEntries,
  type CacheEntry,
  type NewCacheEntry,
  type CreateCacheEntry,
  generateCacheKey,
  getCacheTTL,
  isCacheEntryValid,
  CACHE_CONSTRAINTS,
} from '../../src/db/schema/sessions';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * CacheEntry Model - T050
 *
 * Provides business logic layer for KV cache management and CQRS-style caching.
 * Handles cache operations, TTL management, invalidation, and performance optimization.
 */

export interface CacheEntryWithDetails extends CacheEntry {
  daysSinceCreated: number;
  hoursSinceLastHit?: number;
  isCurrentlyValid: boolean;
  isExpired: boolean;
  isInvalidated: boolean;
  timeToExpiry: string;
  hitRate?: number; // Hits per day
  averageHitsPerDay: number;
  cacheType: string; // Extracted from key
}

export interface CacheSearchFilters {
  keyPattern?: string;
  cacheType?: string;
  isValid?: boolean;
  isExpired?: boolean;
  isInvalidated?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
  lastHitAfter?: string;
  lastHitBefore?: string;
  minHitCount?: number;
  maxHitCount?: number;
  highUsage?: boolean; // Entries with high hit counts
}

export interface CacheListResponse {
  entries: CacheEntryWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    invalidatedEntries: number;
    totalHits: number;
    averageHitCount: number;
  };
}

export interface SetCacheData {
  key: string;
  value: any;
  ttlSeconds?: number;
  cacheType?: string;
}

export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  invalidatedEntries: number;
  totalHits: number;
  averageHitCount: number;
  hitRate: number; // Overall hits per hour
  entriesByType: Record<string, number>;
  topKeys: Array<{ key: string; hitCount: number; lastHit: string }>;
  recentEntries: CacheEntry[];
  performanceMetrics: {
    cacheSize: number; // Total size in KB
    avgEntrySize: number; // Average entry size in KB
    memoryEfficiency: number; // Percentage
  };
}

export interface InvalidateResult {
  invalidated: number;
  keys: string[];
}

export class CacheEntryModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Set cache value
   */
  async set(cacheData: SetCacheData): Promise<CacheEntry> {
    // Validate key length
    if (cacheData.key.length > CACHE_CONSTRAINTS.MAX_KEY_LENGTH) {
      throw new Error(`Cache key cannot exceed ${CACHE_CONSTRAINTS.MAX_KEY_LENGTH} characters`);
    }

    // Validate value size (approximate)
    const valueSize = JSON.stringify(cacheData.value).length / 1024; // KB
    if (valueSize > CACHE_CONSTRAINTS.MAX_VALUE_SIZE_KB) {
      throw new Error(`Cache value cannot exceed ${CACHE_CONSTRAINTS.MAX_VALUE_SIZE_KB}KB`);
    }

    // Determine TTL
    const ttlSeconds =
      cacheData.ttlSeconds ||
      (cacheData.cacheType
        ? getCacheTTL(cacheData.cacheType)
        : CACHE_CONSTRAINTS.DEFAULT_TTL_SECONDS);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Check if entry already exists
    const existingEntry = await this.get(cacheData.key);

    if (existingEntry) {
      // Update existing entry
      const [entry] = await this.db
        .update(cacheEntries)
        .set({
          value: cacheData.value,
          expiresAt: expiresAt.toISOString(),
          invalidatedAt: null, // Clear invalidation
          lastHit: now.toISOString(),
        })
        .where(eq(cacheEntries.key, cacheData.key))
        .returning();

      return entry;
    } else {
      // Create new entry
      const [entry] = await this.db
        .insert(cacheEntries)
        .values({
          key: cacheData.key,
          value: cacheData.value,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          hitCount: 0,
        })
        .returning();

      return entry;
    }
  }

  /**
   * Get cache value
   */
  async get(key: string): Promise<CacheEntry | null> {
    const [entry] = await this.db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .limit(1);

    if (!entry) return null;

    // Check if entry is valid
    if (!isCacheEntryValid(entry)) {
      return null;
    }

    // Update hit count and last hit
    await this.db
      .update(cacheEntries)
      .set({
        hitCount: entry.hitCount + 1,
        lastHit: new Date().toISOString(),
      })
      .where(eq(cacheEntries.id, entry.id));

    return {
      ...entry,
      hitCount: entry.hitCount + 1,
      lastHit: new Date().toISOString(),
    };
  }

  /**
   * Get cache value without updating hit count (for admin purposes)
   */
  async peek(key: string): Promise<CacheEntry | null> {
    const [entry] = await this.db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .limit(1);

    return entry || null;
  }

  /**
   * Check if cache key exists and is valid
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.db.delete(cacheEntries).where(eq(cacheEntries.key, key));

    return result.rowsAffected > 0;
  }

  /**
   * Invalidate cache entry (mark as invalid without deleting)
   */
  async invalidate(key: string): Promise<boolean> {
    const result = await this.db
      .update(cacheEntries)
      .set({
        invalidatedAt: new Date().toISOString(),
      })
      .where(eq(cacheEntries.key, key));

    return result.rowsAffected > 0;
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<InvalidateResult> {
    // Convert simple pattern to SQL LIKE pattern
    const likePattern = pattern.replace(/\*/g, '%');

    const entriesToInvalidate = await this.db
      .select({ key: cacheEntries.key })
      .from(cacheEntries)
      .where(like(cacheEntries.key, likePattern));

    const result = await this.db
      .update(cacheEntries)
      .set({
        invalidatedAt: new Date().toISOString(),
      })
      .where(like(cacheEntries.key, likePattern));

    return {
      invalidated: result.rowsAffected,
      keys: entriesToInvalidate.map(e => e.key),
    };
  }

  /**
   * Get cache entry with detailed information
   */
  async getWithDetails(id: number): Promise<CacheEntryWithDetails | null> {
    const [entry] = await this.db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.id, id))
      .limit(1);

    if (!entry) return null;

    const now = new Date();
    const createdDate = new Date(entry.createdAt);
    const expiresDate = new Date(entry.expiresAt);
    const lastHitDate = entry.lastHit ? new Date(entry.lastHit) : null;

    // Extract cache type from key (e.g., "listings:123" -> "listings")
    const cacheType = entry.key.split(':')[0] || 'unknown';

    // Calculate time to expiry
    const timeToExpiry = this.formatTimeRemaining(expiresDate.getTime() - now.getTime());

    // Calculate average hits per day
    const daysSinceCreated = Math.max(
      1,
      Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    const averageHitsPerDay = entry.hitCount / daysSinceCreated;

    const entryWithDetails: CacheEntryWithDetails = {
      ...entry,
      daysSinceCreated,
      hoursSinceLastHit: lastHitDate
        ? Math.floor((now.getTime() - lastHitDate.getTime()) / (60 * 60 * 1000))
        : undefined,
      isCurrentlyValid: isCacheEntryValid(entry),
      isExpired: expiresDate <= now,
      isInvalidated: !!entry.invalidatedAt,
      timeToExpiry,
      averageHitsPerDay: Math.round(averageHitsPerDay * 100) / 100,
      cacheType,
    };

    return entryWithDetails;
  }

  /**
   * Search and filter cache entries
   */
  async search(filters: CacheSearchFilters = {}, page = 1, limit = 50): Promise<CacheListResponse> {
    let query = this.db.select().from(cacheEntries);
    let countQuery = this.db.select({ count: count() }).from(cacheEntries);

    const conditions = [];
    const now = new Date().toISOString();

    // Key pattern filter
    if (filters.keyPattern) {
      const likePattern = filters.keyPattern.replace(/\*/g, '%');
      conditions.push(like(cacheEntries.key, likePattern));
    }

    // Cache type filter (from key prefix)
    if (filters.cacheType) {
      conditions.push(like(cacheEntries.key, `${filters.cacheType}:%`));
    }

    // Valid filter
    if (filters.isValid !== undefined) {
      if (filters.isValid) {
        conditions.push(and(gte(cacheEntries.expiresAt, now), isNull(cacheEntries.invalidatedAt)));
      } else {
        conditions.push(sql`(
          ${cacheEntries.expiresAt} < ${now} OR
          ${cacheEntries.invalidatedAt} IS NOT NULL
        )`);
      }
    }

    // Expired filter
    if (filters.isExpired !== undefined) {
      if (filters.isExpired) {
        conditions.push(lte(cacheEntries.expiresAt, now));
      } else {
        conditions.push(gte(cacheEntries.expiresAt, now));
      }
    }

    // Invalidated filter
    if (filters.isInvalidated !== undefined) {
      if (filters.isInvalidated) {
        conditions.push(isNotNull(cacheEntries.invalidatedAt));
      } else {
        conditions.push(isNull(cacheEntries.invalidatedAt));
      }
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(cacheEntries.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(cacheEntries.createdAt, filters.createdBefore));
    }
    if (filters.expiresAfter) {
      conditions.push(gte(cacheEntries.expiresAt, filters.expiresAfter));
    }
    if (filters.expiresBefore) {
      conditions.push(lte(cacheEntries.expiresAt, filters.expiresBefore));
    }
    if (filters.lastHitAfter) {
      conditions.push(gte(cacheEntries.lastHit, filters.lastHitAfter));
    }
    if (filters.lastHitBefore) {
      conditions.push(lte(cacheEntries.lastHit, filters.lastHitBefore));
    }

    // Hit count filters
    if (filters.minHitCount !== undefined) {
      conditions.push(gte(cacheEntries.hitCount, filters.minHitCount));
    }
    if (filters.maxHitCount !== undefined) {
      conditions.push(lte(cacheEntries.hitCount, filters.maxHitCount));
    }

    // High usage filter (top 10% by hit count)
    if (filters.highUsage) {
      const [avgHitResult] = await this.db
        .select({ avg: sql<number>`AVG(${cacheEntries.hitCount})` })
        .from(cacheEntries);

      const threshold = (avgHitResult.avg || 0) * 2; // 2x average
      conditions.push(gte(cacheEntries.hitCount, threshold));
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(desc(cacheEntries.lastHit), desc(cacheEntries.hitCount))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const entryList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const entriesWithDetails: CacheEntryWithDetails[] = await Promise.all(
      entryList.map(async entry => {
        const details = await this.getWithDetails(entry.id);
        return details!;
      })
    );

    return {
      entries: entriesWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db.delete(cacheEntries).where(lte(cacheEntries.expiresAt, now));

    return result.rowsAffected;
  }

  /**
   * Clean up invalidated entries
   */
  async cleanupInvalidated(): Promise<number> {
    const result = await this.db.delete(cacheEntries).where(isNotNull(cacheEntries.invalidatedAt));

    return result.rowsAffected;
  }

  /**
   * Clean up least used entries (LRU)
   */
  async cleanupLRU(keepCount: number): Promise<number> {
    // Get entries to delete (beyond keepCount, ordered by usage)
    const entriesToDelete = await this.db
      .select({ id: cacheEntries.id })
      .from(cacheEntries)
      .orderBy(asc(cacheEntries.hitCount), asc(cacheEntries.lastHit))
      .offset(keepCount);

    if (entriesToDelete.length === 0) return 0;

    const idsToDelete = entriesToDelete.map(e => e.id);
    const result = await this.db
      .delete(cacheEntries)
      .where(sql`${cacheEntries.id} IN (${idsToDelete.join(',')})`);

    return result.rowsAffected;
  }

  /**
   * Get entries by cache type
   */
  async getByType(cacheType: string, validOnly = true): Promise<CacheEntry[]> {
    let query = this.db
      .select()
      .from(cacheEntries)
      .where(like(cacheEntries.key, `${cacheType}:%`));

    if (validOnly) {
      const now = new Date().toISOString();
      query = query.where(
        and(
          like(cacheEntries.key, `${cacheType}:%`),
          gte(cacheEntries.expiresAt, now),
          isNull(cacheEntries.invalidatedAt)
        )
      );
    }

    return await query.orderBy(desc(cacheEntries.lastHit));
  }

  /**
   * Get cache hit statistics by type
   */
  async getHitStatsByType(): Promise<
    Record<string, { entries: number; totalHits: number; avgHits: number }>
  > {
    const entries = await this.db.select().from(cacheEntries);

    const statsByType: Record<string, { entries: number; totalHits: number; avgHits: number }> = {};

    for (const entry of entries) {
      const cacheType = entry.key.split(':')[0] || 'unknown';

      if (!statsByType[cacheType]) {
        statsByType[cacheType] = { entries: 0, totalHits: 0, avgHits: 0 };
      }

      statsByType[cacheType].entries++;
      statsByType[cacheType].totalHits += entry.hitCount;
    }

    // Calculate averages
    for (const type in statsByType) {
      const stats = statsByType[type];
      stats.avgHits =
        stats.entries > 0 ? Math.round((stats.totalHits / stats.entries) * 100) / 100 : 0;
    }

    return statsByType;
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(cacheEntries);

    const now = new Date().toISOString();

    const [validResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(and(gte(cacheEntries.expiresAt, now), isNull(cacheEntries.invalidatedAt)));

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(lte(cacheEntries.expiresAt, now));

    const [invalidatedResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(isNotNull(cacheEntries.invalidatedAt));

    const [hitsResult] = await this.db
      .select({ totalHits: sql<number>`SUM(${cacheEntries.hitCount})` })
      .from(cacheEntries);

    const avgHitCount = totalResult.count > 0 ? (hitsResult.totalHits || 0) / totalResult.count : 0;

    // Calculate hit rate (hits per hour)
    const [oldestEntry] = await this.db
      .select({ createdAt: cacheEntries.createdAt })
      .from(cacheEntries)
      .orderBy(asc(cacheEntries.createdAt))
      .limit(1);

    let hitRate = 0;
    if (oldestEntry) {
      const hoursActive = Math.max(
        1,
        (Date.now() - new Date(oldestEntry.createdAt).getTime()) / (60 * 60 * 1000)
      );
      hitRate = (hitsResult.totalHits || 0) / hoursActive;
    }

    // Entries by type
    const entriesByType = await this.getHitStatsByType();
    const entriesByTypeCount = Object.keys(entriesByType).reduce(
      (acc, type) => {
        acc[type] = entriesByType[type].entries;
        return acc;
      },
      {} as Record<string, number>
    );

    // Top keys by hit count
    const topKeys = await this.db
      .select({
        key: cacheEntries.key,
        hitCount: cacheEntries.hitCount,
        lastHit: cacheEntries.lastHit,
      })
      .from(cacheEntries)
      .orderBy(desc(cacheEntries.hitCount))
      .limit(10);

    const recentEntries = await this.db
      .select()
      .from(cacheEntries)
      .orderBy(desc(cacheEntries.createdAt))
      .limit(10);

    // Performance metrics (approximate)
    const [sizeResult] = await this.db
      .select({
        avgSize: sql<number>`AVG(LENGTH(${cacheEntries.value}))`,
        totalSize: sql<number>`SUM(LENGTH(${cacheEntries.value}))`,
      })
      .from(cacheEntries);

    const avgEntrySize = (sizeResult.avgSize || 0) / 1024; // Convert to KB
    const totalSize = (sizeResult.totalSize || 0) / 1024; // Convert to KB

    return {
      totalEntries: totalResult.count,
      validEntries: validResult.count,
      expiredEntries: expiredResult.count,
      invalidatedEntries: invalidatedResult.count,
      totalHits: hitsResult.totalHits || 0,
      averageHitCount: Math.round(avgHitCount * 100) / 100,
      hitRate: Math.round(hitRate * 100) / 100,
      entriesByType: entriesByTypeCount,
      topKeys: topKeys.map(k => ({
        key: k.key,
        hitCount: k.hitCount,
        lastHit: k.lastHit || 'Never',
      })),
      recentEntries,
      performanceMetrics: {
        cacheSize: Math.round(totalSize * 100) / 100,
        avgEntrySize: Math.round(avgEntrySize * 100) / 100,
        memoryEfficiency:
          totalResult.count > 0 ? Math.round((validResult.count / totalResult.count) * 100) : 0,
      },
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    invalidatedEntries: number;
    totalHits: number;
    averageHitCount: number;
  }> {
    const [totalResult] = await this.db.select({ count: count() }).from(cacheEntries);

    const now = new Date().toISOString();

    const [validResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(and(gte(cacheEntries.expiresAt, now), isNull(cacheEntries.invalidatedAt)));

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(lte(cacheEntries.expiresAt, now));

    const [invalidatedResult] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(isNotNull(cacheEntries.invalidatedAt));

    const [hitsResult] = await this.db
      .select({ totalHits: sql<number>`SUM(${cacheEntries.hitCount})` })
      .from(cacheEntries);

    const avgHitCount = totalResult.count > 0 ? (hitsResult.totalHits || 0) / totalResult.count : 0;

    return {
      totalEntries: totalResult.count,
      validEntries: validResult.count,
      expiredEntries: expiredResult.count,
      invalidatedEntries: invalidatedResult.count,
      totalHits: hitsResult.totalHits || 0,
      averageHitCount: Math.round(avgHitCount * 100) / 100,
    };
  }

  /**
   * Check if cache entry exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(cacheEntries)
      .where(eq(cacheEntries.id, id));

    return result.count > 0;
  }

  /**
   * Helper functions
   */
  generateKey(type: string, ...parts: (string | number)[]): string {
    return generateCacheKey(type, ...parts);
  }

  getTTL(type: string): number {
    return getCacheTTL(type);
  }

  isValid(entry: CacheEntry): boolean {
    return isCacheEntryValid(entry);
  }

  private formatTimeRemaining(milliseconds: number): string {
    if (milliseconds <= 0) return 'Expired';

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  getConstraints() {
    return CACHE_CONSTRAINTS;
  }
}

// Export types and functions for use in other modules
export {
  CacheEntry,
  NewCacheEntry,
  CreateCacheEntry,
  generateCacheKey,
  getCacheTTL,
  isCacheEntryValid,
  CACHE_CONSTRAINTS,
};
export type {
  CacheEntryWithDetails,
  CacheSearchFilters,
  CacheListResponse,
  SetCacheData,
  CacheStats,
  InvalidateResult,
};
