import { PremiumFeatureModel } from '../db/models/premium-feature';
import { UserModel } from '../db/models/user';
import { ListingModel } from '../db/models/listing';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  PremiumFeature,
  PremiumFeatureType,
  PremiumFeatureWithStats,
  PurchaseFeatureData,
  FeatureSearchFilters,
  PremiumStats,
  RenewalResult
} from '../db/models/premium-feature';

/**
 * PremiumService - T057
 *
 * Provides comprehensive business logic for premium features and Telegram Stars payments.
 * Handles feature purchases, renewals, billing, subscription management, and analytics.
 */

export interface PurchaseResult {
  success: boolean;
  feature?: PremiumFeature;
  paymentRequired?: boolean;
  paymentUrl?: string;
  error?: string;
  warnings?: string[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  features: PremiumFeatureType[];
  priceStars: number;
  duration: number; // days
  popular?: boolean;
  savings?: number; // percentage compared to individual purchases
}

export interface BillingHistory {
  transactions: Array<{
    id: string;
    date: string;
    type: 'purchase' | 'renewal' | 'refund';
    featureType: PremiumFeatureType;
    amount: number;
    status: 'completed' | 'pending' | 'failed' | 'refunded';
    telegramPaymentId?: string;
    refundReason?: string;
  }>;
  totalSpent: number;
  activeSubscriptions: number;
  nextRenewal?: string;
  savingsThisMonth: number;
}

export interface FeatureUsageAnalytics {
  featureType: PremiumFeatureType;
  purchaseCount: number;
  activeCount: number;
  averageDuration: number;
  renewalRate: number;
  roi: number; // Return on investment
  userSatisfaction: number;
  popularityTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface UserPremiumProfile {
  tier: 'free' | 'basic' | 'premium' | 'vip';
  totalSpent: number;
  activeFeatures: PremiumFeatureWithStats[];
  expiredFeatures: PremiumFeature[];
  availableCredits: number;
  loyaltyPoints: number;
  nextBilling?: string;
  recommendedFeatures: Array<{
    featureType: PremiumFeatureType;
    reason: string;
    potentialBenefit: string;
    discountAvailable?: number;
  }>;
  spendingHistory: {
    thisMonth: number;
    lastMonth: number;
    thisYear: number;
    allTime: number;
  };
}

export interface PaymentValidation {
  isValid: boolean;
  expectedAmount: number;
  actualAmount: number;
  currency: string;
  errors: string[];
  telegramPaymentId?: string;
}

export interface FeatureActivationResult {
  success: boolean;
  feature?: PremiumFeature;
  error?: string;
  activatedAt?: string;
  expiresAt?: string;
  autoRenewal?: boolean;
}

export interface RefundRequest {
  featureId: number;
  reason: string;
  requestedBy: number;
  refundAmount: number;
  approved?: boolean;
  processedAt?: string;
}

export interface PremiumAnalytics {
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number; // percentage
    byFeature: Record<PremiumFeatureType, number>;
    byUserTier: Record<string, number>;
  };
  users: {
    total: number;
    premium: number;
    conversionRate: number;
    churnRate: number;
    averageLifetimeValue: number;
    tierDistribution: Record<string, number>;
  };
  features: {
    mostPopular: PremiumFeatureType;
    highestRevenue: PremiumFeatureType;
    bestRetention: PremiumFeatureType;
    usage: FeatureUsageAnalytics[];
  };
  trends: {
    monthlyGrowth: number;
    seasonality: Record<string, number>;
    forecast: Array<{ month: string; projected: number }>;
  };
}

export class PremiumService {
  private premiumFeatureModel: PremiumFeatureModel;
  private userModel: UserModel;
  private listingModel: ListingModel;

  constructor(db: DrizzleD1Database) {
    this.premiumFeatureModel = new PremiumFeatureModel(db);
    this.userModel = new UserModel(db);
    this.listingModel = new ListingModel(db);
  }

