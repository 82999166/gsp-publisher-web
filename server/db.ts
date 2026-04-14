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
  seoTemplates, InsertSeoTemplate,
  googleSites, InsertGoogleSite,
  generationBatches, InsertGenerationBatch,
  generationItems, InsertGenerationItem,
  publishedPages, InsertPublishedPage,
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

// ─── SEO Templates ────────────────────────────────────────────────────────────
export async function getSeoTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoTemplates).where(eq(seoTemplates.isActive, true)).orderBy(desc(seoTemplates.createdAt));
}

export async function getSeoTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(seoTemplates).where(eq(seoTemplates.id, id)).limit(1);
  return result[0];
}

export async function createSeoTemplate(data: InsertSeoTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(seoTemplates).values(data);
}

export async function updateSeoTemplate(id: number, data: Partial<InsertSeoTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(seoTemplates).set(data).where(eq(seoTemplates.id, id));
}

export async function deleteSeoTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(seoTemplates).where(eq(seoTemplates.id, id));
}

// 预置 5 种 SEO 模板
export async function seedSeoTemplates() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(seoTemplates).where(eq(seoTemplates.isPreset, true)).limit(1);
  if (existing.length > 0) return;

  const presets: InsertSeoTemplate[] = [
    {
      name: "信息型文章",
      type: "informational",
      description: "适合解释性内容，如「什么是X」「X的定义与原理」",
      structure: {
        sections: [
          { type: "intro", label: "引言段落", hint: "在前100字内自然包含核心关键词，简述文章价值" },
          { type: "h2", label: "什么是{keyword}？", hint: "定义与背景，150-200字" },
          { type: "h2", label: "{keyword}的主要特点", hint: "3-5个要点，每个用H3标注，每点50-80字" },
          { type: "h2", label: "{keyword}的应用场景", hint: "2-3个典型场景，200字" },
          { type: "h2", label: "常见问题解答（FAQ）", hint: "3-5个Q&A，每个问题用H3标注" },
          { type: "conclusion", label: "总结", hint: "重申核心价值，包含CTA，100字" },
          { type: "internal_links", label: "相关文章", hint: "自动插入2-3条同站内链" },
          { type: "external_links", label: "参考资料", hint: "1-2条权威外链（维基百科等）" }
        ]
      },
      promptTemplate: "你是SEO内容专家。请为关键词「{keyword}」创作一篇信息型文章。要求：1)语言{language}；2)不少于{minWords}字；3)严格按照H1→H2→H3层级组织；4)关键词密度1-2%，自然融入；5)包含FAQ部分；6)Markdown格式输出。",
      minWords: 800,
      maxWords: 1200,
      isPreset: true,
      isActive: true,
    },
    {
      name: "操作指南型",
      type: "howto",
      description: "适合步骤性内容，如「如何做X」「X的完整教程」",
      structure: {
        sections: [
          { type: "intro", label: "引言", hint: "说明本指南能解决什么问题，100字" },
          { type: "h2", label: "准备工作", hint: "列出所需工具/材料/前提条件" },
          { type: "h2", label: "详细步骤", hint: "5-8个步骤，每步用H3标注，包含具体操作说明" },
          { type: "h2", label: "注意事项与常见错误", hint: "3-5条注意事项" },
          { type: "h2", label: "常见问题解答", hint: "3个Q&A" },
          { type: "conclusion", label: "总结", hint: "总结步骤，鼓励读者行动" },
          { type: "internal_links", label: "相关教程", hint: "自动插入2-3条同站内链" }
        ]
      },
      promptTemplate: "你是SEO内容专家。请为关键词「{keyword}」创作一篇操作指南型文章。要求：1)语言{language}；2)不少于{minWords}字；3)包含清晰的步骤编号；4)每步骤有具体可操作的说明；5)关键词密度1-2%；6)Markdown格式。",
      minWords: 1000,
      maxWords: 1500,
      isPreset: true,
      isActive: true,
    },
    {
      name: "对比评测型",
      type: "comparison",
      description: "适合产品/方案对比，如「X vs Y」「最佳X选择」",
      structure: {
        sections: [
          { type: "intro", label: "引言", hint: "说明对比的背景和意义，100字" },
          { type: "h2", label: "对比概览", hint: "用表格形式列出主要对比维度" },
          { type: "h2", label: "方案A详解", hint: "优缺点分析，150字" },
          { type: "h2", label: "方案B详解", hint: "优缺点分析，150字" },
          { type: "h2", label: "如何选择？", hint: "针对不同场景给出选择建议" },
          { type: "conclusion", label: "总结推荐", hint: "给出明确推荐，包含CTA" },
          { type: "internal_links", label: "相关对比", hint: "自动插入2-3条同站内链" }
        ]
      },
      promptTemplate: "你是SEO内容专家。请为关键词「{keyword}」创作一篇对比评测型文章。要求：1)语言{language}；2)不少于{minWords}字；3)包含对比表格；4)客观分析各方案优缺点；5)给出明确选择建议；6)Markdown格式。",
      minWords: 1000,
      maxWords: 1500,
      isPreset: true,
      isActive: true,
    },
    {
      name: "列表型文章",
      type: "listicle",
      description: "适合资源汇总，如「10个最佳X」「X的5大优势」",
      structure: {
        sections: [
          { type: "intro", label: "引言", hint: "说明列表的价值，100字" },
          { type: "h2", label: "第1-N项：{item}", hint: "每项用H2标注，包含简介+特点+使用场景，每项100-150字" },
          { type: "h2", label: "如何选择适合你的？", hint: "选择建议，100字" },
          { type: "conclusion", label: "总结", hint: "汇总要点，包含CTA" },
          { type: "internal_links", label: "相关推荐", hint: "自动插入2-3条同站内链" }
        ]
      },
      promptTemplate: "你是SEO内容专家。请为关键词「{keyword}」创作一篇列表型文章（如「10个最佳{keyword}」）。要求：1)语言{language}；2)不少于{minWords}字；3)列表项目不少于5个；4)每项有独立H2标题；5)关键词密度1-2%；6)Markdown格式。",
      minWords: 800,
      maxWords: 1200,
      isPreset: true,
      isActive: true,
    },
    {
      name: "本地化型文章",
      type: "local",
      description: "适合地域性内容，如「X城市的Y」「本地X指南」",
      structure: {
        sections: [
          { type: "intro", label: "引言", hint: "介绍本地背景，100字" },
          { type: "h2", label: "{location}的{keyword}概况", hint: "本地特色介绍，200字" },
          { type: "h2", label: "推荐选择", hint: "3-5个本地推荐，每个用H3标注" },
          { type: "h2", label: "实用信息", hint: "地址、交通、价格等实用信息" },
          { type: "h2", label: "常见问题", hint: "3个本地化Q&A" },
          { type: "conclusion", label: "总结", hint: "总结推荐，包含CTA" },
          { type: "internal_links", label: "相关本地内容", hint: "自动插入2-3条同站内链" }
        ]
      },
      promptTemplate: "你是SEO内容专家。请为关键词「{keyword}」创作一篇本地化文章。要求：1)语言{language}；2)不少于{minWords}字；3)突出本地特色和实用信息；4)包含具体地点/场景；5)关键词密度1-2%；6)Markdown格式。",
      minWords: 600,
      maxWords: 1000,
      isPreset: true,
      isActive: true,
    },
  ];

  for (const t of presets) {
    await db.insert(seoTemplates).values(t);
  }
}

