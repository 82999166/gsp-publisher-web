/**
 * Google Sites Publisher Engine
 * 使用 Puppeteer 模拟真人操作，通过 Cookie 登录 Google Sites 并发布文章
 */
import fs from "fs";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer-core";
import type { BrowserFingerprint } from "./fingerprint.js";

// 异步获取 Chromium 可执行文件路径
// 优先级：puppeteer 内置 Chromium（自动下载）> 系统安装的真实二进制
async function getChromiumPath(): Promise<string> {
  // 1. 尝试 puppeteer 内置 Chromium 路径
  // 使用动态 import() 而非 require()，兼容 ESM 生产环境（esbuild 编译后 require 不可用）
  try {
    const puppeteerMod = await import("puppeteer");
    // 支持 default 导出和命名导出两种形式
    const puppeteer = (puppeteerMod as any).default ?? puppeteerMod;
    const builtinPath: string = puppeteer.executablePath();
    if (builtinPath) {
      try {
        const stat = fs.statSync(builtinPath);
        if (stat.isFile() && (stat.mode & 0o111)) {
          console.log(`[Chromium] 使用 puppeteer 内置 Chromium: ${builtinPath}`);
          return builtinPath;
        }
      } catch {
        // 文件不存在，尝试自动下载
        console.log(`[Chromium] 内置路径不存在，尝试自动下载 Chromium...`);
        try {
          const { downloadBrowsers } = await import("puppeteer/internal/node/install.js");
          await downloadBrowsers();
          // 下载后再次检查
          const stat2 = fs.statSync(builtinPath);
          if (stat2.isFile() && (stat2.mode & 0o111)) {
            console.log(`[Chromium] 下载完成，使用: ${builtinPath}`);
            return builtinPath;
          }
        } catch (downloadErr) {
          console.warn(`[Chromium] 自动下载失败: ${downloadErr}`);
        }
      }
    }
  } catch (puppeteerImportErr) {
    console.warn(`[Chromium] puppeteer import 失败: ${puppeteerImportErr}`);
    // puppeteer 未安装或 import 失败，继续尝试系统路径
  }

  // 2. 回退到系统安装的 Chromium（只接受真实 ELF 二进制 >1MB，跳过 shell 包装器）
  const candidates = [
    "/usr/lib/chromium-browser/chromium-browser", // Ubuntu 真实二进制（253MB）
    "/usr/bin/chromium",                          // Debian/Ubuntu 直接安装
    "/usr/bin/google-chrome-stable",              // Google Chrome stable
    "/usr/bin/google-chrome",                     // Google Chrome
    "/snap/bin/chromium",                         // Snap 包
  ];
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p);
      if (stat.isFile() && (stat.mode & 0o111) && stat.size > 1024 * 1024) {
        console.log(`[Chromium] 使用系统 Chromium: ${p} (${Math.round(stat.size / 1024 / 1024)}MB)`);
        return p;
      }
    } catch {}
  }

  // 3. 最终兜底（会失败，但至少有明确错误信息）
  throw new Error(`[Chromium] 未找到有效 Chromium 可执行文件。请确保 puppeteer 已正确安装并能下载 Chromium。`);
}

// 注册 Stealth 插件（绕过 Google 反爬虫检测）
puppeteerExtra.use(StealthPlugin());

// ─── 类型定义 ─────────────────────────────────────────────────────────────────
export interface PublishOptions {
  /** Google 账号 Cookie（JSON 数组格式，来自 Cookie-Editor 等插件） */
  cookieParsed: CookieEntry[];
  /** 目标 Google Site 的名称（URL slug，如 "my-seo-site-2024"） */
  siteName: string;
  /** 文章标题（将成为页面 H1 和 URL slug） */
  title: string;
  /** 文章正文（Markdown 格式，将转换为纯文本段落） */
  content: string;
  /** 目标 Site 的完整 URL（如已存在），为空则自动创建新 Site */
  siteUrl?: string;
  /** 代理配置（可选） */
  proxy?: { host: string; port: number; username?: string; password?: string; protocol?: string };
  /** 浏览器指纹（可选，用于防关联） */
  fingerprint?: BrowserFingerprint;
  /** 是否无头模式（默认 true） */
  headless?: boolean;
  /** 操作超时（毫秒，默认 120000） */
  timeout?: number;
}

export interface CookieEntry {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  expirationDate?: number; // Chrome 扩展导出格式（与 expires 互为别名）
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  session?: boolean; // Chrome 扩展导出格式
  storeId?: string; // Chrome 扩展导出格式
  hostOnly?: boolean; // Chrome 扩展导出格式
}

export interface PublishResult {
  success: boolean;
  publishedUrl?: string;
  siteUrl?: string;
  errorMessage?: string;
  log: string[];
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将 Markdown 内容转换为适合 Google Sites 的纯文本（保留段落结构） */
function markdownToPlainSections(markdown: string): { type: "h1" | "h2" | "h3" | "p"; text: string }[] {
  const lines = markdown.split("\n");
  const sections: { type: "h1" | "h2" | "h3" | "p"; text: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      sections.push({ type: "h3", text: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith("## ")) {
      sections.push({ type: "h2", text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("# ")) {
      sections.push({ type: "h1", text: trimmed.slice(2).trim() });
    } else {
      // 去除 Markdown 格式符号
      const plain = trimmed
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "");
      if (plain) sections.push({ type: "p", text: plain });
    }
  }

  return sections;
}

/** 生成 URL 友好的 slug */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u4e00-\u9fa5]+/g, (match) => {
      // 中文字符转拼音近似处理（实际项目可引入 pinyin 库）
      return match.split("").map(() => "x").join("");
    })
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}

