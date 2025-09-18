-- Migration to Comprehensive Marketplace Schema
-- This migration adds all the marketplace-specific tables and updates the users table

-- Add new fields to existing users table
ALTER TABLE `users` ADD `lastActiveAt` text NOT NULL DEFAULT (datetime('now'));
ALTER TABLE `users` ADD `profilePhotoUrl` text;
ALTER TABLE `users` ADD `isVerified` integer DEFAULT 0;
ALTER TABLE `users` ADD `rating` real DEFAULT 0.0;
ALTER TABLE `users` ADD `ratingCount` integer DEFAULT 0;
ALTER TABLE `users` ADD `totalListings` integer DEFAULT 0;
ALTER TABLE `users` ADD `activeListing` integer DEFAULT 0;
ALTER TABLE `users` ADD `soldListings` integer DEFAULT 0;
ALTER TABLE `users` ADD `isAdmin` integer DEFAULT 0;
ALTER TABLE `users` ADD `isBanned` integer DEFAULT 0;
ALTER TABLE `users` ADD `banReason` text;
ALTER TABLE `users` ADD `bannedAt` text;
ALTER TABLE `users` ADD `bannedUntil` text;
ALTER TABLE `users` ADD `warningCount` integer DEFAULT 0;
ALTER TABLE `users` ADD `notificationsEnabled` integer DEFAULT 1;
ALTER TABLE `users` ADD `emailNotifications` integer DEFAULT 0;
ALTER TABLE `users` ADD `locationSharing` integer DEFAULT 0;

-- Create additional indexes for users table
CREATE INDEX IF NOT EXISTS `usernameIndex` ON `users` (`username`);
CREATE INDEX IF NOT EXISTS `verifiedIndex` ON `users` (`isVerified`);
CREATE INDEX IF NOT EXISTS `ratingIndex` ON `users` (`rating`);

-- Create categories table
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`iconUrl` text,
	`parentId` integer,
	`level` integer NOT NULL DEFAULT 0,
	`sortOrder` integer DEFAULT 0,
	`isActive` integer DEFAULT 1,
	`isVisible` integer DEFAULT 1,
	`listingCount` integer DEFAULT 0,
	FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE UNIQUE INDEX `categorySlugIndex` ON `categories` (`slug`);
CREATE INDEX `categoryParentIndex` ON `categories` (`parentId`);
CREATE INDEX `categoryLevelIndex` ON `categories` (`level`);
CREATE INDEX `categoryActiveIndex` ON `categories` (`isActive`);

