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

    const chromiumPath = await getChromiumPath();
    const browser = await puppeteerExtra.launch({
      executablePath: chromiumPath,
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
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain,
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

  /** 创建新的 Google Site 或导航到已有 Site */
  private async navigateToSite(page: Page, options: PublishOptions): Promise<string> {
    if (options.siteUrl) {
      // 已有 Site，直接导航
      this.addLog(`导航到已有 Site: ${options.siteUrl}`);
      await page.goto(options.siteUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await randomDelay(500, 800);
      return options.siteUrl;
    }

    // 创建新 Site
    this.addLog("导航到 Google Sites 首页...");
    await page.goto("https://sites.google.com/new", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(800, 1200);

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

    // ── 阶段2：填入标题 ────────────────────────────────────────────────────────
    // Google Sites 新站点的标题输入框选择器（多种备选）
    const titleSelectors = [
      '[data-placeholder="Page title"]',
      '[aria-label="Page title"]',
      '[data-placeholder="Title"]',
      '[aria-label="Title"]',
      'h1[contenteditable="true"]',
      '[role="heading"][contenteditable="true"]',
    ];

    let titleFilled = false;
    for (const selector of titleSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await randomDelay(100, 200);
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await page.keyboard.type(title, { delay: 30 });
          titleFilled = true;
          this.addLog(`已填入标题: ${title} (选择器: ${selector})`);
          break;
        }
      } catch {
        // 继续
      }
    }

    if (!titleFilled) {
      // 快速写入失败，回退到键盘输入模式
      this.addLog("未找到标题输入框");
      this.addLog("快速写入失败，回退到键盘输入模式...");
      // 尝试点击页面中央然后输入
      try {
        await page.keyboard.type(title, { delay: 30 });
        this.addLog(`键盘输入标题完成`);
      } catch (e) {
        this.addLog(`键盘输入也失败: ${e}`);
      }
    }

    await randomDelay(200, 400);

    // ── 阶段3：填入正文内容 ────────────────────────────────────────────────────
    const bodySelectors = [
      '[data-placeholder="Start typing..."]',
      '[aria-label="Page content"]',
      '[contenteditable="true"]:not([role="heading"])',
    ];

    for (const selector of bodySelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          this.addLog("已定位到正文编辑区");

          for (const section of sections) {
            if (section.type === "h1") continue; // 标题已单独设置
            await page.keyboard.type(section.text, { delay: 15 });
            await page.keyboard.press("Enter");
            await randomDelay(10, 30);
          }

          this.addLog(`正文内容已填入，共 ${sections.length} 段`);
          break;
        }
      } catch {
        // 继续
      }
    }

    await randomDelay(300, 600);

    // ── 阶段4：设置网络拦截，监听 sitename/create 响应获取真实 slug ────────────
    let capturedSlug: string | null = null;

    // 启用请求拦截
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      req.continue();
    });

    // 监听响应，捕获 sitename/create 的结果
    const responseHandler = async (response: any) => {
      try {
        const url = response.url();
        if (url.includes('/sitename/create')) {
          const text = await response.text();
          // 响应格式: )]}' \n[["at:snd:sn","slug-name"],...]
          const jsonMatch = text.replace(')]}\'\'\n', '').replace(')]}\'\n', '');
          const parsed = JSON.parse(jsonMatch);
          if (Array.isArray(parsed) && parsed[0] && parsed[0][0] === 'at:snd:sn') {
            capturedSlug = parsed[0][1];
            this.addLog(`✅ 网络拦截获取到真实 slug: ${capturedSlug}`);
          }
        }
      } catch {
        // 忽略解析错误
      }
    };
    page.on('response', responseHandler);

    // ── 阶段5：点击发布按钮（打开发布弹窗）────────────────────────────────────
    // Google Sites 发布按钮的多种选择器
    const publishBtnSelectors = [
      '[jsname="RgZmSc"]',
      '[aria-label="Publish"]',
      '[aria-label="发布"]',
      'button[jsname="RgZmSc"]',
    ];

    let publishClicked = false;
    for (const selector of publishBtnSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          publishClicked = true;
          this.addLog(`已点击发布按钮: ${selector}`);
          break;
        }
      } catch {
        // 继续
      }
    }

    if (!publishClicked) {
      // 通过文字查找发布按钮
      try {
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('[role="button"], button'));
          const btn = btns.find(b => {
            const text = b.textContent?.trim();
            return text === 'Publish' || text === '发布';
          });
          if (btn) { (btn as HTMLElement).click(); return true; }
          return false;
        });
        if (clicked) {
          publishClicked = true;
          this.addLog("通过文字查找点击了发布按钮");
        } else {
          this.addLog("API 发布失败，回退到 UI 点击发布...");
        }
      } catch {
        this.addLog("未找到发布按钮");
      }
    }

    // 等待发布弹窗出现
    await randomDelay(1500, 2000);

    // ── 阶段6：在弹窗中填入 slug 并确认 ────────────────────────────────────────
    // 生成站点 URL slug
    const slugBase = title
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5]/g, 'x')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20) || 'site';
    const siteSlug = `${slugBase}-${Date.now().toString(36)}`;
    this.addLog(`生成站点 slug: ${siteSlug}`);

    // 查找弹窗中的 slug 输入框
    const slugInputSelectors = [
      'input[placeholder*="web address"]',
      'input[placeholder*="网址"]',
      'input[aria-label*="web address"]',
      'input[aria-label*="网址"]',
      '[jsname="YPqjbf"]',
      'input[jsname="YPqjbf"]',
      'input[type="text"][jsname]',
    ];

    let slugFilled = false;
    for (const selector of slugInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await page.keyboard.type(siteSlug, { delay: 30 });
          slugFilled = true;
          this.addLog(`已在弹窗中填入站点 slug: ${siteSlug} (选择器: ${selector})`);
          break;
        }
      } catch {
        // 继续
      }
    }

    if (!slugFilled) {
      this.addLog("未找到 slug 输入框，可能弹窗未出现或已有 slug");
    }

    await randomDelay(500, 800);

    // 点击弹窗中的「发布」确认按钮
    const confirmSelectors = [
      '[jsname="M2UYVd"]',
      'button[jsname="M2UYVd"]',
      '.VfPpkd-LgbsSe[data-mdc-dialog-action="ok"]',
      '[data-mdc-dialog-action="ok"]',
    ];

    let confirmed = false;
    for (const selector of confirmSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          confirmed = true;
          this.addLog(`已点击弹窗确认发布按钮: ${selector}`);
          break;
        }
      } catch {
        // 继续
      }
    }

    if (!confirmed) {
      // 通过文字查找弹窗中的确认按钮
      try {
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
          const confirmBtn = btns.find(b => {
            const text = b.textContent?.trim();
            return (text === 'Publish' || text === '发布') && b.closest('[role="dialog"]');
          });
          if (confirmBtn) { (confirmBtn as HTMLElement).click(); return true; }
          return false;
        });
        if (clicked) {
          confirmed = true;
          this.addLog("通过文字查找点击了弹窗确认发布按钮");
        } else {
          this.addLog("未找到弹窗确认发布按钮，通过 UI 点击发布...");
          // 最后尝试：直接点击页面上所有可见的「发布」按钮
          await page.evaluate(() => {
            const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
            const publishBtns = allBtns.filter(b => {
              const text = b.textContent?.trim();
              return text === 'Publish' || text === '发布';
            });
            // 点击最后一个（通常是弹窗中的确认按钮）
            if (publishBtns.length > 0) {
              (publishBtns[publishBtns.length - 1] as HTMLElement).click();
            }
          });
          confirmed = true;
          this.addLog("通过 UI 点击发布...");
        }
      } catch {
        this.addLog("未找到弹窗确认发布按钮，可能弹窗未出现");
      }
    }

    // ── 阶段7：等待发布完成，获取真实 slug ────────────────────────────────────
    // 等待网络请求完成（sitename/create 响应）
    await randomDelay(3000, 4000);

    // 移除事件监听器
    page.off('response', responseHandler);
    await page.setRequestInterception(false);

    // ── 阶段8：构建正确的发布 URL ──────────────────────────────────────────────
    let publishedUrl: string;

    if (capturedSlug) {
      // 优先使用网络拦截获取的真实 slug
      publishedUrl = `https://sites.google.com/view/${capturedSlug}/`;
      this.addLog(`使用网络拦截获取的真实 slug 构建 URL: ${publishedUrl}`);
    } else if (slugFilled && confirmed) {
      // 使用我们填入的 slug
      publishedUrl = `https://sites.google.com/view/${siteSlug}/`;
      this.addLog(`使用填入的 slug 构建 URL: ${publishedUrl}`);
    } else {
      // 回退：尝试从页面 URL 中提取信息
      const currentUrl = page.url();
      this.addLog(`无法获取 slug，当前页面 URL: ${currentUrl}`);
      // 尝试通过 JS 从页面获取发布 URL
      try {
        const pageSlug = await page.evaluate(() => {
          // 尝试从页面 meta 标签或 window 对象获取发布 URL
          const canonical = document.querySelector('link[rel="canonical"]');
          if (canonical) return canonical.getAttribute('href');
          return null;
        });
        if (pageSlug && pageSlug.includes('sites.google.com/view/')) {
          publishedUrl = pageSlug;
          this.addLog(`从页面 meta 获取发布 URL: ${publishedUrl}`);
        } else {
          publishedUrl = currentUrl;
          this.addLog(`使用当前页面 URL: ${currentUrl}`);
        }
      } catch {
        publishedUrl = currentUrl;
      }
    }

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
