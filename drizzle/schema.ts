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
} from "drizzle-orm/mysql-core";

// ─── 用户表 ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
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
  dailyLimit: int("dailyLimit").default(5).notNull(),
  todayPublished: int("todayPublished").default(0).notNull(),
  siteAge: mysqlEnum("siteAge", ["new_site", "growing", "mature"]).default("new_site").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

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
  materialId: int("materialId"),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "scheduled"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  publishedUrl: varchar("publishedUrl", { length: 1024 }),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),
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
  taskId: int("taskId"),
  indexStatus: mysqlEnum("indexStatus", ["unknown", "indexed", "not_indexed", "pending"]).default("unknown").notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = typeof keywords.$inferInsert;
