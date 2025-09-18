import { Database } from '../db/index';
import { categories, type Category, type NewCategory } from '../db/models/category';
import { eq, and, desc, asc, isNull } from 'drizzle-orm';

export interface CategoryCreateData {
  name: string;
  slug: string;
  description?: string;
  parentId?: number;
  icon?: string;
  color?: string;
  displayOrder?: number;
}

export class CategoryService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new category
   */
  async create(categoryData: CategoryCreateData): Promise<Category | null> {
    try {
      const [newCategory] = await this.db.insert(categories)
        .values({
          ...categoryData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      return newCategory;
    } catch (error) {
      console.error('Error creating category:', error);
      return null;
    }
  }

  /**
   * Find category by ID
   */
  async findById(id: number): Promise<Category | null> {
    try {
      const result = await this.db.select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding category by ID:', error);
      return null;
    }
  }

  /**
   * Find category by slug
   */
  async findBySlug(slug: string): Promise<Category | null> {
    try {
      const result = await this.db.select()
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding category by slug:', error);
      return null;
    }
  }

  /**
   * Get all categories
   */
  async findAll(activeOnly: boolean = true): Promise<Category[]> {
    try {
      let query = this.db.select().from(categories);

      if (activeOnly) {
        query = query.where(eq(categories.isActive, true));
      }

      return await query.orderBy(asc(categories.displayOrder), asc(categories.name));
    } catch (error) {
      console.error('Error finding all categories:', error);
      return [];
    }
  }

  /**
   * Get root categories (no parent)
   */
  async getRootCategories(activeOnly: boolean = true): Promise<Category[]> {
    try {
      let query = this.db.select()
        .from(categories)
        .where(isNull(categories.parentId));

      if (activeOnly) {
        query = query.where(and(isNull(categories.parentId), eq(categories.isActive, true)));
      }

      return await query.orderBy(asc(categories.displayOrder), asc(categories.name));
    } catch (error) {
      console.error('Error getting root categories:', error);
      return [];
    }
  }

  /**
   * Get subcategories by parent ID
   */
  async getSubcategories(parentId: number, activeOnly: boolean = true): Promise<Category[]> {
    try {
      let query = this.db.select()
        .from(categories)
        .where(eq(categories.parentId, parentId));

      if (activeOnly) {
        query = query.where(and(eq(categories.parentId, parentId), eq(categories.isActive, true)));
      }

      return await query.orderBy(asc(categories.displayOrder), asc(categories.name));
    } catch (error) {
      console.error('Error getting subcategories:', error);
      return [];
    }
  }

  /**
   * Get category hierarchy (root categories with their children)
   */
  async getHierarchy(activeOnly: boolean = true): Promise<(Category & { children: Category[] })[]> {
    try {
      const rootCategories = await this.getRootCategories(activeOnly);
      const result = [];

      for (const rootCategory of rootCategories) {
        const children = await this.getSubcategories(rootCategory.id, activeOnly);
        result.push({
          ...rootCategory,
          children
        });
      }

      return result;
    } catch (error) {
      console.error('Error getting category hierarchy:', error);
      return [];
    }
  }

  /**
   * Update category
   */
  async update(id: number, updateData: Partial<CategoryCreateData>): Promise<Category | null> {
    try {
      const [updatedCategory] = await this.db.update(categories)
        .set({
          ...updateData,
          updatedAt: new Date().toISOString()
        })
        .where(eq(categories.id, id))
        .returning();

      return updatedCategory || null;
    } catch (error) {
      console.error('Error updating category:', error);
      return null;
    }
  }

  /**
   * Delete category
   */
  async delete(id: number): Promise<boolean> {
    try {
      // Check if category has subcategories
      const subcategories = await this.getSubcategories(id, false);
      if (subcategories.length > 0) {
        throw new Error('Cannot delete category with subcategories');
      }

      await this.db.delete(categories)
        .where(eq(categories.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      return false;
    }
  }

  /**
   * Check if category exists
   */
  async exists(id: number): Promise<boolean> {
    const category = await this.findById(id);
    return category !== null;
  }

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string, excludeId?: number): Promise<boolean> {
    try {
      let query = this.db.select()
        .from(categories)
        .where(eq(categories.slug, slug));

      if (excludeId) {
        query = query.where(and(eq(categories.slug, slug), eq(categories.id, excludeId)));
      }

      const result = await query.limit(1);
      return result.length === 0;
    } catch (error) {
      console.error('Error checking slug availability:', error);
      return false;
    }
  }

  /**
   * Activate/deactivate category
   */
  async setActive(id: number, isActive: boolean): Promise<boolean> {
    try {
      const result = await this.update(id, { isActive });
      return result !== null;
    } catch (error) {
      console.error('Error setting category active status:', error);
      return false;
    }
  }

  /**
   * Update listing count for category
   */
  async updateListingCount(id: number, count: number): Promise<void> {
    try {
      await this.db.update(categories)
        .set({
          listingCount: count,
          updatedAt: new Date().toISOString()
        })
        .where(eq(categories.id, id));
    } catch (error) {
      console.error('Error updating listing count:', error);
    }
  }

  /**
   * Get category statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    withSubcategories: number;
  }> {
    try {
      const allCategories = await this.findAll(false);
      const activeCategories = allCategories.filter(c => c.isActive);
      const withSubcategories = [];

      for (const category of allCategories) {
        const subcategories = await this.getSubcategories(category.id, false);
        if (subcategories.length > 0) {
          withSubcategories.push(category);
        }
      }

      return {
        total: allCategories.length,
        active: activeCategories.length,
        withSubcategories: withSubcategories.length
      };
    } catch (error) {
      console.error('Error getting category stats:', error);
      return { total: 0, active: 0, withSubcategories: 0 };
    }
  }
}