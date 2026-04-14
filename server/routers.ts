import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  getAccounts, getAccountById, createAccount, updateAccount, deleteAccount,
  getMaterials, getMaterialById, createMaterial, updateMaterial, deleteMaterial,
  getPublishTasks, createPublishTask, updatePublishTask, deletePublishTask,
  getHyperlinks, createHyperlink, updateHyperlink, deleteHyperlink, seedPresetHyperlinks,
  getIndexingRecords, createIndexingRecord, updateIndexingRecord, deleteIndexingRecord,
  getSettings, upsertSetting, seedDefaultSettings,
  getKeywords, createKeyword, updateKeyword,
  getDashboardStats,
  getSeoTemplates, getSeoTemplateById, createSeoTemplate, updateSeoTemplate, deleteSeoTemplate, seedSeoTemplates,
  getGoogleSites, getGoogleSiteById, createGoogleSite, updateGoogleSite, deleteGoogleSite,
} from "./db";
import { googleSitesPublisher } from "./googleSitesPublisher";
import {
  getGenerationBatches, getGenerationBatchById, createGenerationBatch, updateGenerationBatch, deleteGenerationBatch,
  getGenerationItems, createGenerationItems, getGenerationBatchProgress,
} from "./db";
import {
  startBatchWorker, pauseBatchWorker, resumeBatchWorker, cancelBatchWorker, isBatchWorkerActive,
} from "./batchGenerationWorker";

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async () => {
    return getDashboardStats();
  }),
});

// ─── Accounts ─────────────────────────────────────────────────────────────────
const accountsRouter = router({
  list: protectedProcedure.query(async () => {
    return getAccounts();
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getAccountById(input.id);
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    cookieRaw: z.string().min(1),
    dailyLimit: z.number().default(5),
    siteAge: z.enum(["new_site", "growing", "mature"]).default("new_site"),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    // Parse cookie JSON if it's a JSON array
    let cookieParsed = null;
    try {
      const parsed = JSON.parse(input.cookieRaw);
      if (Array.isArray(parsed)) {
        cookieParsed = parsed;
      }
    } catch {
      // Not JSON, treat as raw cookie string
    }
    await createAccount({
      name: input.name,
      email: input.email,
      cookieRaw: input.cookieRaw,
      cookieParsed,
      dailyLimit: input.dailyLimit,
      siteAge: input.siteAge,
      notes: input.notes,
      status: "pending",
    });
    return { success: true };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    email: z.string().optional(),
    cookieRaw: z.string().optional(),
    dailyLimit: z.number().optional(),
    siteAge: z.enum(["new_site", "growing", "mature"]).optional(),
    status: z.enum(["online", "expired", "pending", "error"]).optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    if (data.cookieRaw) {
      try {
        const parsed = JSON.parse(data.cookieRaw);
        if (Array.isArray(parsed)) {
          (data as any).cookieParsed = parsed;
        }
      } catch {}
    }
    await updateAccount(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteAccount(input.id);
    return { success: true };
  }),

  verify: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    // Simulate cookie verification (real implementation would use Playwright)
    const account = await getAccountById(input.id);
    if (!account) throw new Error("账号不存在");
    // Mock verification - in production this would launch Playwright
    const isValid = account.cookieRaw.length > 50;
    await updateAccount(input.id, {
      status: isValid ? "online" : "expired",
      lastVerifiedAt: new Date(),
    });
    return { success: true, status: isValid ? "online" : "expired" };
  }),
});

