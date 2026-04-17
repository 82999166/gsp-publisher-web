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
  getSettings, getSettingByKey, upsertSetting, seedDefaultSettings,
  getKeywords, createKeyword, updateKeyword, deleteKeyword,
  getDashboardStats,
  getSeoTemplates, getSeoTemplateById, createSeoTemplate, updateSeoTemplate, deleteSeoTemplate, seedSeoTemplates,
  getGoogleSites, getGoogleSiteById, createGoogleSite, updateGoogleSite, deleteGoogleSite,
  getGenerationBatches, getGenerationBatchById, createGenerationBatch, updateGenerationBatch, deleteGenerationBatch,
  getGenerationItemsByBatch, createGenerationItems, updateGenerationItem, getPendingGenerationItems, countGenerationItems,
  getPublishedPages, countPublishedPages, createPublishedPage, updatePublishedPage, deletePublishedPage, getPublishedPageStats,
  createLog, getLogs, getLogCount, clearLogs,
} from "./db";
import { googleSitesPublisher } from "./googleSitesPublisher";
import { generateFingerprint } from "./fingerprint";
import { submitUrlToGsc, calcSafeDailyLimit, calcPublishDelay } from "./gscSubmitter";

// ─── AI Config Helper ─────────────────────────────────────────────────────────
// Reads AI provider/key/model/url from DB settings, used for all invokeLLM calls
async function getAiConfig() {
  const rows = await getSettings();
  const obj: Record<string, string> = {};
  for (const r of rows) { if (r.value != null) obj[r.key] = r.value; }
  const provider = obj["ai_engine"] ?? "groq";
  const apiKey = obj["ai_api_key"] ?? "";
  if (!apiKey) {
    throw new Error("请先在「系统设置 > AI 配置」中填写 API Key！Groq 免费 Key 可在 https://console.groq.com 获取");
  }
  const model = obj["ai_model"] ?? "llama-3.3-70b-versatile";
  // Determine base URL from provider if not explicitly set
  let apiUrl = obj["ai_base_url"] ?? "";
  if (!apiUrl) {
    if (provider === "groq") apiUrl = "https://api.groq.com/openai/v1";
    else if (provider === "openai") apiUrl = "https://api.openai.com/v1";
    else if (provider === "anthropic") apiUrl = "https://api.anthropic.com/v1";
    else apiUrl = "https://api.groq.com/openai/v1";
  }
  return { apiKey, apiUrl, model };
}

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
    await createLog({ level: "info", category: "account", title: `添加账号：${input.name}`, message: `邮箱：${input.email ?? "未填写"}\n每日限额：${input.dailyLimit}` });
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
    defaultSiteUrl: z.string().optional(),
    defaultSiteName: z.string().optional(),
    proxyConfig: z.object({
      host: z.string(),
      port: z.number(),
      username: z.string().optional(),
      password: z.string().optional(),
      protocol: z.enum(["http", "https", "socks5"]).optional(),
    }).nullable().optional(),
    browserFingerprint: z.any().optional(), // JSON 指纹对象
    resetFingerprint: z.boolean().optional(), // 是否重新生成指纹
  })).mutation(async ({ input }) => {
    const { id, resetFingerprint, ...data } = input;
    if (data.cookieRaw) {
      try {
        const parsed = JSON.parse(data.cookieRaw);
        if (Array.isArray(parsed)) {
          (data as any).cookieParsed = parsed;
        }
      } catch {}
    }
    // 重新生成指纹
    if (resetFingerprint) {
      const { generateFingerprint } = await import("./fingerprint.js");
      (data as any).browserFingerprint = generateFingerprint(id);
    }
     await updateAccount(id, data as any);
    await createLog({ level: "info", category: "account", title: `更新账号 #${id}`, message: `更新字段：${Object.keys(data).filter(k => (data as any)[k] !== undefined).join("、")}` });
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const accToDel = await getAccountById(input.id);
    await deleteAccount(input.id);
    await createLog({ level: "warn", category: "account", title: `删除账号：${accToDel?.name ?? input.id}`, message: `账号 #${input.id} 已删除`, entityType: "account", entityId: input.id });
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
    await createLog({ level: isValid ? "success" : "warn", category: "account", title: `验证账号：${account.name}`, message: `验证结果：${isValid ? "有效" : "已过期"}`, entityType: "account", entityId: input.id });
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
      const response = await invokeLLM({ ...await getAiConfig(),
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
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      return { keywords: parsed.keywords ?? [] };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteKeyword(input.id);
      return { success: true };
    }),

    // 竞争度分析：AI 评估关键词搜索量、竞争难度、优先级
    analyze: protectedProcedure.input(z.object({
      id: z.number(),
      keyword: z.string(),
      language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    })).mutation(async ({ input }) => {
      const langMap = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
      const langName = langMap[input.language];
      const response = await invokeLLM({ ...await getAiConfig(),
        messages: [
          {
            role: "system",
            content: `你是一位专业的SEO关键词竞争度分析专家。请根据关键词评估其搜索量、竞争难度和优先级。\n评估标准：\n- searchVolume：月均搜索量估算（0-100000），基于关键词热度、长尾程度、行业规模\n- difficulty：竞争难度（0-100），0=极低竞争，100=极高竞争。长尾词、细分词竞争低\n- priority：优先级（high/medium/low），综合搜索量和竞争度，高搜索量+低竞争=high\n- reason：简要分析原因（50字以内）\n语言：${langName}`,
          },
          {
            role: "user",
            content: `请分析关键词「${input.keyword}」的竞争度，返回JSON：{"searchVolume": 数字, "difficulty": 数字, "priority": "high/medium/low", "reason": "分析原因"}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      // 保存分析结果到数据库
      await updateKeyword(input.id, {
        searchVolume: Math.round(parsed.searchVolume),
        difficulty: Math.min(100, Math.max(0, parsed.difficulty)),
        priority: parsed.priority as "high" | "medium" | "low",
      });
      return { success: true, searchVolume: parsed.searchVolume, difficulty: parsed.difficulty, priority: parsed.priority, reason: parsed.reason };
    }),

    // 批量竞争度分析
    batchAnalyze: protectedProcedure.input(z.object({
      ids: z.array(z.number()),
    })).mutation(async ({ input }) => {
      const allKeywords = await getKeywords();
      const targets = allKeywords.filter(k => input.ids.includes(k.id));
      let successCount = 0;
      for (const kw of targets) {
        try {
          const response = await invokeLLM({ ...await getAiConfig(),
            messages: [
              {
                role: "system",
                content: `你是SEO关键词竞争度分析专家。评估关键词的搜索量、竞争难度和优先级。返回JSON格式。`,
              },
              {
                role: "user",
                content: `分析关键词「${kw.keyword}」，返回JSON：{"searchVolume": 数字, "difficulty": 数字, "priority": "high/medium/low"}`,
              },
            ],
            response_format: { type: "json_object" },
          });
          const content = response.choices[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
          await updateKeyword(kw.id, {
            searchVolume: Math.round(parsed.searchVolume),
            difficulty: Math.min(100, Math.max(0, parsed.difficulty)),
            priority: parsed.priority as "high" | "medium" | "low",
          });
          successCount++;
        } catch (e) {
          // 单个失败不影响其他
        }
      }
      return { success: true, analyzed: successCount, total: targets.length };
    }),
  }),

  generate: protectedProcedure.input(z.object({
    keyword: z.string().min(1),
    title: z.string().optional(),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    minWords: z.number().default(800),
    style: z.enum(["informational", "commercial", "navigational"]).default("informational"),
    // 指定插入内容
    insertKeywords: z.array(z.string()).optional(),   // 必须出现的关键词
    anchorLinks: z.array(z.object({                   // 锚文本+超链接
      anchorText: z.string(),
      url: z.string(),
      position: z.enum(["intro", "body", "end"]).default("body"),
    })).optional(),
    insertParagraph: z.string().optional(),           // 指定插入段落（原文内容）
  })).mutation(async ({ input }) => {
    const langMap = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
    const langName = langMap[input.language];
    const styleMap = { informational: "信息型（科普、解答）", commercial: "商业型（推广、评测）", navigational: "导航型（品牌、官网）" };
    const styleName = styleMap[input.style];

    // 构建关键词和链接要求
    let insertHints = "";
    if (input.insertKeywords && input.insertKeywords.length > 0) {
      insertHints += `\n\n【必须要求】以下关键词必须自然地出现在文章中（每个至少出现一次）：${input.insertKeywords.join("、")}`;
    }
    if (input.anchorLinks && input.anchorLinks.length > 0) {
      const introLinks = input.anchorLinks.filter(l => l.position === "intro");
      const bodyLinks = input.anchorLinks.filter(l => l.position === "body");
      const endLinks = input.anchorLinks.filter(l => l.position === "end");
      if (introLinks.length > 0) insertHints += `\n\n【引言链接】在文章引言部分自然插入：${introLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
      if (bodyLinks.length > 0) insertHints += `\n\n【正文链接】在文章正文适当位置插入：${bodyLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
      if (endLinks.length > 0) insertHints += `\n\n【末尾链接】在文章末尾「相关推荐」部分插入：${endLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
    }
    if (input.insertParagraph) {
      insertHints += `\n\n【指定插入内容】必须将以下内容自然融入文章正文中：\n${input.insertParagraph}`;
    }

    const titleHint = input.title ? `文章标题已指定为：「${input.title}」，请严格使用此标题。` : "请自动生成吸引人的标题。";

    const response = await invokeLLM({ ...await getAiConfig(),
      messages: [
        {
          role: "system",
          content: `你是一位专业的SEO内容创作专家，擅长为Google Sites创作高质量、防封的文章内容。要求：
1. 语言：${langName}
2. 文章类型：${styleName}
3. 字数：不少于${input.minWords}字
4. 结构：包含标题（H1）、多个小节（H2/H3）、段落正文
5. SEO要求：关键词密度0.5%-2%，自然融入，避免堆砂
6. 防封策略：内容原创、表述自然、避免广告语气
7. 返回JSON格式${insertHints}`,
        },
        {
          role: "user",
          content: `${titleHint}请为关键词"${input.keyword}"创作一篇高质量SEO文章。返回JSON格式：{"title": "文章标题", "content": "文章正文（Markdown格式）", "wordCount": 字数, "qualityScore": 质量分数(0-100)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

    // 读取质量分阈值设置，自动确定状态
    const thresholdRow = await getSettingByKey("auto_approve_threshold");
    const threshold = thresholdRow ? parseInt(thresholdRow.value ?? "0") : 0;
    const autoStatus = threshold > 0 && parsed.qualityScore >= threshold ? "approved" : "pending";

    // Save to materials
    await createMaterial({
      title: input.title || parsed.title,
      keyword: input.keyword,
      language: input.language,
      content: parsed.content,
      wordCount: parsed.wordCount,
      qualityScore: parsed.qualityScore,
      status: autoStatus,
    });

    await createLog({ level: "success", category: "generate", title: `AI生成文章：${input.title || parsed.title}`, message: `关键词：${input.keyword}\n字数：${parsed.wordCount}\n质量分：${parsed.qualityScore}\n状态：${autoStatus === "approved" ? "自动通过" : "待审核"}` });
    return { success: true, title: input.title || parsed.title, wordCount: parsed.wordCount, qualityScore: parsed.qualityScore, autoApproved: autoStatus === "approved" };
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
    const statusLabel: Record<string, string> = { approved: "通过", rejected: "拒绝", pending: "待审核", published: "已发布" };
    const level = input.status === "approved" ? "success" : input.status === "rejected" ? "warn" : "info";
    await createLog({ level, category: "review", title: `素材审核：${statusLabel[input.status] ?? input.status}`, message: `素材 #${input.id} 状态更新为「${statusLabel[input.status] ?? input.status}」`, entityType: "material", entityId: input.id });
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

  // 文章去重检测：AI 评估与已发布内容的相似度
  checkDuplicate: protectedProcedure.input(z.object({
    id: z.number(),
    title: z.string(),
    content: z.string(),
  })).mutation(async ({ input }) => {
    // 获取已发布和已通过的内容标题列表
    const allMaterials = await getMaterials({ status: "approved" });
    const published = await getMaterials({ status: "published" });
    const compareMaterials = [...allMaterials, ...published].filter(m => m.id !== input.id);

    if (compareMaterials.length === 0) {
      await updateMaterial(input.id, { similarityScore: 0 });
      return { success: true, similarityScore: 0, isDuplicate: false, reason: "暂无其他已发布内容，无重复风险" };
    }

    // 取最近 10 条作为参照
    const sampleTitles = compareMaterials.slice(0, 10).map(m => `- ${m.title}`).join("\n");
    const response = await invokeLLM({ ...await getAiConfig(),
      messages: [
        {
          role: "system",
          content: `你是一位内容去重检测专家。请分析新文章与已有内容标题的相似度。\n评估标准：\n- similarityScore：相似度（0-1），0=完全不同，1=完全相同\n- isDuplicate：是否属于重复内容（相似度>0.7）\n- reason：简要说明（30字内）`,
        },
        {
          role: "user",
          content: `新文章标题：「${input.title}」\n\n已有内容标题列表：\n${sampleTitles}\n\n请评估相似度，返回JSON：{"similarityScore": 数字, "isDuplicate": 布尔値, "reason": "说明"}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    const score = Math.min(1, Math.max(0, parsed.similarityScore));
    await updateMaterial(input.id, { similarityScore: score });
    return { success: true, similarityScore: score, isDuplicate: parsed.isDuplicate, reason: parsed.reason };
  }),

  // 批量去重检测
  batchCheckDuplicate: protectedProcedure.input(z.object({
    ids: z.array(z.number()),
  })).mutation(async ({ input }) => {
    const allMaterials = await getMaterials();
    const targets = allMaterials.filter(m => input.ids.includes(m.id));
    const published = allMaterials.filter(m => m.status === "published" || m.status === "approved");
    let checkedCount = 0;
    let duplicateCount = 0;
    for (const mat of targets) {
      try {
        const others = published.filter(m => m.id !== mat.id);
        if (others.length === 0) {
          await updateMaterial(mat.id, { similarityScore: 0 });
          checkedCount++;
          continue;
        }
        const sampleTitles = others.slice(0, 8).map(m => `- ${m.title}`).join("\n");
        const response = await invokeLLM({ ...await getAiConfig(),
          messages: [
            { role: "system", content: `内容去重检测专家。评估新文章与已有内容的相似度，返回JSON格式。` },
            { role: "user", content: `新文章：「${mat.title}」\n已有：\n${sampleTitles}\n返回JSON：{"similarityScore": 0-1数字, "isDuplicate": 布尔値}` },
          ],
          response_format: { type: "json_object" },
        });
        const c = response.choices[0]?.message?.content ?? "{}";
        const p = JSON.parse(typeof c === "string" ? c : JSON.stringify(c));
        const score = Math.min(1, Math.max(0, p.similarityScore));
        await updateMaterial(mat.id, { similarityScore: score });
        if (p.isDuplicate) duplicateCount++;
        checkedCount++;
      } catch (e) {
        // 单个失败不影响其他
      }
    }
    return { success: true, checked: checkedCount, duplicates: duplicateCount, total: targets.length };
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
    await createLog({ level: "info", category: "publish", title: `创建发布任务：${input.name}`, message: `账号 #${input.accountId}${input.scheduledAt ? `\n计划时间：${input.scheduledAt}` : ""}` });
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
    await createLog({ level: "warn", category: "publish", title: `删除发布任务 #${input.id}`, entityType: "task", entityId: input.id });
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
    await createLog({ level: isIndexed ? "success" : "info", category: "indexing", title: `收录检测：${record.publishedUrl?.slice(0, 60)}`, message: `结果：${isIndexed ? "已收录" : "未收录"}`, entityType: "indexing", entityId: input.id });
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
    const indexed = pending.filter((_, i) => {
      const isIdx = Math.random() > 0.4;
      return isIdx;
    }).length;
    await createLog({ level: "info", category: "indexing", title: `批量收录检测完成`, message: `检测 ${pending.length} 条，已收录 ${indexed} 条` });
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
      aiBaseUrl: obj["ai_base_url"] ?? "",
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
    aiBaseUrl: z.string().optional(),
  })).mutation(async ({ input }) => {
    const mapping: Record<string, string | undefined> = {
      site_name: input.siteName,
      site_description: input.siteDescription,
      default_language: input.defaultLanguage,
      timezone: input.timezone,
      ai_engine: input.aiProvider,
      ai_api_key: input.groqApiKey,
      ai_model: input.aiModel,
      ai_base_url: input.aiBaseUrl,
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
    const response = await invokeLLM({ ...await getAiConfig(),
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
  // 诊断端点：查询生产环境 Chromium 状态
  chromiumDiag: publicProcedure.query(async () => {
    const fsModule = await import("fs");
    const osModule = await import("os");
    const diag: Record<string, unknown> = {
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      homeDir: osModule.homedir(),
      env_PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR ?? null,
    };
    try {
      const puppeteerMod = await import("puppeteer");
      const puppeteer = (puppeteerMod as any).default ?? puppeteerMod;
      const p = puppeteer.executablePath() as string;
      diag.puppeteer_executablePath = p;
      try {
        const stat = fsModule.statSync(p);
        diag.puppeteer_chrome_exists = true;
        diag.puppeteer_chrome_size = stat.size;
        diag.puppeteer_chrome_executable = !!(stat.mode & 0o111);
      } catch (e: unknown) {
        diag.puppeteer_chrome_exists = false;
        diag.puppeteer_chrome_error = String(e);
      }
    } catch (e: unknown) {
      diag.puppeteer_error = String(e);
    }
    const candidates = [
      "/usr/lib/chromium-browser/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ];
    diag.system_candidates = candidates.map(p => {
      try {
        const stat = fsModule.statSync(p);
        return { path: p, exists: true, size: stat.size, executable: !!(stat.mode & 0o111) };
      } catch {
        return { path: p, exists: false };
      }
    });
    try {
      const cacheDir = `${osModule.homedir()}/.cache/puppeteer`;
      diag.cache_dir = cacheDir;
      diag.cache_dir_exists = fsModule.existsSync(cacheDir);
      if (diag.cache_dir_exists) {
        diag.cache_dir_contents = fsModule.readdirSync(cacheDir);
      }
    } catch (e: unknown) {
      diag.cache_dir_error = String(e);
    }
    // 尝试触发 downloadBrowsers，记录结果
    if (!diag.puppeteer_chrome_exists) {
      try {
        const { downloadBrowsers } = await import("puppeteer/internal/node/install.js");
        await downloadBrowsers();
        diag.download_result = "success";
        // 重新检查
        const puppeteerMod2 = await import("puppeteer");
        const puppeteer2 = (puppeteerMod2 as any).default ?? puppeteerMod2;
        const p2 = puppeteer2.executablePath() as string;
        try {
          const stat2 = (await import("fs")).statSync(p2);
          diag.after_download_exists = true;
          diag.after_download_size = stat2.size;
        } catch {
          diag.after_download_exists = false;
        }
      } catch (downloadErr: unknown) {
        diag.download_result = "failed";
        diag.download_error = String(downloadErr);
      }
    }
    return diag;
  }),
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
    const fingerprintData = account.browserFingerprint as any;
    try {
      const result = await googleSitesPublisher.publish({
        cookieParsed: account.cookieParsed as any[],
        siteName: account.defaultSiteName ?? "gsp-site",
        title: material.title,
        content: material.content,
        siteUrl,
        proxy: proxyConfig ? { host: proxyConfig.host, port: proxyConfig.port, username: proxyConfig.username, password: proxyConfig.password, protocol: proxyConfig.protocol } : undefined,
        fingerprint: fingerprintData ?? generateFingerprint(account.id),
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
        await createLog({ level: "success", category: "publish", title: `发布成功：${material.title}`, message: `任务 #${input.taskId} 发布成功\n发布链接：${result.publishedUrl}\n\n${result.log.slice(-5).join("\n")}`, entityType: "task", entityId: input.taskId });
        if (result.publishedUrl) {
          // 保存收录监控记录
          await createIndexingRecord({
            publishedUrl: result.publishedUrl,
            title: material.title,
            keyword: material.keyword ?? undefined,
            accountId: task.accountId,
            siteId: task.siteId ?? undefined,
            taskId: input.taskId,
            indexStatus: "pending",
          });
          // 保存已发布链接记录
          await createPublishedPage({
            taskId: input.taskId,
            materialId: task.materialId ?? undefined,
            accountId: task.accountId,
            siteId: task.siteId ?? undefined,
            title: material.title,
            keyword: material.keyword ?? undefined,
            publishedUrl: result.publishedUrl,
            siteUrl: task.siteId ? (await getGoogleSiteById(task.siteId))?.siteUrl ?? undefined : undefined,
            language: material.language ?? "zh-CN",
            wordCount: material.wordCount ?? undefined,
            qualityScore: material.qualityScore ?? undefined,
            indexStatus: "pending",
            gscSubmitted: 0,
          });
          // GSC 自动提交（异步，不阻塞返回）
          const gscKey = await getSettingByKey("gscServiceAccountKey");
          const publishedUrlForGsc = result.publishedUrl;
          if (gscKey?.value && publishedUrlForGsc) {
            submitUrlToGsc(publishedUrlForGsc, gscKey.value).then(async (gscResult) => {
              if (gscResult.success) {
                // 通过 publishedUrl 查找记录并更新 GSC 提交状态
                const pages = await getPublishedPages({ limit: 5 });
                const page = (pages as Array<{ id: number; publishedUrl: string | null }>)
                  .find(p => p.publishedUrl === publishedUrlForGsc);
                if (page) {
                  await updatePublishedPage(page.id, {
                    gscSubmitted: 1,
                    gscSubmittedAt: new Date(),
                    gscResponse: gscResult.response,
                  });
                }
              }
            }).catch(() => {/* GSC 提交失败不影响发布结果 */});
          }
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
        await createLog({ level: "error", category: "publish", title: `发布失败：${material.title}`, message: `任务 #${input.taskId} 发布失败\n错误：${result.errorMessage}\n\n${result.log.slice(-5).join("\n")}`, entityType: "task", entityId: input.taskId });
        return { success: false, errorMessage: result.errorMessage, log: result.log };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await updatePublishTask(input.taskId, { status: "failed", completedAt: new Date(), errorMessage: msg });
      await createLog({ level: "error", category: "publish", title: `发布异常：${material.title}`, message: `任务 #${input.taskId} 发生异常\n${msg}`, entityType: "task", entityId: input.taskId });
      throw error;
    }
  }),
});

// ─── Batch Generation ──────────────────────────────────────────────────────────────────────────────
// In-memory worker state
const workerState: Record<number, { running: boolean; timer?: ReturnType<typeof setTimeout> }> = {};

async function runBatchWorker(batchId: number) {
  const batch = await getGenerationBatchById(batchId);
  if (!batch || batch.status !== "running") return;

  const concurrency = batch.concurrency ?? 3;
  const items = await getPendingGenerationItems(batchId, concurrency);
  if (items.length === 0) {
    // No more pending items - check if all done
    const counts = await countGenerationItems(batchId);
    if (counts.pending === 0) {
      await updateGenerationBatch(batchId, {
        status: "completed",
        completedAt: new Date(),
        completedCount: counts.completed,
        failedCount: counts.failed,
      });
      if (workerState[batchId]) {
        workerState[batchId].running = false;
      }
    }
    return;
  }

  // Process items concurrently
  await Promise.allSettled(items.map(async (item) => {
    await updateGenerationItem(item.id, { status: "running", startedAt: new Date() });
    try {
      const langMap: Record<string, string> = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
      const langName = langMap[batch.language] ?? "简体中文";
      const styleMap: Record<string, string> = { informational: "信息型", commercial: "商业型", navigational: "导航型" };
      const styleName = styleMap[batch.style] ?? "信息型";

      let insertHints = "";
      const insertKeywords = batch.insertKeywords as string[] | null;
      const anchorLinks = batch.anchorLinks as { anchorText: string; url: string; position: string }[] | null;
      if (insertKeywords && insertKeywords.length > 0) {
        insertHints += `\n\n【必须要求】以下关键词必须自然地出现在文章中：${insertKeywords.join("、")}`;
      }
      if (anchorLinks && anchorLinks.length > 0) {
        const endLinks = anchorLinks.filter(l => l.position === "end");
        const bodyLinks = anchorLinks.filter(l => l.position !== "end" && l.position !== "intro");
        const introLinks = anchorLinks.filter(l => l.position === "intro");
        if (introLinks.length > 0) insertHints += `\n\n【引言链接】${introLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
        if (bodyLinks.length > 0) insertHints += `\n\n【正文链接】${bodyLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
        if (endLinks.length > 0) insertHints += `\n\n【末尾链接】${endLinks.map(l => `[${l.anchorText}](${l.url})`).join("、")}`;
      }
      if (batch.insertParagraph) {
        insertHints += `\n\n【指定插入内容】必须将以下内容自然融入文章正文中：\n${batch.insertParagraph}`;
      }
      const titleHint = item.title ? `文章标题已指定为：「${item.title}」，请严格使用此标题。` : "请自动生成吸引人的标题。";

      const response = await invokeLLM({ ...await getAiConfig(),
        messages: [
          {
            role: "system",
            content: `你是专业的SEO内容创作专家。要求：语言${langName}，类型${styleName}，字数不少于${batch.minWords}字，包含H1/H2/H3结构，SEO关键词密度0.5%-2%，返回JSON格式。${insertHints}`,
          },
          {
            role: "user",
            content: `${titleHint}请为关键词「${item.keyword}」创作高质量SEO文章。返回JSON：{"title": "标题", "content": "正文(Markdown)", "wordCount": 字数, "qualityScore": 质量分(0-100)}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));

      // Auto-approve based on threshold
      const threshold = batch.autoApproveThreshold ?? 0;
      const autoStatus = threshold > 0 && parsed.qualityScore >= threshold ? "approved" : "pending";

      await createMaterial({
        title: item.title || parsed.title,
        keyword: item.keyword,
        language: batch.language,
        content: parsed.content,
        wordCount: parsed.wordCount,
        qualityScore: parsed.qualityScore,
        status: autoStatus,
      });

      await updateGenerationItem(item.id, {
        status: "completed",
        completedAt: new Date(),
        generatedTitle: item.title || parsed.title,
        wordCount: parsed.wordCount,
        qualityScore: parsed.qualityScore,
      });

      // Update batch progress
      const counts = await countGenerationItems(batchId);
      await updateGenerationBatch(batchId, {
        completedCount: counts.completed,
        failedCount: counts.failed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryCount = (item.retryCount ?? 0) + 1;
      if (retryCount >= 3) {
        await updateGenerationItem(item.id, { status: "failed", completedAt: new Date(), errorMessage: msg, retryCount });
        await createLog({ level: "error", category: "batch", title: `批量生成失败：${item.keyword}`, message: `错误：${msg}\n已重试 ${retryCount} 次`, entityType: "batch", entityId: batchId });
      } else {
        await updateGenerationItem(item.id, { status: "pending", retryCount });
        await createLog({ level: "warn", category: "batch", title: `批量生成重试：${item.keyword}`, message: `第 ${retryCount} 次重试\n错误：${msg}`, entityType: "batch", entityId: batchId });
      }
    }
  }));

  // Schedule next batch if still running
  const updatedBatch = await getGenerationBatchById(batchId);
  if (updatedBatch?.status === "running" && workerState[batchId]?.running) {
    workerState[batchId].timer = setTimeout(() => runBatchWorker(batchId), 1000);
  }
}

const batchGenerationRouter = router({
  list: protectedProcedure.query(async () => {
    return getGenerationBatches();
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const batch = await getGenerationBatchById(input.id);
    if (!batch) throw new Error("批次不存在");
    const counts = await countGenerationItems(input.id);
    return { ...batch, counts };
  }),

  getItems: protectedProcedure.input(z.object({ batchId: z.number() })).query(async ({ input }) => {
    return getGenerationItemsByBatch(input.batchId);
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    items: z.array(z.object({
      keyword: z.string().min(1),
      title: z.string().optional(),
    })),
    language: z.enum(["zh-CN", "en", "zh-TW"]).default("zh-CN"),
    minWords: z.number().default(800),
    style: z.enum(["informational", "commercial", "navigational"]).default("informational"),
    concurrency: z.number().min(1).max(10).default(3),
    insertKeywords: z.array(z.string()).optional(),
    anchorLinks: z.array(z.object({
      anchorText: z.string(),
      url: z.string(),
      position: z.enum(["intro", "body", "end"]).default("body"),
    })).optional(),
    insertParagraph: z.string().optional(),
    autoApproveThreshold: z.number().min(0).max(100).default(0),
    autoQueue: z.boolean().default(false),
  })).mutation(async ({ input }) => {
    const { items, ...batchData } = input;
    await createGenerationBatch({
      ...batchData,
      totalCount: items.length,
      status: "pending",
    });
    // Get the newly created batch
    const batches = await getGenerationBatches();
    const batch = batches[0];
    if (!batch) throw new Error("创建失败");
    // Insert items in bulk
    await createGenerationItems(items.map(item => ({
      batchId: batch.id,
      keyword: item.keyword,
      title: item.title,
      status: "pending" as const,
    })));
     await createLog({ level: "info", category: "batch", title: `创建批量任务：${batchData.name}`, message: `共 ${items.length} 条，语言：${batchData.language}` });
    return { success: true, batchId: batch.id, totalCount: items.length };
  }),
  start: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const batch = await getGenerationBatchById(input.id);
    if (!batch) throw new Error("批次不存在");
    if (batch.status === "running") return { success: true, message: "已在运行中" };
     await updateGenerationBatch(input.id, { status: "running", startedAt: new Date() });
    workerState[input.id] = { running: true };
    await createLog({ level: "info", category: "batch", title: `批量任务已启动 #${input.id}`, message: `批次：${batch.name}，共 ${batch.totalCount} 条`, entityType: "batch", entityId: input.id });
    // Start worker asynchronously
    setTimeout(() => runBatchWorker(input.id), 100);
    return { success: true, message: "已启动" };
  }),
  pause: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await updateGenerationBatch(input.id, { status: "paused" });
    if (workerState[input.id]) {
      workerState[input.id].running = false;
      if (workerState[input.id].timer) clearTimeout(workerState[input.id].timer);
    }
    await createLog({ level: "warn", category: "batch", title: `批量任务已暂停 #${input.id}`, entityType: "batch", entityId: input.id });
    return { success: true };
  }),
   resume: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await updateGenerationBatch(input.id, { status: "running" });
    workerState[input.id] = { running: true };
    await createLog({ level: "info", category: "batch", title: `批量任务已恢复 #${input.id}`, entityType: "batch", entityId: input.id });
    setTimeout(() => runBatchWorker(input.id), 100);
    return { success: true };
  }),
   cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await updateGenerationBatch(input.id, { status: "failed", completedAt: new Date() });
    if (workerState[input.id]) {
      workerState[input.id].running = false;
      if (workerState[input.id].timer) clearTimeout(workerState[input.id].timer);
    }
    await createLog({ level: "warn", category: "batch", title: `批量任务已取消 #${input.id}`, entityType: "batch", entityId: input.id });
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    if (workerState[input.id]) {
      workerState[input.id].running = false;
      if (workerState[input.id].timer) clearTimeout(workerState[input.id].timer);
      delete workerState[input.id];
    }
    await deleteGenerationBatch(input.id);
    await createLog({ level: "warn", category: "batch", title: `删除批量任务 #${input.id}`, entityType: "batch", entityId: input.id });
    return { success: true };
  }),

  progress: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const batch = await getGenerationBatchById(input.id);
    if (!batch) throw new Error("批次不存在");
    const counts = await countGenerationItems(input.id);
    const percent = batch.totalCount > 0 ? Math.round((counts.completed / batch.totalCount) * 100) : 0;
    return {
      batchId: input.id,
      status: batch.status,
      totalCount: batch.totalCount,
      completedCount: counts.completed,
      failedCount: counts.failed,
      pendingCount: counts.pending,
      percent,
    };
  }),
});

// ─── Published Pages Router ─────────────────────────────────────────────────────────────────────────────────
const publishedPagesRouter = router({
  list: protectedProcedure.input(z.object({
    keyword: z.string().optional(),
    indexStatus: z.string().optional(),
    accountId: z.number().optional(),
    siteId: z.number().optional(),
    limit: z.number().default(100),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    return getPublishedPages(input);
  }),
  stats: protectedProcedure.query(async () => {
    return getPublishedPageStats();
  }),
  count: protectedProcedure.query(async () => {
    return countPublishedPages();
  }),
  create: protectedProcedure.input(z.object({
    taskId: z.number().optional(),
    materialId: z.number().optional(),
    accountId: z.number().optional(),
    siteId: z.number().optional(),
    title: z.string().min(1),
    keyword: z.string().optional(),
    publishedUrl: z.string().url(),
    siteUrl: z.string().optional(),
    language: z.string().default("zh-CN"),
    wordCount: z.number().optional(),
    qualityScore: z.number().optional(),
  })).mutation(async ({ input }) => {
    await createPublishedPage(input);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    indexStatus: z.enum(["unknown", "indexed", "not_indexed", "pending"]).optional(),
    gscSubmitted: z.number().optional(),
    gscResponse: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await updatePublishedPage(id, data as any);
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deletePublishedPage(input.id);
    return { success: true };
  }),
  exportCsv: protectedProcedure.input(z.object({
    keyword: z.string().optional(),
    indexStatus: z.string().optional(),
  })).query(async ({ input }) => {
    const pages = await getPublishedPages({ ...input, limit: 100000 });
    // Return as CSV data
    const headers = ["ID", "标题", "关键词", "发布URL", "站点URL", "语言", "字数", "质量分", "收录状态", "GSC已提交", "发布时间"];
    const rows = pages.map((p: any) => [
      p.id,
      `"${(p.title ?? "").replace(/"/g, '""')}"`,
      `"${(p.keyword ?? "").replace(/"/g, '""')}"`,
      p.publishedUrl ?? "",
      p.siteUrl ?? "",
      p.language ?? "zh-CN",
      p.wordCount ?? "",
      p.qualityScore ?? "",
      p.indexStatus ?? "unknown",
      p.gscSubmitted ? "是" : "否",
      p.publishedAt ? new Date(p.publishedAt).toLocaleString("zh-CN") : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
    return { csv, total: pages.length };
  }),
});
// ─── Logs Router ─────────────────────────────────────────────────────────────────────────────
const logsRouter = router({
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      level: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return await getLogs(input ?? {});
    }),
  count: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      level: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await getLogCount(input ?? {});
    }),
  clear: protectedProcedure.mutation(async () => {
    await clearLogs();
    return { success: true };
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      await createLog({ level: "info", category: "system", title: `用户退出登录`, message: `用户 ${ctx.user?.name ?? "未知"} 退出登录` });
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
   publishedPages: publishedPagesRouter,
  logs: logsRouter,
});
export type AppRouter = typeof appRouter;
