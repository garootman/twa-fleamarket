CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdDate` text NOT NULL,
	`updatedDate` text NOT NULL,
	`expiredDate` text NOT NULL,
	`tokenHash` text NOT NULL,
	`userId` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_tokenHash_unique` ON `tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `tokenHashIndex` ON `tokens` (`tokenHash`);--> statement-breakpoint
CREATE TABLE `users` (
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
	`phoneNumber` text,
	`supportsInlineQueries` integer,
	`canJoinGroups` integer,
	`canReadAllGroupMessages` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegramId_unique` ON `users` (`telegramId`);--> statement-breakpoint
CREATE INDEX `telegramIdIndex` ON `users` (`telegramId`);