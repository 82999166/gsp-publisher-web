CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(320),
	`cookieRaw` text NOT NULL,
	`cookieParsed` json,
	`status` enum('online','expired','pending','error') NOT NULL DEFAULT 'pending',
	`lastVerifiedAt` timestamp,
	`dailyLimit` int NOT NULL DEFAULT 5,
	`todayPublished` int NOT NULL DEFAULT 0,
	`siteAge` enum('new_site','growing','mature') NOT NULL DEFAULT 'new_site',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hyperlinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('internal','external') NOT NULL DEFAULT 'external',
	`url` varchar(1024) NOT NULL,
	`anchorText` varchar(256),
	`anchorType` enum('exact','partial','lsi','brand','natural','naked') DEFAULT 'natural',
	`domain` varchar(256),
	`displayName` varchar(256),
	`category` varchar(64),
	`authorityScore` int DEFAULT 0,
	`language` varchar(16) DEFAULT 'en',
	`description` text,
	`isPreset` boolean DEFAULT false,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hyperlinks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `indexing_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publishedUrl` varchar(1024) NOT NULL,
	`title` varchar(512),
	`keyword` varchar(256),
	`accountId` int,
	`taskId` int,
	`indexStatus` enum('unknown','indexed','not_indexed','pending') NOT NULL DEFAULT 'unknown',
	`lastCheckedAt` timestamp,
	`indexedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indexing_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`expandedKeywords` json,
	`language` enum('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
	`status` enum('pending','generating','done','failed') NOT NULL DEFAULT 'pending',
	`generatedCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `keywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`keyword` varchar(256),
	`language` enum('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
	`content` text NOT NULL,
	`wordCount` int DEFAULT 0,
	`qualityScore` float DEFAULT 0,
	`status` enum('pending','approved','rejected','published') NOT NULL DEFAULT 'pending',
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publish_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`accountId` int NOT NULL,
	`materialId` int,
	`status` enum('pending','running','success','failed','scheduled') NOT NULL DEFAULT 'pending',
	`scheduledAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`publishedUrl` varchar(1024),
	`errorMessage` text,
	`retryCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publish_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
