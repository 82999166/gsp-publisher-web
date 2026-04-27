import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
  json,
  tinyint,
} from "drizzle-orm/mysql-core";

// ─── 用户表 ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 256 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 账号表 ───────────────────────────────────────────────────────────────────
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  cookieRaw: text("cookieRaw").notNull(),
  cookieParsed: json("cookieParsed"),
  status: mysqlEnum("status", ["online", "expired", "pending", "error"]).default("pending").notNull(),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  cookieExpiresAt: timestamp("cookieExpiresAt"), // Cookie 过期时间
  dailyLimit: int("dailyLimit").default(5).notNull(),
  todayPublished: int("todayPublished").default(0).notNull(),
  siteAge: mysqlEnum("siteAge", ["new_site", "growing", "mature"]).default("new_site").notNull(),
  // Google Sites 相关
  defaultSiteUrl: varchar("defaultSiteUrl", { length: 1024 }),  // 默认发布到的 Site URL
  defaultSiteName: varchar("defaultSiteName", { length: 256 }), // 默认 Site 名称
  proxyConfig: json("proxyConfig"),  // 该账号专属代理配置 {host, port, username, password, protocol}
  browserFingerprint: json("browserFingerprint"), // 该账号专属浏览器指纹 {userAgent, screenWidth, screenHeight, timezone, language, platform, colorDepth, hardwareConcurrency, deviceMemory}
  // Google OAuth 令牌
  googleOAuthAccessToken: text("googleOAuthAccessToken"), // Google OAuth 访问令牌
  googleOAuthRefreshToken: text("googleOAuthRefreshToken"), // Google OAuth 刷新令牌
  googleOAuthExpiresAt: timestamp("googleOAuthExpiresAt"), // OAuth 令牌过期时间
  googleOAuthScope: text("googleOAuthScope"), // OAuth 授权范围
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

