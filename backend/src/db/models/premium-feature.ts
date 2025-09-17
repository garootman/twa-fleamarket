import { eq, and, desc, asc, count, sql, gte, lte, isNull, isNotNull, or } from 'drizzle-orm';
import {
  premiumFeatures,
  type PremiumFeature,
  type NewPremiumFeature,
  type CreatePremiumFeature,
  type UpdatePremiumFeature,
  type PremiumFeatureWithDetails,
  PremiumFeatureType,
  calculateFeatureExpiration,
  getFeaturePrice,
  isFeatureActive,
  canUserPurchaseFeature,
  getFeatureDisplayName,
  getFeatureDescription,
  enrichPremiumFeature,
  PREMIUM_FEATURE_CONSTRAINTS,
} from '../../src/db/schema/premium';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * PremiumFeature Model - T046
 *
 * Provides business logic layer for premium feature management with Telegram Stars payments.
 * Handles feature purchases, renewals, expiration, and billing integration.
 */

export interface PremiumFeatureWithStats extends PremiumFeatureWithDetails {
  daysSincePurchase: number;
  daysRemaining?: number;
  hoursRemaining?: number;
  renewalCount: number;
  totalStarsSpent: number;
  isExpiringSoon: boolean; // Within 24 hours
  effectivenessScore?: number; // For analytics
}

export interface FeatureSearchFilters {
  userId?: number;
  listingId?: string;
  featureType?: PremiumFeatureType;
  isActive?: boolean;
  purchasedAfter?: string;
  purchasedBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
  expiringSoon?: boolean; // Within 24 hours
  cancelled?: boolean;
}

export interface FeatureListResponse {
  features: PremiumFeatureWithStats[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    activeFeatures: number;
    totalRevenue: number;
    expiringCount: number;
    featuresByType: Record<PremiumFeatureType, number>;
  };
}

export interface PurchaseFeatureData {
  userId: number;
  featureType: PremiumFeatureType;
  listingId?: string;
  starsPaid: number;
  telegramPaymentId?: string; // From Telegram payment
}

export interface PremiumStats {
  totalFeatures: number;
  activeFeatures: number;
  totalRevenue: number;
  revenueByType: Record<PremiumFeatureType, number>;
  featuresByType: Record<PremiumFeatureType, number>;
  avgRevenuePerUser: number;
  topSpenders: Array<{ userId: number; totalSpent: number }>;
  recentPurchases: PremiumFeature[];
  autoRenewalSuccessRate: number;
}

export interface RenewalResult {
  success: boolean;
  feature?: PremiumFeature;
  error?: string;
  nextRenewal?: string;
}

