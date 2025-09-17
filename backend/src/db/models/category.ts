import { eq, and, desc, asc, count, sql, isNull, isNotNull } from 'drizzle-orm';
import {
  categories,
  type Category,
  type NewCategory,
  type CreateCategory,
  type UpdateCategory,
  type CategoryWithHierarchy,
  buildCategoryHierarchy,
  validateCategoryHierarchy,
  getLeafCategories,
  isParentCategory,
  isChildCategory,
  CATEGORY_CONSTRAINTS,
} from '../../src/db/schema/categories';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Category Model - T041
 *
 * Provides business logic layer for 2-level category hierarchy management.
 * Handles category CRUD operations, hierarchy validation, and listing organization.
 */

export interface CategoryWithStats extends CategoryWithHierarchy {
  listingCount: number;
  activeListingCount: number;
  recentListingCount: number; // Last 7 days
}

export interface CategoryTree {
  parent: CategoryWithStats;
  children: CategoryWithStats[];
}

export interface CategorySearchFilters {
  active?: boolean;
  hasListings?: boolean;
  parentId?: number | null;
  search?: string;
  level?: 0 | 1; // 0 = parent, 1 = child
}

export interface CategoryListResponse {
  categories: CategoryWithStats[];
  totalCount: number;
  hasMore: boolean;
}