  /**
   * Purchase a premium feature with comprehensive validation
   */
  async purchaseFeature(
    userId: number,
    featureType: PremiumFeatureType,
    listingId?: string,
    paymentData?: {
      telegramPaymentId: string;
      starsPaid: number;
      currency: string;
    }
  ): Promise<PurchaseResult> {
    try {
      // Validate user exists and is not banned
      const user = await this.userModel.findByTelegramId(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.isBanned) {
        return { success: false, error: 'Banned users cannot purchase premium features' };
      }

      // Validate listing if required
      if (listingId) {
        const listing = await this.listingModel.findById(listingId);
        if (!listing) {
          return { success: false, error: 'Listing not found' };
        }

        if (listing.userId !== userId) {
          return { success: false, error: 'Can only purchase features for your own listings' };
        }

        if (listing.status !== 'active') {
          return { success: false, error: 'Can only purchase features for active listings' };
        }
      }

      // Check if user can purchase this feature
      const existingFeatures = await this.premiumFeatureModel.getUserFeatures(userId);
      const canPurchase = this.premiumFeatureModel.canPurchase(userId, featureType, listingId || null, existingFeatures);

      if (!canPurchase.canPurchase) {
        return { success: false, error: canPurchase.reason };
      }

      // Get expected price
      const expectedPrice = this.premiumFeatureModel.getPrice(featureType);

      // If payment data provided, validate it
      if (paymentData) {
        const validation = this.validatePayment(paymentData, expectedPrice);
        if (!validation.isValid) {
          return {
            success: false,
            error: `Payment validation failed: ${validation.errors.join(', ')}`,
          };
        }

        // Process the purchase
        const purchaseData: PurchaseFeatureData = {
          userId,
          featureType,
          listingId,
          starsPaid: paymentData.starsPaid,
          telegramPaymentId: paymentData.telegramPaymentId,
        };

        const feature = await this.premiumFeatureModel.purchase(purchaseData);

        // Apply feature effects
        await this.applyFeatureEffects(feature);

        // Track analytics
        await this.trackPurchaseAnalytics(userId, featureType, paymentData.starsPaid);

        return {
          success: true,
          feature,
          warnings: await this.generatePurchaseWarnings(feature),
        };
      } else {
        // Return payment required with details
        return {
          success: false,
          paymentRequired: true,
          paymentUrl: await this.generatePaymentUrl(userId, featureType, listingId),
          error: `Payment required: ${expectedPrice} Telegram Stars`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Purchase failed',
      };
    }
  }

  /**
   * Get available subscription plans
   */
  getSubscriptionPlans(): SubscriptionPlan[] {
    return [
      {
        id: 'basic',
        name: 'Basic Seller',
        description: 'Essential tools for casual sellers',
        features: ['BOOST' as PremiumFeatureType],
        priceStars: 50,
        duration: 30,
        savings: 0,
      },
      {
        id: 'premium',
        name: 'Premium Seller',
        description: 'Advanced features for serious sellers',
        features: ['BOOST' as PremiumFeatureType, 'FEATURED' as PremiumFeatureType],
        priceStars: 120,
        duration: 30,
        popular: true,
        savings: 15,
      },
      {
        id: 'vip',
        name: 'VIP Seller',
        description: 'All features for professional sellers',
        features: [
          'BOOST' as PremiumFeatureType,
          'FEATURED' as PremiumFeatureType,
          'AUTO_BUMP' as PremiumFeatureType,
          'PRIORITY_SUPPORT' as PremiumFeatureType
        ],
        priceStars: 200,
        duration: 30,
        savings: 25,
      },
    ];
  }

  /**
   * Get user's premium profile with comprehensive information
   */
  async getUserPremiumProfile(userId: number): Promise<UserPremiumProfile> {
    const user = await this.userModel.findByTelegramId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's spending and features
    const spending = await this.premiumFeatureModel.getUserSpending(userId);
    const allFeatures = await this.premiumFeatureModel.getUserFeatures(userId);
    const activeFeatures = allFeatures.filter(f => this.premiumFeatureModel.isActive(f));

    // Determine user tier
    const tier = this.calculateUserTier(spending.totalSpent, activeFeatures.length);

    // Get enhanced feature details
    const enhancedActiveFeatures: PremiumFeatureWithStats[] = await Promise.all(
      activeFeatures.map(async feature => {
        const stats = await this.premiumFeatureModel.getWithStats(feature.id);
        return stats!;
      })
    );

    const expiredFeatures = allFeatures.filter(f => !this.premiumFeatureModel.isActive(f));

    // Calculate spending history
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const spendingHistory = {
      thisMonth: this.calculateSpendingForPeriod(allFeatures, thisYear, thisMonth),
      lastMonth: this.calculateSpendingForPeriod(allFeatures, lastMonthYear, lastMonth),
      thisYear: this.calculateSpendingForPeriod(allFeatures, thisYear),
      allTime: spending.totalSpent,
    };

    // Generate recommendations
    const recommendedFeatures = await this.generateFeatureRecommendations(userId, activeFeatures);

    // Calculate loyalty points and credits
    const loyaltyPoints = Math.floor(spending.totalSpent * 0.1); // 10% of spending as points
    const availableCredits = Math.floor(loyaltyPoints / 10); // 10 points = 1 credit

    // Find next billing date
    const nextBilling = enhancedActiveFeatures
      .filter(f => f.isExpiringSoon)
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0]?.expiresAt;

    return {
      tier,
      totalSpent: spending.totalSpent,
      activeFeatures: enhancedActiveFeatures,
      expiredFeatures,
      availableCredits,
      loyaltyPoints,
      nextBilling,
      recommendedFeatures,
      spendingHistory,
    };
  }

