import { CategoryModel } from '../db/models/category';
import { ListingModel } from '../db/models/listing';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  CreateCategory,
  UpdateCategory,
  CategoryWithStats,
  CategoryTree,
} from '../db/models/category';

/**
 * CategoryService - T053
 *
 * Provides business logic for category management with 2-level hierarchy.
 * Handles category CRUD, hierarchy queries, validation, and statistics with caching.
 */

export interface CategoryWithListingStats extends CategoryWithStats {
  recentListings: any[];
  topListings: any[];
  averagePrice: number;
  priceRange: { min: number; max: number };
  popularityScore: number;
  trendDirection: 'up' | 'down' | 'stable';
}

export interface CategoryHierarchy {
  parents: CategoryWithListingStats[];
  children: Record<number, CategoryWithListingStats[]>;
  leafCategories: CategoryWithListingStats[];
  totalCategories: number;
  maxDepth: number;
}

export interface CategorySearchOptions {
  includeInactive?: boolean;
  includeStats?: boolean;
  parentId?: number;
  level?: 0 | 1;
  hasListings?: boolean;
  search?: string;
  sortBy?: 'name' | 'listings' | 'recent' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

export interface CategoryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class CategoryService {
  private categoryModel: CategoryModel;
  private listingModel: ListingModel;

  constructor(db: DrizzleD1Database) {
    this.categoryModel = new CategoryModel(db);
    this.listingModel = new ListingModel(db);
  }

  /**
   * Get complete category hierarchy with statistics
   */
  async getHierarchy(includeStats = true): Promise<CategoryHierarchy> {
    const allCategories = await this.categoryModel.getAll(true);
    const hierarchicalCategories = await this.categoryModel.getHierarchyWithStats();

    // Enhance with listing statistics if requested
    let enhancedCategories: CategoryWithListingStats[] = [];
    if (includeStats) {
      enhancedCategories = await Promise.all(
        allCategories.map(async category => {
          const stats = await this.getCategoryListingStats(category.id);
          return {
            ...category,
            listingCount: stats.totalListings,
            activeListingCount: stats.activeListings,
            recentListingCount: stats.recentListings,
            ...stats,
          };
        })
      );
    } else {
      enhancedCategories = allCategories.map(cat => ({
        ...cat,
        level: cat.parentId === null ? 0 : 1,
        fullPath: cat.parentId === null ? cat.name : `Parent > ${cat.name}`,
        children: [],
        recentListings: [],
        topListings: [],
        averagePrice: 0,
        priceRange: { min: 0, max: 0 },
        popularityScore: 0,
        trendDirection: 'stable' as const,
      }));
    }

    // Build hierarchy structure
    const parents = enhancedCategories.filter(cat => cat.level === 0);
    const children: Record<number, CategoryWithListingStats[]> = {};

    parents.forEach(parent => {
      children[parent.id] = enhancedCategories.filter(cat => cat.parentId === parent.id);
    });

    const leafCategories = enhancedCategories.filter(cat =>
      cat.level === 0 ? children[cat.id]?.length === 0 : true
    );

    return {
      parents,
      children,
      leafCategories,
      totalCategories: enhancedCategories.length,
      maxDepth: 2, // Fixed 2-level hierarchy
    };
  }

  /**
   * Create new category with validation
   */
  async createCategory(categoryData: CreateCategory): Promise<{
    success: boolean;
    category?: any;
    error?: string;
    validation?: CategoryValidationResult;
  }> {
    try {
      // Validate category data
      const validation = await this.validateCategory(categoryData);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          validation,
        };
      }

      const category = await this.categoryModel.create(categoryData);