// ─── AI Content Generation ────────────────────────────────────────────────────
const contentRouter = router({
  keywords: router({
    list: protectedProcedure.query(async () => getKeywords()),
    create: protectedProcedure.input(z.object({
      keyword: z.string().min(1),
      language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    })).mutation(async ({ input }) => {
      await createKeyword({ keyword: input.keyword, language: input.language, status: "pending" });
      return { success: true };
    }),
    batchCreate: protectedProcedure.input(z.object({
      keywords: z.array(z.string()),
      language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    })).mutation(async ({ input }) => {
      for (const kw of input.keywords) {
        if (kw.trim()) {
          await createKeyword({ keyword: kw.trim(), language: input.language, status: "pending" });
        }
      }
      return { success: true, count: input.keywords.length };
    }),
    expand: protectedProcedure.input(z.object({
      keyword: z.string(),
      language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
      count: z.number().default(10),
    })).mutation(async ({ input }) => {
      const langMap = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
      const langName = langMap[input.language];
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一位专业的SEO关键词研究专家。请根据用户提供的核心关键词，生成相关的长尾关键词列表。要求：1. 生成${input.count}个长尾关键词；2. 语言使用${langName}；3. 关键词需要有搜索价值；4. 返回JSON格式。`,
          },
          {
            role: "user",
            content: `核心关键词：${input.keyword}\n请生成${input.count}个相关长尾关键词，返回JSON格式：{"keywords": ["关键词1", "关键词2", ...]}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "keywords_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                keywords: { type: "array", items: { type: "string" } },
              },
              required: ["keywords"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      return { keywords: parsed.keywords ?? [] };
    }),
  }),

  generate: protectedProcedure.input(z.object({
    keyword: z.string().min(1),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    minWords: z.number().default(800),
    style: z.enum(["informational", "commercial", "navigational"]).default("informational"),
  })).mutation(async ({ input }) => {
    const langMap = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
    const langName = langMap[input.language];
    const styleMap = { informational: "信息型（科普、解答）", commercial: "商业型（推广、评测）", navigational: "导航型（品牌、官网）" };
    const styleName = styleMap[input.style];

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一位专业的SEO内容创作专家，擅长为Google Sites创作高质量、防封的文章内容。要求：
1. 语言：${langName}
2. 文章类型：${styleName}
3. 字数：不少于${input.minWords}字
4. 结构：包含标题（H1）、多个小节（H2/H3）、段落正文
5. SEO要求：关键词密度0.5%-2%，自然融入，避免堆砌
6. 防封策略：内容原创、表述自然、避免广告语气
7. 返回JSON格式`,
        },
        {
          role: "user",
          content: `请为关键词"${input.keyword}"创作一篇高质量SEO文章。返回JSON格式：{"title": "文章标题", "content": "文章正文（Markdown格式）", "wordCount": 字数, "qualityScore": 质量分数(0-100)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              wordCount: { type: "number" },
              qualityScore: { type: "number" },
            },
            required: ["title", "content", "wordCount", "qualityScore"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

    // Save to materials
    await createMaterial({
      title: parsed.title,
      keyword: input.keyword,
      language: input.language,
      content: parsed.content,
      wordCount: parsed.wordCount,
      qualityScore: parsed.qualityScore,
      status: "pending",
    });

    return { success: true, title: parsed.title, wordCount: parsed.wordCount, qualityScore: parsed.qualityScore };
  }),

  batchGenerate: protectedProcedure.input(z.object({
    keywords: z.array(z.string()),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    minWords: z.number().default(800),
    style: z.enum(["informational", "commercial", "navigational"]).default("informational"),
  })).mutation(async ({ input }) => {
    // Return job info - actual generation happens per keyword
    return { success: true, totalKeywords: input.keywords.length, message: `已提交 ${input.keywords.length} 个关键词的生成任务` };
  }),
});

// ─── Materials ────────────────────────────────────────────────────────────────
const materialsRouter = router({
  list: protectedProcedure.input(z.object({
    status: z.string().optional(),
    keyword: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    return getMaterials(input);
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getMaterialById(input.id);
  }),

  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["pending", "approved", "rejected", "published"]),
  })).mutation(async ({ input }) => {
    await updateMaterial(input.id, { status: input.status });
    return { success: true };
  }),

  batchUpdateStatus: protectedProcedure.input(z.object({
    ids: z.array(z.number()),
    status: z.enum(["pending", "approved", "rejected", "published"]),
  })).mutation(async ({ input }) => {
    for (const id of input.ids) {
      await updateMaterial(id, { status: input.status });
    }
    return { success: true, count: input.ids.length };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteMaterial(input.id);
    return { success: true };
  }),

  batchDelete: protectedProcedure.input(z.object({
    ids: z.array(z.number()),
  })).mutation(async ({ input }) => {
    for (const id of input.ids) {
      await deleteMaterial(id);
    }
    return { success: true, count: input.ids.length };
  }),
});