// ─── SEO 文章模板表 ───────────────────────────────────────────────────────────
export const seoTemplates = mysqlTable("seo_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["informational", "howto", "comparison", "listicle", "local"]).notNull(),
  description: text("description"),
  // 模板结构：JSON 定义各区块（title/h2/h3/body/faq/cta/internal_links）
  structure: json("structure").notNull(),
  // 示例提示词模板（给 AI 的 system prompt 片段）
  promptTemplate: text("promptTemplate"),
  // 推荐字数范围
  minWords: int("minWords").default(800),
  maxWords: int("maxWords").default(1500),
  isPreset: boolean("isPreset").default(false),
  isActive: boolean("isActive").default(true),
  usageCount: int("usageCount").default(0),
  // 发布设置：站点名称后缀（发布时站点名称 = 关键词 + 后缀）
  siteNameSuffix: varchar("siteNameSuffix", { length: 256 }),
  // 内嵌网站配置
  embedUrl: varchar("embedUrl", { length: 1024 }),
  embedWidth: varchar("embedWidth", { length: 32 }).default("100%"),
  embedHeight: varchar("embedHeight", { length: 32 }).default("600px"),
  embedPosition: mysqlEnum("embedPosition", ["top", "bottom"]).default("bottom"),
  // Google Sites 主题设置（发布时自动应用）
  siteTheme: varchar("siteTheme", { length: 64 }).default("Simple"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SeoTemplate = typeof seoTemplates.$inferSelect;
export type InsertSeoTemplate = typeof seoTemplates.$inferInsert;

// ─── Google Sites 站点表 ──────────────────────────────────────────────────────
export const googleSites = mysqlTable("google_sites", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  siteName: varchar("siteName", { length: 256 }).notNull(),
  siteUrl: varchar("siteUrl", { length: 1024 }),     // 发布后的 URL（如 sites.google.com/view/xxx）
  customDomain: varchar("customDomain", { length: 256 }), // 绑定的自定义域名
  category: varchar("category", { length: 64 }),     // 站点主题分类
  language: mysqlEnum("language", ["zh-CN", "en", "zh-TW"]).default("zh-CN").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  pageCount: int("pageCount").default(0),            // 已发布页面数
  indexedCount: int("indexedCount").default(0),      // 已收录页面数
  gscVerified: boolean("gscVerified").default(false), // 是否已在 GSC 验证
  gscSiteUrl: varchar("gscSiteUrl", { length: 1024 }), // GSC 中注册的 Site URL
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoogleSite = typeof googleSites.$inferSelect;
export type InsertGoogleSite = typeof googleSites.$inferInsert;

// ─── 素材库表 ─────────────────────────────────────────────────────────────────
export const materials = mysqlTable("materials", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  keyword: varchar("keyword", { length: 256 }),
  language: mysqlEnum("language", ["zh-CN", "en", "zh-TW"]).default("zh-CN").notNull(),
  content: text("content").notNull(),
  wordCount: int("wordCount").default(0),
  qualityScore: float("qualityScore").default(0),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "published"]).default("pending").notNull(),
  tags: json("tags"),
  // SEO 扩展字段
  seoTemplateId: int("seoTemplateId"),               // 使用的 SEO 模板 ID
  metaDescription: varchar("metaDescription", { length: 160 }), // Meta Description（≤160字符）
  urlSlug: varchar("urlSlug", { length: 256 }),      // 页面 URL slug（含关键词）
  internalLinks: json("internalLinks"),              // 内链列表 [{url, anchorText}]
  externalLinks: json("externalLinks"),              // 外链列表 [{url, anchorText}]
  similarityScore: float("similarityScore"),         // 与已发布内容的相似度（0-1）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

// ─── 发布任务表 ───────────────────────────────────────────────────────────────
export const publishTasks = mysqlTable("publish_tasks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  accountId: int("accountId").notNull(),
  siteId: int("siteId"),                             // 目标 Google Site ID
  materialId: int("materialId"),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "scheduled", "cancelled"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  publishedUrl: varchar("publishedUrl", { length: 1024 }),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),
  maxRetries: int("maxRetries").default(3),
  // 发布引擎日志
  engineLog: text("engineLog"),                      // 发布引擎执行日志
  publishMethod: mysqlEnum("publishMethod", ["browser_automation", "google_sites_api"]).default("google_sites_api").notNull(), // 发布方式
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PublishTask = typeof publishTasks.$inferSelect;
export type InsertPublishTask = typeof publishTasks.$inferInsert;

// ─── 超链接表 ─────────────────────────────────────────────────────────────────
export const hyperlinks = mysqlTable("hyperlinks", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["internal", "external"]).default("external").notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  anchorText: varchar("anchorText", { length: 256 }),
  anchorType: mysqlEnum("anchorType", ["exact", "partial", "lsi", "brand", "natural", "naked"]).default("natural"),
  domain: varchar("domain", { length: 256 }),
  displayName: varchar("displayName", { length: 256 }),
  category: varchar("category", { length: 64 }),
  authorityScore: int("authorityScore").default(0),
  language: varchar("language", { length: 16 }).default("en"),
  description: text("description"),
  isPreset: boolean("isPreset").default(false),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Hyperlink = typeof hyperlinks.$inferSelect;
export type InsertHyperlink = typeof hyperlinks.$inferInsert;

// ─── 收录监控表 ───────────────────────────────────────────────────────────────
export const indexingRecords = mysqlTable("indexing_records", {
  id: int("id").autoincrement().primaryKey(),
  publishedUrl: varchar("publishedUrl", { length: 1024 }).notNull(),
  title: varchar("title", { length: 512 }),
  keyword: varchar("keyword", { length: 256 }),
  accountId: int("accountId"),
  siteId: int("siteId"),
  taskId: int("taskId"),
  indexStatus: mysqlEnum("indexStatus", ["unknown", "indexed", "not_indexed", "pending", "submitted"]).default("unknown").notNull(),
  gscSubmitted: boolean("gscSubmitted").default(false),  // 是否已提交到 GSC
  gscSubmittedAt: timestamp("gscSubmittedAt"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  indexedAt: timestamp("indexedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndexingRecord = typeof indexingRecords.$inferSelect;
export type InsertIndexingRecord = typeof indexingRecords.$inferInsert;

// ─── 系统设置表 ───────────────────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ─── 关键词表 ─────────────────────────────────────────────────────────────────
export const keywords = mysqlTable("keywords", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 256 }).notNull(),
  expandedKeywords: json("expandedKeywords"),
  language: mysqlEnum("language", ["zh-CN", "en", "zh-TW"]).default("zh-CN").notNull(),
  status: mysqlEnum("status", ["pending", "generating", "done", "failed"]).default("pending").notNull(),
  generatedCount: int("generatedCount").default(0),
  // 竞争度分析（第三阶段）
  searchVolume: int("searchVolume"),                 // 月均搜索量
  difficulty: float("difficulty"),                   // 竞争难度（0-100）
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = typeof keywords.$inferInsert;

// ─── 批量生成批次表 ────────────────────────────────────────────────────────────
export const generationBatches = mysqlTable("generation_batches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "paused", "completed", "failed"]).default("pending").notNull(),
  totalCount: int("totalCount").default(0).notNull(),
  completedCount: int("completedCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  // 生成配置
  language: mysqlEnum("language", ["zh-CN", "en", "zh-TW"]).default("zh-CN").notNull(),
  minWords: int("minWords").default(800).notNull(),
  style: mysqlEnum("style", ["informational", "commercial", "navigational"]).default("informational").notNull(),
  concurrency: int("concurrency").default(3).notNull(),
  // 自动审批阈值（质量分达到该阈值自动审批）
  autoApproveThreshold: int("autoApproveThreshold").default(0).notNull(),
  // 生成后自动加入发布队列
  autoQueue: tinyint("autoQueue").default(0).notNull(),
  // 关联的 SEO 模板 ID（可空，空则自由生成）
  templateId: int("templateId"),
  // 指定插入内容（全局配置）
  insertKeywords: json("insertKeywords"),   // string[]
  anchorLinks: json("anchorLinks"),         // {anchorText, url, position}[]
  insertParagraph: text("insertParagraph"), // 要插入的段落文本
  // 时间戳
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenerationBatch = typeof generationBatches.$inferSelect;
export type InsertGenerationBatch = typeof generationBatches.$inferInsert;

// ─── 批量生成项目表 ────────────────────────────────────────────────────────────
export const generationItems = mysqlTable("generation_items", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  keyword: varchar("keyword", { length: 256 }).notNull(),
  title: varchar("title", { length: 512 }),          // 指定的标题（可空，空则 AI 自动生成）
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  generatedContent: text("generatedContent"),
  generatedTitle: varchar("generatedTitle", { length: 512 }), // AI 实际生成的标题
  wordCount: int("wordCount"),                        // 实际字数
  qualityScore: int("qualityScore"),                  // AI 质量评分 0-100
  retryCount: int("retryCount").default(0).notNull(), // 重试次数
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenerationItem = typeof generationItems.$inferSelect;
export type InsertGenerationItem = typeof generationItems.$inferInsert;

// ─── 已发布页面表 ──────────────────────────────────────────────────────────────
export const publishedPages = mysqlTable("published_pages", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId"),
  materialId: int("materialId"),
  accountId: int("accountId").notNull(),
  siteId: int("siteId"),
  title: varchar("title", { length: 512 }).notNull(),
  keyword: varchar("keyword", { length: 256 }),
  publishedUrl: varchar("publishedUrl", { length: 1024 }).notNull(),
  siteUrl: varchar("siteUrl", { length: 1024 }),
  language: mysqlEnum("language", ["zh-CN", "en", "zh-TW"]).default("zh-CN").notNull(),
  wordCount: int("wordCount"),
  qualityScore: float("qualityScore"),
  indexStatus: mysqlEnum("indexStatus", ["unknown", "indexed", "not_indexed", "pending", "submitted"]).default("pending").notNull(),
  gscSubmitted: tinyint("gscSubmitted").default(0),
  gscSubmittedAt: timestamp("gscSubmittedAt"),
  gscResponse: text("gscResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PublishedPage = typeof publishedPages.$inferSelect;
export type InsertPublishedPage = typeof publishedPages.$inferInsert;

// ─── 系统日志表 ────────────────────────────────────────────────────────────────
export const systemLogs = mysqlTable("system_logs", {
  id: int("id").autoincrement().primaryKey(),
  level: mysqlEnum("level", ["debug", "info", "warn", "error", "success"]).default("info").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  message: text("message"),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = typeof systemLogs.$inferInsert;