export class CategoryModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new category
   */
  async create(categoryData: CreateCategory): Promise<Category> {
    // Validate hierarchy before creation
    const existingCategories = await this.getAll();
    const validationErrors = validateCategoryHierarchy(categoryData, existingCategories);

    if (validationErrors.length > 0) {
      throw new Error(`Category validation failed: ${validationErrors.join(', ')}`);
    }

    const [category] = await this.db
      .insert(categories)
      .values({
        name: categoryData.name,
        parentId: categoryData.parentId || null,
        description: categoryData.description || null,
        isActive: categoryData.isActive ?? true,
      })
      .returning();

    return category;
  }

  /**
   * Find category by ID
   */
  async findById(id: number): Promise<Category | null> {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return category || null;
  }

  /**
   * Find category by name (within same parent level)
   */
  async findByName(name: string, parentId?: number | null): Promise<Category | null> {
    let query = this.db.select().from(categories).where(eq(categories.name, name));

    if (parentId !== undefined) {
      if (parentId === null) {
        query = query.where(and(eq(categories.name, name), isNull(categories.parentId)));
      } else {
        query = query.where(and(eq(categories.name, name), eq(categories.parentId, parentId)));
      }
    }

    const [category] = await query.limit(1);
    return category || null;
  }

  /**
   * Get all categories
   */
  async getAll(activeOnly = false): Promise<Category[]> {
    let query = this.db.select().from(categories);

    if (activeOnly) {
      query = query.where(eq(categories.isActive, true));
    }

    return await query.orderBy(
      sql`CASE WHEN ${categories.parentId} IS NULL THEN 0 ELSE 1 END`,
      asc(categories.name)
    );
  }

  /**
   * Get category hierarchy with statistics
   */
  async getHierarchyWithStats(): Promise<CategoryTree[]> {
    const allCategories = await this.getAll(true);
    const hierarchicalCategories = buildCategoryHierarchy(allCategories);

    // Add stats to each category (would join with listings in real implementation)
    const categoriesWithStats: CategoryWithStats[] = hierarchicalCategories.map(cat => ({
      ...cat,
      listingCount: 0, // Would be calculated from joins
      activeListingCount: 0,
      recentListingCount: 0,
    }));

    // Build tree structure
    const parentCategories = categoriesWithStats.filter(cat => cat.level === 0);

    return parentCategories.map(parent => ({
      parent,
      children: categoriesWithStats.filter(cat => cat.parentId === parent.id),
    }));
  }

  /**
   * Get parent categories only
   */
  async getParentCategories(activeOnly = true): Promise<Category[]> {
    let query = this.db.select().from(categories).where(isNull(categories.parentId));

    if (activeOnly) {
      query = query.where(and(isNull(categories.parentId), eq(categories.isActive, true)));
    }

    return await query.orderBy(asc(categories.name));
  }

  /**
   * Get child categories for a parent
   */
  async getChildCategories(parentId: number, activeOnly = true): Promise<Category[]> {
    let query = this.db.select().from(categories).where(eq(categories.parentId, parentId));

    if (activeOnly) {
      query = query.where(and(eq(categories.parentId, parentId), eq(categories.isActive, true)));
    }

    return await query.orderBy(asc(categories.name));
  }

  /**
   * Get leaf categories (categories that can have listings)
   */
  async getLeafCategories(activeOnly = true): Promise<Category[]> {
    const allCategories = await this.getAll(activeOnly);
    return getLeafCategories(allCategories);
  }

  /**
   * Update category
   */
  async update(id: number, updateData: UpdateCategory): Promise<Category | null> {
    // If changing parentId, validate hierarchy
    if ('parentId' in updateData) {
      const existingCategories = await this.getAll();
      const currentCategory = existingCategories.find(cat => cat.id === id);

      if (currentCategory) {
        const testCategory = { ...currentCategory, ...updateData };
        const validationErrors = validateCategoryHierarchy(testCategory, existingCategories);

        if (validationErrors.length > 0) {
          throw new Error(`Category validation failed: ${validationErrors.join(', ')}`);
        }
      }
    }

    const [category] = await this.db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();

    return category || null;
  }

  /**
   * Soft delete category (mark as inactive)
   */
  async softDelete(id: number): Promise<Category | null> {
    // Check if category has active children
    const children = await this.getChildCategories(id, true);
    if (children.length > 0) {
      throw new Error('Cannot deactivate category with active child categories');
    }

    // Check if category has active listings (would be implemented with joins)
    // For now, just deactivate
    const [category] = await this.db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, id))
      .returning();

    return category || null;
  }

  /**
   * Permanently delete category
   */
  async hardDelete(id: number): Promise<boolean> {
    // Check if category has children
    const children = await this.getChildCategories(id, false);
    if (children.length > 0) {
      throw new Error('Cannot delete category with child categories');
    }

    // Check if category has listings (would be implemented with joins)
    // For now, just delete
    const result = await this.db.delete(categories).where(eq(categories.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Reactivate category
   */
  async reactivate(id: number): Promise<Category | null> {
    const [category] = await this.db
      .update(categories)
      .set({ isActive: true })
      .where(eq(categories.id, id))
      .returning();

    return category || null;
  }

  /**
   * Search categories with filters
   */
  async search(
    filters: CategorySearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<CategoryListResponse> {
    let query = this.db.select().from(categories);
    let countQuery = this.db.select({ count: count() }).from(categories);

    const conditions = [];

    if (filters.active !== undefined) {
      conditions.push(eq(categories.isActive, filters.active));
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(categories.parentId));
      } else {
        conditions.push(eq(categories.parentId, filters.parentId));
      }
    }

    if (filters.level !== undefined) {
      if (filters.level === 0) {
        conditions.push(isNull(categories.parentId));
      } else {
        conditions.push(isNotNull(categories.parentId));
      }
    }

    if (filters.search) {
      conditions.push(
        sql`(
          ${categories.name} LIKE ${`%${filters.search}%`} OR
          ${categories.description} LIKE ${`%${filters.search}%`}
        )`
      );
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(
        sql`CASE WHEN ${categories.parentId} IS NULL THEN 0 ELSE 1 END`,
        asc(categories.name)
      )
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const categoryList = hasMore ? results.slice(0, limit) : results;

    // Add hierarchy info and stats
    const categoriesWithStats: CategoryWithStats[] = categoryList.map(cat => ({
      ...cat,
      level: cat.parentId === null ? 0 : 1,
      fullPath: cat.parentId === null ? cat.name : `Parent > ${cat.name}`, // Would be resolved with joins
      children: [],
      listingCount: 0,
      activeListingCount: 0,
      recentListingCount: 0,
    }));

    return {
      categories: categoriesWithStats,
      totalCount,
      hasMore,
    };
  }

  /**
   * Get category path (for breadcrumbs)
   */
  async getCategoryPath(categoryId: number): Promise<Category[]> {
    const category = await this.findById(categoryId);
    if (!category) return [];

    const path: Category[] = [category];

    if (category.parentId) {
      const parent = await this.findById(category.parentId);
      if (parent) {
        path.unshift(parent);
      }
    }

    return path;
  }

  /**
   * Move category to different parent
   */
  async moveCategory(categoryId: number, newParentId: number | null): Promise<Category | null> {
    // Validate the move
    const category = await this.findById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    // Cannot move to itself or its children
    if (newParentId === categoryId) {
      throw new Error('Cannot move category to itself');
    }

    // If moving to a parent, ensure it's not a child category
    if (newParentId !== null) {
      const newParent = await this.findById(newParentId);
      if (!newParent) {
        throw new Error('New parent category not found');
      }

      if (newParent.parentId !== null) {
        throw new Error('Cannot move category under a child category (max 2 levels)');
      }
    }

    // Validate hierarchy constraints
    const allCategories = await this.getAll();
    const testCategory = { ...category, parentId: newParentId };
    const validationErrors = validateCategoryHierarchy(testCategory, allCategories);

    if (validationErrors.length > 0) {
      throw new Error(`Move validation failed: ${validationErrors.join(', ')}`);
    }

    return await this.update(categoryId, { parentId: newParentId });
  }

  /**
   * Get category statistics
   */
  async getStats(): Promise<{
    totalCategories: number;
    activeCategories: number;
    parentCategories: number;
    childCategories: number;
    categoriesWithListings: number;
  }> {
    const [totalResult] = await this.db.select({ count: count() }).from(categories);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(categories)
      .where(eq(categories.isActive, true));

    const [parentResult] = await this.db
      .select({ count: count() })
      .from(categories)
      .where(isNull(categories.parentId));

    const [childResult] = await this.db
      .select({ count: count() })
      .from(categories)
      .where(isNotNull(categories.parentId));

    return {
      totalCategories: totalResult.count,
      activeCategories: activeResult.count,
      parentCategories: parentResult.count,
      childCategories: childResult.count,
      categoriesWithListings: 0, // Would be calculated with joins
    };
  }

  /**
   * Check if category exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(categories)
      .where(eq(categories.id, id));

    return result.count > 0;
  }

  /**
   * Check if category name is unique within parent level
   */
  async isNameUnique(name: string, parentId: number | null, excludeId?: number): Promise<boolean> {
    let query = this.db
      .select({ count: count() })
      .from(categories)
      .where(eq(categories.name, name));

    if (parentId === null) {
      query = query.where(and(eq(categories.name, name), isNull(categories.parentId)));
    } else {
      query = query.where(and(eq(categories.name, name), eq(categories.parentId, parentId)));
    }

    if (excludeId) {
      query = query.where(and(query.where, sql`${categories.id} != ${excludeId}`));
    }

    const [result] = await query;
    return result.count === 0;
  }

  /**
   * Get popular categories (by listing count)
   */
  async getPopular(limit = 10): Promise<CategoryWithStats[]> {
    // This would be implemented with joins to count listings
    // For now, return categories ordered by name
    const categoryList = await this.getAll(true);

    return categoryList.slice(0, limit).map(cat => ({
      ...cat,
      level: cat.parentId === null ? 0 : 1,
      fullPath: cat.parentId === null ? cat.name : `Parent > ${cat.name}`,
      children: [],
      listingCount: Math.floor(Math.random() * 100), // Mock data
      activeListingCount: Math.floor(Math.random() * 80),
      recentListingCount: Math.floor(Math.random() * 20),
    }));
  }

  /**
   * Validate category hierarchy constraints
   */
  validateHierarchy(
    categoryData: CreateCategory | UpdateCategory,
    existingCategories: Category[]
  ): string[] {
    return validateCategoryHierarchy(categoryData, existingCategories);
  }

  /**
   * Helper methods
   */
  isParent(category: Category): boolean {
    return isParentCategory(category);
  }

  isChild(category: Category): boolean {
    return isChildCategory(category);
  }

  getConstraints() {
    return CATEGORY_CONSTRAINTS;
  }
}

// Export types and functions for use in other modules
export {
  Category,
  NewCategory,
  CreateCategory,
  UpdateCategory,
  CategoryWithHierarchy,
  CategoryWithStats,
  CategoryTree,
  buildCategoryHierarchy,
  getLeafCategories,
  isParentCategory,
  isChildCategory,
  CATEGORY_CONSTRAINTS,
};
export type { CategorySearchFilters, CategoryListResponse };
