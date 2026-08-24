/**
 * Google Sites Publisher Engine
 * 使用 Puppeteer 模拟真人操作，通过 Cookie 登录 Google Sites 并发布文章
 *
 * 发布流程：
 * 1. 注入 Cookie 并验证登录状态
 * 2. 导航到创建链接，等待新站点编辑器打开（URL 包含 /d/[SiteID]/）
 * 3. 等待编辑器加载，点击默认文本块激活编辑模式
 * 4. 输入文章标题和正文内容
 * 5. 等待自动保存（5 秒）
 * 6. 点击右上角"发布"按钮
 * 7. 等待发布弹窗，填写标题和随机 slug
 * 8. 点击弹窗内确认发布按钮
 * 9. 等待发布成功标志（工具栏出现"复制已发布网站的链接"按钮）
 */
import fs from "fs";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer-core";
import type { BrowserFingerprint } from "./fingerprint.js";

// 异步获取 Chromium 可执行文件路径
async function getChromiumPath(): Promise<string> {
  try {
    const puppeteerMod = await import("puppeteer");
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
        console.log(`[Chromium] 内置路径不存在，尝试自动下载 Chromium...`);
        try {
          const { downloadBrowsers } = await import("puppeteer/internal/node/install.js");
          await downloadBrowsers();
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
  }

  const candidates = [
    "/usr/lib/chromium-browser/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
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
  /** 目标 Site 的完整 URL（如已存在），仅用于获取 OAuth token，不再用于发布 */
  siteUrl?: string;
  /** 代理配置（可选） */
  proxy?: { host: string; port: number; username?: string; password?: string; protocol?: string };
  /** 浏览器指纹（可选，用于防关联） */
  fingerprint?: BrowserFingerprint;
  /** 是否无头模式（默认 true） */
  headless?: boolean;
  /** 操作超时（毫秒，默认 120000） */
  timeout?: number;
  /** 内嵌网站板块列表（来自 SEO 模板的内嵌配置） */
  embedBlocks?: Array<{ embedUrl: string; embedWidth?: string; embedHeight?: number | string; embedPosition?: string }>;
  /** 模板样式设置（来自 SEO 模板的样式配置） */
  templateStyles?: {
    h1?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    h2?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    h3?: { fontSize?: string; fontWeight?: string; textAlign?: string };
    p?: { fontSize?: string; fontWeight?: string; textAlign?: string };
  };
  /** 超链接列表（锚文本+URL，插入到文章中） */
  anchorLinks?: Array<{ text: string; url: string; position?: string }>;
  /** 社交媒体链接（插入到文章底部） */
  socialLinks?: Array<{ label: string; url: string; type?: string }>;
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
  session?: boolean;
  storeId?: string;
  hostOnly?: boolean;
}

export interface PublishResult {
  success: boolean;
  publishedUrl?: string;
  siteUrl?: string;
  errorMessage?: string;
  log: string[];
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将 Markdown 内容转换为适合 Google Sites 的纯文本段落列表 */
export function markdownToPlainSections(markdown: string): { type: "h1" | "h2" | "h3" | "p" | "embed"; text: string; embedUrl?: string; embedHeight?: number }[] {
  const lines = markdown.split("\n");
  const sections: { type: "h1" | "h2" | "h3" | "p" | "embed"; text: string; embedUrl?: string; embedHeight?: number }[] = [];

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
      if (trimmed.includes('<iframe')) {
        const srcMatch = trimmed.match(/src=["'](.*?)['"]/);
        const heightMatch = trimmed.match(/height=["'](\d+)['"]/);
        if (srcMatch && srcMatch[1]) {
          sections.push({ type: 'embed', text: '', embedUrl: srcMatch[1], embedHeight: parseInt(heightMatch?.[1] || '300') });
          continue;
        }
      }
      const plain = trimmed
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "");
      if (plain && !plain.includes('<iframe')) sections.push({ type: "p", text: plain });
    }
  }

  return sections;
}

