ALTER TABLE `seo_templates` ADD `siteNameSuffix` varchar(256);--> statement-breakpoint
ALTER TABLE `seo_templates` ADD `embedUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `seo_templates` ADD `embedWidth` varchar(32) DEFAULT '100%';--> statement-breakpoint
ALTER TABLE `seo_templates` ADD `embedHeight` varchar(32) DEFAULT '600px';--> statement-breakpoint
ALTER TABLE `seo_templates` ADD `embedPosition` enum('top','bottom') DEFAULT 'bottom';