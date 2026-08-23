import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  getAccounts, getAccountById, createAccount, updateAccount, deleteAccount, batchDeleteAccounts,
  getMaterials, getMaterialById, createMaterial, updateMaterial, deleteMaterial,
  getPublishTasks, createPublishTask, updatePublishTask, deletePublishTask, batchDeletePublishTasks,
  createIndexingRecord,
  getSettings, getSettingByKey, upsertSetting, seedDefaultSettings,
  getKeywords, createKeyword, updateKeyword, deleteKeyword, batchDeleteKeywords,
  getDashboardStats,
  getSeoTemplates, getSeoTemplateById, createSeoTemplate, updateSeoTemplate, deleteSeoTemplate, seedSeoTemplates,
  getGoogleSites, getGoogleSiteById, createGoogleSite, updateGoogleSite, deleteGoogleSite,
  getGenerationBatches, getGenerationBatchById, createGenerationBatch, updateGenerationBatch, deleteGenerationBatch, batchDeleteGenerationBatches,
  getGenerationItemsByBatch, createGenerationItems, updateGenerationItem, getPendingGenerationItems, countGenerationItems,
  getPublishedPages, countPublishedPages, createPublishedPage, updatePublishedPage, deletePublishedPage, getPublishedPageStats, batchDeletePublishedPages,
  createLog, getLogs, getLogCount, clearLogs,
  getPublishTaskById,
} from "./db";
import { googleSitesPublisher } from "./googleSitesPublisher";
import { createGoogleOAuthHandler } from "./googleOAuth";
import { generateFingerprint } from "./fingerprint";
import { submitUrlToGsc, calcSafeDailyLimit, calcPublishDelay } from "./gscSubmitter";
import axios from "axios";

// 动态导入代理 agent
let HttpsProxyAgent: any = null;
let SocksProxyAgent: any = null;

