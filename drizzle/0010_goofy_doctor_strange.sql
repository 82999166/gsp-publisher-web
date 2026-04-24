CREATE TABLE `generation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`generatedContent` text,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_items_id` PRIMARY KEY(`id`)
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