// ─── Google Sites ─────────────────────────────────────────────────────────────
export async function getGoogleSites(accountId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = accountId ? [eq(googleSites.accountId, accountId)] : [];
  return db.select().from(googleSites)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(googleSites.createdAt));
}

export async function getGoogleSiteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(googleSites).where(eq(googleSites.id, id)).limit(1);
  return result[0];
}

export async function createGoogleSite(data: InsertGoogleSite) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(googleSites).values(data);
}

export async function updateGoogleSite(id: number, data: Partial<InsertGoogleSite>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(googleSites).set(data).where(eq(googleSites.id, id));
}

export async function deleteGoogleSite(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(googleSites).where(eq(googleSites.id, id));
}

// ─── Generation Batches ────────────────────────────────────────────────────────
export async function getGenerationBatches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generationBatches).orderBy(desc(generationBatches.createdAt));
}

export async function getGenerationBatchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(generationBatches).where(eq(generationBatches.id, id)).limit(1);
  return result[0];
}

export async function createGenerationBatch(data: InsertGenerationBatch) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(generationBatches).values(data);
  return result[0];
}

export async function updateGenerationBatch(id: number, data: Partial<InsertGenerationBatch>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(generationBatches).set(data).where(eq(generationBatches.id, id));
}

export async function deleteGenerationBatch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(generationItems).where(eq(generationItems.batchId, id));
  await db.delete(generationBatches).where(eq(generationBatches.id, id));
}