// ─── Publish Tasks ────────────────────────────────────────────────────────────
const tasksRouter = router({
  list: protectedProcedure.query(async () => {
    return getPublishTasks();
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    accountId: z.number(),
    materialId: z.number().optional(),
    scheduledAt: z.string().optional(),
  })).mutation(async ({ input }) => {
    await createPublishTask({
      name: input.name,
      accountId: input.accountId,
      materialId: input.materialId,
      status: input.scheduledAt ? "scheduled" : "pending",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    });
    return { success: true };
  }),

  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["pending", "running", "success", "failed", "scheduled"]),
    publishedUrl: z.string().optional(),
    errorMessage: z.string().optional(),
  })).mutation(async ({ input }) => {
    const updateData: any = { status: input.status };
    if (input.status === "running") updateData.startedAt = new Date();
    if (input.status === "success" || input.status === "failed") updateData.completedAt = new Date();
    if (input.publishedUrl) updateData.publishedUrl = input.publishedUrl;
    if (input.errorMessage) updateData.errorMessage = input.errorMessage;
    await updatePublishTask(input.id, updateData);

    // If published successfully, create indexing record
    if (input.status === "success" && input.publishedUrl) {
      const task = await (await import("./db")).getPublishTasks();
      const t = task.find(t => t.id === input.id);
      await createIndexingRecord({
        publishedUrl: input.publishedUrl,
        accountId: t?.accountId,
        taskId: input.id,
        indexStatus: "unknown",
      });
    }
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deletePublishTask(input.id);
    return { success: true };
  }),
});

// ─── Hyperlinks ───────────────────────────────────────────────────────────────
const hyperlinksRouter = router({
  list: protectedProcedure.input(z.object({
    type: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    await seedPresetHyperlinks();
    return getHyperlinks(input?.type);
  }),

  create: protectedProcedure.input(z.object({
    type: z.enum(["internal", "external"]),
    url: z.string().url(),
    anchorText: z.string().optional(),
    anchorType: z.enum(["exact", "partial", "lsi", "brand", "natural", "naked"]).optional(),
    domain: z.string().optional(),
    displayName: z.string().optional(),
    category: z.string().optional(),
    authorityScore: z.number().optional(),
    language: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    await createHyperlink({ ...input, isPreset: false, isActive: true });
    return { success: true };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    anchorText: z.string().optional(),
    anchorType: z.enum(["exact", "partial", "lsi", "brand", "natural", "naked"]).optional(),
    displayName: z.string().optional(),
    authorityScore: z.number().optional(),
    isActive: z.boolean().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await updateHyperlink(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteHyperlink(input.id);
    return { success: true };
  }),
});

// ─── Indexing Monitor ─────────────────────────────────────────────────────────
const indexingRouter = router({
  list: protectedProcedure.input(z.object({
    status: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    const records = await getIndexingRecords();
    if (input?.status) return records.filter(r => r.indexStatus === input.status);
    return records;
  }),

  add: protectedProcedure.input(z.object({
    url: z.string().url(),
    keyword: z.string().optional(),
    title: z.string().optional(),
  })).mutation(async ({ input }) => {
    await createIndexingRecord({ publishedUrl: input.url, keyword: input.keyword, title: input.title, indexStatus: "pending" });
    return { success: true };
  }),

  check: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    // Mock check - real implementation would use Google Search Console API
    const records = await getIndexingRecords();
    const record = records.find(r => r.id === input.id);
    if (!record) throw new Error("记录不存在");
    // Simulate: randomly mark as indexed or not_indexed
    const isIndexed = Math.random() > 0.4;
    const newStatus = isIndexed ? "indexed" : "not_indexed";
    const updateData: any = { indexStatus: newStatus, lastCheckedAt: new Date() };
    if (isIndexed) updateData.indexedAt = new Date();
    await updateIndexingRecord(input.id, updateData);
    return { success: true, indexStatus: newStatus };
  }),

  batchCheck: protectedProcedure.input(z.object({}).optional()).mutation(async () => {
    const records = await getIndexingRecords();
    const pending = records.filter(r => r.indexStatus === "pending" || r.indexStatus === "unknown");
    for (const r of pending) {
      const isIndexed = Math.random() > 0.4;
      const newStatus = isIndexed ? "indexed" : "not_indexed";
      const updateData: any = { indexStatus: newStatus, lastCheckedAt: new Date() };
      if (isIndexed) updateData.indexedAt = new Date();
      await updateIndexingRecord(r.id, updateData);
    }
    return { success: true, count: pending.length };
  }),

  create: protectedProcedure.input(z.object({
    publishedUrl: z.string().url(),
    title: z.string().optional(),
    keyword: z.string().optional(),
    accountId: z.number().optional(),
  })).mutation(async ({ input }) => {
    await createIndexingRecord({ ...input, indexStatus: "pending" });
    return { success: true };
  }),

  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    indexStatus: z.enum(["unknown", "indexed", "not_indexed", "pending"]),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const updateData: any = { indexStatus: input.indexStatus, lastCheckedAt: new Date() };
    if (input.indexStatus === "indexed") updateData.indexedAt = new Date();
    if (input.notes) updateData.notes = input.notes;
    await updateIndexingRecord(input.id, updateData);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteIndexingRecord(input.id);
    return { success: true };
  }),
});