/** 随机延迟（模拟真人操作节奏） */
function randomDelay(min = 500, max = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 生成随机 8 位字母数字 slug */
function generateRandomSlug(): string {
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
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

    for (const cookie of cookies) {
      try {
        let domain = cookie.domain || ".google.com";
        if (!domain.startsWith('.') && !domain.startsWith('http')) {
          domain = '.' + domain;
        }
        const expiresTs = cookie.expires ?? (cookie as any).expirationDate;
        const rawSameSite = (cookie as any).sameSite as string | undefined;
        let sameSite: "Strict" | "Lax" | "None" | undefined;
        if (rawSameSite) {
          const lower = rawSameSite.toLowerCase();
          if (lower === 'strict') sameSite = 'Strict';
          else if (lower === 'lax') sameSite = 'Lax';
          else if (lower === 'none' || lower === 'no_restriction') sameSite = 'None';
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
      } catch {
        // 忽略单条 Cookie 设置失败
      }
    }

    this.addLog("Cookie 已设置，导航到 Google Sites 验证登录状态...");
    await page.goto("https://sites.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(1000, 1500);

    const url = page.url();
    this.addLog(`导航后 URL: ${url}`);

    const isRedirectedToLogin = url.includes("accounts.google.com/signin") ||
      url.includes("accounts.google.com/v3") ||
      url.includes("/ServiceLogin") ||
      url.includes("/CheckCookie");

    const isOnSites = url.includes("sites.google.com");

    if (isRedirectedToLogin) {
      this.addLog(`被重定向到登录页: ${url}`);
      await page.goto("https://drive.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
      await randomDelay(800, 1200);
      const driveUrl = page.url();
      this.addLog(`Drive URL: ${driveUrl}`);
      if (!driveUrl.includes("accounts.google.com")) {
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

    this.addLog(`未知状态，当前 URL: ${url}，尝试继续...`);
    return !isRedirectedToLogin;
  }

  /**
   * 创建全新 Google Sites 站点并返回编辑器 URL
   * 使用 /u/0/create 链接直接跳转到编辑器，无需点击模板
   */
  private async navigateToNewSite(page: Page): Promise<string> {
    this.addLog('导航到 Google Sites 创建全新站点（直接创建链接）...');
    await page.goto('https://sites.google.com/u/0/create?usp=sites_home&ths=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await randomDelay(3000, 5000);

    let currentUrl = page.url();
    this.addLog(`当前 URL: ${currentUrl}`);

    // 如果还没跳转到编辑器，再等一次
    if (!currentUrl.includes('/d/')) {
      this.addLog('等待跳转到编辑器...');
      try {
        await page.waitForFunction(
          () => window.location.href.includes('/d/'),
          { timeout: 20000 }
        );
        currentUrl = page.url();
        this.addLog(`✅ 等待后跳转成功: ${currentUrl}`);
      } catch {
        currentUrl = page.url();
        this.addLog(`⚠️ 等待超时，当前 URL: ${currentUrl}`);
        throw new Error(`无法创建新 Google Sites 站点，创建链接未跳转到编辑器（当前 URL: ${currentUrl}）`);
      }
    }

    this.addLog(`✅ 新站点编辑器 URL: ${currentUrl}`);
    return currentUrl;
  }

  /**
   * 在 Google Sites 编辑器中写入内容并发布
   * 返回已发布的公开 URL
   */
  /** 检测 URL 类型 */
  private detectEmbedType(url: string): 'youtube' | 'maps' | 'form' | 'generic' {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();
      
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
      if (hostname.includes('maps.google.com') || hostname.includes('google.com/maps')) return 'maps';
      if (hostname.includes('forms.google.com') || pathname.includes('/forms/')) return 'form';
      return 'generic';
    } catch {
      return 'generic';
    }
  }

  /**
   * Google Sites 的 jsaction 交互不会稳定响应 HTMLElement.click()。
   * 先在 DOM 中定位可见目标，再统一改用 Puppeteer 的真实鼠标事件触发。
   */
  private async clickVisibleText(page: Page, texts: string[], selector = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"]'): Promise<string | null> {
    const target = await page.evaluate(({ texts, selector }) => {
      const normalized = texts.map(text => text.trim().toLowerCase());
      const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
      const element = elements.find((candidate) => {
        const label = `${candidate.textContent ?? ''} ${candidate.getAttribute('aria-label') ?? ''}`.trim().toLowerCase();
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return !(candidate as HTMLButtonElement).disabled && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          && normalized.some(text => label === text || label.includes(text));
      });
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        text: (element.textContent ?? element.getAttribute('aria-label') ?? '').trim(),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }, { texts, selector });

    if (!target) return null;
    await page.mouse.click(target.x, target.y);
    return target.text || texts[0];
  }

  /** 在当前 Google Sites 弹窗内精确点击指定动作，避免命中页面或嵌套的同名控件。 */
  private async clickDialogAction(page: Page, texts: string[]): Promise<string | null> {
    const target = await page.evaluate((labels) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const expected = labels.map(label => label.trim().toLowerCase());
      const candidates = Array.from(dialog.querySelectorAll('button, [role="button"]')) as HTMLElement[];
      const action = candidates.find((candidate) => {
        const text = `${candidate.textContent ?? ''} ${candidate.getAttribute('aria-label') ?? ''}`.trim().toLowerCase();
        const rect = candidate.getBoundingClientRect();
        const disabled = (candidate as HTMLButtonElement).disabled || candidate.getAttribute('aria-disabled') === 'true';
        return !disabled && rect.width > 0 && rect.height > 0 && expected.some(label => text === label || text.includes(label));
      });
      if (!action) return null;
      const rect = action.getBoundingClientRect();
      return { text: (action.textContent ?? action.getAttribute('aria-label') ?? '').trim(), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, texts);
    if (!target) return null;
    await page.mouse.click(target.x, target.y);
    return target.text || texts[0];
  }

  /** 验证内嵌对话框自动关闭后，编辑器中是否真实生成了目标网址的嵌入元素。 */
  private async verifyEmbedRendered(page: Page, embedUrl: string): Promise<{ rendered: boolean; evidence: string }> {
    const hostname = (() => {
      try { return new URL(embedUrl).hostname; } catch { return embedUrl; }
    })();
    return page.evaluate(({ embedUrl, hostname }) => {
      const iframe = Array.from(document.querySelectorAll('iframe')).find((element) =>
        element.src.includes(embedUrl) || element.src.includes(hostname),
      );
      if (iframe) return { rendered: true, evidence: `iframe:${iframe.src}` };

      const linkedElement = Array.from(document.querySelectorAll('[href], [data-url], [data-embed-url]')).find((element) => {
        const values = [
          element.getAttribute('href') ?? '',
          element.getAttribute('data-url') ?? '',
          element.getAttribute('data-embed-url') ?? '',
        ];
        return values.some((value) => value.includes(embedUrl) || value.includes(hostname));
      });
      if (linkedElement) {
        return { rendered: true, evidence: `${linkedElement.tagName.toLowerCase()}:${linkedElement.getAttribute('href') ?? linkedElement.getAttribute('data-url') ?? linkedElement.getAttribute('data-embed-url')}` };
      }
      return { rendered: false, evidence: '未检测到 iframe、href、data-url 或 data-embed-url 证据' };
    }, { embedUrl, hostname });
  }

  /** 将模板的 H1 字号映射到 Google Sites 支持的字号菜单。 */
  private async applyBannerTitleFontSize(page: Page, title: string, templateSize?: string): Promise<void> {
    // Google Sites 的 Banner 默认字号为 64，过大；将模板语义字号映射为其菜单中的可选值。
    const sizeMap: Record<string, number> = { sm: 18, base: 24, lg: 30, xl: 36, "2xl": 36 };
    const targetSize = sizeMap[templateSize ?? "xl"] ?? 36;

    try {
      const selected = await page.evaluate((headline) => {
        const editable = Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"]'))
          .find((element) => (element.textContent ?? '').trim().startsWith(headline));
        if (!editable) return false;
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode();
        if (!textNode?.textContent) return false;
        const length = Math.min(headline.length, textNode.textContent.length);
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection?.toString() === headline;
      }, title);

      if (!selected) {
        this.addLog('⚠️ 未定位到 Banner 标题文本，跳过字号设置');
        return;
      }

      await randomDelay(250, 450);
      const control = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
        const input = inputs.find((candidate) => {
          const label = `${candidate.getAttribute('aria-label') ?? ''} ${candidate.getAttribute('role') ?? ''}`.toLowerCase();
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (label.includes('font size') || label.includes('字号') || label.includes('combobox'));
        });
        if (!input) return null;
        const rect = input.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });

      if (!control) {
        this.addLog('⚠️ 标题字号工具栏未出现，跳过字号设置');
        return;
      }

      await page.mouse.click(control.x, control.y);
      await randomDelay(350, 600);
      const selectedOption = await this.clickVisibleText(page, [String(targetSize)], '[role="option"], [role="menuitem"]');
      if (selectedOption) this.addLog(`✅ Banner 标题字号已设置为 ${targetSize}`);
      else this.addLog(`⚠️ 未找到 Google Sites 的 ${targetSize} 号字号选项`);
    } catch (error) {
      this.addLog(`Banner 标题字号设置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 通过 Google Sites 工具栏插入内嵌网站板块 */
  private async insertEmbedBlock(page: Page, embedUrl: string, embedHeight: number): Promise<boolean> {
    this.addLog(`插入内嵌网站: ${embedUrl} (高度: ${embedHeight}px)`);
    
    // 检测 URL 类型
    const embedType = this.detectEmbedType(embedUrl);
    this.addLog(`检测到嵌入类型: ${embedType}`);
    
    try {
      // 点击内容区末尾，确保光标在内容区
      await page.keyboard.press('End');
      await randomDelay(300, 500);

      // Google Sites 的首次菜单点击偶尔会命中旧控件。只在真正的 URL 对话框出现后
      // 才继续填写，避免把 URL 输入到编辑器或其他残留弹窗中。
      let dialogOpened = false;
      for (let attempt = 1; attempt <= 2 && !dialogOpened; attempt++) {
        const insertBtnClicked = await this.clickVisibleText(page, ['插入', 'Insert'], 'button, [role="button"], [role="tab"]');
        if (!insertBtnClicked) {
          this.addLog(`⚠️ 第 ${attempt} 次未找到插入入口`);
          continue;
        }
        this.addLog(`已点击插入入口（第 ${attempt} 次）: ${insertBtnClicked}`);
        await randomDelay(700, 1000);

        const menuItemText = embedType === 'youtube' ? '视频' : embedType === 'maps' ? '地图' : embedType === 'form' ? '表单' : '嵌入';
        const embedMenuClicked = await this.clickVisibleText(
          page,
          [menuItemText, menuItemText === '嵌入' ? 'Embed' : menuItemText],
          '[role="menuitem"], [role="button"], [role="option"]',
        );
        if (!embedMenuClicked) {
          this.addLog(`⚠️ 第 ${attempt} 次未找到 ${menuItemText} 菜单项`);
          await page.keyboard.press('Escape');
          continue;
        }
        this.addLog(`已点击菜单项: ${embedMenuClicked}`);
        try {
          await page.waitForSelector('[role="dialog"] input, [role="dialog"] textarea', { timeout: 8000 });
          dialogOpened = true;
          this.addLog('内嵌 URL 对话框已出现');
        } catch {
          this.addLog(`⚠️ 第 ${attempt} 次点击后未出现内嵌 URL 对话框`);
          await page.keyboard.press('Escape');
          await randomDelay(400, 650);
        }
      }

      if (!dialogOpened) {
        this.addLog('⚠️ 无法打开内嵌 URL 对话框，已跳过该内嵌块');
        return false;
      }

      // Google Sites 的嵌入弹窗可能同时渲染隐藏输入框，不能使用“第一个 input”。
      // 优先锁定 aria-label/placeholder 带 Paste URL、URL 或 link 的可见真实输入框。
      const urlFillResult = await page.evaluate((url) => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return null;
        const candidates = Array.from(dialog.querySelectorAll('input, textarea')).filter((candidate) => {
          const element = candidate as HTMLInputElement;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && !element.disabled && element.getAttribute('aria-hidden') !== 'true';
        }) as Array<HTMLInputElement | HTMLTextAreaElement>;
        const score = (element: HTMLInputElement | HTMLTextAreaElement) => {
          const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''}`.toLowerCase();
          if (label.includes('paste the url') || label.includes('paste url')) return 100;
          if (label.includes('url') || label.includes('link') || label.includes('链接') || label.includes('网址')) return 90;
          if (element.type === 'url') return 80;
          if (element.type === 'text') return 20;
          return 0;
        };
        const input = candidates.sort((a, b) => score(b) - score(a))[0];
        if (!input) return null;

        input.focus();
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(input, url);
        else input.value = url;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: url }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'v' }));
        const rect = input.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          value: input.value.trim(),
          label: `${input.getAttribute('aria-label') ?? ''} ${input.getAttribute('placeholder') ?? ''}`.trim(),
          candidateCount: candidates.length,
        };
      }, embedUrl);

      if (!urlFillResult) {
        this.addLog('⚠️ 未找到内嵌 URL 输入框，跳过内嵌网站');
        await this.clickDialogAction(page, ['取消', 'Cancel']);
        return false;
      }
      this.addLog(`已定位内嵌 URL 输入框: ${urlFillResult.label || '未标注'}（候选 ${urlFillResult.candidateCount} 个）`);
      await page.mouse.click(urlFillResult.x, urlFillResult.y);
      // Tab 使 Google Sites 的 jsaction 提交由原生 setter 触发的输入，进而加载预览。
      await page.keyboard.press('Tab');
      this.addLog(`已填入 URL 并触发预览: ${embedUrl}`);
      const enteredUrl = await page.evaluate((expectedUrl) => {
        const dialog = document.querySelector('[role="dialog"]');
        const inputs = Array.from(dialog?.querySelectorAll('input, textarea') || []) as Array<HTMLInputElement | HTMLTextAreaElement>;
        const input = inputs.find((candidate) => candidate.value.trim() === expectedUrl) ?? inputs[0];
        return input?.value?.trim() || '';
      }, embedUrl.trim());
      if (enteredUrl !== embedUrl.trim()) {
        this.addLog(`⚠️ 内嵌 URL 未写入输入框（当前值: ${enteredUrl || '空'}），已中止该嵌入`);
        await this.clickDialogAction(page, ['取消', 'Cancel']);
        return false;
      }
      await randomDelay(1800, 2500);

      // 某些版本有明确的 Next/Preview 操作；没有该操作时绝不能按 Enter，
      // 因为 Enter 会关闭当前内嵌对话框而不是加载预览。
      const previewAction = await this.clickDialogAction(page, ['下一步', 'Next', '预览', 'Preview']);
      if (previewAction) {
        this.addLog(`已点击预览动作: ${previewAction}`);
      } else {
        this.addLog('未发现单独的预览动作，等待 Google Sites 自动加载预览（不按 Enter）');
      }
      try {
        await page.waitForFunction(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return false;
          const text = dialog.textContent ?? '';
          const hasFullPageCard = /整个页面|Entire page/i.test(text);
          const hasInsertAction = Array.from(dialog.querySelectorAll('button, [role="button"]')).some((element) =>
            /插入|Insert/i.test(`${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''}`),
          );
          return hasFullPageCard || hasInsertAction;
        }, { timeout: 10000 });
        this.addLog('内嵌预览或 Insert 动作已出现');
      } catch {
        const previewDetails = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return { dialogOpen: false, text: '', elements: [] as unknown[] };
          return {
            dialogOpen: true,
            text: (dialog.textContent ?? '').trim().slice(0, 600),
            elements: Array.from(dialog.querySelectorAll('button, [role="button"], input, textarea')).map((element) => ({
              tag: element.tagName,
              text: (element.textContent ?? '').trim().slice(0, 80),
              ariaLabel: element.getAttribute('aria-label'),
              value: (element as HTMLInputElement).value ?? null,
            })),
          };
        });
        this.addLog(`⚠️ 等待内嵌预览超时，已中止嵌入。弹窗状态: ${JSON.stringify(previewDetails)}`);
        try { await page.screenshot({ path: '/tmp/gsp_embed_preview_timeout.png', fullPage: false }); } catch {}
        await this.clickDialogAction(page, ['取消', 'Cancel']);
        return false;
      }

      if (embedType === 'generic') {
        const fullPageCard = await page.evaluate(() => {
          const texts = ['整个页面', 'Entire page'];
          const element = Array.from(document.querySelectorAll('[role="dialog"] *')).find((candidate) => {
            const label = (candidate.textContent ?? '').trim();
            const rect = (candidate as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && texts.some(text => label === text || label.includes(text));
          }) as HTMLElement | undefined;
          if (!element) return null;
          const target = element.querySelector('[jsname="jkaScf"]') as HTMLElement | null ?? element;
          const rect = target.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
        if (fullPageCard) {
          await page.mouse.click(fullPageCard.x, fullPageCard.y);
          this.addLog('已选择“整个页面 / Entire page”内嵌卡片');
          await randomDelay(500, 800);
        } else {
          this.addLog('⚠️ 未出现“整个页面”预览卡片，将尝试使用默认嵌入方式');
        }
      }

      // Google Sites 的部分版本会在 URL 提交后直接关闭对话框。如果发生这种情况，
      // 只有在编辑器页面中检测到目标网址的 iframe/嵌入证据时才允许继续发布。
      const dialogStillPresent = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
      if (!dialogStillPresent) {
        const verification = await this.verifyEmbedRendered(page, embedUrl);
        if (verification.rendered) {
          this.addLog(`✅ 内嵌对话框自动关闭且已验证嵌入块: ${verification.evidence}`);
          return true;
        }
        this.addLog(`⚠️ 内嵌对话框自动关闭但未检测到嵌入块: ${verification.evidence}`);
        try { await page.screenshot({ path: '/tmp/gsp_embed_auto_close_debug.png', fullPage: false }); } catch {}
        return false;
      }

      // 预览生成后，在当前弹窗内精确点击 Insert。
      let nextClicked = await this.clickDialogAction(page, ['插入', 'Insert']);

      if (nextClicked) {
        this.addLog(`已点击: ${nextClicked}`);
        await randomDelay(2000, 3000);

        // 如果点击的是"下一步"/"预览"，还需要点击"插入"
        if (nextClicked !== '插入' && nextClicked !== 'Insert') {
          const insertClicked = await this.clickDialogAction(page, ['插入', 'Insert']);
          if (insertClicked) {
            this.addLog(`已点击插入确认: ${insertClicked}`);
          }
        }
        // 等待对话框自然关闭（最多等 12 秒）
        this.addLog('等待对话框关闭...');
        let dialogClosed = false;
        for (let i = 0; i < 12; i++) {
          await randomDelay(1000, 1000);
          const dialogStillOpen = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog) return false;
            return dialog.querySelectorAll('input, textarea').length > 0;
          });
          if (!dialogStillOpen) {
            dialogClosed = true;
            break;
          }
        }
        if (dialogClosed) {
          this.addLog(`✅ 内嵌网站插入完成: ${embedUrl}`);
          return true;
        } else {
          // 未关闭代表 Google Sites 尚未接受嵌入（常见原因是目标站点禁止 iframe）。
          // 不再把这种情况记录为成功，避免发布日志与实际页面不一致。
          this.addLog(`⚠️ 内嵌网站未被 Google Sites 接受：${embedUrl}。请确认目标网址允许 iframe 嵌入。`);
          await this.clickDialogAction(page, ['取消', 'Cancel']);
          await randomDelay(600, 900);
          return false;
        }
      } else {
        const dialogDetails = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return Array.from(dialog?.querySelectorAll('button, [role="button"], input, textarea') || []).map((el) => ({
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 80),
            ariaLabel: el.getAttribute('aria-label'),
            value: (el as HTMLInputElement).value || null,
          }));
        });
        this.addLog(`⚠️ 未找到 Insert 确认按钮，已中止嵌入。弹窗元素: ${JSON.stringify(dialogDetails)}`);
        await this.clickDialogAction(page, ['取消', 'Cancel']);
        return false;
      }
    } catch (err) {
      this.addLog(`内嵌网站插入失败: ${err}`);
      try { await this.clickDialogAction(page, ['取消', 'Cancel']); } catch {}
      return false;
    }
  }

  private async writeContentAndPublish(page: Page, title: string, content: string, embedBlocks?: Array<{ embedUrl: string; embedWidth?: string; embedHeight?: number | string; embedPosition?: string }>, templateStyles?: PublishOptions['templateStyles'], siteName?: string, anchorLinks?: PublishOptions['anchorLinks'], socialLinks?: PublishOptions['socialLinks']): Promise<string> {
    this.addLog(`开始写入内容: ${title}`);

    const sections = markdownToPlainSections(content);
    this.addLog(`内容解析完成，共 ${sections.length} 个段落/标题`);

    // ── 阶段1：等待编辑器加载完成 ────────────────────────────────────────────
    this.addLog('等待编辑器加载...');
    try {
      // 等待页面主体内容区域出现（Google Sites 编辑器的主要容器）
      await page.waitForSelector(
        '[contenteditable], [data-placeholder], [role="main"]',
        { timeout: 25000 }
      );
      this.addLog('编辑器已加载');
    } catch {
      this.addLog('等待编辑器超时，尝试继续...');
    }

    // 额外等待编辑器完全初始化
    await randomDelay(2000, 3000);

    // 调试：截图并输出页面结构
    try {
      await page.screenshot({ path: '/tmp/gsp_editor_debug.png', fullPage: false });
      this.addLog('截图已保存: /tmp/gsp_editor_debug.png');

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
      this.addLog(`contenteditable 元素 (${editableEls.length}个): ${JSON.stringify(editableEls.slice(0, 8))}`);

      const iframes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('iframe')).map(el => ({
          src: el.src?.slice(0, 100),
          id: el.id,
          className: el.className?.slice(0, 50),
        }));
      });
      this.addLog(`iframe (${iframes.length}个): ${JSON.stringify(iframes.slice(0, 5))}`);
    } catch (debugErr) {
      this.addLog(`调试信息获取失败: ${debugErr}`);
    }

    // ── 阶段2：激活编辑器并写入内容 ─────────────────────────────────────────
    // Google Sites 新建站点后，页面上有一个默认的文本块（"点击以添加内容"）
    // 需要先单击激活，然后输入内容
    let contentWritten = false;

    // 策略1：找到 contenteditable 元素直接点击激活
    const editableSelectors = [
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      '[role="textbox"]',
      '[data-placeholder]',
    ];

    for (const sel of editableSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          this.addLog(`找到可编辑元素: ${sel}，点击激活...`);
          await el.click();
          await randomDelay(300, 500);

          // 全选并清除默认内容
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await randomDelay(100, 200);
          await page.keyboard.press('Delete');
          await randomDelay(100, 200);

          // 写入标题
          await page.keyboard.type(title, { delay: 15 });
          await page.keyboard.press('Enter');
          await randomDelay(100, 200);

          // 写入正文
          const inlineEmbeds: Array<{ embedUrl: string; embedHeight: number }> = [];
          for (const section of sections) {
            if (section.type === 'h1') continue; // 标题已写入
            if (section.type === 'embed') {
              if (section.embedUrl) inlineEmbeds.push({ embedUrl: section.embedUrl, embedHeight: section.embedHeight ?? 300 });
              continue;
            }
            await page.keyboard.type(section.text, { delay: 8 });
            await page.keyboard.press('Enter');
            await randomDelay(10, 30);
          }

          contentWritten = true;
          this.addLog(`✅ 内容写入成功（通过 ${sel}），标题: ${title}，段落数: ${sections.length}`);
          if (inlineEmbeds.length > 0) {
            embedBlocks = [...(embedBlocks ?? []), ...inlineEmbeds];
            this.addLog(`从内容中提取到 ${inlineEmbeds.length} 个 iframe 嵌入块`);
          }
          break;
        }
      } catch (e) {
        this.addLog(`尝试 ${sel} 失败: ${e}`);
      }
    }

    // 策略2：如果没找到 contenteditable，尝试点击页面中央区域激活编辑器
    if (!contentWritten) {
      this.addLog('未找到 contenteditable 元素，尝试点击页面中央激活编辑器...');
      try {
        // 点击页面中央
        await page.mouse.click(640, 400);
        await randomDelay(500, 800);

        // 再次检查是否有 contenteditable 出现
        const el = await page.$('[contenteditable="true"]');
        if (el) {
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await page.keyboard.press('Delete');
          await randomDelay(100, 200);

          await page.keyboard.type(title, { delay: 15 });
          await page.keyboard.press('Enter');
          const inlineEmbeds2: Array<{ embedUrl: string; embedHeight: number }> = [];
          for (const section of sections) {
            if (section.type === 'h1') continue;
            if (section.type === 'embed') {
              if (section.embedUrl) inlineEmbeds2.push({ embedUrl: section.embedUrl, embedHeight: section.embedHeight ?? 300 });
              continue;
            }
            await page.keyboard.type(section.text, { delay: 8 });
            await page.keyboard.press('Enter');
            await randomDelay(10, 30);
          }
          contentWritten = true;
          this.addLog('✅ 内容写入成功（通过点击中央激活）');
          if (inlineEmbeds2.length > 0) {
            embedBlocks = [...(embedBlocks ?? []), ...inlineEmbeds2];
            this.addLog(`从内容中提取到 ${inlineEmbeds2.length} 个 iframe 嵌入块`);
          }
        }
      } catch (e) {
        this.addLog(`点击中央激活失败: ${e}`);
      }
    }

    if (!contentWritten) {
      this.addLog('⚠️ 内容写入失败，将继续尝试发布（站点标题将为默认值）');
    }

    if (contentWritten) {
      await this.applyBannerTitleFontSize(page, title, templateStyles?.h1?.fontSize);
    }

    // ── 阶段2.5：填写网站名称（siteName）─────────────────────────────────────
    if (siteName) {
      this.addLog(`尝试填写网站名称: ${siteName}`);
      try {
        // Google Sites 顶部有一个网站名称输入框（input#i3 或 aria-label="Site name"）
        const siteNameFilled = await page.evaluate((name: string) => {
          const selectors = ['input#i3', 'input[aria-label="Site name"]', 'input[aria-label="网站名称"]', 'input[placeholder*="site name" i]', 'input[placeholder*="网站名称"]'];
          for (const sel of selectors) {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) {
              el.focus();
              el.select();
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.value = name;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return sel;
            }
          }
          return null;
        }, siteName);
        if (siteNameFilled) {
          await randomDelay(300, 500);
          await page.keyboard.press('Enter');
          this.addLog(`✅ 网站名称已填写（通过 ${siteNameFilled}）: ${siteName}`);
        } else {
          // 尝试用真实鼠标点击顶部输入框区域
          await page.mouse.click(200, 32);
          await randomDelay(300, 500);
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await page.keyboard.type(siteName, { delay: 10 });
          await page.keyboard.press('Enter');
          this.addLog(`网站名称已通过点击顶部区域填写: ${siteName}`);
        }
      } catch (e) {
        this.addLog(`网站名称填写失败: ${e}`);
      }
      await randomDelay(500, 800);
    }

    // ── 阶段2.6：插入超链接列表（anchorLinks）────────────────────────────────
    if (anchorLinks && anchorLinks.length > 0) {
      this.addLog(`开始插入 ${anchorLinks.length} 个超链接...`);
      try {
        // 在文章末尾添加超链接列表
        await page.mouse.click(640, 400);
        await randomDelay(300, 500);
        // 移到文章末尾
        await page.keyboard.down('Control');
        await page.keyboard.press('End');
        await page.keyboard.up('Control');
        await randomDelay(200, 300);
        await page.keyboard.press('Enter');
        await randomDelay(100, 200);
        for (const link of anchorLinks) {
          await page.keyboard.type(`${link.text}: ${link.url}`, { delay: 8 });
          await page.keyboard.press('Enter');
          await randomDelay(50, 100);
        }
        this.addLog(`✅ 超链接列表已插入`);
      } catch (e) {
        this.addLog(`超链接列表插入失败: ${e}`);
      }
    }

    // ── 阶段2.7：插入社交媒体链接（socialLinks）──────────────────────────────
    if (socialLinks && socialLinks.length > 0) {
      this.addLog(`开始插入 ${socialLinks.length} 个社交媒体链接...`);
      try {
        await page.mouse.click(640, 400);
        await randomDelay(300, 500);
        await page.keyboard.down('Control');
        await page.keyboard.press('End');
        await page.keyboard.up('Control');
        await randomDelay(200, 300);
        await page.keyboard.press('Enter');
        await randomDelay(100, 200);
        for (const link of socialLinks) {
          await page.keyboard.type(`${link.label}: ${link.url}`, { delay: 8 });
          await page.keyboard.press('Enter');
          await randomDelay(50, 100);
        }
        this.addLog(`✅ 社交媒体链接已插入`);
      } catch (e) {
        this.addLog(`社交媒体链接插入失败: ${e}`);
      }
    }

    // ── 阶段3：插入内嵌网站板块（如果有）──────────────────────────────────────
    if (embedBlocks && embedBlocks.length > 0) {
      this.addLog(`开始插入 ${embedBlocks.length} 个内嵌网站板块...`);
      const failedEmbedUrls: string[] = [];
      for (const block of embedBlocks) {
        if (block.embedUrl) {
          const heightNum = typeof block.embedHeight === 'string' ? parseInt(block.embedHeight) || 600 : (block.embedHeight ?? 600);
          const inserted = await this.insertEmbedBlock(page, block.embedUrl, heightNum);
          if (!inserted) failedEmbedUrls.push(block.embedUrl);
          await randomDelay(1000, 1500);
        }
      }
      if (failedEmbedUrls.length > 0) {
        throw new Error(`内嵌网站未成功插入，已停止发布：${failedEmbedUrls.join(', ')}`);
      }
    }

        // ── 阶段3.5：关闭嵌入类残留弹窗 ─────────────────────────────────────
    // 嵌入弹窗特征：有 input/textarea；发布弹窗特征：没有 input
    // 只关闭嵌入类弹窗，避免误关发布弹窗
    this.addLog('检查并关闭嵌入类残留弹窗...');
    let closeAttempts = 0;
    while (closeAttempts < 8) {
      const dialogState = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return { hasDialog: false, cancelPos: null };
        const hasInput = dialog.querySelectorAll('input, textarea').length > 0;
        if (!hasInput) return { hasDialog: false, cancelPos: null };
        // 找 Cancel 按钮坐标
        const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
        const cancelBtn = btns.find(b => {
          const t = b.textContent?.trim() || '';
          return t === 'Cancel' || t === '取消' || t === '关闭';
        });
        if (cancelBtn) {
          const rect = (cancelBtn as HTMLElement).getBoundingClientRect();
          return { hasDialog: true, cancelPos: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
        }
        return { hasDialog: true, cancelPos: null };
      });
      if (!dialogState.hasDialog) break;
      this.addLog(`发现嵌入类弹窗（第 ${closeAttempts + 1} 次）...`);
      if (dialogState.cancelPos) {
        this.addLog('点击 Cancel 按钮关闭弹窗');
        await page.mouse.click(dialogState.cancelPos.x, dialogState.cancelPos.y);
      } else {
        await page.keyboard.press('Escape');
      }
      await randomDelay(800, 1000);
      closeAttempts++;
    }
    await randomDelay(500, 800);
    const embedDialogStillOpen = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && dialog.querySelectorAll('input, textarea').length > 0;
    });
    if (embedDialogStillOpen) {
      this.addLog('⚠️ 嵌入弹窗仍未关闭，尝试点击页面空白区域...');
      await page.mouse.click(640, 200);
      await randomDelay(800, 1000);
      // 最后尝试：JS 直接点击 Cancel
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return;
        const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
        const cancelBtn = btns.find(b => { const t = b.textContent?.trim() || ''; return t === 'Cancel' || t === '取消'; });
        if (cancelBtn) (cancelBtn as HTMLElement).click();
      });
      await randomDelay(800, 1000);
    } else {
      this.addLog('✅ 嵌入类弹窗已关闭，可安全执行发布流程');
    }

    // ── 阶段3.6：应用样式设置（如果有）─────────────────────────────────────
    if (templateStyles) {
      this.addLog('开始应用样式设置...');
      // TODO: 实现样式应用逻辑
      // 这里需要：
      // 1. 找到对应的文本块（H1、H2、段落等）
      // 2. 选中文本
      // 3. 通过 Google Sites 的样式菜单应用样式
      this.addLog('样式应用功能待实现');
    }

    // ── 阶段4：等待自动保存 ──────────────────────────────────────────────────
    // Google Sites 编辑器会自动保存，等待 5 秒确保内容已保存
    this.addLog('等待 Google Sites 自动保存内容（5 秒）...');
    await randomDelay(5000, 6000);
    // ── 阶段5：点击右上角"发布"按钮 ─────────────────────────────────────────────────
    this.addLog('查找并点击发布按钮...');
    const publishBtnClicked = await this.clickVisibleText(page, ['发布', 'Publish']);

    if (!publishBtnClicked) {
      this.addLog('⚠️ 未找到发布按钮，截图调试...');
      try {
        await page.screenshot({ path: '/tmp/gsp_no_publish_btn.png', fullPage: false });
        const allBtns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, [role="button"]'))
            .map(b => ({ text: b.textContent?.trim().slice(0, 30), cls: b.className?.slice(0, 40) }))
            .filter(b => b.text);
        });
        this.addLog(`页面所有按钮: ${JSON.stringify(allBtns.slice(0, 15))}`);
      } catch {}
      throw new Error('未找到发布按钮，请检查编辑器是否正常加载');
    }

    this.addLog(`✅ 已点击发布按钮: "${publishBtnClicked}"`);
    await randomDelay(2000, 3000);

    // ── 阶段5：处理发布弹窗 ──────────────────────────────────────────────────
    this.addLog('等待发布弹窗出现...');

    // 等待弹窗出现（最多 10 秒）
    try {
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      this.addLog('发布弹窗已出现');
    } catch {
      this.addLog('⚠️ 等待弹窗超时，尝试继续...');
    }

    await randomDelay(800, 1200);

    // 调试：输出弹窗内容
    const dialogInfo = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
        type: i.type,
        ariaLabel: i.getAttribute('aria-label'),
        placeholder: i.placeholder,
        value: i.value,
      }));
      const btns = Array.from(dialog.querySelectorAll('button, [role="button"]')).map(b => ({
        text: b.textContent?.trim().slice(0, 30),
        disabled: (b as HTMLButtonElement).disabled,
      }));
      return { hasDialog: true, inputs, btns };
    });
    this.addLog(`弹窗内容: ${JSON.stringify(dialogInfo)}`);

    // 生成随机 slug 并填写
    const slug = generateRandomSlug();
    this.addLog(`生成随机 slug: ${slug}`);

    const slugInputTarget = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const container = dialog || document;
      const inputs = Array.from(container.querySelectorAll(
        'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
      )) as HTMLInputElement[];
      // 新建 Google Sites 的发布弹窗通常只有一个文本框，它就是 Web address / slug。
      // 该输入框可能已被网站名称自动预填，因此不能用“值为空”判断。
      const urlInput = inputs.length === 1 ? inputs[0] : inputs.find(i => {
        const label = (i.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('网站名称') || label.includes('site name') || label.includes('web address') || label.includes('url');
      }) || inputs.find(i => i.value === '');
      if (!urlInput) return { target: null, totalInputs: inputs.length };
      const rect = urlInput.getBoundingClientRect();
      return { target: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, totalInputs: inputs.length };
    });

    let fillResult: { titleFilled: boolean; urlFilled: boolean; urlValue?: string; totalInputs: number };
    if (slugInputTarget.target) {
      await page.mouse.click(slugInputTarget.target.x, slugInputTarget.target.y);
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.type(slug, { delay: 20 });
      await page.keyboard.press('Tab');
      fillResult = { titleFilled: false, urlFilled: true, urlValue: slug, totalInputs: slugInputTarget.totalInputs };
    } else {
      fillResult = { titleFilled: false, urlFilled: false, totalInputs: slugInputTarget.totalInputs };
    }

    this.addLog(`输入框填写结果: ${JSON.stringify(fillResult)}`);

    if (!fillResult.urlFilled) {
      this.addLog('⚠️ 未找到 URL 输入框，尝试 Tab 键导航填写...');
      try {
        await page.keyboard.press('Tab');
        await randomDelay(200, 300);
        await page.keyboard.type(slug, { delay: 30 });
        await randomDelay(200, 300);
      } catch {}
    }

    // 等待 Google 验证 slug 可用性（slug 输入后需要等待校验）
    this.addLog('等待 slug 可用性验证（3 秒）...');
    await randomDelay(3000, 4000);

    // ── 阶段6：点击弹窗内确认发布按钮 ───────────────────────────────────────
    this.addLog('点击弹窗内确认发布按钮...');

    // 必须在点击前注册监听，Google Sites 的 publish 请求往往会在 1 秒内发出。
    let publishApiCalled = false;
    const publishApiListener = (req: any) => {
      const reqUrl: string = req.url();
      if (reqUrl.includes('/publish/publish') || reqUrl.includes('/publish/setpublishedstate') || reqUrl.includes('/publish/setpublished')) {
        publishApiCalled = true;
        this.addLog(`✅ 检测到发布 API 请求: ${reqUrl.split('?')[0]}`);
      }
    };
    page.on('request', publishApiListener);

    const confirmResult = await this.clickDialogAction(page, ['发布', 'Publish']);

    if (confirmResult) {
      this.addLog(`✅ 已点击确认发布按钮: ${confirmResult}`);
    } else {
      this.addLog('⚠️ 未找到可点击的确认发布按钮，尝试等待更长时间后重试...');
      // 再等 2 秒后重试一次（slug 验证可能需要更长时间）
      await randomDelay(2000, 3000);
      const retryClick = await this.clickDialogAction(page, ['发布', 'Publish']);
      const retryResult = retryClick ? `重试成功: "${retryClick}"` : await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btns = Array.from(dialog?.querySelectorAll('button, [role="button"]') || []);
        return `重试失败，弹窗按钮: ${JSON.stringify(btns.map(b => ({ text: b.textContent?.trim().slice(0, 20), disabled: (b as HTMLButtonElement).disabled })))}`;
      });
      this.addLog(`重试结果: ${retryResult}`);
    }

    // ── 阶段7：等待发布完成 ───────────────────────────────────────────────────
    // 修复：不能用"复制已发布网站的链接"按钮判断（该按钮在发布前就已存在）
    // 正确方式：监听 /publish/publish API 请求 + 等待弹窗消失
    this.addLog('等待发布完成（监听发布 API 请求 + 等待弹窗关闭）...');

    let publishConfirmed = false;

    try {
      // 等待弹窗消失（最多 20 秒）——弹窗消失表示用户点击了确认发布
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
        { timeout: 20000 }
      );
      this.addLog('✅ 发布弹窗已关闭，等待 Google Sites 处理发布请求...');
      // 弹窗关闭后等待 6 秒，让 Google Sites 完成发布处理
      await randomDelay(6000, 7000);
      publishConfirmed = true;
    } catch {
      this.addLog('⚠️ 20 秒内弹窗未关闭，可能发布按钮未被成功点击，截图调试...');
      try {
        await page.screenshot({ path: '/tmp/gsp_after_publish.png', fullPage: false });
        const pageState = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const btns = Array.from(dialog?.querySelectorAll('button, [role="button"]') || []);
          return {
            dialogExists: !!dialog,
            dialogButtons: btns.map(b => ({ text: b.textContent?.trim().slice(0, 30), disabled: (b as HTMLButtonElement).disabled })),
            url: window.location.href
          };
        });
        this.addLog(`发布后页面状态: ${JSON.stringify(pageState)}`);
      } catch {}
    }

    // 移除网络请求监听
    page.off('request', publishApiListener);

    if (publishConfirmed && !publishApiCalled) {
      this.addLog('⚠️ 弹窗已关闭但未检测到发布 API，可能 slug 已被占用或发布失败，额外等待 3 秒...');
      await randomDelay(3000, 4000);
      // 如果弹窗关闭且没有 API 请求，认为发布失败
      publishConfirmed = false;
    }

    // 构建已发布 URL
    const publishedUrl = `https://sites.google.com/view/${slug}/`;

    if (publishConfirmed) {
      this.addLog(`✅ 发布成功！URL: ${publishedUrl}`);
    } else {
      this.addLog(`⚠️ 发布状态未确认，slug: ${slug}，URL: ${publishedUrl}（请手动检查 Google Sites 后台）`);
      // 即使未确认，也返回 URL 并标记为失败（由调用方决定是否重试）
      throw new Error(`发布未确认完成，slug: ${slug}，请检查 Google Sites 后台是否出现新站点`);
    }

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
          Object.defineProperty(navigator, 'platform', { get: () => fingerprint.platform });
          Object.defineProperty(navigator, 'language', { get: () => fingerprint.language });
          Object.defineProperty(navigator, 'languages', { get: () => [fingerprint.language, 'en'] });
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fingerprint.hardwareConcurrency });
          Object.defineProperty(navigator, 'deviceMemory', { get: () => fingerprint.deviceMemory });
          Object.defineProperty(screen, 'width', { get: () => fingerprint.screenWidth });
          Object.defineProperty(screen, 'height', { get: () => fingerprint.screenHeight });
          Object.defineProperty(screen, 'colorDepth', { get: () => fingerprint.colorDepth });
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
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

      // 创建全新 Google Sites 站点
      const siteUrl = await this.navigateToNewSite(page);

      // 写入内容并发布
      const publishedUrl = await this.writeContentAndPublish(page, options.title, options.content, options.embedBlocks, options.templateStyles, options.siteName, options.anchorLinks, options.socialLinks);

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