async function loadProxyAgents() {
  if (!HttpsProxyAgent) {
    try {
      const httpsModule = await import("https-proxy-agent");
      HttpsProxyAgent = httpsModule.HttpsProxyAgent;
    } catch (e) {
      console.warn("https-proxy-agent 未安装");
    }
  }
  if (!SocksProxyAgent) {
    try {
      const socksModule = await import("socks-proxy-agent");
      SocksProxyAgent = socksModule.SocksProxyAgent;
    } catch (e) {
      console.warn("socks-proxy-agent 未安装");
    }
  }
}
// 代理 agent 动态导入（运行时按需加载）
// import { HttpsProxyAgent } from "https-proxy-agent";
// import { SocksProxyAgent } from "socks-proxy-agent";

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
  let model = obj["ai_model"] ?? "llama-3.3-70b-versatile";
  // Check if model is deprecated and use fallback
  const deprecatedModels = ["llama3-70b-8192", "mixtral-8x7b-32768", "llama3-8b-8192"];
  if (deprecatedModels.includes(model)) {
    console.warn(`Model ${model} is deprecated, using llama-3.3-70b-versatile instead`);
    model = "llama-3.3-70b-versatile";
  }
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
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    await batchDeleteAccounts(input.ids);
    await createLog({ level: "warn", category: "account", title: `批量删除账号 ${input.ids.length} 个`, message: `账号 IDs: ${input.ids.join(", ")}` });
    return { success: true };
  }),
  verify: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const account = await getAccountById(input.id);
    if (!account) throw new Error("账号不存在");
    
    // Check if cookie is valid: must have content and not be expired
    const isValidCookie = account.cookieRaw && account.cookieRaw.length > 50;
    const isNotExpired = !account.cookieExpiresAt || account.cookieExpiresAt > new Date();
    const isValid = isValidCookie && isNotExpired;
    
    // Set cookie expiration to 60 days from now (Google Sites cookies typically last 60-90 days)
    const cookieExpiresAt = new Date();
    cookieExpiresAt.setDate(cookieExpiresAt.getDate() + 60);
    
    await updateAccount(input.id, {
      status: isValid ? "online" : "expired",
      lastVerifiedAt: new Date(),
      cookieExpiresAt: isValid ? cookieExpiresAt : account.cookieExpiresAt,
    });
    
    const expiryMsg = isValid ? `有效（有效期至 ${cookieExpiresAt.toLocaleString('zh-CN')})` : "已过期";
    await createLog({ level: isValid ? "success" : "warn", category: "account", title: `验证账号：${account.name}`, message: `验证结果：${expiryMsg}`, entityType: "account", entityId: input.id });
    return { success: true, status: isValid ? "online" : "expired" };
  }),
  
  // Google OAuth 授权 URL 生成
  getGoogleOAuthUrl: protectedProcedure.input(z.object({ 
    accountId: z.number() 
  })).mutation(async ({ input }) => {
    try {
      const oauthHandler = createGoogleOAuthHandler();
      const state = JSON.stringify({ accountId: input.accountId, timestamp: Date.now() });
      const authUrl = oauthHandler.getAuthorizationUrl(Buffer.from(state).toString('base64'));
      return { success: true, authUrl };
    } catch (error) {
      throw new Error(`生成 OAuth URL 失败: ${error}`);
    }
  }),
  
  // Google OAuth 回调处理
  handleGoogleOAuthCallback: protectedProcedure.input(z.object({
    code: z.string(),
    state: z.string(),
  })).mutation(async ({ input }) => {
    try {
      const oauthHandler = createGoogleOAuthHandler();
      const stateData = JSON.parse(Buffer.from(input.state, 'base64').toString());
      const accountId = stateData.accountId;
      
      if (!accountId) {
        throw new Error("无效的 state 参数");
      }
      
      // 交换授权码获取 token
      const tokenInfo = await oauthHandler.exchangeCodeForToken(input.code);
      
      // 更新账号的 OAuth 令牌
      await updateAccount(accountId, {
        googleOAuthAccessToken: tokenInfo.accessToken,
        googleOAuthRefreshToken: tokenInfo.refreshToken,
        googleOAuthExpiresAt: tokenInfo.expiresAt,
        googleOAuthScope: tokenInfo.scope,
      });
      
      await createLog({ 
        level: "success", 
        category: "account", 
        title: `账号 #${accountId} 授权 Google OAuth`, 
        message: `成功获取 Google OAuth 令牌，有效期至 ${tokenInfo.expiresAt?.toLocaleString('zh-CN') || '未知'}`,
        entityType: "account", 
        entityId: accountId 
      });
      
      return { success: true, accountId };
    } catch (error) {
      throw new Error(`处理 OAuth 回调失败: ${error}`);
    }
  }),
  
  // 检查账号是否有有效的 Google OAuth 令牌
  checkGoogleOAuthStatus: protectedProcedure.input(z.object({ 
    id: z.number() 
  })).query(async ({ input }) => {
    const account = await getAccountById(input.id);
    if (!account) throw new Error("账号不存在");
    
    const hasToken = !!account.googleOAuthAccessToken;
    const isExpired = account.googleOAuthExpiresAt && account.googleOAuthExpiresAt < new Date();
    const isValid = hasToken && !isExpired;
    
    return {
      hasToken,
      isExpired: isExpired || false,
      isValid,
      expiresAt: account.googleOAuthExpiresAt,
    };
  }),
  
  // 撤销 Google OAuth 授权
  revokeGoogleOAuth: protectedProcedure.input(z.object({ 
    id: z.number() 
  })).mutation(async ({ input }) => {
    const account = await getAccountById(input.id);
    if (!account) throw new Error("账号不存在");
    
    if (account.googleOAuthAccessToken) {
      try {
        const oauthHandler = createGoogleOAuthHandler();
        await oauthHandler.revokeAccessToken(account.googleOAuthAccessToken);
      } catch (error) {
        console.warn(`撤销 OAuth 令牌失败: ${error}`);
      }
    }
    
    // 清除 OAuth 令牌
    await updateAccount(input.id, {
      googleOAuthAccessToken: null as any,
      googleOAuthRefreshToken: null as any,
      googleOAuthExpiresAt: null as any,
      googleOAuthScope: null as any,
    });
    
    await createLog({ 
      level: "info", 
      category: "account", 
      title: `账号 #${input.id} 撤销 Google OAuth`, 
      message: `已撤销 Google OAuth 授权`,
      entityType: "account", 
      entityId: input.id 
    });
    
    return { success: true };
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
    batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
      await batchDeleteKeywords(input.ids);
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
      externalLinks: input.anchorLinks?.map(link => ({ anchorText: link.anchorText, url: link.url, position: link.position })),
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
    // Check if account cookie is still valid before creating publish task
    const account = await getAccountById(input.accountId);
    if (!account) throw new Error("账号不存在");
    
    // Verify cookie is not expired
    const isCookieExpired = account.cookieExpiresAt && account.cookieExpiresAt < new Date();
    if (isCookieExpired || account.status === "expired") {
      const expiryDate = account.cookieExpiresAt?.toLocaleString('zh-CN') || '未知';
      throw new Error(`账号 Cookie 已过期，请重新验证账号。有效期至：${expiryDate}`);
    }
    
    await createPublishTask({
      name: input.name,
      accountId: input.accountId,
      materialId: input.materialId,
      status: input.scheduledAt ? "scheduled" : "pending",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    });
    await createLog({ level: "info", category: "publish", title: `创建发布任务：${input.name}`, message: `账号 #${input.accountId}${input.scheduledAt ? `
计划时间：${input.scheduledAt}` : ""}` });
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
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    await batchDeletePublishTasks(input.ids);
    await createLog({ level: "warn", category: "publish", title: `批量删除发布任务 ${input.ids.length} 个`, message: `IDs: ${input.ids.join(", ")}` });
    return { success: true };
  }),
});