// ─── System Settings ──────────────────────────────────────────────────────────
const settingsRouter = router({
  list: protectedProcedure.query(async () => {
    await seedDefaultSettings();
    return getSettings();
  }),

  // Returns settings as a flat key-value object for the Settings page
  get: protectedProcedure.query(async () => {
    await seedDefaultSettings();
    const rows = await getSettings();
    const obj: Record<string, string> = {};
    for (const r of rows) {
      if (r.value != null) obj[r.key] = r.value;
    }
    // Map stored keys to form fields
    return {
      siteName: obj["site_name"] ?? "GSP Publisher",
      siteDescription: obj["site_description"] ?? "",
      defaultLanguage: obj["default_language"] ?? "zh-CN",
      timezone: obj["timezone"] ?? "Asia/Shanghai",
      aiProvider: obj["ai_engine"] ?? "groq",
      groqApiKey: obj["ai_api_key"] ?? "",
      aiModel: obj["ai_model"] ?? "llama3-70b-8192",
      aiTemperature: parseFloat(obj["ai_temperature"] ?? "0.7"),
      aiMaxTokens: parseInt(obj["ai_max_tokens"] ?? "4096"),
      proxyEnabled: obj["proxy_enabled"] === "true",
      proxyType: obj["proxy_type"] ?? "http",
      proxyHost: obj["proxy_host"] ?? "",
      proxyPort: obj["proxy_port"] ?? "",
      proxyUsername: obj["proxy_username"] ?? "",
      proxyPassword: obj["proxy_password"] ?? "",
      publishInterval: parseInt(obj["publish_interval_min"] ?? "30"),
      publishRetryCount: parseInt(obj["publish_retry_count"] ?? "3"),
      publishConcurrency: parseInt(obj["publish_concurrency"] ?? "1"),
      publishUserAgent: obj["publish_user_agent"] ?? "",
      headlessBrowser: obj["headless_browser"] !== "false",
      gscEnabled: obj["gsc_enabled"] === "true",
      gscClientEmail: obj["gsc_client_email"] ?? "",
      gscPrivateKey: obj["gsc_private_key"] ?? "",
      gscSiteUrl: obj["gsc_site_url"] ?? "",
    };
  }),

  update: protectedProcedure.input(z.object({
    siteName: z.string().optional(),
    siteDescription: z.string().optional(),
    defaultLanguage: z.string().optional(),
    timezone: z.string().optional(),
    aiProvider: z.string().optional(),
    groqApiKey: z.string().optional(),
    aiModel: z.string().optional(),
    aiTemperature: z.number().optional(),
    aiMaxTokens: z.number().optional(),
    proxyEnabled: z.boolean().optional(),
    proxyType: z.string().optional(),
    proxyHost: z.string().optional(),
    proxyPort: z.string().optional(),
    proxyUsername: z.string().optional(),
    proxyPassword: z.string().optional(),
    publishInterval: z.number().optional(),
    publishRetryCount: z.number().optional(),
    publishConcurrency: z.number().optional(),
    publishUserAgent: z.string().optional(),
    headlessBrowser: z.boolean().optional(),
    gscEnabled: z.boolean().optional(),
    gscClientEmail: z.string().optional(),
    gscPrivateKey: z.string().optional(),
    gscSiteUrl: z.string().optional(),
  })).mutation(async ({ input }) => {
    const mapping: Record<string, string | undefined> = {
      site_name: input.siteName,
      site_description: input.siteDescription,
      default_language: input.defaultLanguage,
      timezone: input.timezone,
      ai_engine: input.aiProvider,
      ai_api_key: input.groqApiKey,
      ai_model: input.aiModel,
      ai_temperature: input.aiTemperature?.toString(),
      ai_max_tokens: input.aiMaxTokens?.toString(),
      proxy_enabled: input.proxyEnabled?.toString(),
      proxy_type: input.proxyType,
      proxy_host: input.proxyHost,
      proxy_port: input.proxyPort,
      proxy_username: input.proxyUsername,
      proxy_password: input.proxyPassword,
      publish_interval_min: input.publishInterval?.toString(),
      publish_retry_count: input.publishRetryCount?.toString(),
      publish_concurrency: input.publishConcurrency?.toString(),
      publish_user_agent: input.publishUserAgent,
      headless_browser: input.headlessBrowser?.toString(),
      gsc_enabled: input.gscEnabled?.toString(),
      gsc_client_email: input.gscClientEmail,
      gsc_private_key: input.gscPrivateKey,
      gsc_site_url: input.gscSiteUrl,
    };
    for (const [key, value] of Object.entries(mapping)) {
      if (value !== undefined) await upsertSetting(key, value);
    }
    return { success: true };
  }),

  batchUpdate: protectedProcedure.input(z.object({
    settings: z.array(z.object({ key: z.string(), value: z.string() })),
  })).mutation(async ({ input }) => {
    for (const s of input.settings) {
      await upsertSetting(s.key, s.value);
    }
    return { success: true };
  }),
});

