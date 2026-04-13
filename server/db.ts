import { eq, desc, and, like, count, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  accounts, InsertAccount,
  materials, InsertMaterial,
  publishTasks, InsertPublishTask,
  hyperlinks, InsertHyperlink,
  indexingRecords, InsertIndexingRecord,
  systemSettings, InsertSystemSetting,
  keywords, InsertKeyword,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
export async function getAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts).orderBy(desc(accounts.createdAt));
}

export async function getAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return result[0];
}

export async function createAccount(data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(accounts).values(data);
}

export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accounts).set(data).where(eq(accounts.id, id));
}

export async function deleteAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accounts).where(eq(accounts.id, id));
}

// ─── Materials ────────────────────────────────────────────────────────────────
export async function getMaterials(filters?: { status?: string; keyword?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(materials.status, filters.status as any));
  if (filters?.keyword) conditions.push(like(materials.keyword, `%${filters.keyword}%`));
  return db.select().from(materials)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(materials.createdAt));
}

export async function getMaterialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  return result[0];
}

export async function createMaterial(data: InsertMaterial) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(materials).values(data);
}

export async function updateMaterial(id: number, data: Partial<InsertMaterial>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(materials).set(data).where(eq(materials.id, id));
}

export async function deleteMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(materials).where(eq(materials.id, id));
}

// ─── Publish Tasks ────────────────────────────────────────────────────────────
export async function getPublishTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(publishTasks).orderBy(desc(publishTasks.createdAt));
}

export async function createPublishTask(data: InsertPublishTask) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(publishTasks).values(data);
}

export async function updatePublishTask(id: number, data: Partial<InsertPublishTask>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(publishTasks).set(data).where(eq(publishTasks.id, id));
}

export async function deletePublishTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(publishTasks).where(eq(publishTasks.id, id));
}

// ─── Hyperlinks ───────────────────────────────────────────────────────────────
export async function getHyperlinks(type?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = type ? [eq(hyperlinks.type, type as any)] : [];
  return db.select().from(hyperlinks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hyperlinks.authorityScore));
}

export async function createHyperlink(data: InsertHyperlink) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(hyperlinks).values(data);
}

export async function updateHyperlink(id: number, data: Partial<InsertHyperlink>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(hyperlinks).set(data).where(eq(hyperlinks.id, id));
}

export async function deleteHyperlink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(hyperlinks).where(eq(hyperlinks.id, id));
}

export async function seedPresetHyperlinks() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(hyperlinks).where(eq(hyperlinks.isPreset, true)).limit(1);
  if (existing.length > 0) return;
  const presets = [
    { domain: "wikipedia.org", displayName: "Wikipedia", category: "general", authorityScore: 95, language: "en", description: "全球最大百科全书", isPreset: true, type: "external" as const, url: "https://wikipedia.org", isActive: true },
    { domain: "who.int", displayName: "WHO 世界卫生组织", category: "health", authorityScore: 92, language: "en", description: "世界卫生组织官网", isPreset: true, type: "external" as const, url: "https://who.int", isActive: true },
    { domain: "scholar.google.com", displayName: "Google Scholar", category: "academic", authorityScore: 88, language: "en", description: "谷歌学术", isPreset: true, type: "external" as const, url: "https://scholar.google.com", isActive: true },
    { domain: "reuters.com", displayName: "Reuters", category: "news", authorityScore: 88, language: "en", description: "路透社新闻", isPreset: true, type: "external" as const, url: "https://reuters.com", isActive: true },
    { domain: "bbc.com", displayName: "BBC", category: "news", authorityScore: 87, language: "en", description: "BBC 新闻", isPreset: true, type: "external" as const, url: "https://bbc.com", isActive: true },
    { domain: "forbes.com", displayName: "Forbes", category: "business", authorityScore: 85, language: "en", description: "福布斯商业媒体", isPreset: true, type: "external" as const, url: "https://forbes.com", isActive: true },
    { domain: "statista.com", displayName: "Statista", category: "data", authorityScore: 82, language: "en", description: "统计数据平台", isPreset: true, type: "external" as const, url: "https://statista.com", isActive: true },
    { domain: "techcrunch.com", displayName: "TechCrunch", category: "tech", authorityScore: 80, language: "en", description: "科技新闻媒体", isPreset: true, type: "external" as const, url: "https://techcrunch.com", isActive: true },
    { domain: "harvard.edu", displayName: "Harvard University", category: "academic", authorityScore: 95, language: "en", description: "哈佛大学", isPreset: true, type: "external" as const, url: "https://harvard.edu", isActive: true },
    { domain: "gov.cn", displayName: "中国政府网", category: "government", authorityScore: 90, language: "zh", description: "中国政府官方网站", isPreset: true, type: "external" as const, url: "https://gov.cn", isActive: true },
  ];
  for (const p of presets) {
    await db.insert(hyperlinks).values(p);
  }
}