// ─── Hyperlinks ───────────────────────────────────────────────────────────────
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
      googleSiteNameSuffix: obj["google_site_name_suffix"] ?? "",
      siteDescription: obj["site_description"] ?? "",
      defaultLanguage: obj["default_language"] ?? "zh-CN",
      timezone: obj["timezone"] ?? "Asia/Shanghai",
      aiProvider: obj["ai_engine"] ?? "groq",
      groqApiKey: obj["ai_api_key"] ?? "",
      aiModel: obj["ai_model"] ?? "llama-3.3-70b-versatile",
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
    googleSiteNameSuffix: z.string().optional(),
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
      google_site_name_suffix: input.googleSiteNameSuffix,
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
    siteNameSuffix: z.string().optional(),
    embedUrl: z.string().optional(),
    embedWidth: z.string().optional(),
    embedHeight: z.string().optional(),
    embedPosition: z.enum(["top", "bottom"]).optional(),
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
    siteNameSuffix: z.string().optional(),
    embedUrl: z.string().optional(),
    embedWidth: z.string().optional(),
    embedHeight: z.string().optional(),
    embedPosition: z.enum(["top", "bottom"]).optional(),
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
    socialLinks: z.array(z.object({
      label: z.string().min(1),
      url: z.string().url(),
      type: z.string().optional(),
    })).optional(),
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
    socialLinks: z.array(z.object({
      label: z.string().min(1),
      url: z.string().url(),
      type: z.string().optional(),
    })).optional(),
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