export class PremiumFeatureModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Purchase a premium feature
   */
  async purchase(purchaseData: PurchaseFeatureData): Promise<PremiumFeature> {
    // Validate feature type and price
    const expectedPrice = getFeaturePrice(purchaseData.featureType);
    if (purchaseData.starsPaid !== expectedPrice) {
      throw new Error(
        `Invalid payment amount. Expected ${expectedPrice} stars, got ${purchaseData.starsPaid}`
      );
    }

    // Check if user can purchase this feature
    const existingFeatures = await this.getUserFeatures(purchaseData.userId);
    const canPurchase = canUserPurchaseFeature(
      purchaseData.userId,
      purchaseData.featureType,
      purchaseData.listingId || null,
      existingFeatures
    );

    if (!canPurchase.canPurchase) {
      throw new Error(canPurchase.reason || 'Cannot purchase this feature');
    }

    // Calculate expiration
    const purchaseDate = new Date();
    const expirationDate = calculateFeatureExpiration(purchaseData.featureType, purchaseDate);

    const [feature] = await this.db
      .insert(premiumFeatures)
      .values({
        userId: purchaseData.userId,
        listingId: purchaseData.listingId || null,
        featureType: purchaseData.featureType,
        starsPaid: purchaseData.starsPaid,
        purchasedAt: purchaseDate.toISOString(),
        expiresAt: expirationDate.toISOString(),
        isActive: true,
        autoRenewedCount: 0,
      })
      .returning();

    return feature;
  }

  /**
   * Find premium feature by ID
   */
  async findById(id: number): Promise<PremiumFeature | null> {
    const [feature] = await this.db
      .select()
      .from(premiumFeatures)
      .where(eq(premiumFeatures.id, id))
      .limit(1);

    return feature || null;
  }

  /**
   * Get premium feature with detailed information
   */
  async getWithStats(id: number): Promise<PremiumFeatureWithStats | null> {
    const feature = await this.findById(id);
    if (!feature) return null;

    const enriched = enrichPremiumFeature(feature);
    const now = new Date();
    const purchaseDate = new Date(feature.purchasedAt);
    const expirationDate = new Date(feature.expiresAt);

    const stats: PremiumFeatureWithStats = {
      ...enriched,
      daysSincePurchase: Math.floor(
        (now.getTime() - purchaseDate.getTime()) / (24 * 60 * 60 * 1000)
      ),
      daysRemaining: enriched.isCurrentlyActive
        ? Math.floor((expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : 0,
      hoursRemaining: enriched.isCurrentlyActive
        ? Math.floor((expirationDate.getTime() - now.getTime()) / (60 * 60 * 1000))
        : 0,
      renewalCount: feature.autoRenewedCount,
      totalStarsSpent: feature.starsPaid * (1 + feature.autoRenewedCount),
      isExpiringSoon:
        enriched.isCurrentlyActive &&
        expirationDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000,
    };

    return stats;
  }

  /**
   * Update premium feature
   */
  async update(id: number, updateData: UpdatePremiumFeature): Promise<PremiumFeature | null> {
    const [feature] = await this.db
      .update(premiumFeatures)
      .set(updateData)
      .where(eq(premiumFeatures.id, id))
      .returning();

    return feature || null;
  }

  /**
   * Cancel premium feature (stop auto-renewal)
   */
  async cancel(id: number, userId?: number): Promise<PremiumFeature | null> {
    const existingFeature = await this.findById(id);
    if (!existingFeature) {
      throw new Error('Premium feature not found');
    }

    // Check ownership if userId provided
    if (userId && existingFeature.userId !== userId) {
      throw new Error('Not authorized to cancel this feature');
    }

    return await this.update(id, {
      cancelledAt: new Date().toISOString(),
    });
  }

  /**
   * Reactivate cancelled feature
   */
  async reactivate(id: number, userId?: number): Promise<PremiumFeature | null> {
    const existingFeature = await this.findById(id);
    if (!existingFeature) {
      throw new Error('Premium feature not found');
    }

    // Check ownership if userId provided
    if (userId && existingFeature.userId !== userId) {
      throw new Error('Not authorized to reactivate this feature');
    }

    // Can only reactivate if not expired
    if (new Date(existingFeature.expiresAt) <= new Date()) {
      throw new Error('Cannot reactivate expired feature');
    }

    return await this.update(id, {
      cancelledAt: null,
    });
  }

  /**
   * Get user's premium features
   */
  async getUserFeatures(userId: number, activeOnly = false): Promise<PremiumFeature[]> {
    let query = this.db.select().from(premiumFeatures).where(eq(premiumFeatures.userId, userId));

    if (activeOnly) {
      query = query.where(
        and(
          eq(premiumFeatures.userId, userId),
          eq(premiumFeatures.isActive, true),
          gte(premiumFeatures.expiresAt, new Date().toISOString()),
          isNull(premiumFeatures.cancelledAt)
        )
      );
    }

    return await query.orderBy(desc(premiumFeatures.purchasedAt));
  }

  /**
   * Get listing's premium features
   */
  async getListingFeatures(listingId: string, activeOnly = true): Promise<PremiumFeature[]> {
    let query = this.db
      .select()
      .from(premiumFeatures)
      .where(eq(premiumFeatures.listingId, listingId));

    if (activeOnly) {
      query = query.where(
        and(
          eq(premiumFeatures.listingId, listingId),
          eq(premiumFeatures.isActive, true),
          gte(premiumFeatures.expiresAt, new Date().toISOString()),
          isNull(premiumFeatures.cancelledAt)
        )
      );
    }

    return await query.orderBy(desc(premiumFeatures.purchasedAt));
  }

  /**
   * Get active features by type
   */
  async getActiveFeaturesByType(featureType: PremiumFeatureType): Promise<PremiumFeature[]> {
    return await this.db
      .select()
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.featureType, featureType),
          eq(premiumFeatures.isActive, true),
          gte(premiumFeatures.expiresAt, new Date().toISOString()),
          isNull(premiumFeatures.cancelledAt)
        )
      )
      .orderBy(desc(premiumFeatures.purchasedAt));
  }

  /**
   * Search and filter premium features
   */
  async search(
    filters: FeatureSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<FeatureListResponse> {
    let query = this.db.select().from(premiumFeatures);
    let countQuery = this.db.select({ count: count() }).from(premiumFeatures);

    const conditions = [];
    const now = new Date().toISOString();

    // User filter
    if (filters.userId) {
      conditions.push(eq(premiumFeatures.userId, filters.userId));
    }

    // Listing filter
    if (filters.listingId) {
      conditions.push(eq(premiumFeatures.listingId, filters.listingId));
    }

    // Feature type filter
    if (filters.featureType) {
      conditions.push(eq(premiumFeatures.featureType, filters.featureType));
    }

    // Active filter
    if (filters.isActive !== undefined) {
      if (filters.isActive) {
        conditions.push(
          and(
            eq(premiumFeatures.isActive, true),
            gte(premiumFeatures.expiresAt, now),
            isNull(premiumFeatures.cancelledAt)
          )
        );
      } else {
        conditions.push(
          or(
            eq(premiumFeatures.isActive, false),
            lte(premiumFeatures.expiresAt, now),
            isNotNull(premiumFeatures.cancelledAt)
          )
        );
      }
    }

    // Date filters
    if (filters.purchasedAfter) {
      conditions.push(gte(premiumFeatures.purchasedAt, filters.purchasedAfter));
    }
    if (filters.purchasedBefore) {
      conditions.push(lte(premiumFeatures.purchasedAt, filters.purchasedBefore));
    }
    if (filters.expiresAfter) {
      conditions.push(gte(premiumFeatures.expiresAt, filters.expiresAfter));
    }
    if (filters.expiresBefore) {
      conditions.push(lte(premiumFeatures.expiresAt, filters.expiresBefore));
    }

    // Expiring soon filter
    if (filters.expiringSoon) {
      const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      conditions.push(
        and(
          eq(premiumFeatures.isActive, true),
          lte(premiumFeatures.expiresAt, in24Hours),
          gte(premiumFeatures.expiresAt, now),
          isNull(premiumFeatures.cancelledAt)
        )
      );
    }

    // Cancelled filter
    if (filters.cancelled !== undefined) {
      if (filters.cancelled) {
        conditions.push(isNotNull(premiumFeatures.cancelledAt));
      } else {
        conditions.push(isNull(premiumFeatures.cancelledAt));
      }
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
      .orderBy(desc(premiumFeatures.purchasedAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const featureList = hasMore ? results.slice(0, limit) : results;

    // Enhance with stats
    const featuresWithStats: PremiumFeatureWithStats[] = await Promise.all(
      featureList.map(async feature => {
        const stats = await this.getWithStats(feature.id);
        return stats!;
      })
    );

    return {
      features: featuresWithStats,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Get expiring features
   */
  async getExpiring(hours = 24, limit = 100): Promise<PremiumFeature[]> {
    const futureDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    return await this.db
      .select()
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.isActive, true),
          lte(premiumFeatures.expiresAt, futureDate),
          gte(premiumFeatures.expiresAt, now),
          isNull(premiumFeatures.cancelledAt)
        )
      )
      .orderBy(asc(premiumFeatures.expiresAt))
      .limit(limit);
  }

  /**
   * Get expired features that should be deactivated
   */
  async getExpired(): Promise<PremiumFeature[]> {
    const now = new Date().toISOString();

    return await this.db
      .select()
      .from(premiumFeatures)
      .where(and(eq(premiumFeatures.isActive, true), lte(premiumFeatures.expiresAt, now)))
      .orderBy(asc(premiumFeatures.expiresAt));
  }

  /**
   * Deactivate expired features
   */
  async deactivateExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .update(premiumFeatures)
      .set({ isActive: false })
      .where(and(eq(premiumFeatures.isActive, true), lte(premiumFeatures.expiresAt, now)));

    return result.rowsAffected;
  }

  /**
   * Auto-renew eligible features
   */
  async autoRenewFeatures(): Promise<RenewalResult[]> {
    // Get features eligible for auto-renewal (expires within 1 hour and not cancelled)
    const eligibleFeatures = await this.db
      .select()
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.featureType, PremiumFeatureType.AUTO_BUMP),
          eq(premiumFeatures.isActive, true),
          lte(premiumFeatures.expiresAt, new Date(Date.now() + 60 * 60 * 1000).toISOString()),
          gte(premiumFeatures.expiresAt, new Date().toISOString()),
          isNull(premiumFeatures.cancelledAt),
          sql`${premiumFeatures.autoRenewedCount} < ${PREMIUM_FEATURE_CONSTRAINTS.MAX_AUTO_RENEWALS}`
        )
      );

    const results: RenewalResult[] = [];

    for (const feature of eligibleFeatures) {
      try {
        // In real implementation, this would charge the user's payment method
        // For now, assume the payment succeeds

        const newExpiration = calculateFeatureExpiration(
          feature.featureType as PremiumFeatureType,
          new Date(feature.expiresAt)
        );

        const [renewed] = await this.db
          .update(premiumFeatures)
          .set({
            expiresAt: newExpiration.toISOString(),
            autoRenewedCount: feature.autoRenewedCount + 1,
          })
          .where(eq(premiumFeatures.id, feature.id))
          .returning();

        results.push({
          success: true,
          feature: renewed,
          nextRenewal: newExpiration.toISOString(),
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get user's total spending
   */
  async getUserSpending(userId: number): Promise<{
    totalSpent: number;
    featureBreakdown: Record<PremiumFeatureType, { count: number; spent: number }>;
    activeFeatures: number;
    lastPurchase?: PremiumFeature;
  }> {
    const userFeatures = await this.getUserFeatures(userId);

    const totalSpent = userFeatures.reduce(
      (sum, feature) => sum + feature.starsPaid * (1 + feature.autoRenewedCount),
      0
    );

    const featureBreakdown = Object.values(PremiumFeatureType).reduce(
      (acc, type) => {
        const typeFeatures = userFeatures.filter(f => f.featureType === type);
        acc[type] = {
          count: typeFeatures.length,
          spent: typeFeatures.reduce((sum, f) => sum + f.starsPaid * (1 + f.autoRenewedCount), 0),
        };
        return acc;
      },
      {} as Record<PremiumFeatureType, { count: number; spent: number }>
    );

    const activeFeatures = userFeatures.filter(f => isFeatureActive(f)).length;
    const lastPurchase = userFeatures.length > 0 ? userFeatures[0] : undefined;

    return {
      totalSpent,
      featureBreakdown,
      activeFeatures,
      lastPurchase,
    };
  }

  /**
   * Get comprehensive premium statistics
   */
  async getStats(): Promise<PremiumStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(premiumFeatures);

    const now = new Date().toISOString();
    const [activeResult] = await this.db
      .select({ count: count() })
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.isActive, true),
          gte(premiumFeatures.expiresAt, now),
          isNull(premiumFeatures.cancelledAt)
        )
      );

    // Total revenue
    const [revenueResult] = await this.db
      .select({
        total: sql<number>`SUM(${premiumFeatures.starsPaid} * (1 + ${premiumFeatures.autoRenewedCount}))`,
      })
      .from(premiumFeatures);

    // Revenue by type
    const revenueByTypeResults = await this.db
      .select({
        featureType: premiumFeatures.featureType,
        revenue: sql<number>`SUM(${premiumFeatures.starsPaid} * (1 + ${premiumFeatures.autoRenewedCount}))`,
      })
      .from(premiumFeatures)
      .groupBy(premiumFeatures.featureType);

    const revenueByType = Object.values(PremiumFeatureType).reduce(
      (acc, type) => {
        acc[type] = revenueByTypeResults.find(r => r.featureType === type)?.revenue || 0;
        return acc;
      },
      {} as Record<PremiumFeatureType, number>
    );

    // Features by type
    const featuresByTypeResults = await this.db
      .select({
        featureType: premiumFeatures.featureType,
        count: count(),
      })
      .from(premiumFeatures)
      .groupBy(premiumFeatures.featureType);

    const featuresByType = Object.values(PremiumFeatureType).reduce(
      (acc, type) => {
        acc[type] = featuresByTypeResults.find(r => r.featureType === type)?.count || 0;
        return acc;
      },
      {} as Record<PremiumFeatureType, number>
    );

    // Top spenders
    const topSpenders = await this.db
      .select({
        userId: premiumFeatures.userId,
        totalSpent: sql<number>`SUM(${premiumFeatures.starsPaid} * (1 + ${premiumFeatures.autoRenewedCount}))`,
      })
      .from(premiumFeatures)
      .groupBy(premiumFeatures.userId)
      .orderBy(
        desc(sql`SUM(${premiumFeatures.starsPaid} * (1 + ${premiumFeatures.autoRenewedCount}))`)
      )
      .limit(10);

    // Average revenue per user
    const [uniqueUsersResult] = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${premiumFeatures.userId})` })
      .from(premiumFeatures);

    const avgRevenuePerUser =
      uniqueUsersResult.count > 0 ? (revenueResult.total || 0) / uniqueUsersResult.count : 0;

    // Recent purchases
    const recentPurchases = await this.db
      .select()
      .from(premiumFeatures)
      .orderBy(desc(premiumFeatures.purchasedAt))
      .limit(10);

    // Auto-renewal success rate
    const [autoRenewalResult] = await this.db
      .select({
        totalRenewals: sql<number>`SUM(${premiumFeatures.autoRenewedCount})`,
        totalAutoFeatures: count(),
      })
      .from(premiumFeatures)
      .where(eq(premiumFeatures.featureType, PremiumFeatureType.AUTO_BUMP));

    const autoRenewalSuccessRate =
      autoRenewalResult.totalAutoFeatures > 0
        ? (autoRenewalResult.totalRenewals / autoRenewalResult.totalAutoFeatures) * 100
        : 0;

    return {
      totalFeatures: totalResult.count,
      activeFeatures: activeResult.count,
      totalRevenue: revenueResult.total || 0,
      revenueByType,
      featuresByType,
      avgRevenuePerUser: Math.round(avgRevenuePerUser * 100) / 100,
      topSpenders: topSpenders.map(s => ({
        userId: s.userId,
        totalSpent: s.totalSpent,
      })),
      recentPurchases,
      autoRenewalSuccessRate: Math.round(autoRenewalSuccessRate * 100) / 100,
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    activeFeatures: number;
    totalRevenue: number;
    expiringCount: number;
    featuresByType: Record<PremiumFeatureType, number>;
  }> {
    const now = new Date().toISOString();

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.isActive, true),
          gte(premiumFeatures.expiresAt, now),
          isNull(premiumFeatures.cancelledAt)
        )
      );

    const [revenueResult] = await this.db
      .select({
        total: sql<number>`SUM(${premiumFeatures.starsPaid} * (1 + ${premiumFeatures.autoRenewedCount}))`,
      })
      .from(premiumFeatures);

    // Expiring in 24 hours
    const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [expiringResult] = await this.db
      .select({ count: count() })
      .from(premiumFeatures)
      .where(
        and(
          eq(premiumFeatures.isActive, true),
          lte(premiumFeatures.expiresAt, in24Hours),
          gte(premiumFeatures.expiresAt, now),
          isNull(premiumFeatures.cancelledAt)
        )
      );

    // Features by type
    const featuresByTypeResults = await this.db
      .select({
        featureType: premiumFeatures.featureType,
        count: count(),
      })
      .from(premiumFeatures)
      .groupBy(premiumFeatures.featureType);

    const featuresByType = Object.values(PremiumFeatureType).reduce(
      (acc, type) => {
        acc[type] = featuresByTypeResults.find(r => r.featureType === type)?.count || 0;
        return acc;
      },
      {} as Record<PremiumFeatureType, number>
    );

    return {
      activeFeatures: activeResult.count,
      totalRevenue: revenueResult.total || 0,
      expiringCount: expiringResult.count,
      featuresByType,
    };
  }

  /**
   * Check if feature exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(premiumFeatures)
      .where(eq(premiumFeatures.id, id));

    return result.count > 0;
  }

  /**
   * Delete premium feature (admin only)
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(premiumFeatures).where(eq(premiumFeatures.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Helper methods
   */
  isActive(feature: PremiumFeature): boolean {
    return isFeatureActive(feature);
  }

  canPurchase(
    userId: number,
    featureType: PremiumFeatureType,
    listingId: string | null,
    existingFeatures: PremiumFeature[]
  ) {
    return canUserPurchaseFeature(userId, featureType, listingId, existingFeatures);
  }

  getPrice(featureType: PremiumFeatureType): number {
    return getFeaturePrice(featureType);
  }

  getDisplayName(featureType: PremiumFeatureType): string {
    return getFeatureDisplayName(featureType);
  }

  getDescription(featureType: PremiumFeatureType): string {
    return getFeatureDescription(featureType);
  }

  enrichFeature(feature: PremiumFeature): PremiumFeatureWithDetails {
    return enrichPremiumFeature(feature);
  }

  getConstraints() {
    return PREMIUM_FEATURE_CONSTRAINTS;
  }
}

// Export types and functions for use in other modules
export {
  PremiumFeature,
  NewPremiumFeature,
  CreatePremiumFeature,
  UpdatePremiumFeature,
  PremiumFeatureWithDetails,
  PremiumFeatureType,
  calculateFeatureExpiration,
  getFeaturePrice,
  isFeatureActive,
  canUserPurchaseFeature,
  getFeatureDisplayName,
  getFeatureDescription,
  enrichPremiumFeature,
  PREMIUM_FEATURE_CONSTRAINTS,
};
export type {
  PremiumFeatureWithStats,
  FeatureSearchFilters,
  FeatureListResponse,
  PurchaseFeatureData,
  PremiumStats,
  RenewalResult,
};