/** 随机延迟（模拟真人操作节奏） */
function randomDelay(min = 500, max = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 主发布类 ─────────────────────────────────────────────────────────────────
export class GoogleSitesPublisher {
  private browser: Browser | null = null;
  private log: string[] = [];

  private addLog(msg: string) {
    const ts = new Date().toISOString();
    this.log.push(`[${ts}] ${msg}`);
    console.log(`[GSP Publisher] ${msg}`);
  }

  /** 启动浏览器（应用账号独立指纹和代理） */
  private async launchBrowser(options: PublishOptions): Promise<Browser> {
    const fp = options.fingerprint;
    const windowW = fp?.windowWidth ?? 1280;
    const windowH = fp?.windowHeight ?? 800;
    const lang = fp?.language ?? "zh-CN,zh";

    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      `--window-size=${windowW},${windowH}`,
      `--lang=${lang}`,
      // 防指纹检测相关参数
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ];

    if (fp?.timezone) {
      args.push(`--timezone=${fp.timezone}`);
    }

    if (options.proxy) {
      const protocol = options.proxy.protocol ?? "http";
      args.push(`--proxy-server=${protocol}://${options.proxy.host}:${options.proxy.port}`);
    }

    // 使用 Puppeteer 自动下载的 Chromium（避免系统依赖问题）
    // 如果系统 Chromium 可用，Puppeteer 会优先使用；否则自动下载
    const browser = await puppeteerExtra.launch({
      headless: options.headless !== false,
      args,
      defaultViewport: { width: windowW, height: windowH },
      timeout: options.timeout ?? 120000,
    } as any);

    this.addLog("浏览器已启动");
    return browser;
  }

  /** 注入 Cookie 并验证登录状态 */
  private async injectCookiesAndVerify(page: Page, cookies: CookieEntry[]): Promise<boolean> {
    this.addLog(`注入 ${cookies.length} 条 Cookie...`);

    // 策略：先设置 Cookie，再导航到目标页面（避免先导航触发 Google 反自动化检测）
    // 分别为不同域名设置 Cookie
    const googleDomains = [".google.com", "accounts.google.com", "sites.google.com"];

    for (const cookie of cookies) {
      try {
        // 确保 domain 格式正确（必须以 . 开头或为完整域名）
        let domain = cookie.domain || ".google.com";
        if (!domain.startsWith('.') && !domain.startsWith('http')) {
          domain = '.' + domain;
        }
        // 兼容 Chrome 扩展导出格式（expirationDate）和标准格式（expires）
        const expiresTs = cookie.expires ?? (cookie as any).expirationDate;
        // sameSite 字段兼容：Chrome 导出格式映射到 Puppeteer 支持的值
        // Chrome 导出值: "unspecified", "no_restriction", "lax", "strict"
        // Puppeteer 支持值: "Strict", "Lax", "None"
        const rawSameSite = (cookie as any).sameSite as string | undefined;
        let sameSite: "Strict" | "Lax" | "None" | undefined;
        if (rawSameSite) {
          const lower = rawSameSite.toLowerCase();
          if (lower === 'strict') sameSite = 'Strict';
          else if (lower === 'lax') sameSite = 'Lax';
          else if (lower === 'none' || lower === 'no_restriction') sameSite = 'None';
          // 'unspecified' → undefined（不设置 sameSite，让浏览器使用默认值）
        }
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain,
          path: cookie.path || "/",
          ...(expiresTs !== undefined ? { expires: Math.floor(expiresTs) } : {}),
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          ...(sameSite ? { sameSite } : {}),
        });
      } catch (e) {
        // 忽略单条 Cookie 设置失败
      }
    }

    this.addLog("Cookie 已设置，导航到 Google Sites 验证登录状态...");

    // 验证：直接导航到 sites.google.com（我们实际要用的服务）
    // 而不是 myaccount.google.com（对自动化工具更严格）
    await page.goto("https://sites.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(1000, 1500);

    const url = page.url();
    this.addLog(`导航后 URL: ${url}`);

    // 判断是否登录成功：
    // - 如果还在 accounts.google.com 登录页 → 失败
    // - 如果在 sites.google.com → 成功
    const isRedirectedToLogin = url.includes("accounts.google.com/signin") ||
      url.includes("accounts.google.com/v3") ||
      url.includes("/ServiceLogin") ||
      url.includes("/CheckCookie");

    const isOnSites = url.includes("sites.google.com");

    // 如果被重定向到登录页，尝试第二种验证方式
    if (isRedirectedToLogin) {
      this.addLog(`被重定向到登录页: ${url}`);
      // 尝试导航到 drive.google.com 作为备选验证
      await page.goto("https://drive.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
      await randomDelay(800, 1200);
      const driveUrl = page.url();
      this.addLog(`Drive URL: ${driveUrl}`);
      const isOnDrive = driveUrl.includes("drive.google.com") && !driveUrl.includes("accounts.google.com");
      if (isOnDrive) {
        this.addLog("Cookie 验证成功（通过 Drive 验证）");
        return true;
      }
      this.addLog("Cookie 验证失败，账号可能已过期");
      return false;
    }

    if (isOnSites) {
      this.addLog("Cookie 验证成功，已登录 Google 账号");
      return true;
    }

    // 其他情况：输出调试信息
    this.addLog(`未知状态，当前 URL: ${url}，尝试继续...`);
    // 如果 URL 不是登录页，就认为登录成功
    return !isRedirectedToLogin;
  }

  /** 从页面请求中捕获的 token（用于 API 调用） */
  private capturedToken: string | null = null;

  /** 创建新的 Google Site 或导航到已有 Site */
  private async navigateToSite(page: Page, options: PublishOptions): Promise<string> {
    // 重置 token
    this.capturedToken = null;

    // 启动请求监听，从多种方式中提取 token
    const capturedRequests: any[] = [];
    const tokenHandler = (req: any) => {
      try {
        const url: string = req.url();
        const postData = req.postData();
        
        // 记录所有 API 请求用于调试
        if (url.includes('googleapis.com') || url.includes('sites.google.com') || url.includes('google.com/rpc')) {
          capturedRequests.push({ url, hasPostData: !!postData });
        }
        
        // 方法 1: 从 URL 参数中提取 token
        if (url.includes('/bind?') || url.includes('/bind ')) {
          const match = url.match(/[?&]token=([^&]+)/);
          if (match && match[1]) {
            const token = decodeURIComponent(match[1]);
            if (!this.capturedToken) {
              this.capturedToken = token;
              this.addLog(`✅ 从 bind URL 参数捕获 token: ${token.slice(0, 30)}...`);
            }
          }
        }
        
        // 方法 2: 从 POST 数据中提取 token
        if (!this.capturedToken && postData) {
          try {
            const patterns = [
              /"token":"([^"]+)"/,
              /"accessToken":"([^"]+)"/,
              /"access_token":"([^"]+)"/,
              /"auth":"([^"]+)"/,
              /"sid":"([^"]+)"/,
            ];
            
            for (const pattern of patterns) {
              const match = postData.match(pattern);
              if (match && match[1] && match[1].length > 20) {
                const token = match[1];
                this.capturedToken = token;
                this.addLog(`✅ 从 POST 数据捕获 token: ${token.slice(0, 30)}...`);
                break;
              }
            }
          } catch {}
        }
      } catch {}
    };
    page.on('request', tokenHandler);

    // ── 第一步：用固定站点获取 OAuth token ──────────────────────────────────────
    if (options.siteUrl) {
      // 从 siteUrl 中提取 Site ID，构建根编辑器 URL，仅用于捕获 token
      const siteIdMatch = options.siteUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      let targetUrl = options.siteUrl;
      if (siteIdMatch) {
        targetUrl = `https://sites.google.com/d/${siteIdMatch[1]}/edit`;
        this.addLog(`提取 Site ID: ${siteIdMatch[1]}，导航到固定站点获取 token: ${targetUrl}`);
      } else {
        this.addLog(`导航到固定站点获取 token: ${targetUrl}`);
      }
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

      const editorUrl = page.url();
      this.addLog(`导航后 URL: ${editorUrl}`);

      // 如果被重定向到登录页，说明 Cookie 失效
      if (editorUrl.includes('accounts.google.com') || editorUrl.includes('/signin')) {
        page.off('request', tokenHandler);
        throw new Error('导航到 Site 时被重定向到登录页，Cookie 可能已失效');
      }

      // 等待 token 被捕获（最多 20 秒）
      const tokenWaitStart = Date.now();
      while (!this.capturedToken && Date.now() - tokenWaitStart < 20000) {
        await randomDelay(500, 500);
      }

      if (this.capturedToken) {
        this.addLog(`token 捕获成功`);
      } else {
        this.addLog(`等待 token 超时，尝试从页面 JS 上下文提取`);
        try {
          const tokenFromPage = await page.evaluate(() => {
            if ((window as any).token) return (window as any).token;
            if ((window as any)._token) return (window as any)._token;
            const lsToken = localStorage.getItem('token');
            if (lsToken) return lsToken;
            const url = window.location.href;
            const match = url.match(/[?&]token=([^&]+)/);
            if (match && match[1]) return decodeURIComponent(match[1]);
            return null;
          });
          if (tokenFromPage) {
            this.capturedToken = tokenFromPage;
            this.addLog(`✅ 从页面 JS 上下文提取 token: ${tokenFromPage.slice(0, 30)}...`);
          } else {
            this.addLog(`⚠️ 无法从页面中提取 token`);
          }
        } catch (err) {
          this.addLog(`⚠️ 从页面提取 token 失败: ${err}`);
        }
      }
    } else {
      this.addLog('未配置固定站点 URL，跳过 token 获取步骤');
    }

    page.off('request', tokenHandler);

    // ── 第二步：每次都创建全新的 Google Sites 站点 ────────────────────────────────
    this.addLog('导航到 Google Sites 创建全新站点...');
    await page.goto('https://sites.google.com/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);

    const newPageUrl = page.url();
    this.addLog(`当前 URL: ${newPageUrl}`);

    // 如果还在 /new 页面（模板选择页），需要点击空白模板
    if (newPageUrl.includes('/new') || !newPageUrl.includes('/d/')) {
      this.addLog('在模板选择页，尝试点击空白模板...');

      // 输出页面上所有可点击元素，帮助调试
      try {
        const clickables = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[role="button"], button, [tabindex="0"]'));
          return els.slice(0, 20).map(el => ({
            tag: el.tagName,
            ariaLabel: el.getAttribute('aria-label'),
            text: el.textContent?.trim().slice(0, 50),
            class: el.className?.slice(0, 50),
          }));
        });
        this.addLog(`模板选择页可点击元素: ${JSON.stringify(clickables)}`);
      } catch {}

      // 尝试多种选择器点击空白模板
      const blankSelectors = [
        '[aria-label="Blank"]',
        '[aria-label="空白"]',
        '[data-id="blank"]',
        '[jsname="blank"]',
      ];

      let clicked = false;
      for (const sel of blankSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            clicked = true;
            this.addLog(`点击了空白模板: ${sel}`);
            break;
          }
        } catch {}
      }

      if (!clicked) {
        // 通过文字查找
        try {
          const found = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('[role="button"], div[tabindex="0"]'));
            const blank = els.find(el => {
              const text = el.textContent?.trim().toLowerCase();
              return text === 'blank' || text === '空白' || el.getAttribute('aria-label')?.toLowerCase().includes('blank');
            });
            if (blank) { (blank as HTMLElement).click(); return true; }
            return false;
          });
          if (found) {
            clicked = true;
            this.addLog('通过文字查找点击了空白模板');
          }
        } catch {}
      }

      if (clicked) {
        // 等待跳转到新站点编辑器（URL 包含 /d/）
        try {
          await page.waitForFunction(
            () => window.location.href.includes('/d/'),
            { timeout: 25000 }
          );
          this.addLog('✅ 已跳转到新站点编辑器');
        } catch {
          this.addLog('⚠️ 等待跳转到编辑器超时');
        }
      } else {
        this.addLog('⚠️ 未能点击空白模板');
        // 如果无法新建站点，回退到固定站点（如果有配置）
        if (options.siteUrl) {
          this.addLog('回退：使用固定站点编辑器');
          const siteIdMatch = options.siteUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          const fallbackUrl = siteIdMatch
            ? `https://sites.google.com/d/${siteIdMatch[1]}/edit`
            : options.siteUrl;
          await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } else {
          throw new Error('无法创建新 Google Sites 站点，且未配置固定站点 URL');
        }
      }
    }

    const newSiteUrl = page.url();
    this.addLog(`✅ 新站点编辑器 URL: ${newSiteUrl}`);
    return newSiteUrl;
  }

  /** 在 Google Sites 中创建新页面并填入内容 */
  private async createPageWithContent(page: Page, title: string, content: string): Promise<string> {
    this.addLog(`开始创建页面: ${title}`);

    // ── 网络请求捕获：记录所有 API 调用 ────────────────────────────────────────────
    const capturedRequests: { url: string; method: string; body?: string }[] = [];
    const requestHandler = (req: any) => {
      try {
        const url = req.url();
        if (url.includes('sites.google.com')) {
          capturedRequests.push({
            url: url.slice(0, 200),
            method: req.method(),
            body: req.postData()?.slice(0, 300),
          });
        }
      } catch {}
    };
    page.on('request', requestHandler);

    const sections = markdownToPlainSections(content);
    this.addLog(`内容解析完成，共 ${sections.length} 个段落/标题`);

    // ── 阶段1：等待编辑器加载 ──────────────────────────────────────────────────
    // 等待 Google Sites 编辑器完全加载（等待内容区域出现）
    try {
      await page.waitForSelector(
        '[contenteditable="true"], [data-placeholder], .docs-texteventtarget-iframe',
        { timeout: 20000 }
      );
      this.addLog("编辑器已加载");
    } catch {
      this.addLog("等待编辑器超时，尝试继续...");
    }

    // 获取当前 URL 和 docId（用于后续 API 调用）
    const editorUrl = page.url();
    const docIdMatch = editorUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const docId = docIdMatch ? docIdMatch[1] : null;
    this.addLog(`当前 URL: ${editorUrl}, docId: ${docId}`);

    // ── 截图调试：保存编辑器截图和 DOM 结构 ────────────────────────────────────
    try {
      // 保存截图
      await page.screenshot({ path: '/tmp/gsp_editor_debug.png', fullPage: false });
      this.addLog('截图已保存到 /tmp/gsp_editor_debug.png');

      // 输出页面中所有 contenteditable 元素的信息
      const editableEls = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[contenteditable]'));
        return els.map(el => ({
          tag: el.tagName,
          contenteditable: el.getAttribute('contenteditable'),
          ariaLabel: el.getAttribute('aria-label'),
          dataPlaceholder: el.getAttribute('data-placeholder'),
          role: el.getAttribute('role'),
          className: el.className?.slice(0, 80),
          text: el.textContent?.trim().slice(0, 50),
          id: el.id,
        }));
      });
      this.addLog(`页面 contenteditable 元素 (${editableEls.length}个): ${JSON.stringify(editableEls.slice(0, 10))}`);

      // 输出页面中所有 iframe 信息
      const iframes = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('iframe'));
        return els.map(el => ({
          src: el.src?.slice(0, 100),
          id: el.id,
          className: el.className?.slice(0, 50),
          ariaLabel: el.getAttribute('aria-label'),
        }));
      });
      this.addLog(`页面 iframe (${iframes.length}个): ${JSON.stringify(iframes.slice(0, 5))}`);
    } catch (debugErr) {
      this.addLog(`调试信息获取失败: ${debugErr}`);
    }

    // ── 阶段2：写入标题和正文内容 ────────────────────────────────────────────
    // Google Sites 编辑器中，文本组件默认 contenteditable="false"
    // 需要先双击激活编辑模式，才能输入内容

    // 等待文本组件出现 - 尝试多种选择器
    let textboxEl = null;
    
    // 尝试多种选择器找到文本组件
    const selectors = [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[data-placeholder]',
      '.docs-texteventtarget-iframe',
      '[jsname="aXBDCe"]', // Google Sites 特定的编辑器
      'div[role="main"] [contenteditable]',
      'div[data-editable-id]',
    ];
    
    for (const selector of selectors) {
      try {
        textboxEl = await page.$(selector);
        if (textboxEl) {
          this.addLog(`找到文本组件: ${selector}`);
          break;
        }
      } catch {}
    }
    
    if (!textboxEl) {
      this.addLog('未找到文本组件，尝试使用页面评估找到');
      try {
        textboxEl = await page.evaluateHandle(() => {
          // 查找任何 contenteditable 元素
          let el = document.querySelector('[contenteditable="true"]');
          if (!el) el = document.querySelector('[role="textbox"]');
          if (!el) el = document.querySelector('[data-placeholder]');
          if (!el) {
            // 作为最后的余地，找到主要内容区域
            const main = document.querySelector('div[role="main"]');
            if (main) el = main.querySelector('div');
          }
          return el;
        });
        this.addLog('通过页面评估找到了元素');
      } catch {}
    }

    let contentWritten = false;

    if (textboxEl) {
      try {
        // 双击激活编辑模式
        await page.evaluate((el) => {
          const evt = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
          (el as HTMLElement).dispatchEvent(evt);
        }, textboxEl);
        await randomDelay(500, 800);

        // 检查是否进入了编辑模式
        const isEditable = await page.evaluate(() => {
          const el = document.querySelector('[role="textbox"]');
          return el?.getAttribute('contenteditable') === 'true';
        });
        this.addLog(`双击后 contenteditable: ${isEditable}`);

        // 全选并删除原有内容
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await randomDelay(100, 200);
        await page.keyboard.press('Delete');
        await randomDelay(100, 200);

        // 写入标题（第一行）
        await page.keyboard.type(title, { delay: 20 });
        await page.keyboard.press('Enter');
        await randomDelay(100, 200);

        // 写入正文内容
        for (const section of sections) {
          if (section.type === 'h1') continue; // 标题已单独写入
          await page.keyboard.type(section.text, { delay: 10 });
          await page.keyboard.press('Enter');
          await randomDelay(10, 20);
        }

        contentWritten = true;
        this.addLog(`内容已写入，标题: ${title}，共 ${sections.length} 段`);
      } catch (e) {
        this.addLog(`内容写入失败: ${e}`);
      }
    }

    if (!contentWritten) {
      this.addLog('内容写入失败，将发布当前页面内容');
    }

    // ── 关键修复：等待自动保存完成 ────────────────────────────────────
    // Google Sites 编辑器会自动保存内容，需要等待保存完成后再发布
    // 通过监听网络请求来检测自动保存
    if (contentWritten) {
      this.addLog('等待 Google Sites 自动保存...');
      
      let saveDetected = false;
      const saveHandler = (req: any) => {
        try {
          const url = req.url();
          // 检测保存相关的请求（通常包含 'save', 'update', 'commit' 等）
          if (url.includes('/save') || url.includes('/update') || url.includes('/commit')) {
            saveDetected = true;
            this.addLog('检测到自动保存请求');
          }
        } catch {}
      };
      
      page.on('request', saveHandler);
      
      // 等待最多 15 秒，让自动保存完成
      const saveWaitStart = Date.now();
      while (Date.now() - saveWaitStart < 15000) {
        if (saveDetected) {
          this.addLog('自动保存已完成');
          break;
        }
        await randomDelay(500, 500);
      }
      
      page.off('request', saveHandler);
      
      if (!saveDetected) {
        this.addLog('未检测到自动保存，继续发布（Google Sites 可能已自动保存）');
      }
    }

    await randomDelay(500, 1000);

    await randomDelay(300, 600);


    // ── 阶段4：点击发布按钮让 Google Sites 自动处理 ────────────────────────────────────
    // 关键修复：不再直接调用 API，而是让 Google Sites 编辑器自动保存并发布
    // 这样可以确保编辑器中的内容被正确保存和发布
    
    this.addLog('等待发布按钮出现...');
    
    let publishedUrl: string = '';
    let publishSuccess = false;
    let usedSlug: string = '';
    
    try {
      // 尝试找到发布按钮（右上角蓝色主按钮，文字精确为"发布"或"Publish"）
      const publishBtnInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const btn = buttons.find(b => {
          const text = b.textContent?.trim() || '';
          return text === '发布' || text === 'Publish' || text === 'publish';
        });
        if (btn) return { found: true, text: btn.textContent?.trim(), className: btn.className?.slice(0, 60) };
        return { found: false };
      });
      
      if (publishBtnInfo.found) {
        this.addLog(`找到发布按钮（文字: "${publishBtnInfo.text}"），点击发布...`);
        
        // 点击发布按钮
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          const btn = buttons.find(b => {
            const text = b.textContent?.trim() || '';
            return text === '发布' || text === 'Publish' || text === 'publish';
          });
          if (btn) (btn as HTMLElement).click();
        });
        
        await randomDelay(2000, 3000);
        
        // 等待发布对话框（"发布到网络" 弹窗）
        this.addLog('等待发布对话框...');
        try {
          await page.waitForSelector(
            '[role="dialog"], [data-dialog], .VfPpkd-P5QLlc, .VfPpkd-xl07Ob-XxIAqe, [jsname="haAclf"]',
            { timeout: 8000 }
          ).catch(() => null);
          await randomDelay(800, 1200);
          
          // 调试：输出弹窗内容
          const dialogInfo = await page.evaluate(() => {
            const selectors = ['[role="dialog"]', '[data-dialog]', '.VfPpkd-P5QLlc', '[jsname="haAclf"]'];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) return { selector: sel, html: el.innerHTML.slice(0, 300) };
            }
            return null;
          });
          this.addLog(`弹窗内容: ${JSON.stringify(dialogInfo)}`);
          
          // 生成随机 slug（全新站点，URL 框必然为空）
          const newSlug = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
          this.addLog(`生成随机 slug: ${newSlug}`);
          usedSlug = newSlug;
          
          // 填写弹窗内的输入框：标题框填文章标题，URL 框填随机 slug
          const fillResult = await page.evaluate((params: { slug: string; title: string }) => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'));
            
            function fillInput(input: HTMLInputElement, value: string) {
              input.focus();
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (setter) setter.call(input, value);
              else input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // 1. 标题框：不是 URL 框且不是字体大小框
            const titleInput = inputs.find(i => {
              const ariaLabel = i.getAttribute('aria-label') || '';
              return ariaLabel !== '字体大小' && ariaLabel !== 'Font size' 
                && ariaLabel !== '网站名称' && ariaLabel !== 'Site name' && ariaLabel !== 'Web address';
            }) as HTMLInputElement | undefined;
            if (titleInput) fillInput(titleInput, params.title);
            
            // 2. URL 框：ariaLabel="网站名称" 或备用空值框
            let urlInput = inputs.find(i => {
              const ariaLabel = i.getAttribute('aria-label') || '';
              return ariaLabel === '网站名称' || ariaLabel === 'Site name' || ariaLabel === 'Web address';
            }) as HTMLInputElement | undefined;
            if (!urlInput) {
              urlInput = inputs.find(i => {
                const val = (i as HTMLInputElement).value || '';
                const ariaLabel = i.getAttribute('aria-label') || '';
                return val === '' && ariaLabel !== '字体大小' && ariaLabel !== 'Font size';
              }) as HTMLInputElement | undefined;
            }
            // 全新站点，直接填入新 slug
            if (urlInput) fillInput(urlInput as HTMLInputElement, params.slug);
            
            return {
              titleFilled: !!titleInput,
              titleValue: titleInput?.value,
              urlFilled: !!urlInput,
              urlValue: (urlInput as HTMLInputElement | undefined)?.value,
            };
          }, { slug: newSlug, title });
          this.addLog(`输入框填写结果: ${JSON.stringify(fillResult)}`);
          this.addLog(`✅ 全新站点，填入 slug: "${newSlug}"，标题: "${fillResult.titleValue}"`);
          
          await randomDelay(2500, 3500); // 等待 Google 验证 slug 可用性
          
          // 点击弹窗内的确认发布按钮
          const confirmResult = await page.evaluate(() => {
            // 优先在 dialog 内找
            const dialog = document.querySelector('[role="dialog"]');
            if (dialog) {
              const dialogBtns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
              const btn = dialogBtns.find(b => {
                const text = b.textContent?.trim() || '';
                const isDisabled = (b as HTMLButtonElement).disabled;
                return !isDisabled && (text === '发布' || text === 'Publish');
              });
              if (btn) {
                (btn as HTMLElement).click();
                return `dialog内 "${btn.textContent?.trim()}"`;
              }
            }
            // 备用：全页面找，跳过工具栏按钮（className 含 UQuaGc）
            const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
            const btn = allBtns.find(b => {
              const text = b.textContent?.trim() || '';
              const isDisabled = (b as HTMLButtonElement).disabled;
              const cls = b.className || '';
              if (cls.includes('UQuaGc') && !dialog?.contains(b)) return false;
              return !isDisabled && (text === '发布' || text === 'Publish');
            });
            if (btn) {
              (btn as HTMLElement).click();
              return `全页面 "${btn.textContent?.trim()}"`;
            }
            return null;
          });
          
          if (confirmResult) {
            this.addLog(`✅ 已点击弹窗内发布按钮: "${confirmResult}"`);
          } else {
            this.addLog('⚠️ 未找到弹窗内发布按钮');
          }
          
        } catch (e) {
          this.addLog(`等待发布对话框超时: ${e}`);
        }
        
        // 等待发布完成
        this.addLog('等待发布完成...');
        await randomDelay(4000, 6000);
        
        // 尝试等待工具栏"复制已发布网站的链接"按钮出现，确认发布成功
        try {
          await page.waitForFunction(
            () => {
              const btns = Array.from(document.querySelectorAll('[aria-label]'));
              return btns.some(b => {
                const label = b.getAttribute('aria-label') || '';
                return label.includes('复制已发布') || label.includes('Copy the published');
              });
            },
            { timeout: 8000 }
          );
          this.addLog('✅ 工具栏显示"复制已发布网站的链接"，发布成功！');
        } catch {
          this.addLog('工具栏未检测到发布成功标志，继续使用填入的 slug...');
        }
        
        // 使用填入的 slug 构建真实 URL
        if (usedSlug) {
          publishedUrl = `https://sites.google.com/view/${usedSlug}/`;
          publishSuccess = true;
          this.addLog(`✅ 发布完成，slug: ${usedSlug}，URL: ${publishedUrl}`);
        } else {
          this.addLog('未找到 slug，发布可能失败');
          publishSuccess = false;
        }
      } else {
        this.addLog('未找到发布按钮，尝试使用 API 发布...');
        
        // 回退到 API 方式
        const slugBase = title
          .toLowerCase()
          .replace(/[\u4e00-\u9fa5]/g, 'x')
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 20) || 'site';
        const siteSlug = `${slugBase}-${Date.now().toString(36)}`;
        this.addLog(`生成 slug: ${siteSlug}`);

        const tokenForApi = this.capturedToken;
        this.addLog(`使用 token: ${tokenForApi ? tokenForApi.slice(0, 30) + '...' : '未捕获到 token'}`);

        const publishResult = await page.evaluate(async (params: {
          docId: string;
          slug: string;
          token: string | null;
        }) => {
          const { docId, slug, token } = params;

          if (!token) {
            return { success: false, error: '未捕获到 token，请确认已配置 Google Site 编辑器地址' };
          }

          const baseUrl = `https://sites.google.com/u/0/d/${docId}`;
          const commonParams = `token=${encodeURIComponent(token)}&authuser=0`;

          const doPost = async (endpoint: string, body: string) => {
            const resp = await fetch(`${baseUrl}/${endpoint}?${commonParams}`, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
              body: `f.req=${encodeURIComponent(body)}`,
              credentials: 'include',
            });
            const text = await resp.text();
            return { status: resp.status, text };
          };

          try {
            // 1. 检查 slug 是否可用
            const checkResp = await doPost('sitename/check', `[null,["at:snd:sn","${slug}",1]]`);
            const checkAvailable = checkResp.text.includes('"at:sna:csnrs",true');
            if (!checkAvailable) {
              const newSlug = slug + '-' + Math.random().toString(36).slice(2, 6);
              const checkResp2 = await doPost('sitename/check', `[null,["at:snd:sn","${newSlug}",1]]`);
              if (!checkResp2.text.includes('"at:sna:csnrs",true')) {
                return { success: false, error: 'slug 已被占用，无法创建' };
              }
              const createResp = await doPost('sitename/create', `[null,["at:snd:sn","${newSlug}",1]]`);
              await doPost('publish/setpublishingsettings', '["at:pa:spsrq",null,["at:pd:uips",1]]');
              await doPost('publish/publish', '["at:pa:prq",null,1,null,1,15,null,null,0]');
              return { success: true, slug: newSlug };
            }

            const createResp = await doPost('sitename/create', `[null,["at:snd:sn","${slug}",1]]`);
            await doPost('publish/setpublishingsettings', '["at:pa:spsrq",null,["at:pd:uips",1]]');
            await doPost('publish/publish', '["at:pa:prq",null,1,null,1,15,null,null,0]');

            return { success: true, slug };
          } catch (e: any) {
            return { success: false, error: e?.message || String(e) };
          }
        }, { docId: docId!, slug: siteSlug, token: this.capturedToken }) as any;
        
        this.addLog(`API 发布结果: ${JSON.stringify(publishResult)}`);
        
        if (publishResult.success && publishResult.slug) {
          publishedUrl = `https://sites.google.com/view/${publishResult.slug}/`;
          publishSuccess = true;
          this.addLog(`✅ 发布成功！URL: ${publishedUrl}`);
        } else {
          this.addLog(`API 发布失败: ${publishResult.error || '未知错误'}`);
          publishSuccess = false;
        }
      }
    } catch (e) {
      this.addLog(`发布过程出错: ${e}`);
      publishSuccess = false;
    }

    if (!publishSuccess) {
      // 最后的回退方案
      const slugBase = title
        .toLowerCase()
        .replace(/[\u4e00-\u9fa5]/g, 'x')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 20) || 'site';
      const fallbackSlug = `${slugBase}-${Date.now().toString(36)}`;
      publishedUrl = `https://sites.google.com/view/${fallbackSlug}/`;
      this.addLog(`使用回退 slug: ${fallbackSlug}`);
    }

    // 输出捕获的网络请求（用于调试）
    this.addLog(`捕获的 API 请求 (${capturedRequests.length}个):`);
    for (let i = 0; i < Math.min(10, capturedRequests.length); i++) {
      const req = capturedRequests[i];
      this.addLog(`  [${i+1}] ${req.method} ${req.url}`);
      if (req.body) {
        this.addLog(`      Body: ${req.body}`);
      }
    }
    page.off('request', requestHandler);

        this.addLog(`发布完成，URL: ${publishedUrl}`);
    return publishedUrl;

  }

  /** 主发布方法 */
  async publish(options: PublishOptions): Promise<PublishResult> {
    this.log = [];
    this.addLog(`开始发布任务: ${options.title}`);

    try {
      this.browser = await this.launchBrowser(options);
      const page = await this.browser.newPage();

      const fp = options.fingerprint;

      // 应用账号独立指纹：User-Agent
      const userAgent = fp?.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
      await page.setUserAgent(userAgent);

      // 注入指纹覆盖（覆盖 navigator 属性，防止 Google 检测自动化和设备指纹）
      if (fp) {
        await page.evaluateOnNewDocument((fingerprint) => {
          // 覆盖 navigator.platform
          Object.defineProperty(navigator, 'platform', { get: () => fingerprint.platform });
          // 覆盖 navigator.language
          Object.defineProperty(navigator, 'language', { get: () => fingerprint.language });
          Object.defineProperty(navigator, 'languages', { get: () => [fingerprint.language, 'en'] });
          // 覆盖 navigator.hardwareConcurrency
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fingerprint.hardwareConcurrency });
          // 覆盖 navigator.deviceMemory
          Object.defineProperty(navigator, 'deviceMemory', { get: () => fingerprint.deviceMemory });
          // 覆盖屏幕分辨率
          Object.defineProperty(screen, 'width', { get: () => fingerprint.screenWidth });
          Object.defineProperty(screen, 'height', { get: () => fingerprint.screenHeight });
          Object.defineProperty(screen, 'colorDepth', { get: () => fingerprint.colorDepth });
          // 隐藏自动化标识
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          // 删除 chrome.runtime 中的自动化标识
          if ((window as any).chrome) {
            (window as any).chrome.runtime = {};
          }
        }, fp);
      }

      // 代理认证
      if (options.proxy?.username && options.proxy?.password) {
        await page.authenticate({
          username: options.proxy.username,
          password: options.proxy.password,
        });
      }

      // 注入 Cookie 并验证
      const isLoggedIn = await this.injectCookiesAndVerify(page, options.cookieParsed);
      if (!isLoggedIn) {
        return {
          success: false,
          errorMessage: "Cookie 已过期，请重新导入账号 Cookie",
          log: this.log,
        };
      }

      // 导航到 Site
      const siteUrl = await this.navigateToSite(page, options);

      // 创建页面并填入内容
      const publishedUrl = await this.createPageWithContent(page, options.title, options.content);

      this.addLog("发布任务完成！");
      return {
        success: true,
        publishedUrl,
        siteUrl,
        log: this.log,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.addLog(`发布失败: ${msg}`);
      return {
        success: false,
        errorMessage: msg,
        log: this.log,
      };
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.addLog("浏览器已关闭");
      }
    }
  }

  /** 仅验证 Cookie 是否有效 */
  async verifyCookie(cookieParsed: CookieEntry[], proxy?: PublishOptions["proxy"]): Promise<{ valid: boolean; email?: string; log: string[] }> {
    this.log = [];
    this.addLog("开始验证 Cookie...");

    try {
      this.browser = await this.launchBrowser({ cookieParsed, siteName: "", title: "", content: "", proxy, headless: true });
      const page = await this.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      const isLoggedIn = await this.injectCookiesAndVerify(page, cookieParsed);

      let email: string | undefined;
      if (isLoggedIn) {
        try {
          // 尝试获取账号邮箱
          email = await page.evaluate(() => {
            const el = document.querySelector('[data-email]');
            return el?.getAttribute('data-email') ?? undefined;
          });
        } catch {
          // 忽略
        }
      }

      return { valid: isLoggedIn, email, log: this.log };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.addLog(`验证失败: ${msg}`);
      return { valid: false, log: this.log };
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }
}

// 单例导出
export const googleSitesPublisher = new GoogleSitesPublisher();