/** 后台异步执行发布任务（不阻塞 HTTP 响应） */
async function runPublishTaskAsync(
  taskId: number,
  task: { materialId: number | null; siteId: number | null; accountId: number; retryCount: number | null },
  account: Awaited<ReturnType<typeof getAccountById>>,
  material: Awaited<ReturnType<typeof getMaterialById>>
) {
  if (!account || !material) return;
  // 当前业务规则：每次任务都创建一个独立的 Google Sites 站点。
  // siteId 仅作为发布配置（社交链接等）的来源，不再作为既有站点的编辑 URL。
  const siteConfig = task.siteId ? await getGoogleSiteById(task.siteId) : undefined;
  const proxyConfig = (account as any).proxyConfig as any;
  const fingerprintData = (account as any).browserFingerprint as any;
  const cleanArticleTitle = material.title.replace(/\s*[-–—]\s*SEO文章\s*$/i, "").trim() || material.title;
  const normalizeLinks = (raw: unknown): Array<{ text: string; url: string; position?: string }> => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.flatMap<{ text: string; url: string; position?: string }>((item: any) => {
      const text = String(item?.text ?? item?.anchorText ?? item?.label ?? "").trim();
      const url = String(item?.url ?? "").trim();
      const position = typeof item?.position === "string" ? item.position : "end";
      if (!text || !/^https?:\/\//i.test(url) || seen.has(`${text}|${url}`)) return [];
      seen.add(`${text}|${url}`);
      return [{ text, url, position }];
    });
  };
  // 读取网站名称后缀、嵌入内容、版式和模板链接。
  let siteNameSuffix = "";
  let embedBlocks: Array<{ embedUrl: string; embedWidth?: string; embedHeight?: string; embedPosition?: string }> = [];
  let templateStyles: {
    h1?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    h2?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    h3?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    p?: { fontSize?: string; fontWeight?: string; textAlign?: string };
  } | undefined;
  const anchorLinks: Array<{ text: string; url: string; position?: string }> = normalizeLinks([
    ...((material as any).internalLinks ?? []),
    ...((material as any).externalLinks ?? []),
  ]);
  const socialLinks = Array.isArray((siteConfig as any)?.socialLinks)
    ? (siteConfig as any).socialLinks.filter((item: any) => item?.label && /^https?:\/\//i.test(String(item?.url ?? "")))
    : [];

  if ((material as any).seoTemplateId) {
    try {
      const tpl = await getSeoTemplateById((material as any).seoTemplateId);
      if (tpl) {
        // 优先使用模板的站点名称后缀
        if ((tpl as any).siteNameSuffix) {
          siteNameSuffix = ((tpl as any).siteNameSuffix as string).trim();
        }
        // 读取模板级内嵌网站配置。
        if ((tpl as any).embedUrl) {
          embedBlocks.push({
            embedUrl: (tpl as any).embedUrl as string,
            embedWidth: ((tpl as any).embedWidth as string) || "100%",
            embedHeight: ((tpl as any).embedHeight as string) || "600px",
            embedPosition: ((tpl as any).embedPosition as string) || "bottom",
          });
        }
        // 模板级配置和可视化板块结构可以同时存在，不能互相排斥。
        if (tpl.structure) {
          const structure = typeof tpl.structure === 'string' ? JSON.parse(tpl.structure as string) : tpl.structure;
          if (Array.isArray(structure)) {
            const structureEmbeds = (structure as any[]).filter((b: any) => b.type === 'embed' && b.embedUrl)
              .map((b: any) => ({ embedUrl: b.embedUrl as string, embedHeight: b.embedHeight as string | undefined }));
            embedBlocks.push(...structureEmbeds);
            const styles: NonNullable<typeof templateStyles> = {};
            for (const block of structure as any[]) {
              const styleKey = block.type === "paragraph" ? "p" : block.type;
              if (["h1", "h2", "h3", "p"].includes(styleKey) && (block.fontSize || block.fontWeight || block.textAlign)) {
                (styles as any)[styleKey] = {
                  fontSize: block.fontSize,
                  fontWeight: block.fontWeight,
                  textAlign: block.textAlign,
                };
              }
              if (block.type === "links") anchorLinks.push(...normalizeLinks(block.linkItems));
            }
            if (Object.keys(styles).length > 0) templateStyles = styles;
          }
        }
      }
    } catch (e) {
      console.error('[发布引擎] 读取 SEO 模板失败:', e);
    }
  }

  // 如果模板没有设置后缀，则使用系统设置
  if (!siteNameSuffix) {
    const siteNameSuffixRow = await getSettingByKey("google_site_name_suffix");
    siteNameSuffix = siteNameSuffixRow?.value?.trim() ?? "";
  }
  const computedSiteName = siteNameSuffix ? `${cleanArticleTitle} ${siteNameSuffix}` : cleanArticleTitle;
  embedBlocks = embedBlocks.filter((block, index, all) =>
    !!block.embedUrl && all.findIndex(candidate => candidate.embedUrl === block.embedUrl && candidate.embedPosition === block.embedPosition) === index
  );
  const uniqueAnchorLinks = normalizeLinks(anchorLinks);

  try {
    const result = await googleSitesPublisher.publish({
      cookieParsed: (account as any).cookieParsed as any[],
      siteName: computedSiteName,
      title: cleanArticleTitle,
      content: material.content,
      proxy: proxyConfig ? { host: proxyConfig.host, port: proxyConfig.port, username: proxyConfig.username, password: proxyConfig.password, protocol: proxyConfig.protocol } : undefined,
      fingerprint: fingerprintData ?? generateFingerprint(account.id),
      headless: true,
      timeout: 120000,
      embedBlocks: embedBlocks.length > 0 ? embedBlocks : undefined,
      templateStyles,
      anchorLinks: uniqueAnchorLinks.length > 0 ? uniqueAnchorLinks : undefined,
      socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
    });
    if (result.success) {
      await updatePublishTask(taskId, {
        status: "success",
        completedAt: new Date(),
        publishedUrl: result.publishedUrl,
        engineLog: result.log.join("\n"),
      });
      if (task.materialId) await updateMaterial(task.materialId, { status: "published" });
      await updateAccount(account.id, { todayPublished: (account.todayPublished ?? 0) + 1 });
      await createLog({ level: "success", category: "publish", title: `发布成功：${cleanArticleTitle}`, message: `任务 #${taskId} 发布成功\n发布链接：${result.publishedUrl}\n\n${result.log.slice(-5).join("\n")}`, entityType: "task", entityId: taskId });
      if (result.publishedUrl) {
        await createIndexingRecord({
          publishedUrl: result.publishedUrl,
          title: cleanArticleTitle,
          keyword: material.keyword ?? undefined,
          accountId: task.accountId,
          siteId: task.siteId ?? undefined,
          taskId,
          indexStatus: "pending",
        });
        await createPublishedPage({
          taskId,
          materialId: task.materialId ?? undefined,
          accountId: task.accountId,
          siteId: task.siteId ?? undefined,
          title: cleanArticleTitle,
          keyword: material.keyword ?? undefined,
          publishedUrl: result.publishedUrl,
          siteUrl: result.siteUrl ?? result.publishedUrl,
          language: material.language ?? "zh-CN",
          wordCount: material.wordCount ?? undefined,
          qualityScore: material.qualityScore ?? undefined,
          indexStatus: "pending",
          gscSubmitted: 0,
        });
        const gscKey = await getSettingByKey("gscServiceAccountKey");
        const publishedUrlForGsc = result.publishedUrl;
        if (gscKey?.value && publishedUrlForGsc) {
          submitUrlToGsc(publishedUrlForGsc, gscKey.value).then(async (gscResult) => {
            if (gscResult.success) {
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
          }).catch(() => {});
        }
      }
    } else {
      await updatePublishTask(taskId, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: result.errorMessage,
        engineLog: result.log.join("\n"),
        retryCount: (task.retryCount ?? 0) + 1,
      });
      await createLog({ level: "error", category: "publish", title: `发布失败：${material.title}`, message: `任务 #${taskId} 发布失败\n错误：${result.errorMessage}\n\n${result.log.slice(-5).join("\n")}`, entityType: "task", entityId: taskId });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updatePublishTask(taskId, { status: "failed", completedAt: new Date(), errorMessage: msg, engineLog: msg });
    await createLog({ level: "error", category: "publish", title: `发布异常：${material.title}`, message: `任务 #${taskId} 发生异常\n${msg}`, entityType: "task", entityId: taskId });
  }
}

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

  // 验证代理连通性
  verifyProxy: protectedProcedure.input(z.object({
    host: z.string(),
    port: z.number(),
    protocol: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { host, port, protocol = "http", username, password } = input;
    const startTime = Date.now();
    try {
      // 加载代理 agent
      await loadProxyAgents();
      
      // 构建代理 URL（含认证信息）
      const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
      const proxyUrl = `${protocol}://${auth}${host}:${port}`;

      // 根据协议选择 agent
      let agent: any;
      if (protocol.startsWith("socks")) {
        if (!SocksProxyAgent) throw new Error("socks-proxy-agent 未安装");
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        if (!HttpsProxyAgent) throw new Error("https-proxy-agent 未安装");
        agent = new HttpsProxyAgent(proxyUrl);
      }

      // 通过代理请求 ip-api.com 获取出口 IP 和地区
      const resp = await axios.get("http://ip-api.com/json", {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 15000,
        proxy: false, // 禁用 axios 默认代理，使用 agent
      });

      const latency = Date.now() - startTime;
      const data = resp.data;

      return {
        success: true,
        latency,
        ip: data.query ?? "未知",
        country: data.country ?? "未知",
        region: data.regionName ?? "未知",
        city: data.city ?? "未知",
        isp: data.isp ?? "未知",
        message: `✅ 代理连通！出口 IP: ${data.query}，地区: ${data.country} ${data.city}，延迟: ${latency}ms`,
      };
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const msg = err?.message ?? String(err);
      return {
        success: false,
        latency,
        ip: "",
        country: "",
        region: "",
        city: "",
        isp: "",
        message: `❌ 代理连接失败（${latency}ms）: ${msg}`,
      };
    }
  }),

  // 异步触发发布任务（立即返回，后台执行 Puppeteer）
  executeTask: protectedProcedure.input(z.object({
    taskId: z.number(),
  })).mutation(async ({ input }) => {
    const task = await getPublishTaskById(input.taskId);
    if (!task) throw new Error("任务不存在");
    if (!task.materialId) throw new Error("任务没有关联素材");
    if (task.status === "running") throw new Error("任务正在执行中，请勿重复触发");
    const account = await getAccountById(task.accountId);
    if (!account) throw new Error("账号不存在");
    if (!account.cookieParsed) throw new Error("账号没有有效 Cookie");
    const material = await getMaterialById(task.materialId);
    if (!material) throw new Error("素材不存在");
    // 立即更新状态为 running，让前端知道任务已启动
    await updatePublishTask(input.taskId, { status: "running", startedAt: new Date(), engineLog: "[任务已加入队列，正在启动浏览器...]" });
    // 后台异步执行，不阻塞 HTTP 响应
    runPublishTaskAsync(input.taskId, task, account, material).catch(() => {/* 错误已在函数内处理 */});
    return { queued: true, taskId: input.taskId };
  }),
  // 查询任务当前状态和日志（前端轮询用）
  getTaskStatus: protectedProcedure.input(z.object({
    taskId: z.number(),
  })).query(async ({ input }) => {
    const task = await getPublishTaskById(input.taskId);
    if (!task) throw new Error("任务不存在");
    return {
      id: task.id,
      status: task.status,
      publishedUrl: task.publishedUrl,
      errorMessage: task.errorMessage,
      engineLog: task.engineLog,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
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

      // 如果有模板，使用模板的 promptTemplate
      let systemPrompt = `你是专业的SEO内容创作专家。要求：语言${langName}，类型${styleName}，字数不少于${batch.minWords}字，包含H1/H2/H3结构，SEO关键词密度0.5%-2%，返回JSON格式。${insertHints}`;
      let seoTemplateId: number | null = null;
      if (batch.templateId) {
        const tpl = await getSeoTemplateById(batch.templateId);
        if (tpl) {
          seoTemplateId = tpl.id;
          const structureDesc = Array.isArray(tpl.structure)
            ? (tpl.structure as any[]).map((b: any) => `${b.type}${b.label ? `(${b.label})` : ""}`).join(" -> ")
            : JSON.stringify(tpl.structure);
          systemPrompt = `你是专业的SEO内容创作专家。要求：语言${langName}，字数不少于${tpl.minWords ?? batch.minWords}字，SEO关键词密度0.5%-2%，返回JSON格式。
模板类型：${tpl.type}。文章结构应按照：${structureDesc}。
${tpl.promptTemplate ? `模板要求：${tpl.promptTemplate}` : ""}
${insertHints}`;
        }
      }

      const response = await invokeLLM({ ...await getAiConfig(),
        messages: [
          {
            role: "system",
            content: systemPrompt,
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
        seoTemplateId: seoTemplateId ?? undefined,
        externalLinks: anchorLinks?.map(link => ({ anchorText: link.anchorText, url: link.url, position: link.position })),
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
    templateId: z.number().optional(),
  })).mutation(async ({ input }) => {
    const { items, autoQueue, templateId, ...batchData } = input;
    await createGenerationBatch({
      ...batchData,
      autoQueue: autoQueue ? 1 : 0,
      templateId: templateId ?? null,
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
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    for (const id of input.ids) {
      if (workerState[id]) {
        workerState[id].running = false;
        if (workerState[id].timer) clearTimeout(workerState[id].timer);
        delete workerState[id];
      }
    }
    await batchDeleteGenerationBatches(input.ids);
    await createLog({ level: "warn", category: "batch", title: `批量删除生成任务 ${input.ids.length} 个`, message: `IDs: ${input.ids.join(", ")}` });
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
    await createPublishedPage(input as any);
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
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    await batchDeletePublishedPages(input.ids);
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
  settings: settingsRouter,
  seoTemplates: seoTemplatesRouter,
  sites: sitesRouter,
  publisher: publisherRouter,
  batchGeneration: batchGenerationRouter,
   publishedPages: publishedPagesRouter,
  logs: logsRouter,
});
export type AppRouter = typeof appRouter;
