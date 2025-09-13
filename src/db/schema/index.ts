// Re-export all schema tables and types
export * from './users';
export * from './categories';
export * from './listings';
export * from './moderation';
export * from './premium';
export * from './sessions';

// Schema object for Drizzle
import { users, usersRelations } from './users';
import { categories, categoriesRelations } from './categories';
import { listings, listingsRelations } from './listings';
import {
  flags,
  moderationActions,
  appeals,
  blockedWords,
  flagsRelations,
  moderationActionsRelations,
  appealsRelations,
  blockedWordsRelations,
} from './moderation';
import { premiumFeatures, premiumFeaturesRelations } from './premium';
import {
  userSessions,
  mockUsers,
  cacheEntries,
  userSessionsRelations,
  mockUsersRelations,
} from './sessions';

// All tables
export const schema = {
  // Core tables
  users,
  categories,
  listings,

  // Moderation tables
  flags,
  moderationActions,
  appeals,
  blockedWords,

  // Premium features
  premiumFeatures,

  // Sessions and cache
  userSessions,
  mockUsers,
  cacheEntries,

  // Relations
  usersRelations,
  categoriesRelations,
  listingsRelations,
  flagsRelations,
  moderationActionsRelations,
  appealsRelations,
  blockedWordsRelations,
  premiumFeaturesRelations,
  userSessionsRelations,
  mockUsersRelations,
};

// Table references for easier access
export const tables = {
  users,
  categories,
  listings,
  flags,
  moderationActions,
  appeals,
  blockedWords,
  premiumFeatures,
  userSessions,
  mockUsers,
  cacheEntries,
};

// Type exports for easier imports
export type { User, NewUser, TelegramUser, CreateUser, UpdateUser } from './users';
export type {
  Category,
  NewCategory,
  CreateCategory,
  UpdateCategory,
  CategoryWithHierarchy,
} from './categories';
export type {
  Listing,
  NewListing,
  CreateListing,
  UpdateListing,
  ListingSearch,
  ListingWithRelations,
} from './listings';
export type {
  Flag,
  NewFlag,
  CreateFlag,
  ModerationAction,
  NewModerationAction,
  CreateModerationAction,
  Appeal,
  NewAppeal,
  CreateAppeal,
  BlockedWord,
  NewBlockedWord,
  CreateBlockedWord,
} from './moderation';
export type {
  PremiumFeature,
  NewPremiumFeature,
  CreatePremiumFeature,
  UpdatePremiumFeature,
  PremiumFeatureWithDetails,
} from './premium';
export type {
  UserSession,
  NewUserSession,
  CreateUserSession,
  MockUser,
  NewMockUser,
  CreateMockUser,
  CacheEntry,
  NewCacheEntry,
  CreateCacheEntry,
} from './sessions';

// Enum exports
export { UserStatus } from './users';
export { ListingStatus } from './listings';
export {
  FlagReason,
  FlagStatus,
  ModerationActionType,
  AppealStatus,
  BlockedWordSeverity,
} from './moderation';
export { PremiumFeatureType } from './premium';
export { MockUserRole } from './sessions';

// Constraint exports
export { CATEGORY_CONSTRAINTS } from './categories';
export { LISTING_CONSTRAINTS } from './listings';
export { MODERATION_CONSTRAINTS } from './moderation';
export { PREMIUM_FEATURE_CONSTRAINTS } from './premium';
export { SESSION_CONSTRAINTS, CACHE_CONSTRAINTS, MOCK_USER_CONSTRAINTS } from './sessions';

// Helper function exports
export { isUserAdmin, getUserStatus } from './users';
export {
  isParentCategory,
  isChildCategory,
  validateCategoryHierarchy,
  buildCategoryHierarchy,
  getLeafCategories,
} from './categories';
export {
  generateListingId,
  isListingExpired,
  canBumpListing,
  getTimeLeft,
  validateListingOwnership,
  canUserCreateListing,
  isValidStatusTransition,
} from './listings';
export { canUserFlag, canAppealAction, isBanActive, filterProfanity } from './moderation';
export {
  calculateFeatureExpiration,
  getFeaturePrice,
  isFeatureActive,
  canUserPurchaseFeature,
  getFeatureDisplayName,
  getFeatureDescription,
  enrichPremiumFeature,
} from './premium';
export {
  generateSessionToken,
  calculateSessionExpiration,
  isSessionValid,
  isSessionExpiredButActive,
  getDefaultMockUsers,
  mockUserToTelegramUser,
  generateCacheKey,
  getCacheTTL,
  isCacheEntryValid,
} from './sessions';