  /**
   * Get user's billing history
   */
  async getBillingHistory(userId: number): Promise<BillingHistory> {
    const userFeatures = await this.premiumFeatureModel.getUserFeatures(userId);

    const transactions = userFeatures.map(feature => ({
      id: `tx_${feature.id}`,
      date: feature.purchasedAt,
      type: 'purchase' as const,
      featureType: feature.featureType,
      amount: feature.starsPaid,
      status: 'completed' as const,
      telegramPaymentId: feature.telegramPaymentId,
    }));

    // Add renewal transactions
    userFeatures.forEach(feature => {
      for (let i = 0; i < feature.autoRenewedCount; i++) {
        transactions.push({
          id: `renewal_${feature.id}_${i + 1}`,
          date: new Date(new Date(feature.purchasedAt).getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'renewal' as const,
          featureType: feature.featureType,
          amount: feature.starsPaid,
          status: 'completed' as const,
        });
      }
    });

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const activeFeatures = userFeatures.filter(f => this.premiumFeatureModel.isActive(f));
    const activeSubscriptions = activeFeatures.length;

    // Find next renewal
    const nextRenewal = activeFeatures
      .map(f => f.expiresAt)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

    // Calculate savings (mock calculation)
    const savingsThisMonth = Math.floor(totalSpent * 0.05); // 5% savings

    return {
      transactions,
      totalSpent,
      activeSubscriptions,
      nextRenewal,
      savingsThisMonth,
    };
  }

  /**
   * Manage feature subscriptions (cancel, reactivate, upgrade)
   */
  async manageSubscription(
    userId: number,
    featureId: number,
    action: 'cancel' | 'reactivate' | 'upgrade',
    options: any = {}
  ): Promise<{ success: boolean; feature?: PremiumFeature; error?: string }> {
    try {
      const feature = await this.premiumFeatureModel.findById(featureId);
      if (!feature) {
        return { success: false, error: 'Feature not found' };
      }

      if (feature.userId !== userId) {
        return { success: false, error: 'Not authorized to manage this feature' };
      }

      switch (action) {
        case 'cancel':
          const cancelledFeature = await this.premiumFeatureModel.cancel(featureId, userId);
          return { success: true, feature: cancelledFeature || undefined };

        case 'reactivate':
          const reactivatedFeature = await this.premiumFeatureModel.reactivate(featureId, userId);
          return { success: true, feature: reactivatedFeature || undefined };

        case 'upgrade':
          return { success: false, error: 'Feature upgrades not yet implemented' };

        default:
          return { success: false, error: 'Invalid action' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Subscription management failed',
      };
    }
  }

  /**
   * Process feature renewals and expirations
   */
  async processRenewalsAndExpirations(): Promise<{
    renewalsProcessed: number;
    expirationsProcessed: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Process auto-renewals
    const renewalResults = await this.premiumFeatureModel.autoRenewFeatures();
    const renewalsProcessed = renewalResults.filter(r => r.success).length;

    renewalResults.filter(r => !r.success).forEach(result => {
      if (result.error) errors.push(`Renewal failed: ${result.error}`);
    });

    // Process expirations
    const expirationsProcessed = await this.premiumFeatureModel.deactivateExpired();

    return {
      renewalsProcessed,
      expirationsProcessed,
      errors,
    };
  }

  /**
   * Get comprehensive premium analytics
   */
  async getPremiumAnalytics(): Promise<PremiumAnalytics> {
    const stats = await this.premiumFeatureModel.getStats();

    // Calculate growth rate
    const thisMonth = new Date().getMonth();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const thisMonthRevenue = await this.getRevenueForMonth(thisMonth);
    const lastMonthRevenue = await this.getRevenueForMonth(lastMonth);
    const growth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

    // Calculate user metrics
    const totalUsers = (await this.userModel.getStats()).totalUsers;
    const premiumUsers = stats.topSpenders.length; // Approximate
    const conversionRate = totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0;

    // Mock additional metrics
    const churnRate = 5.2; // percentage
    const averageLifetimeValue = stats.totalRevenue / Math.max(1, premiumUsers);

    // Feature usage analytics
    const featureUsage: FeatureUsageAnalytics[] = Object.entries(stats.featuresByType).map(([type, count]) => ({
      featureType: type as PremiumFeatureType,
      purchaseCount: count,
      activeCount: Math.floor(count * 0.7), // 70% active rate
      averageDuration: 30, // days
      renewalRate: 65, // percentage
      roi: 300, // percentage
      userSatisfaction: 4.2, // out of 5
      popularityTrend: 'stable' as const,
    }));

    // Find most popular and highest revenue features
    const sortedByCount = featureUsage.sort((a, b) => b.purchaseCount - a.purchaseCount);
    const sortedByRevenue = Object.entries(stats.revenueByType).sort(([,a], [,b]) => b - a);

    return {
      revenue: {
        total: stats.totalRevenue,
        thisMonth: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        growth,
        byFeature: stats.revenueByType,
        byUserTier: {
          basic: stats.totalRevenue * 0.3,
          premium: stats.totalRevenue * 0.5,
          vip: stats.totalRevenue * 0.2,
        },
      },
      users: {
        total: totalUsers,
        premium: premiumUsers,
        conversionRate,
        churnRate,
        averageLifetimeValue,
        tierDistribution: {
          free: totalUsers - premiumUsers,
          basic: Math.floor(premiumUsers * 0.4),
          premium: Math.floor(premiumUsers * 0.4),
          vip: Math.floor(premiumUsers * 0.2),
        },
      },
      features: {
        mostPopular: sortedByCount[0]?.featureType || 'BOOST' as PremiumFeatureType,
        highestRevenue: sortedByRevenue[0]?.[0] as PremiumFeatureType || 'BOOST' as PremiumFeatureType,
        bestRetention: 'AUTO_BUMP' as PremiumFeatureType,
        usage: featureUsage,
      },
      trends: {
        monthlyGrowth: growth,
        seasonality: {
          'Q1': stats.totalRevenue * 0.2,
          'Q2': stats.totalRevenue * 0.25,
          'Q3': stats.totalRevenue * 0.3,
          'Q4': stats.totalRevenue * 0.25,
        },
        forecast: this.generateRevenueForecast(stats.totalRevenue, growth),
      },
    };
  }

  /**
   * Handle refund requests
   */
  async processRefundRequest(
    refundRequest: RefundRequest
  ): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
    try {
      const feature = await this.premiumFeatureModel.findById(refundRequest.featureId);
      if (!feature) {
        return { success: false, error: 'Feature not found' };
      }

      // Check refund eligibility
      const daysSincePurchase = Math.floor(
        (Date.now() - new Date(feature.purchasedAt).getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysSincePurchase > 7) {
        return { success: false, error: 'Refund period has expired (7 days)' };
      }

      // Calculate refund amount (pro-rated)
      const totalDuration = Math.floor(
        (new Date(feature.expiresAt).getTime() - new Date(feature.purchasedAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      const daysUsed = daysSincePurchase;
      const refundRatio = Math.max(0, (totalDuration - daysUsed) / totalDuration);
      const refundAmount = Math.floor(feature.starsPaid * refundRatio);

      // Process refund (in real implementation, this would integrate with payment provider)
      await this.premiumFeatureModel.update(refundRequest.featureId, {
        isActive: false,
        cancelledAt: new Date().toISOString(),
      });

      return {
        success: true,
        refundAmount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund processing failed',
      };
    }
  }

  /**
   * Get feature recommendation engine
   */
  async getFeatureRecommendations(
    userId: number,
    context?: {
      listingId?: string;
      category?: string;
      budget?: number;
    }
  ): Promise<Array<{
    featureType: PremiumFeatureType;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    expectedBenefit: string;
    price: number;
    estimatedROI: number;
  }>> {
    const user = await this.userModel.findByTelegramId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const userFeatures = await this.premiumFeatureModel.getUserFeatures(userId, true);
    const userListings = await this.listingModel.getUserListings(userId);

    const recommendations = [];

    // Recommend boost if user has listings but no boost
    if (userListings.length > 0 && !userFeatures.some(f => f.featureType === 'BOOST')) {
      recommendations.push({
        featureType: 'BOOST' as PremiumFeatureType,
        priority: 'high' as const,
        reason: 'You have active listings that could benefit from increased visibility',
        expectedBenefit: 'Up to 3x more views and faster sales',
        price: this.premiumFeatureModel.getPrice('BOOST' as PremiumFeatureType),
        estimatedROI: 250,
      });
    }

    // Recommend featured if user has popular listings
    const popularListings = userListings.filter(l => l.viewCount > 50);
    if (popularListings.length > 0 && !userFeatures.some(f => f.featureType === 'FEATURED')) {
      recommendations.push({
        featureType: 'FEATURED' as PremiumFeatureType,
        priority: 'medium' as const,
        reason: 'Your popular listings could reach even more buyers',
        expectedBenefit: 'Premium placement in search results',
        price: this.premiumFeatureModel.getPrice('FEATURED' as PremiumFeatureType),
        estimatedROI: 180,
      });
    }

    // Recommend auto-bump for active sellers
    if (userListings.length >= 5 && !userFeatures.some(f => f.featureType === 'AUTO_BUMP')) {
      recommendations.push({
        featureType: 'AUTO_BUMP' as PremiumFeatureType,
        priority: 'medium' as const,
        reason: 'As an active seller, automatic bumping saves time and ensures consistent visibility',
        expectedBenefit: 'Automated listing promotion every 24 hours',
        price: this.premiumFeatureModel.getPrice('AUTO_BUMP' as PremiumFeatureType),
        estimatedROI: 200,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Validate Telegram Stars payment
   */
  private validatePayment(
    paymentData: { telegramPaymentId: string; starsPaid: number; currency: string },
    expectedAmount: number
  ): PaymentValidation {
    const errors: string[] = [];

    if (paymentData.currency !== 'XTR') {
      errors.push('Invalid currency: expected Telegram Stars (XTR)');
    }

    if (paymentData.starsPaid !== expectedAmount) {
      errors.push(`Payment amount mismatch: expected ${expectedAmount}, received ${paymentData.starsPaid}`);
    }

    if (!paymentData.telegramPaymentId || paymentData.telegramPaymentId.length < 10) {
      errors.push('Invalid Telegram payment ID');
    }

    return {
      isValid: errors.length === 0,
      expectedAmount,
      actualAmount: paymentData.starsPaid,
      currency: paymentData.currency,
      errors,
      telegramPaymentId: paymentData.telegramPaymentId,
    };
  }

  /**
   * Apply feature effects to listings/user
   */
  private async applyFeatureEffects(feature: PremiumFeature): Promise<void> {
    switch (feature.featureType) {
      case 'BOOST':
        if (feature.listingId) {
          // Boost the listing (increase visibility)
          await this.listingModel.incrementViews(feature.listingId, 10);
        }
        break;

      case 'FEATURED':
        if (feature.listingId) {
          // Mark listing as featured
          // In real implementation, this would set a featured flag
        }
        break;

      case 'AUTO_BUMP':
        // Schedule automatic bumping
        // In real implementation, this would set up a scheduled job
        break;

      case 'PRIORITY_SUPPORT':
        // Grant priority support access
        // In real implementation, this would update user support tier
        break;
    }
  }

  /**
   * Generate payment URL for Telegram Stars
   */
  private async generatePaymentUrl(
    userId: number,
    featureType: PremiumFeatureType,
    listingId?: string
  ): Promise<string> {
    const price = this.premiumFeatureModel.getPrice(featureType);
    const featureName = this.premiumFeatureModel.getDisplayName(featureType);

    // In real implementation, this would integrate with Telegram's payment API
    return `https://t.me/invoice/${userId}_${featureType}_${Date.now()}?amount=${price}&currency=XTR&title=${encodeURIComponent(featureName)}`;
  }

  /**
   * Track purchase analytics
   */
  private async trackPurchaseAnalytics(
    userId: number,
    featureType: PremiumFeatureType,
    amount: number
  ): Promise<void> {
    // In real implementation, this would send analytics events
    console.log(`Analytics: User ${userId} purchased ${featureType} for ${amount} stars`);
  }

  /**
   * Generate purchase warnings
   */
  private async generatePurchaseWarnings(feature: PremiumFeature): Promise<string[]> {
    const warnings: string[] = [];

    // Check if user has similar active features
    const userFeatures = await this.premiumFeatureModel.getUserFeatures(feature.userId, true);
    const similarFeatures = userFeatures.filter(f => f.featureType === feature.featureType && f.id !== feature.id);

    if (similarFeatures.length > 0) {
      warnings.push('You already have an active feature of this type');
    }

    // Check feature expiration
    const daysUntilExpiry = Math.floor(
      (new Date(feature.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    if (daysUntilExpiry < 7) {
      warnings.push(`This feature expires in ${daysUntilExpiry} days`);
    }

    return warnings;
  }

  /**
   * Calculate user tier based on spending and activity
   */
  private calculateUserTier(
    totalSpent: number,
    activeFeatures: number
  ): 'free' | 'basic' | 'premium' | 'vip' {
    if (totalSpent >= 500 || activeFeatures >= 4) return 'vip';
    if (totalSpent >= 200 || activeFeatures >= 2) return 'premium';
    if (totalSpent >= 50 || activeFeatures >= 1) return 'basic';
    return 'free';
  }

  /**
   * Calculate spending for a specific period
   */
  private calculateSpendingForPeriod(
    features: PremiumFeature[],
    year: number,
    month?: number
  ): number {
    return features
      .filter(feature => {
        const purchaseDate = new Date(feature.purchasedAt);
        if (month !== undefined) {
          return purchaseDate.getFullYear() === year && purchaseDate.getMonth() === month;
        } else {
          return purchaseDate.getFullYear() === year;
        }
      })
      .reduce((sum, feature) => sum + feature.starsPaid * (1 + feature.autoRenewedCount), 0);
  }

  /**
   * Generate feature recommendations for user
   */
  private async generateFeatureRecommendations(
    userId: number,
    activeFeatures: PremiumFeature[]
  ): Promise<Array<{
    featureType: PremiumFeatureType;
    reason: string;
    potentialBenefit: string;
    discountAvailable?: number;
  }>> {
    const recommendations = [];

    // Get user's listings to inform recommendations
    const userListings = await this.listingModel.getUserListings(userId);

    if (userListings.length > 0 && !activeFeatures.some(f => f.featureType === 'BOOST')) {
      recommendations.push({
        featureType: 'BOOST' as PremiumFeatureType,
        reason: 'Increase visibility for your listings',
        potentialBenefit: 'Get 3x more views and sell faster',
        discountAvailable: 10,
      });
    }

    if (userListings.length >= 3 && !activeFeatures.some(f => f.featureType === 'AUTO_BUMP')) {
      recommendations.push({
        featureType: 'AUTO_BUMP' as PremiumFeatureType,
        reason: 'Automate your listing promotion',
        potentialBenefit: 'Save time with automatic daily bumps',
      });
    }

    return recommendations;
  }

  /**
   * Get revenue for a specific month
   */
  private async getRevenueForMonth(month: number): Promise<number> {
    // In real implementation, this would query actual revenue data
    // For now, return mock data
    return Math.floor(Math.random() * 5000) + 2000;
  }

  /**
   * Generate revenue forecast
   */
  private generateRevenueForecast(
    currentRevenue: number,
    growthRate: number
  ): Array<{ month: string; projected: number }> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const forecast = [];

    for (let i = 0; i < 6; i++) {
      const projectedRevenue = Math.floor(currentRevenue * Math.pow(1 + growthRate / 100, i + 1));
      forecast.push({
        month: months[i],
        projected: projectedRevenue,
      });
    }

    return forecast;
  }
}