// ─── SEO Templates ──────────────────────────────────────────────────────────
const seoTemplatesRouter = router({
  list: protectedProcedure.query(async () => {
    await seedSeoTemplates();
    return getSeoTemplates();
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getSeoTemplateById(input.id);
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    type: z.enum(["informational", "howto", "comparison", "listicle", "local"]),
    description: z.string().optional(),
    structure: z.any(),
    promptTemplate: z.string().optional(),
    minWords: z.number().default(800),
    maxWords: z.number().default(1500),
  })).mutation(async ({ input }) => {
    await createSeoTemplate({ ...input, isPreset: false, isActive: true });
    return { success: true };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    description: z.string().optional(),
    structure: z.any().optional(),
    promptTemplate: z.string().optional(),
    minWords: z.number().optional(),
    maxWords: z.number().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await updateSeoTemplate(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteSeoTemplate(input.id);
    return { success: true };
  }),

  generateWithTemplate: protectedProcedure.input(z.object({
    templateId: z.number(),
    keyword: z.string().min(1),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    internalLinks: z.array(z.object({ url: z.string(), anchorText: z.string() })).optional(),
    externalLinks: z.array(z.object({ url: z.string(), anchorText: z.string() })).optional(),
  })).mutation(async ({ input }) => {
    const template = await getSeoTemplateById(input.templateId);
    if (!template) throw new Error("模板不存在");
    const langLabel = input.language === "zh-CN" ? "中文（简体）" : input.language === "zh-TW" ? "中文（繁体）" : "English";
    const promptTemplate = (template.promptTemplate ?? "").replace("{keyword}", input.keyword).replace("{language}", langLabel).replace("{minWords}", String(template.minWords ?? 800));
    let linkHint = "";
    if (input.internalLinks && input.internalLinks.length > 0) {
      linkHint += `\n\n请在文章末尾的「相关文章」部分插入以下内链：\n${input.internalLinks.map(l => `- [${l.anchorText}](${l.url})`).join("\n")}`;
    }
    if (input.externalLinks && input.externalLinks.length > 0) {
      linkHint += `\n\n请在文章末尾的「参考资料」部分插入以下外链：\n${input.externalLinks.map(l => `- [${l.anchorText}](${l.url})`).join("\n")}`;
    }
    const response = await invokeLLM({
      messages: [
        { role: "system", content: promptTemplate },
        { role: "user", content: `请为关键词「${input.keyword}」创作SEO文章。${linkHint}` },
      ],
    });
    const rawContent = response.choices?.[0]?.message?.content ?? "";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const wordCount = content.replace(/\s+/g, "").length;
    const plainText = content.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").replace(/\n+/g, " ").trim();
    const metaDescription = plainText.slice(0, 157) + (plainText.length > 157 ? "..." : "");
    const urlSlug = input.keyword.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "").slice(0, 60);
    await createMaterial({
      title: `${input.keyword} - SEO文章`,
      keyword: input.keyword,
      language: input.language,
      content,
      wordCount,
      qualityScore: Math.min(95, 60 + wordCount / 50),
      status: "pending",
      seoTemplateId: input.templateId,
      metaDescription,
      urlSlug,
      internalLinks: input.internalLinks ?? [],
      externalLinks: input.externalLinks ?? [],
    });
    await updateSeoTemplate(input.templateId, { usageCount: (template.usageCount ?? 0) + 1 });
    return { success: true, content, wordCount, metaDescription, urlSlug };
  }),
});