-- Create listings table
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`title` text NOT NULL,
	`description` text NOT NULL,
	`priceUsd` real NOT NULL,
	`currency` text DEFAULT 'USD',
	`categoryId` integer NOT NULL,
	`subcategoryId` integer,
	`tags` text,
	`images` text,
	`thumbnail` text,
	`location` text,
	`latitude` real,
	`longitude` real,
	`userId` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'draft',
	`isDraft` integer DEFAULT 1,
	`isPublished` integer DEFAULT 0,
	`publishedAt` text,
	`expiresAt` text,
	`isFeatured` integer DEFAULT 0,
	`isPremium` integer DEFAULT 0,
	`isUrgent` integer DEFAULT 0,
	`featuredUntil` text,
	`bumpedAt` text,
	`lastBumpAt` text,
	`viewCount` integer DEFAULT 0,
	`favoriteCount` integer DEFAULT 0,
	`messageCount` integer DEFAULT 0,
	`moderationStatus` text DEFAULT 'pending',
	`moderatedAt` text,
	`moderatedBy` integer,
	`moderationNotes` text,
	`flagCount` integer DEFAULT 0,
	FOREIGN KEY (`userId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subcategoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`moderatedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `listingUserIndex` ON `listings` (`userId`);
CREATE INDEX `listingCategoryIndex` ON `listings` (`categoryId`);
CREATE INDEX `listingStatusIndex` ON `listings` (`status`);
CREATE INDEX `listingPublishedIndex` ON `listings` (`isPublished`);
CREATE INDEX `listingFeaturedIndex` ON `listings` (`isFeatured`);
CREATE INDEX `listingPriceIndex` ON `listings` (`priceUsd`);
CREATE INDEX `listingLocationIndex` ON `listings` (`latitude`, `longitude`);
CREATE INDEX `listingCreatedIndex` ON `listings` (`createdDate`);
CREATE INDEX `listingBumpedIndex` ON `listings` (`bumpedAt`);
CREATE INDEX `listingViewsIndex` ON `listings` (`viewCount`);

-- Create userSessions table
CREATE TABLE `userSessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`userId` integer NOT NULL,
	`token` text NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` text NOT NULL,
	`isActive` integer DEFAULT 1,
	`userAgent` text,
	`ipAddress` text,
	`deviceInfo` text,
	`revokedAt` text,
	`revokedBy` integer,
	`revokeReason` text,
	FOREIGN KEY (`userId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revokedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE UNIQUE INDEX `sessionTokenIndex` ON `userSessions` (`token`);
CREATE UNIQUE INDEX `sessionTokenHashIndex` ON `userSessions` (`tokenHash`);
CREATE INDEX `sessionUserIndex` ON `userSessions` (`userId`);
CREATE INDEX `sessionActiveIndex` ON `userSessions` (`isActive`);
CREATE INDEX `sessionExpiresIndex` ON `userSessions` (`expiresAt`);

-- Create flags table
CREATE TABLE `flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	`reportedBy` integer NOT NULL,
	`reason` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`severity` text DEFAULT 'medium',
	`status` text DEFAULT 'pending',
	`resolvedAt` text,
	`resolvedBy` integer,
	`resolution` text,
	`moderatorNotes` text,
	FOREIGN KEY (`reportedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `flagTargetIndex` ON `flags` (`targetType`, `targetId`);
CREATE INDEX `flagReporterIndex` ON `flags` (`reportedBy`);
CREATE INDEX `flagStatusIndex` ON `flags` (`status`);
CREATE INDEX `flagSeverityIndex` ON `flags` (`severity`);
CREATE INDEX `flagCreatedIndex` ON `flags` (`createdDate`);

-- Create moderationActions table
CREATE TABLE `moderationActions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`action` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	`moderatorId` integer NOT NULL,
	`reason` text,
	`details` text,
	`duration` text,
	`severity` text DEFAULT 'medium',
	`relatedFlagId` integer,
	`relatedUserId` integer,
	FOREIGN KEY (`moderatorId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relatedFlagId`) REFERENCES `flags`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`relatedUserId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `moderationModeratorIndex` ON `moderationActions` (`moderatorId`);
CREATE INDEX `moderationTargetIndex` ON `moderationActions` (`targetType`, `targetId`);
CREATE INDEX `moderationActionIndex` ON `moderationActions` (`action`);
CREATE INDEX `moderationCreatedIndex` ON `moderationActions` (`createdDate`);

-- Create appeals table
CREATE TABLE `appeals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`userId` integer NOT NULL,
	`moderationActionId` integer NOT NULL,
	`reason` text NOT NULL,
	`explanation` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'pending',
	`reviewedAt` text,
	`reviewedBy` integer,
	`reviewerNotes` text,
	`resolution` text,
	FOREIGN KEY (`userId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moderationActionId`) REFERENCES `moderationActions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `appealUserIndex` ON `appeals` (`userId`);
CREATE INDEX `appealActionIndex` ON `appeals` (`moderationActionId`);
CREATE INDEX `appealStatusIndex` ON `appeals` (`status`);
CREATE INDEX `appealCreatedIndex` ON `appeals` (`createdDate`);

-- Create premiumFeatures table
CREATE TABLE `premiumFeatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`userId` integer NOT NULL,
	`listingId` text,
	`featureType` text NOT NULL,
	`duration` integer NOT NULL,
	`priceStars` integer NOT NULL,
	`isActive` integer DEFAULT 1,
	`activatedAt` text DEFAULT (datetime('now')),
	`expiresAt` text NOT NULL,
	`paymentId` text,
	`paymentStatus` text DEFAULT 'pending',
	`paymentDate` text,
	`refundDate` text,
	FOREIGN KEY (`userId`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `premiumUserIndex` ON `premiumFeatures` (`userId`);
CREATE INDEX `premiumListingIndex` ON `premiumFeatures` (`listingId`);
CREATE INDEX `premiumFeatureIndex` ON `premiumFeatures` (`featureType`);
CREATE INDEX `premiumActiveIndex` ON `premiumFeatures` (`isActive`);
CREATE INDEX `premiumExpiresIndex` ON `premiumFeatures` (`expiresAt`);

-- Create blockedWords table
CREATE TABLE `blockedWords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`word` text NOT NULL,
	`pattern` text,
	`category` text NOT NULL,
	`severity` text DEFAULT 'medium',
	`action` text DEFAULT 'flag',
	`isActive` integer DEFAULT 1,
	`isRegex` integer DEFAULT 0,
	`addedBy` integer,
	`notes` text,
	FOREIGN KEY (`addedBy`) REFERENCES `users`(`telegramId`) ON UPDATE no action ON DELETE set null
);

CREATE UNIQUE INDEX `blockedWordIndex` ON `blockedWords` (`word`);
CREATE INDEX `blockedWordCategoryIndex` ON `blockedWords` (`category`);
CREATE INDEX `blockedWordSeverityIndex` ON `blockedWords` (`severity`);
CREATE INDEX `blockedWordActiveIndex` ON `blockedWords` (`isActive`);

-- Create mockUsers table
CREATE TABLE `mockUsers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`telegramId` integer NOT NULL,
	`username` text,
	`firstName` text,
	`lastName` text,
	`isAdmin` integer DEFAULT 0,
	`scenario` text,
	`description` text,
	`isActive` integer DEFAULT 1
);

CREATE UNIQUE INDEX `mockUserTelegramIndex` ON `mockUsers` (`telegramId`);
CREATE INDEX `mockUserUsernameIndex` ON `mockUsers` (`username`);
CREATE INDEX `mockUserScenarioIndex` ON `mockUsers` (`scenario`);

-- Create cacheEntries table
CREATE TABLE `cacheEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL DEFAULT (datetime('now')),
	`updatedDate` text NOT NULL DEFAULT (datetime('now')),
	`key` text NOT NULL,
	`value` text NOT NULL,
	`ttl` integer,
	`expiresAt` text,
	`namespace` text,
	`tags` text
);

CREATE UNIQUE INDEX `cacheKeyIndex` ON `cacheEntries` (`key`);
CREATE INDEX `cacheNamespaceIndex` ON `cacheEntries` (`namespace`);
CREATE INDEX `cacheExpiresIndex` ON `cacheEntries` (`expiresAt`);

-- Insert default categories
INSERT INTO `categories` (`name`, `slug`, `description`, `level`, `sortOrder`, `isActive`, `isVisible`) VALUES
('Electronics', 'electronics', 'Electronic devices and gadgets', 0, 1, 1, 1),
('Home & Garden', 'home-garden', 'Home improvement and garden items', 0, 2, 1, 1),
('Clothing & Accessories', 'clothing-accessories', 'Fashion and accessories', 0, 3, 1, 1),
('Sports & Recreation', 'sports-recreation', 'Sports equipment and recreational items', 0, 4, 1, 1),
('Books & Media', 'books-media', 'Books, music, movies and media', 0, 5, 1, 1),
('Vehicles', 'vehicles', 'Cars, motorcycles, and other vehicles', 0, 6, 1, 1),
('Real Estate', 'real-estate', 'Property and real estate listings', 0, 7, 1, 1),
('Services', 'services', 'Professional and personal services', 0, 8, 1, 1),
('Jobs', 'jobs', 'Job listings and career opportunities', 0, 9, 1, 1),
('Other', 'other', 'Miscellaneous items', 0, 10, 1, 1);

-- Insert electronics subcategories
INSERT INTO `categories` (`name`, `slug`, `description`, `parentId`, `level`, `sortOrder`, `isActive`, `isVisible`) VALUES
('Smartphones', 'smartphones', 'Mobile phones and accessories', 1, 1, 1, 1, 1),
('Computers', 'computers', 'Laptops, desktops, and computer accessories', 1, 1, 2, 1, 1),
('Gaming', 'gaming', 'Gaming consoles and accessories', 1, 1, 3, 1, 1),
('Audio & Video', 'audio-video', 'Headphones, speakers, cameras', 1, 1, 4, 1, 1);

-- Insert some default blocked words
INSERT INTO `blockedWords` (`word`, `category`, `severity`, `action`, `isActive`) VALUES
('spam', 'spam', 'high', 'block', 1),
('scam', 'fraud', 'high', 'block', 1),
('fake', 'fraud', 'medium', 'flag', 1),
('fraud', 'fraud', 'high', 'block', 1),
('stolen', 'illegal', 'high', 'block', 1);

-- Insert default mock users for development
INSERT INTO `mockUsers` (`telegramId`, `username`, `firstName`, `lastName`, `isAdmin`, `scenario`, `description`, `isActive`) VALUES
(111111111, 'admin_user', 'Admin', 'User', 1, 'admin', 'Default admin user for testing', 1),
(222222222, 'seller_user', 'Seller', 'Test', 0, 'seller', 'Active seller with multiple listings', 1),
(333333333, 'buyer_user', 'Buyer', 'Test', 0, 'buyer', 'Active buyer browsing marketplace', 1),
(444444444, 'banned_user', 'Banned', 'User', 0, 'banned', 'Banned user for testing moderation', 0),
(555555555, 'premium_user', 'Premium', 'User', 0, 'premium', 'User with premium features', 1);