// ─── Indexing Records ─────────────────────────────────────────────────────────
export async function getIndexingRecords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(indexingRecords).orderBy(desc(indexingRecords.createdAt));
}

export async function createIndexingRecord(data: InsertIndexingRecord) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(indexingRecords).values(data);
}

export async function updateIndexingRecord(id: number, data: Partial<InsertIndexingRecord>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(indexingRecords).set(data).where(eq(indexingRecords.id, id));
}

export async function deleteIndexingRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(indexingRecords).where(eq(indexingRecords.id, id));
}

// ─── System Settings ──────────────────────────────────────────────────────────
export async function getSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings);
}

export async function getSettingByKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return result[0];
}

export async function upsertSetting(key: string, value: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(systemSettings).values({ key, value, description })
    .onDuplicateKeyUpdate({ set: { value, ...(description ? { description } : {}) } });
}

export async function seedDefaultSettings() {
  const db = await getDb();
  if (!db) return;
  const defaults = [
    { key: "ai_api_key", value: "", description: "AI API Key（支持 OpenAI / Groq 等兼容接口）" },
    { key: "ai_base_url", value: "https://api.openai.com/v1", description: "AI API Base URL" },
    { key: "ai_model", value: "gpt-4.1-mini", description: "默认 AI 模型" },
    { key: "ai_engine", value: "openai", description: "AI 引擎选择: openai / groq / gemini" },
    { key: "default_daily_limit", value: "5", description: "默认每日发布上限" },
    { key: "content_min_words", value: "800", description: "内容最少字数" },
    { key: "quality_threshold", value: "70", description: "内容质量评分门槛（0-100）" },
    { key: "publish_interval_min", value: "30", description: "发布间隔最小值（分钟）" },
    { key: "publish_interval_max", value: "120", description: "发布间隔最大值（分钟）" },
    { key: "site_name", value: "GSP Publisher", description: "站点名称" },
  ];
  for (const d of defaults) {
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, d.key)).limit(1);
    if (existing.length === 0) {
      await db.insert(systemSettings).values(d);
    }
  }
}

// ─── Keywords ─────────────────────────────────────────────────────────────────
export async function getKeywords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keywords).orderBy(desc(keywords.createdAt));
}

export async function createKeyword(data: InsertKeyword) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(keywords).values(data);
}

export async function updateKeyword(id: number, data: Partial<InsertKeyword>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(keywords).set(data).where(eq(keywords.id, id));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { accountCount: 0, todayPublished: 0, materialCount: 0, indexedCount: 0, totalPublished: 0, pendingTasks: 0, indexRate: 0 };

  const [accountRows] = await db.select({ count: count() }).from(accounts);
  const [materialRows] = await db.select({ count: count() }).from(materials);
  const [taskRows] = await db.select({ count: count() }).from(publishTasks).where(eq(publishTasks.status, "success"));
  const [pendingRows] = await db.select({ count: count() }).from(publishTasks).where(eq(publishTasks.status, "pending"));
  const [indexedRows] = await db.select({ count: count() }).from(indexingRecords).where(eq(indexingRecords.indexStatus, "indexed"));
  const [totalIndexRows] = await db.select({ count: count() }).from(indexingRecords);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayRows] = await db.select({ count: count() }).from(publishTasks)
    .where(and(eq(publishTasks.status, "success"), sql`${publishTasks.completedAt} >= ${today}`));

  const totalIndex = totalIndexRows?.count ?? 0;
  const indexed = indexedRows?.count ?? 0;
  const indexRate = totalIndex > 0 ? Math.round((indexed / totalIndex) * 100) : 0;

  return {
    accountCount: accountRows?.count ?? 0,
    todayPublished: todayRows?.count ?? 0,
    materialCount: materialRows?.count ?? 0,
    indexedCount: indexed,
    totalPublished: taskRows?.count ?? 0,
    pendingTasks: pendingRows?.count ?? 0,
    indexRate,
  };
}