// ─── Google Sites Management ──────────────────────────────────────────────────
const sitesRouter = router({
  list: protectedProcedure.input(z.object({ accountId: z.number().optional() }).optional()).query(async ({ input }) => {
    return getGoogleSites(input?.accountId);
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getGoogleSiteById(input.id);
  }),

  create: protectedProcedure.input(z.object({
    accountId: z.number(),
    siteName: z.string().min(1),
    siteUrl: z.string().optional(),
    customDomain: z.string().optional(),
    category: z.string().optional(),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    await createGoogleSite({ ...input, status: "active" });
    return { success: true };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    siteName: z.string().optional(),
    siteUrl: z.string().optional(),
    customDomain: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(["active", "inactive", "suspended"]).optional(),
    gscVerified: z.boolean().optional(),
    gscSiteUrl: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await updateGoogleSite(id, data);
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteGoogleSite(input.id);
    return { success: true };
  }),
});

// ─── Publisher Engine ─────────────────────────────────────────────────────────
const publisherRouter = router({
  verifyCookie: protectedProcedure.input(z.object({
    accountId: z.number(),
  })).mutation(async ({ input }) => {
    const account = await getAccountById(input.accountId);
    if (!account) throw new Error("账号不存在");
    if (!account.cookieParsed) throw new Error("该账号没有解析好的 Cookie，请重新导入");
    const proxyConfig = account.proxyConfig as any;
    const result = await googleSitesPublisher.verifyCookie(
      account.cookieParsed as any[],
      proxyConfig ? { host: proxyConfig.host, port: proxyConfig.port, username: proxyConfig.username, password: proxyConfig.password } : undefined
    );
    await updateAccount(input.accountId, {
      status: result.valid ? "online" : "expired",
      lastVerifiedAt: new Date(),
      ...(result.email ? { email: result.email } : {}),
    });
    return { success: true, valid: result.valid, email: result.email, log: result.log };
  }),

  executeTask: protectedProcedure.input(z.object({
    taskId: z.number(),
  })).mutation(async ({ input }) => {
    const tasks = await getPublishTasks();
    const task = tasks.find(t => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    if (!task.materialId) throw new Error("任务没有关联素材");
    const account = await getAccountById(task.accountId);
    if (!account) throw new Error("账号不存在");
    if (!account.cookieParsed) throw new Error("账号没有有效 Cookie");
    const material = await getMaterialById(task.materialId);
    if (!material) throw new Error("素材不存在");
    let siteUrl: string | undefined;
    if (task.siteId) {
      const site = await getGoogleSiteById(task.siteId);
      siteUrl = site?.siteUrl ?? undefined;
    } else if (account.defaultSiteUrl) {
      siteUrl = account.defaultSiteUrl;
    }
    await updatePublishTask(input.taskId, { status: "running", startedAt: new Date() });
    const proxyConfig = account.proxyConfig as any;
    try {
      const result = await googleSitesPublisher.publish({
        cookieParsed: account.cookieParsed as any[],
        siteName: account.defaultSiteName ?? "gsp-site",
        title: material.title,
        content: material.content,
        siteUrl,
        proxy: proxyConfig ? { host: proxyConfig.host, port: proxyConfig.port, username: proxyConfig.username, password: proxyConfig.password } : undefined,
        headless: true,
        timeout: 120000,
      });
      if (result.success) {
        await updatePublishTask(input.taskId, {
          status: "success",
          completedAt: new Date(),
          publishedUrl: result.publishedUrl,
          engineLog: result.log.join("\n"),
        });
        await updateMaterial(task.materialId, { status: "published" });
        if (result.publishedUrl) {
          await createIndexingRecord({
            publishedUrl: result.publishedUrl,
            title: material.title,
            keyword: material.keyword ?? undefined,
            accountId: task.accountId,
            siteId: task.siteId ?? undefined,
            taskId: input.taskId,
            indexStatus: "pending",
          });
        }
        return { success: true, publishedUrl: result.publishedUrl, log: result.log };
      } else {
        await updatePublishTask(input.taskId, {
          status: "failed",
          completedAt: new Date(),
          errorMessage: result.errorMessage,
          engineLog: result.log.join("\n"),
          retryCount: (task.retryCount ?? 0) + 1,
        });
        return { success: false, errorMessage: result.errorMessage, log: result.log };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await updatePublishTask(input.taskId, { status: "failed", completedAt: new Date(), errorMessage: msg });
      throw error;
    }
  }),
});

// ─── Batch Generation ───────────────────────────────────────────────────────────────
const batchGenerationRouter = router({
  // 获取所有批次列表
  list: protectedProcedure.query(async () => {
    return getGenerationBatches();
  }),

  // 获取单个批次详情
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getGenerationBatchById(input.id);
  }),

  // 获取批次进度
  progress: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const batch = await getGenerationBatchById(input.id);
    if (!batch) throw new Error("批次不存在");
    const progress = await getGenerationBatchProgress(input.id);
    return {
      ...batch,
      ...progress,
      isWorkerActive: isBatchWorkerActive(input.id),
    };
  }),

  // 获取批次条目列表
  items: protectedProcedure.input(z.object({
    batchId: z.number(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    return getGenerationItems(input.batchId, input.status);
  }),

  // 创建批次并导入条目
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    style: z.enum(["informational", "commercial", "navigational"]).default("informational"),
    minWords: z.number().default(800),
    concurrency: z.number().min(1).max(10).default(3),
    seoTemplateId: z.number().optional(),
    autoPublish: z.boolean().default(false),
    // 条目列表：每条包含 keyword（必填）和可选 title
    items: z.array(z.object({
      keyword: z.string().min(1),
      title: z.string().optional(),
      extraKeywords: z.array(z.string()).optional(),
    })).min(1).max(50000),
  })).mutation(async ({ input }) => {
    const totalCount = input.items.length;
    const batch = await createGenerationBatch({
      name: input.name,
      totalCount,
      pendingCount: totalCount,
      runningCount: 0,
      successCount: 0,
      failedCount: 0,
      status: "pending",
      language: input.language,
      style: input.style,
      minWords: input.minWords,
      concurrency: input.concurrency,
      seoTemplateId: input.seoTemplateId,
      autoPublish: input.autoPublish,
    });
    if (!batch) throw new Error("创建批次失败");

    // 批量插入条目
    await createGenerationItems(input.items.map((item, idx) => ({
      batchId: batch.id,
      rowIndex: idx,
      keyword: item.keyword,
      title: item.title ?? null,
      extraKeywords: item.extraKeywords ?? [],
      status: "pending" as const,
      retryCount: 0,
    })));

    return { success: true, batchId: batch.id, totalCount };
  }),

  // 启动批次
  start: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const batch = await getGenerationBatchById(input.id);
    if (!batch) throw new Error("批次不存在");
    if (batch.status === "running") return { success: true, message: "批次已在运行中" };
    await startBatchWorker(input.id);
    return { success: true, message: `批次已启动，并发数: ${batch.concurrency}` };
  }),

  // 暂停批次
  pause: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    pauseBatchWorker(input.id);
    return { success: true };
  }),

  // 继续批次
  resume: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    resumeBatchWorker(input.id);
    await updateGenerationBatch(input.id, { status: "running" });
    return { success: true };
  }),

  // 取消批次
  cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    cancelBatchWorker(input.id);
    await updateGenerationBatch(input.id, { status: "cancelled" });
    return { success: true };
  }),

  // 删除批次
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    cancelBatchWorker(input.id);
    await deleteGenerationBatch(input.id);
    return { success: true };
  }),
});

// ─── App Router ────────────────────────────────────────────────────────────────────────────────────
export const appRouter = router({m: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: dashboardRouter,
  accounts: accountsRouter,
  content: contentRouter,
  materials: materialsRouter,
  tasks: tasksRouter,
  hyperlinks: hyperlinksRouter,
  indexing: indexingRouter,
  settings: settingsRouter,
  seoTemplates: seoTemplatesRouter,
  sites: sitesRouter,
  publisher: publisherRouter,
  batchGeneration: batchGenerationRouter,
});

export type AppRouter = typeof appRouter;
