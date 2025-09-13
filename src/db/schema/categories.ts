import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import { listings } from './listings';

// Categories table - represents 2-level hierarchy for organizing listings
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    parentId: integer('parent_id'), // Self-referential for hierarchy
    description: text('description'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  table => ({
    nameIdx: index('categories_name_idx').on(table.name),
    parentIdIdx: index('categories_parent_id_idx').on(table.parentId),
    isActiveIdx: index('categories_is_active_idx').on(table.isActive),
    nameParentIdx: index('categories_name_parent_idx').on(table.name, table.parentId),
  })
);

// Relations
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'parentChild',
  }),
  children: many(categories, { relationName: 'parentChild' }),
  listings: many(listings),
}));

// Zod schemas for validation
export const CategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  parentId: z.number().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  isActive: z.boolean(),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(50, 'Category name too long'),
  parentId: z.number().optional(),
  description: z.string().max(500, 'Description too long').optional(),
  isActive: z.boolean().default(true),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  parentId: z.number().nullable().optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

// Inferred types
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;

// Enhanced category type with hierarchy info
export interface CategoryWithHierarchy extends Category {
  parent?: Category | null;
  children?: Category[];
  level: number;
  fullPath: string;
  listingCount?: number;
}

// Helper functions for category management
export function isParentCategory(category: Category): boolean {
  return category.parentId === null;
}

export function isChildCategory(category: Category): boolean {
  return category.parentId !== null;
}

// Validation functions
export function validateCategoryHierarchy(
  category: CreateCategory | UpdateCategory,
  existingCategories: Category[]
): string[] {
  const errors: string[] = [];

  // Check name uniqueness within same parent level
  if ('name' in category && category.name) {
    const parentId = 'parentId' in category ? category.parentId : null;
    const sameLevelCategories = existingCategories.filter(
      cat => cat.parentId === parentId && cat.isActive
    );

    if (sameLevelCategories.some(cat => cat.name === category.name)) {
      errors.push('Category name must be unique within the same parent level');
    }
  }

  // Ensure maximum 2 levels deep (parent → child, no grandchildren)
  if ('parentId' in category && category.parentId) {
    const parentCategory = existingCategories.find(cat => cat.id === category.parentId);
    if (parentCategory?.parentId !== null) {
      errors.push('Categories can only be 2 levels deep (parent → child)');
    }
  }

  return errors;
}

export function buildCategoryHierarchy(categories: Category[]): CategoryWithHierarchy[] {
  const categoryMap = new Map<number, CategoryWithHierarchy>();

  // First pass: convert to CategoryWithHierarchy and build map
  categories.forEach(cat => {
    const enhanced: CategoryWithHierarchy = {
      ...cat,
      level: 0,
      fullPath: '',
      children: [],
    };
    categoryMap.set(cat.id, enhanced);
  });

  // Second pass: build hierarchy and calculate levels/paths
  const rootCategories: CategoryWithHierarchy[] = [];

  categoryMap.forEach(cat => {
    if (cat.parentId === null) {
      // Root category
      cat.level = 0;
      cat.fullPath = cat.name;
      rootCategories.push(cat);
    } else {
      // Child category
      const parent = categoryMap.get(cat.parentId);
      if (parent) {
        cat.level = 1;
        cat.parent = parent;
        cat.fullPath = `${parent.name} > ${cat.name}`;
        parent.children!.push(cat);
      }
    }
  });

  // Sort categories by name within each level
  rootCategories.sort((a, b) => a.name.localeCompare(b.name));
  rootCategories.forEach(parent => {
    parent.children!.sort((a, b) => a.name.localeCompare(b.name));
  });

  return Array.from(categoryMap.values());
}

// Get leaf categories (categories that can have listings assigned)
export function getLeafCategories(categories: Category[]): Category[] {
  const categoryMap = new Map<number, Category>();
  categories.forEach(cat => categoryMap.set(cat.id, cat));

  return categories.filter(cat => {
    // A category is a leaf if it has no children
    return !categories.some(otherCat => otherCat.parentId === cat.id);
  });
}

// Category constants
export const CATEGORY_CONSTRAINTS = {
  MAX_DEPTH: 2,
  MAX_NAME_LENGTH: 50,
  MAX_DESCRIPTION_LENGTH: 500,
} as const;