// ─── Generation Items ──────────────────────────────────────────────────────────
export async function getGenerationItemsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generationItems)
    .where(eq(generationItems.batchId, batchId))
    .orderBy(generationItems.id);
}

export async function createGenerationItems(items: InsertGenerationItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (items.length === 0) return;
  // Insert in chunks of 500 to avoid query size limits
  for (let i = 0; i < items.length; i += 500) {
    await db.insert(generationItems).values(items.slice(i, i + 500));
  }
}

export async function updateGenerationItem(id: number, data: Partial<InsertGenerationItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(generationItems).set(data).where(eq(generationItems.id, id));
}

export async function getPendingGenerationItems(batchId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generationItems)
    .where(and(eq(generationItems.batchId, batchId), eq(generationItems.status, "pending")))
    .limit(limit)
    .orderBy(generationItems.id);
}

export async function countGenerationItems(batchId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, failed: 0, pending: 0 };
  const rows = await db.select({
    status: generationItems.status,
    cnt: count(),
  }).from(generationItems).where(eq(generationItems.batchId, batchId)).groupBy(generationItems.status);
  const result = { total: 0, completed: 0, failed: 0, pending: 0 };
  for (const r of rows) {
    result.total += Number(r.cnt);
    if (r.status === "completed") result.completed = Number(r.cnt);
    else if (r.status === "failed") result.failed = Number(r.cnt);
    else if (r.status === "pending") result.pending = Number(r.cnt);
  }
  return result;
}

// ─── 已发布页面记录 ────────────────────────────────────────────────────────────
export async function getPublishedPages(opts?: {
  keyword?: string;
  indexStatus?: string;
  accountId?: number;
  siteId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let q = db.select().from(publishedPages);
  const conditions = [];
  if (opts?.keyword) conditions.push(like(publishedPages.keyword, `%${opts.keyword}%`));
  if (opts?.indexStatus) conditions.push(eq(publishedPages.indexStatus, opts.indexStatus as any));
  if (opts?.accountId) conditions.push(eq(publishedPages.accountId, opts.accountId));
  if (opts?.siteId) conditions.push(eq(publishedPages.siteId, opts.siteId));
  if (conditions.length > 0) q = (q as any).where(and(...conditions));
  return (q as any)
    .orderBy(desc(publishedPages.publishedAt))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

export async function countPublishedPages() {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ cnt: count() }).from(publishedPages);
  return Number(rows[0]?.cnt ?? 0);
}

export async function createPublishedPage(data: InsertPublishedPage) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(publishedPages).values(data);
}

export async function updatePublishedPage(id: number, data: Partial<InsertPublishedPage>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(publishedPages).set(data).where(eq(publishedPages.id, id));
}

export async function deletePublishedPage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(publishedPages).where(eq(publishedPages.id, id));
}

export async function getPublishedPageStats() {
  const db = await getDb();
  if (!db) return { total: 0, indexed: 0, notIndexed: 0, pending: 0, gscSubmitted: 0 };
  const rows = await db.select({
    indexStatus: publishedPages.indexStatus,
    cnt: count(),
  }).from(publishedPages).groupBy(publishedPages.indexStatus);
  const result = { total: 0, indexed: 0, notIndexed: 0, pending: 0, gscSubmitted: 0 };
  for (const r of rows) {
    result.total += Number(r.cnt);
    if (r.indexStatus === "indexed") result.indexed = Number(r.cnt);
    else if (r.indexStatus === "not_indexed") result.notIndexed = Number(r.cnt);
    else if (r.indexStatus === "pending") result.pending = Number(r.cnt);
  }
  const gscRows = await db.select({ cnt: count() }).from(publishedPages)
    .where(eq(publishedPages.gscSubmitted, 1 as any));
  result.gscSubmitted = Number(gscRows[0]?.cnt ?? 0);
  return result;
}
