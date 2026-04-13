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
} from "./db";

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

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
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
});

export type AppRouter = typeof appRouter;