      return {
        success: true,
        category,
        validation,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Category creation failed',
      };
    }
  }

  /**
   * Update category with validation
   */
  async updateCategory(
    id: number,
    updateData: UpdateCategory
  ): Promise<{
    success: boolean;
    category?: any;
    error?: string;
    validation?: CategoryValidationResult;
  }> {
    try {
      // Get existing category for validation
      const existingCategory = await this.categoryModel.findById(id);
      if (!existingCategory) {
        return {
          success: false,
          error: 'Category not found',
        };
      }

      // Validate updates
      const testCategory = { ...existingCategory, ...updateData };
      const validation = await this.validateCategory(testCategory);

      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          validation,
        };
      }

      const category = await this.categoryModel.update(id, updateData);

      return {
        success: true,
        category,
        validation,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Category update failed',
      };
    }
  }

  /**
   * Get category with comprehensive statistics
   */
  async getCategoryWithStats(id: number): Promise<CategoryWithListingStats | null> {
    const category = await this.categoryModel.findById(id);
    if (!category) return null;

    const stats = await this.getCategoryListingStats(id);

    return {
      ...category,
      level: category.parentId === null ? 0 : 1,
      fullPath: await this.getCategoryPath(id),
      children: category.parentId === null ? await this.categoryModel.getChildCategories(id) : [],
      listingCount: stats.totalListings,
      activeListingCount: stats.activeListings,
      recentListingCount: stats.recentListings,
      ...stats,
    };
  }

  /**
   * Search categories with advanced options
   */
  async searchCategories(
    query: string,
    options: CategorySearchOptions = {}
  ): Promise<{
    categories: CategoryWithListingStats[];
    totalCount: number;
    suggestions: string[];
  }> {
    const searchFilters = {
      search: query,
      active: !options.includeInactive,
      hasListings: options.hasListings,
      parentId: options.parentId,
      level: options.level,
    };

    const result = await this.categoryModel.search(searchFilters);

    // Enhance with stats if requested
    let enhancedCategories: CategoryWithListingStats[] = [];
    if (options.includeStats) {
      enhancedCategories = await Promise.all(
        result.categories.map(async category => {
          const stats = await this.getCategoryListingStats(category.id);
          return {
            ...category,
            ...stats,
          };
        })
      );
    } else {
      enhancedCategories = result.categories.map(cat => ({
        ...cat,
        recentListings: [],
        topListings: [],
        averagePrice: 0,
        priceRange: { min: 0, max: 0 },
        popularityScore: 0,
        trendDirection: 'stable' as const,
      }));
    }

    // Sort results
    if (options.sortBy) {
      enhancedCategories = this.sortCategories(
        enhancedCategories,
        options.sortBy,
        options.sortOrder
      );
    }

    // Generate search suggestions
    const suggestions = await this.generateSearchSuggestions(query);

    return {
      categories: enhancedCategories,
      totalCount: result.totalCount,
      suggestions,
    };
  }

  /**
   * Get category statistics for listings
   */
  private async getCategoryListingStats(categoryId: number): Promise<{
    totalListings: number;
    activeListings: number;
    recentListings: any[];
    topListings: any[];
    averagePrice: number;
    priceRange: { min: number; max: number };
    popularityScore: number;
    trendDirection: 'up' | 'down' | 'stable';
  }> {
    // Get all listings for this category
    const listings = await this.listingModel.search({ categoryId });
    const activeListings = listings.listings.filter(l => l.status === 'active');

    // Get recent listings (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentListingsResult = await this.listingModel.search({
      categoryId,
      createdAfter: weekAgo,
    });

    // Calculate price statistics
    const prices = activeListings.map(l => l.priceUsd).filter(p => p > 0);
    const averagePrice =
      prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };

    // Calculate popularity score (views + recent activity)
    const totalViews = activeListings.reduce((sum, l) => sum + l.viewCount, 0);
    const popularityScore = Math.min(
      100,
      totalViews / Math.max(1, activeListings.length) + recentListingsResult.listings.length * 10
    );

    // Determine trend (simplified)
    const trendDirection: 'up' | 'down' | 'stable' =
      recentListingsResult.listings.length > activeListings.length * 0.1
        ? 'up'
        : recentListingsResult.listings.length === 0 && activeListings.length > 5
          ? 'down'
          : 'stable';

    // Get top listings by views
    const topListings = activeListings.sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);

    return {
      totalListings: listings.listings.length,
      activeListings: activeListings.length,
      recentListings: recentListingsResult.listings.length,
      recentListings: recentListingsResult.listings.slice(0, 5),
      topListings,
      averagePrice: Math.round(averagePrice * 100) / 100,
      priceRange,
      popularityScore: Math.round(popularityScore),
      trendDirection,
    };
  }

  /**
   * Get available categories for creating listings (leaf categories only)
   */
  async getAvailableCategories(): Promise<CategoryWithStats[]> {
    return await this.categoryModel.getLeafCategories(true);
  }

  /**
   * Get category breadcrumb path
   */
  async getCategoryPath(categoryId: number): Promise<string> {
    const path = await this.categoryModel.getCategoryPath(categoryId);
    return path.map(cat => cat.name).join(' > ');
  }

  /**
   * Get popular categories
   */
  async getPopularCategories(limit = 10): Promise<CategoryWithListingStats[]> {
    const categories = await this.categoryModel.getAll(true);

    // Enhance with stats and sort by popularity
    const categoriesWithStats = await Promise.all(
      categories.map(async category => {
        const stats = await this.getCategoryListingStats(category.id);
        return {
          ...category,
          level: category.parentId === null ? 0 : 1,
          fullPath: category.parentId === null ? category.name : `Parent > ${category.name}`,
          children: [],
          listingCount: stats.totalListings,
          activeListingCount: stats.activeListings,
          recentListingCount: stats.recentListings,
          ...stats,
        };
      })
    );

    return categoriesWithStats
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, limit);
  }

  /**
   * Get trending categories
   */
  async getTrendingCategories(limit = 5): Promise<CategoryWithListingStats[]> {
    const popular = await this.getPopularCategories(50);

    return popular.filter(cat => cat.trendDirection === 'up').slice(0, limit);
  }

  /**
   * Move category to different parent
   */
  async moveCategory(
    categoryId: number,
    newParentId: number | null
  ): Promise<{ success: boolean; category?: any; error?: string }> {
    try {
      const category = await this.categoryModel.moveCategory(categoryId, newParentId);
      return {
        success: true,
        category,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Category move failed',
      };
    }
  }

  /**
   * Soft delete category
   */
  async deleteCategory(id: number, force = false): Promise<{ success: boolean; error?: string }> {
    try {
      if (force) {
        await this.categoryModel.hardDelete(id);
      } else {
        await this.categoryModel.softDelete(id);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Category deletion failed',
      };
    }
  }

  /**
   * Reactivate category
   */
  async reactivateCategory(
    id: number
  ): Promise<{ success: boolean; category?: any; error?: string }> {
    try {
      const category = await this.categoryModel.reactivate(id);
      return {
        success: true,
        category,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Category reactivation failed',
      };
    }
  }

  /**
   * Validate category data
   */
  private async validateCategory(categoryData: any): Promise<CategoryValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if parent exists (if parentId is provided)
    if (categoryData.parentId) {
      const parent = await this.categoryModel.findById(categoryData.parentId);
      if (!parent) {
        errors.push('Parent category does not exist');
      } else if (parent.parentId !== null) {
        errors.push('Cannot create category under a child category (max 2 levels)');
      }
    }

    // Check for duplicate names in same level
    const existingCategory = await this.categoryModel.findByName(
      categoryData.name,
      categoryData.parentId || null
    );

    if (existingCategory && existingCategory.id !== categoryData.id) {
      errors.push('Category name already exists at this level');
    }

    // Business rules validation
    const businessRuleErrors = this.categoryModel.validateHierarchy(
      categoryData,
      await this.categoryModel.getAll()
    );
    errors.push(...businessRuleErrors);

    // Warnings for potential issues
    if (categoryData.name && categoryData.name.length < 3) {
      warnings.push('Category name is very short');
    }

    if (categoryData.description && categoryData.description.length > 200) {
      warnings.push('Category description is quite long');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Sort categories by different criteria
   */
  private sortCategories(
    categories: CategoryWithListingStats[],
    sortBy: string,
    sortOrder: 'asc' | 'desc' = 'asc'
  ): CategoryWithListingStats[] {
    const sorted = [...categories].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'listings':
          comparison = a.activeListingCount - b.activeListingCount;
          break;
        case 'recent':
          comparison = a.recentListingCount - b.recentListingCount;
          break;
        case 'popularity':
          comparison = a.popularityScore - b.popularityScore;
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }

  /**
   * Generate search suggestions
   */
  private async generateSearchSuggestions(query: string): Promise<string[]> {
    const allCategories = await this.categoryModel.getAll(true);
    const suggestions = allCategories
      .filter(cat => cat.name.toLowerCase().includes(query.toLowerCase()))
      .map(cat => cat.name)
      .slice(0, 5);

    return suggestions;
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(): Promise<any> {
    return await this.categoryModel.getStats();
  }

  /**
   * Check if category exists
   */
  async exists(id: number): Promise<boolean> {
    return await this.categoryModel.exists(id);
  }

  /**
   * Get category by ID
   */
  async findById(id: number): Promise<any> {
    return await this.categoryModel.findById(id);
  }

  /**
   * Get all categories
   */
  async getAll(activeOnly = true): Promise<any[]> {
    return await this.categoryModel.getAll(activeOnly);
  }

  /**
   * Get parent categories
   */
  async getParentCategories(activeOnly = true): Promise<any[]> {
    return await this.categoryModel.getParentCategories(activeOnly);
  }

  /**
   * Get child categories
   */
  async getChildCategories(parentId: number, activeOnly = true): Promise<any[]> {
    return await this.categoryModel.getChildCategories(parentId, activeOnly);
  }
}
