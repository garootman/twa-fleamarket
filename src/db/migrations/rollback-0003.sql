-- Rollback Migration for 0003_marketplace_schema.sql
-- This script reverts the comprehensive marketplace schema back to the basic users table

-- Drop all marketplace tables in reverse dependency order
DROP INDEX IF EXISTS `cacheKeyIndex`;
DROP INDEX IF EXISTS `cacheNamespaceIndex`;
DROP INDEX IF EXISTS `cacheExpiresIndex`;
DROP TABLE IF EXISTS `cacheEntries`;

DROP INDEX IF EXISTS `mockUserTelegramIndex`;
DROP INDEX IF EXISTS `mockUserUsernameIndex`;
DROP INDEX IF EXISTS `mockUserScenarioIndex`;
DROP TABLE IF EXISTS `mockUsers`;

DROP INDEX IF EXISTS `blockedWordIndex`;
DROP INDEX IF EXISTS `blockedWordCategoryIndex`;
DROP INDEX IF EXISTS `blockedWordSeverityIndex`;
DROP INDEX IF EXISTS `blockedWordActiveIndex`;
DROP TABLE IF EXISTS `blockedWords`;

DROP INDEX IF EXISTS `premiumUserIndex`;
DROP INDEX IF EXISTS `premiumListingIndex`;
DROP INDEX IF EXISTS `premiumFeatureIndex`;
DROP INDEX IF EXISTS `premiumActiveIndex`;
DROP INDEX IF EXISTS `premiumExpiresIndex`;
DROP TABLE IF EXISTS `premiumFeatures`;

DROP INDEX IF EXISTS `appealUserIndex`;
DROP INDEX IF EXISTS `appealActionIndex`;
DROP INDEX IF EXISTS `appealStatusIndex`;
DROP INDEX IF EXISTS `appealCreatedIndex`;
DROP TABLE IF EXISTS `appeals`;

DROP INDEX IF EXISTS `moderationModeratorIndex`;
DROP INDEX IF EXISTS `moderationTargetIndex`;
DROP INDEX IF EXISTS `moderationActionIndex`;
DROP INDEX IF EXISTS `moderationCreatedIndex`;
DROP TABLE IF EXISTS `moderationActions`;

DROP INDEX IF EXISTS `flagTargetIndex`;
DROP INDEX IF EXISTS `flagReporterIndex`;
DROP INDEX IF EXISTS `flagStatusIndex`;
DROP INDEX IF EXISTS `flagSeverityIndex`;
DROP INDEX IF EXISTS `flagCreatedIndex`;
DROP TABLE IF EXISTS `flags`;

DROP INDEX IF EXISTS `sessionTokenIndex`;
DROP INDEX IF EXISTS `sessionTokenHashIndex`;
DROP INDEX IF EXISTS `sessionUserIndex`;
DROP INDEX IF EXISTS `sessionActiveIndex`;
DROP INDEX IF EXISTS `sessionExpiresIndex`;
DROP TABLE IF EXISTS `userSessions`;

DROP INDEX IF EXISTS `listingUserIndex`;
DROP INDEX IF EXISTS `listingCategoryIndex`;
DROP INDEX IF EXISTS `listingStatusIndex`;
DROP INDEX IF EXISTS `listingPublishedIndex`;
DROP INDEX IF EXISTS `listingFeaturedIndex`;
DROP INDEX IF EXISTS `listingPriceIndex`;
DROP INDEX IF EXISTS `listingLocationIndex`;
DROP INDEX IF EXISTS `listingCreatedIndex`;
DROP INDEX IF EXISTS `listingBumpedIndex`;
DROP INDEX IF EXISTS `listingViewsIndex`;
DROP TABLE IF EXISTS `listings`;

DROP INDEX IF EXISTS `categorySlugIndex`;
DROP INDEX IF EXISTS `categoryParentIndex`;
DROP INDEX IF EXISTS `categoryLevelIndex`;
DROP INDEX IF EXISTS `categoryActiveIndex`;
DROP TABLE IF EXISTS `categories`;

-- Note: Cannot easily remove columns from SQLite, so we create a new users table
-- and migrate data back to the original structure

-- Create temporary table with original users structure
CREATE TABLE `users_original` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL,
	`updatedDate` text NOT NULL,
	`lastAuthTimestamp` text NOT NULL,
	`telegramId` integer NOT NULL,
	`username` text,
	`isBot` integer,
	`firstName` text,
	`lastName` text,
	`languageCode` text,
	`isPremium` integer,
	`addedToAttachmentMenu` integer,
	`allowsWriteToPm` integer,
	`photoUrl` text,
	`r2ImageKey` text,
	`phoneNumber` text,
	`supportsInlineQueries` integer,
	`canJoinGroups` integer,
	`canReadAllGroupMessages` integer
);

-- Copy data from current users table to original structure
INSERT INTO `users_original` (
	`id`, `createdDate`, `updatedDate`, `lastAuthTimestamp`, `telegramId`,
	`username`, `isBot`, `firstName`, `lastName`, `languageCode`, `isPremium`,
	`addedToAttachmentMenu`, `allowsWriteToPm`, `photoUrl`, `r2ImageKey`,
	`phoneNumber`, `supportsInlineQueries`, `canJoinGroups`, `canReadAllGroupMessages`
)
SELECT
	`id`, `createdDate`, `updatedDate`, `lastAuthTimestamp`, `telegramId`,
	`username`, `isBot`, `firstName`, `lastName`, `languageCode`, `isPremium`,
	`addedToAttachmentMenu`, `allowsWriteToPm`, `photoUrl`, `r2ImageKey`,
	`phoneNumber`, `supportsInlineQueries`, `canJoinGroups`, `canReadAllGroupMessages`
FROM `users`;

-- Drop the current users table and rename the original
DROP TABLE `users`;
ALTER TABLE `users_original` RENAME TO `users`;

-- Recreate original indexes
CREATE UNIQUE INDEX `users_telegramId_unique` ON `users` (`telegramId`);
CREATE INDEX `telegramIdIndex` ON `users` (`telegramId`);

-- Remove additional indexes that were added
DROP INDEX IF EXISTS `usernameIndex`;
DROP INDEX IF EXISTS `verifiedIndex`;
DROP INDEX IF EXISTS `ratingIndex`;