/**
 * Google Sites Publisher Engine
 * 使用 Puppeteer 模拟真人操作，通过 Cookie 登录 Google Sites 并发布文章
 */
import fs from "fs";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer-core";
import type { BrowserFingerprint } from "./fingerprint.js";

// 自动检测 Chromium 可执行文件路径
// 优先级：puppeteer 内置 Chromium（~/.cache/puppeteer）> 系统安装的真实二进制 > 最终兜底
function detectChromiumPath(): string {
  // 1. 优先使用 puppeteer 内置 Chromium（生产环境最可靠，由 pnpm install 自动下载）
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer");
    const builtinPath = puppeteer.executablePath();
    if (builtinPath) {
      const stat = fs.statSync(builtinPath);
      if (stat.isFile() && (stat.mode & 0o111)) {
        console.log(`[Chromium] 使用 puppeteer 内置 Chromium: ${builtinPath}`);
        return builtinPath;
      }
    }
  } catch {
    // puppeteer 未安装或路径无效，继续尝试系统路径
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

  // 3. 最终兜底
  console.warn(`[Chromium] 未找到有效 Chromium，使用兜底路径`);
  return "/usr/bin/chromium-browser";
}

const CHROMIUM_PATH = detectChromiumPath();

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
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
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

    const browser = await puppeteerExtra.launch({
      executablePath: CHROMIUM_PATH,
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

    // 先导航到 Google 域名，再设置 Cookie
    await page.goto("https://accounts.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(500, 1000);

    for (const cookie of cookies) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || ".google.com",
          path: cookie.path || "/",
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        });
      } catch (e) {
        // 忽略单条 Cookie 设置失败
      }
    }

    // 验证登录状态
    await page.goto("https://myaccount.google.com", { waitUntil: "networkidle2", timeout: 30000 });
    await randomDelay(1000, 2000);

    const url = page.url();
    const isLoggedIn = !url.includes("accounts.google.com/signin") && !url.includes("accounts.google.com/v3");

    if (isLoggedIn) {
      this.addLog("Cookie 验证成功，已登录 Google 账号");
    } else {
      this.addLog("Cookie 验证失败，账号可能已过期");
    }

    return isLoggedIn;
  }

  /** 创建新的 Google Site 或导航到已有 Site */
  private async navigateToSite(page: Page, options: PublishOptions): Promise<string> {
    if (options.siteUrl) {
      // 已有 Site，直接导航
      this.addLog(`导航到已有 Site: ${options.siteUrl}`);
      await page.goto(options.siteUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await randomDelay(1000, 2000);
      return options.siteUrl;
    }

    // 创建新 Site
    this.addLog("导航到 Google Sites 首页...");
    await page.goto("https://sites.google.com/new", { waitUntil: "networkidle2", timeout: 30000 });
    await randomDelay(2000, 3000);

    // 等待编辑器加载
    try {
      await page.waitForSelector('[data-view-id="SITE_NAME_INPUT"], input[placeholder*="站点名称"], input[placeholder*="Site name"], input[aria-label*="name"]', { timeout: 15000 });
      this.addLog("Google Sites 编辑器已加载");
    } catch {
      this.addLog("等待编辑器超时，尝试继续...");
    }

    const currentUrl = page.url();
    this.addLog(`当前 URL: ${currentUrl}`);
    return currentUrl;
  }

  /** 在 Google Sites 中创建新页面并填入内容 */
  private async createPageWithContent(page: Page, title: string, content: string): Promise<string> {
    this.addLog(`开始创建页面: ${title}`);

    const sections = markdownToPlainSections(content);
    this.addLog(`内容解析完成，共 ${sections.length} 个段落/标题`);

    // 尝试点击"新建页面"按钮
    const newPageSelectors = [
      '[aria-label="New page"]',
      '[data-tooltip="New page"]',
      'button[aria-label*="页面"]',
      '[jsname="Vebqub"]',
    ];

    let clicked = false;
    for (const selector of newPageSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        clicked = true;
        this.addLog(`点击了新建页面按钮: ${selector}`);
        break;
      } catch {
        // 继续尝试下一个选择器
      }
    }

    if (!clicked) {
      this.addLog("未找到新建页面按钮，尝试通过 URL 创建...");
    }

    await randomDelay(1500, 2500);

    // 填入页面标题
    const titleSelectors = [
      '[data-placeholder="Page title"]',
      '[aria-label="Page title"]',
      'input[placeholder*="title"]',
      '[contenteditable="true"][data-is-title]',
    ];

    for (const selector of titleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        await randomDelay(300, 600);
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.type(title, { delay: 50 });
        this.addLog(`已填入标题: ${title}`);
        break;
      } catch {
        // 继续
      }
    }

    await randomDelay(500, 1000);

    // 填入正文内容（逐段落插入）
    const bodySelectors = [
      '[data-placeholder="Start typing..."]',
      '[aria-label="Page content"]',
      '[contenteditable="true"]:not([data-is-title])',
    ];

    for (const selector of bodySelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        this.addLog("已定位到正文编辑区");

        for (const section of sections) {
          if (section.type === "h1") continue; // 标题已单独设置
          await page.keyboard.type(section.text, { delay: 20 });
          await page.keyboard.press("Enter");
          await randomDelay(100, 300);
        }

        this.addLog(`正文内容已填入，共 ${sections.length} 段`);
        break;
      } catch {
        // 继续
      }
    }

    await randomDelay(1000, 2000);

    // 点击发布按钮
    const publishSelectors = [
      '[aria-label="Publish"]',
      'button[data-action="publish"]',
      '[jsname="publish"]',
      'div[role="button"]:has-text("Publish")',
    ];

    for (const selector of publishSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        this.addLog("已点击发布按钮");
        break;
      } catch {
        // 继续
      }
    }

    await randomDelay(2000, 4000);

    // 获取发布后的 URL
    const publishedUrl = page.url();
    this.addLog(`页面已发布，URL: ${publishedUrl}`);

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
