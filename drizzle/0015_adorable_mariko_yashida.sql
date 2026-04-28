CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`email` varchar(320),
	`cookieRaw` text NOT NULL,
	`cookieParsed` json,
	`status` enum('online','expired','pending','error') NOT NULL DEFAULT 'pending',
	`lastVerifiedAt` timestamp,
	`cookieExpiresAt` timestamp,
	`dailyLimit` int NOT NULL DEFAULT 5,
	`todayPublished` int NOT NULL DEFAULT 0,
	`siteAge` enum('new_site','growing','mature') NOT NULL DEFAULT 'new_site',
	`defaultSiteUrl` varchar(1024),
	`defaultSiteName` varchar(256),
	`proxyConfig` json,
	`browserFingerprint` json,
	`googleOAuthAccessToken` text,
	`googleOAuthRefreshToken` text,
	`googleOAuthExpiresAt` timestamp,
	`googleOAuthScope` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generation_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`status` enum('pending','running','paused','completed','failed') NOT NULL DEFAULT 'pending',
	`totalCount` int NOT NULL DEFAULT 0,
	`completedCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`language` enum('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
	`minWords` int NOT NULL DEFAULT 800,
	`style` enum('informational','commercial','navigational') NOT NULL DEFAULT 'informational',
	`concurrency` int NOT NULL DEFAULT 3,
	`autoApproveThreshold` int NOT NULL DEFAULT 0,
	`autoQueue` tinyint NOT NULL DEFAULT 0,
	`templateId` int,
	`insertKeywords` json,
	`anchorLinks` json,
	`insertParagraph` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`title` varchar(512),
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`generatedContent` text,
	`generatedTitle` varchar(512),
	`wordCount` int,
	`qualityScore` int,
	`retryCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	`siteId` int,
	`taskId` int,
	`indexStatus` enum('unknown','indexed','not_indexed','pending','submitted') NOT NULL DEFAULT 'unknown',
	`gscSubmitted` boolean DEFAULT false,
	`gscSubmittedAt` timestamp,
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
	`searchVolume` int,
	`difficulty` float,
	`priority` enum('high','medium','low') DEFAULT 'medium',
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
	`seoTemplateId` int,
	`metaDescription` varchar(160),
	`urlSlug` varchar(256),
	`internalLinks` json,
	`externalLinks` json,
	`similarityScore` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publish_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`templateId` int,
	`keyword` varchar(256) NOT NULL,
	`title` varchar(512) NOT NULL,
	`content` text NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 0,
	`retryCount` int NOT NULL DEFAULT 0,
	`maxRetries` int NOT NULL DEFAULT 3,
	`errorMessage` text,
	`publishedUrl` varchar(1024),
	`siteUrl` varchar(1024),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publish_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publish_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`accountId` int NOT NULL,
	`siteId` int,
	`materialId` int,
	`status` enum('pending','running','success','failed','scheduled','cancelled') NOT NULL DEFAULT 'pending',
	`scheduledAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`publishedUrl` varchar(1024),
	`errorMessage` text,
	`retryCount` int DEFAULT 0,
	`maxRetries` int DEFAULT 3,
	`engineLog` text,
	`publishMethod` enum('browser_automation','google_sites_api') NOT NULL DEFAULT 'google_sites_api',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publish_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `published_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int,
	`materialId` int,
	`accountId` int NOT NULL,
	`siteId` int,
	`title` varchar(512) NOT NULL,
	`keyword` varchar(256),
	`publishedUrl` varchar(1024) NOT NULL,
	`siteUrl` varchar(1024),
	`language` enum('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
	`wordCount` int,
	`qualityScore` float,
	`indexStatus` enum('unknown','indexed','not_indexed','pending','submitted') NOT NULL DEFAULT 'pending',
	`gscSubmitted` tinyint DEFAULT 0,
	`gscSubmittedAt` timestamp,
	`gscResponse` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `published_pages_id` PRIMARY KEY(`id`)
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
	`siteNameSuffix` varchar(256),
	`embedUrl` varchar(1024),
	`embedWidth` varchar(32) DEFAULT '100%',
	`embedHeight` varchar(32) DEFAULT '600px',
	`embedPosition` enum('top','bottom') DEFAULT 'bottom',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`level` enum('debug','info','warn','error','success') NOT NULL DEFAULT 'info',
	`category` varchar(64) NOT NULL,
	`title` varchar(256) NOT NULL,
	`message` text,
	`entityType` varchar(64),
	`entityId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_logs_id` PRIMARY KEY(`id`)
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
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(256);