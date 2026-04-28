CREATE TABLE `google_sites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`siteName` varchar(256) NOT NULL,
	`siteUrl` varchar(1024),
	`customDomain` varchar(256),
	`category` varchar(64),
	`language` enum('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`pageCount` int DEFAULT 0,
	`indexedCount` int DEFAULT 0,
	`gscVerified` boolean DEFAULT false,
	`gscSiteUrl` varchar(1024),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('informational','howto','comparison','listicle','local') NOT NULL,
	`description` text,
	`structure` json NOT NULL,
	`promptTemplate` text,
	`minWords` int DEFAULT 800,
	`maxWords` int DEFAULT 1500,
	`isPreset` boolean DEFAULT false,
	`isActive` boolean DEFAULT true,
	`usageCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `indexing_records` MODIFY COLUMN `indexStatus` enum('unknown','indexed','not_indexed','pending','submitted') NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `publish_tasks` MODIFY COLUMN `status` enum('pending','running','success','failed','scheduled','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `accounts` ADD `defaultSiteUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `accounts` ADD `defaultSiteName` varchar(256);--> statement-breakpoint
ALTER TABLE `accounts` ADD `proxyConfig` json;--> statement-breakpoint
ALTER TABLE `indexing_records` ADD `siteId` int;--> statement-breakpoint
ALTER TABLE `indexing_records` ADD `gscSubmitted` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `indexing_records` ADD `gscSubmittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `keywords` ADD `searchVolume` int;--> statement-breakpoint
ALTER TABLE `keywords` ADD `difficulty` float;--> statement-breakpoint
ALTER TABLE `keywords` ADD `priority` enum('high','medium','low') DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `materials` ADD `seoTemplateId` int;--> statement-breakpoint
ALTER TABLE `materials` ADD `metaDescription` varchar(160);--> statement-breakpoint
ALTER TABLE `materials` ADD `urlSlug` varchar(256);--> statement-breakpoint
ALTER TABLE `materials` ADD `internalLinks` json;--> statement-breakpoint
ALTER TABLE `materials` ADD `externalLinks` json;--> statement-breakpoint
ALTER TABLE `materials` ADD `similarityScore` float;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `siteId` int;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `maxRetries` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `publish_tasks` ADD `engineLog` text;