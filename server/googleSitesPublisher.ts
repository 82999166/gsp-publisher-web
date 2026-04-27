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
  /** Google Sites 主题名称（发布后自动应用，如 "Simple"、"Diplomat"、"Vision" 等） */
  siteTheme?: string;
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
  /** 通过 Google Sites 工具栏插入内嵌网站板块 */
  private async insertEmbedBlock(page: Page, embedUrl: string, embedHeight: number): Promise<void> {
    this.addLog(`插入内嵌网站: ${embedUrl} (高度: ${embedHeight}px)`);
    try {
      // 点击内容区末尾，确保光标在内容区
      await page.keyboard.press('End');
      await randomDelay(300, 500);

      // 查找并点击工具栏中的“插入”按鈕
      const insertBtnClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        const insertBtn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          const ariaLabel = b.getAttribute('aria-label') || '';
          return text === '插入' || text === 'Insert' || ariaLabel === '插入' || ariaLabel === 'Insert';
        });
        if (insertBtn) {
          (insertBtn as HTMLElement).click();
          return insertBtn.textContent?.trim() ?? 'clicked';
        }
        return null;
      });

      if (!insertBtnClicked) {
        this.addLog('⚠️ 未找到插入按鈕，跳过内嵌网站板块');
        return;
      }
      this.addLog(`已点击插入按鈕: ${insertBtnClicked}`);
      await randomDelay(800, 1200);

      // 在下拉菜单中查找“嵌入”选项
      const embedMenuClicked = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li, button, [role="button"]'));
        const embedItem = items.find(item => {
          const text = item.textContent?.trim() || '';
          return text === '嵌入' || text === 'Embed' || (text.includes('嵌入') && text.length < 10) || (text.includes('Embed') && text.length < 10);
        });
        if (embedItem) {
          (embedItem as HTMLElement).click();
          return embedItem.textContent?.trim() ?? 'clicked';
        }
        return null;
      });

      if (!embedMenuClicked) {
        this.addLog('⚠️ 未找到嵌入菜单项，截图调试...');
        try {
          await page.screenshot({ path: '/tmp/gsp_insert_menu.png', fullPage: false });
          const menuItems = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[role="menuitem"], li'))
              .map(el => el.textContent?.trim().slice(0, 30))
              .filter(Boolean);
          });
          this.addLog(`菜单项: ${JSON.stringify(menuItems)}`);
        } catch {}
        await page.keyboard.press('Escape');
        return;
      }
      this.addLog(`已点击嵌入菜单项: ${embedMenuClicked}`);
      await randomDelay(1000, 1500);

      // 等待嵌入对话框出现
      try {
        await page.waitForSelector('[role="dialog"] input, [role="dialog"] textarea', { timeout: 8000 });
        this.addLog('嵌入对话框已出现');
      } catch {
        this.addLog('⚠️ 嵌入对话框未出现，尝试继续...');
      }

      // 在输入框中填入 URL
      const urlFilled = await page.evaluate((url: string) => {
        const dialog = document.querySelector('[role="dialog"]') || document;
        const inputs = Array.from(dialog.querySelectorAll('input, textarea')) as HTMLInputElement[];
        const urlInput = inputs.find(i => {
          const label = (i.getAttribute('aria-label') || i.placeholder || '').toLowerCase();
          return label.includes('url') || label.includes('link') || label.includes('链接') || label.includes('网址') || i.type === 'url' || i.type === 'text';
        }) || inputs[0];
        if (urlInput) {
          urlInput.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(urlInput, url);
          else urlInput.value = url;
          urlInput.dispatchEvent(new Event('input', { bubbles: true }));
          urlInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, embedUrl);

      if (!urlFilled) {
        this.addLog('⚠️ 未找到 URL 输入框，跳过内嵌网站');
        await page.keyboard.press('Escape');
        return;
      }
      this.addLog(`已填入嵌入 URL: ${embedUrl}`);
      await randomDelay(500, 800);

      // 点击“下一步”或“预览”按鈕
      const nextClicked = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]') || document;
        const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
        const nextBtn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          const disabled = (b as HTMLButtonElement).disabled;
          return !disabled && (text === '下一步' || text === 'Next' || text === '预览' || text === 'Preview' || text === '插入' || text === 'Insert');
        });
        if (nextBtn) {
          (nextBtn as HTMLElement).click();
          return nextBtn.textContent?.trim() ?? 'clicked';
        }
        return null;
      });

      if (nextClicked) {
        this.addLog(`已点击: ${nextClicked}`);
        await randomDelay(2000, 3000);

        // 如果点击的是“下一步”/“预览”，还需要点击“插入”
        if (nextClicked !== '插入' && nextClicked !== 'Insert') {
          const insertClicked = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]') || document;
            const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
            const insertBtn = btns.find(b => {
              const text = b.textContent?.trim() || '';
              const disabled = (b as HTMLButtonElement).disabled;
              return !disabled && (text === '插入' || text === 'Insert');
            });
            if (insertBtn) {
              (insertBtn as HTMLElement).click();
              return insertBtn.textContent?.trim() ?? 'clicked';
            }
            return null;
          });
          if (insertClicked) {
            this.addLog(`已点击插入确认: ${insertClicked}`);
          }
        }
        // 等待嵌入弹窗自然关闭（最多等 12 秒）
        this.addLog('等待嵌入弹窗关闭...');
        let embedDialogClosed = false;
        for (let i = 0; i < 12; i++) {
          await randomDelay(1000, 1000);
          const dialogStillOpen = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog) return false;
            // 嵌入弹窗有 input，发布弹窗没有 input
            return dialog.querySelectorAll('input, textarea').length > 0;
          });
          if (!dialogStillOpen) {
            embedDialogClosed = true;
            break;
          }
        }
        if (embedDialogClosed) {
          this.addLog(`✅ 内嵌网站插入完成: ${embedUrl}`);
        } else {
          // 弹窗仍未关闭，强制按 Escape 关闭
          this.addLog('⚠️ 嵌入弹窗未自动关闭，强制按 Escape 关闭...');
          await page.keyboard.press('Escape');
          await randomDelay(1200, 1500);
          this.addLog(`✅ 内嵌网站插入完成（强制关闭弹窗）: ${embedUrl}`);
        }
      } else {
        this.addLog('⚠️ 未找到插入确认按鈕，跳过');
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      this.addLog(`内嵌网站插入失败: ${err}`);
      try { await page.keyboard.press('Escape'); } catch {}
    }
  }

  private async writeContentAndPublish(page: Page, title: string, content: string, embedBlocks?: Array<{ embedUrl: string; embedWidth?: string; embedHeight?: number | string; embedPosition?: string }>): Promise<string> {
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
          for (const section of sections) {
            if (section.type === 'h1') continue; // 标题已写入
            await page.keyboard.type(section.text, { delay: 8 });
            await page.keyboard.press('Enter');
            await randomDelay(10, 30);
          }

          contentWritten = true;
          this.addLog(`✅ 内容写入成功（通过 ${sel}），标题: ${title}，段落数: ${sections.length}`);
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
          for (const section of sections) {
            if (section.type === 'h1') continue;
            await page.keyboard.type(section.text, { delay: 8 });
            await page.keyboard.press('Enter');
            await randomDelay(10, 30);
          }
          contentWritten = true;
          this.addLog('✅ 内容写入成功（通过点击中央激活）');
        }
      } catch (e) {
        this.addLog(`点击中央激活失败: ${e}`);
      }
    }

    if (!contentWritten) {
      this.addLog('⚠️ 内容写入失败，将继续尝试发布（站点标题将为默认值）');
    }

    // ── 阶段3：插入内嵌网站板块（如果有）──────────────────────────────────────
    if (embedBlocks && embedBlocks.length > 0) {
      this.addLog(`开始插入 ${embedBlocks.length} 个内嵌网站板块...`);
      for (const block of embedBlocks) {
        if (block.embedUrl) {
          const heightNum = typeof block.embedHeight === 'string' ? parseInt(block.embedHeight) || 600 : (block.embedHeight ?? 600);
          await this.insertEmbedBlock(page, block.embedUrl, heightNum);
          await randomDelay(1000, 1500);
        }
      }
    }

        // ── 阶段3.5：关闭嵌入类残留弹窗 ─────────────────────────────────────
    // 嵌入弹窗特征：有 input/textarea；发布弹窗特征：没有 input
    // 只关闭嵌入类弹窗，避免误关发布弹窗
    this.addLog('检查并关闭嵌入类残留弹窗...');
    let closeAttempts = 0;
    while (closeAttempts < 5) {
      const hasEmbedDialog = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        // 嵌入弹窗有 input，发布弹窗没有 input
        return dialog.querySelectorAll('input, textarea').length > 0;
      });
      if (!hasEmbedDialog) break;
      this.addLog(`发现嵌入类弹窗（第 ${closeAttempts + 1} 次），按 Escape 关闭...`);
      await page.keyboard.press('Escape');
      await randomDelay(1000, 1200);
      closeAttempts++;
    }
    await randomDelay(800, 1000);
    const embedDialogStillOpen = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && dialog.querySelectorAll('input, textarea').length > 0;
    });
    if (embedDialogStillOpen) {
      this.addLog('⚠️ 嵌入弹窗仍未关闭，尝试点击页面空白区域...');
      await page.mouse.click(100, 100);
      await randomDelay(1000, 1200);
    } else {
      this.addLog('✅ 嵌入类弹窗已关闭，可安全执行发布流程');
    }

    // ── 阶段4：等待自动保存 ──────────────────────────────────────────────────
    // Google Sites 编辑器会自动保存，等待 5 秒确保内容已保存
    this.addLog('等待 Google Sites 自动保存内容（5 秒）...');
    await randomDelay(5000, 6000);
    // ── 阶段5：点击右上角"发布"按钮 ─────────────────────────────────────────────────
    this.addLog('查找并点击发布按钮...');
    const publishBtnClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = buttons.find(b => {
        const text = b.textContent?.trim() || '';
        return text === '发布' || text === 'Publish' || text === 'publish';
      });
      if (btn) {
        (btn as HTMLElement).click();
        return btn.textContent?.trim() ?? 'clicked';
      }
      return null;
    });

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

    const fillResult = await page.evaluate((params: { slug: string; title: string }) => {
      const dialog = document.querySelector('[role="dialog"]');
      const container = dialog || document;

      const inputs = Array.from(container.querySelectorAll(
        'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
      )) as HTMLInputElement[];

      function fillInput(input: HTMLInputElement, value: string) {
        input.focus();
        // 使用 React 原生 setter 触发 React 状态更新
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // URL 框：ariaLabel 为"网站名称"/"Site name"/"Web address"，或初始值为空
      const urlInput = inputs.find(i => {
        const label = (i.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('网站名称') || label.includes('site name') || label.includes('web address') || label.includes('url');
      }) || inputs.find(i => i.value === '');

      // 标题框：排除 URL 框和字体大小框
      const titleInput = inputs.find(i => {
        const label = (i.getAttribute('aria-label') || '').toLowerCase();
        return i !== urlInput && !label.includes('字体大小') && !label.includes('font size');
      });

      if (titleInput) fillInput(titleInput, params.title);
      if (urlInput) fillInput(urlInput, params.slug);

      return {
        titleFilled: !!titleInput,
        titleValue: titleInput?.value,
        urlFilled: !!urlInput,
        urlValue: urlInput?.value,
        totalInputs: inputs.length,
      };
    }, { slug, title });

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

    const confirmResult = await page.evaluate(() => {
      // 优先在 dialog 内找未禁用的"发布"/"Publish"按钮
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
        const btn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          const disabled = (b as HTMLButtonElement).disabled;
          return !disabled && (text === '发布' || text === 'Publish');
        });
        if (btn) {
          (btn as HTMLElement).click();
          return `dialog内: "${btn.textContent?.trim()}"`;
        }

        // 如果发布按钮是禁用的，记录原因
        const disabledBtn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          return text === '发布' || text === 'Publish';
        });
        if (disabledBtn) {
          return `发布按钮被禁用（可能 slug 未通过验证）`;
        }
      }

      // 全页面备用查找（排除工具栏按钮）
      const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = allBtns.find(b => {
        const text = b.textContent?.trim() || '';
        const disabled = (b as HTMLButtonElement).disabled;
        const cls = b.className || '';
        // 跳过工具栏按钮（className 含 UQuaGc 且不在 dialog 内）
        if (cls.includes('UQuaGc') && !dialog?.contains(b)) return false;
        return !disabled && (text === '发布' || text === 'Publish');
      });
      if (btn) {
        (btn as HTMLElement).click();
        return `全页面: "${btn.textContent?.trim()}"`;
      }
      return null;
    });

    if (confirmResult) {
      this.addLog(`✅ 已点击确认发布按钮: ${confirmResult}`);
    } else {
      this.addLog('⚠️ 未找到可点击的确认发布按钮，尝试等待更长时间后重试...');
      // 再等 2 秒后重试一次（slug 验证可能需要更长时间）
      await randomDelay(2000, 3000);
      const retryResult = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const container = dialog || document;
        const btns = Array.from(container.querySelectorAll('button, [role="button"]'));
        const btn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          const disabled = (b as HTMLButtonElement).disabled;
          return !disabled && (text === '发布' || text === 'Publish');
        });
        if (btn) {
          (btn as HTMLElement).click();
          return `重试成功: "${btn.textContent?.trim()}"`;
        }
        // 输出所有按钮状态用于调试
        return `重试失败，弹窗按钮: ${JSON.stringify(btns.map(b => ({ text: b.textContent?.trim().slice(0, 20), disabled: (b as HTMLButtonElement).disabled })))}`;
      });
      this.addLog(`重试结果: ${retryResult}`);
    }

    // ── 阶段7：等待发布完成 ───────────────────────────────────────────────────
    // 修复：不能用"复制已发布网站的链接"按钮判断（该按钮在发布前就已存在）
    // 正确方式：监听 /publish/publish API 请求 + 等待弹窗消失
    this.addLog('等待发布完成（监听发布 API 请求 + 等待弹窗关闭）...');

    let publishConfirmed = false;
    let publishApiCalled = false;

    // 设置网络请求监听，捕获真正的发布 API 调用
    const publishApiListener = (req: any) => {
      const reqUrl: string = req.url();
      if (reqUrl.includes('/publish/publish') || reqUrl.includes('/publish/setpublishedstate') || reqUrl.includes('/publish/setpublished')) {
        publishApiCalled = true;
        this.addLog(`✅ 检测到发布 API 请求: ${reqUrl.split('?')[0]}`);
      }
    };
    page.on('request', publishApiListener);

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
      const publishedUrl = await this.writeContentAndPublish(page, options.title, options.content, options.embedBlocks);

      // 应用 Google Sites 主题（发布完成后切换主题）
      if (options.siteTheme && options.siteTheme !== 'Simple') {
        try {
          await this.applyTheme(page, options.siteTheme);
        } catch (themeErr) {
          this.addLog(`主题应用失败（不影响发布结果）: ${themeErr}`);
        }
      }

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

  /**
   * 应用 Google Sites 主题
   * 在发布完成后，通过主题面板选择指定主题
   */
  private async applyTheme(page: Page, themeName: string): Promise<void> {
    this.addLog(`开始应用主题: ${themeName}`);

    // 点击工具栏中的主题按鈕（通常标注为 "主题" 或 "Themes"）
    const themeBtnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = btns.find(b => {
        const text = b.textContent?.trim() || '';
        const ariaLabel = b.getAttribute('aria-label') || '';
        return text === '主题' || text === 'Themes' || text === 'Theme'
          || ariaLabel === '主题' || ariaLabel === 'Themes' || ariaLabel === 'Theme';
      });
      if (btn) { (btn as HTMLElement).click(); return true; }
      return false;
    });

    if (!themeBtnClicked) {
      this.addLog('⚠️ 未找到主题按鈕，尝试通过导航栏查找...');
      // 尝试在导航栏找到主题入口
      const navThemeClicked = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('[data-tooltip], [title], [aria-label]'));
        const el = allEls.find(e => {
          const tip = e.getAttribute('data-tooltip') || e.getAttribute('title') || e.getAttribute('aria-label') || '';
          return tip.includes('主题') || tip.toLowerCase().includes('theme');
        });
        if (el) { (el as HTMLElement).click(); return true; }
        return false;
      });
      if (!navThemeClicked) {
        this.addLog('⚠️ 未找到主题入口，跳过主题设置');
        return;
      }
    }

    this.addLog('已点击主题按鈕，等待主题面板加载...');
    await randomDelay(2000, 3000);

    // 在主题面板中查找目标主题
    const themeApplied = await page.evaluate((targetTheme: string) => {
      // 查找主题列表中匹配目标主题名称的元素
      const allEls = Array.from(document.querySelectorAll('[data-theme-name], [aria-label], [title], button, [role="button"]'));
      const themeEl = allEls.find(el => {
        const themeName = el.getAttribute('data-theme-name') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        const text = el.textContent?.trim() || '';
        return themeName === targetTheme
          || ariaLabel === targetTheme
          || title === targetTheme
          || text === targetTheme;
      });
      if (themeEl) {
        (themeEl as HTMLElement).click();
        return true;
      }
      // 输出所有元素的主题相关属性，便于调试
      return JSON.stringify(allEls.slice(0, 20).map(e => ({
        tag: e.tagName,
        dataTheme: e.getAttribute('data-theme-name'),
        aria: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        text: e.textContent?.trim().slice(0, 30),
      })));
    }, themeName);

    if (themeApplied === true) {
      this.addLog(`✅ 主题 "${themeName}" 已选中，等待应用...`);
      await randomDelay(2000, 3000);

      // 查找并点击确认按鈕（如果有）
      const confirmClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        const btn = btns.find(b => {
          const text = b.textContent?.trim() || '';
          return text === '应用' || text === 'Apply' || text === '确定' || text === 'OK';
        });
        if (btn) { (btn as HTMLElement).click(); return true; }
        return false;
      });
      if (confirmClicked) {
        this.addLog('已点击确认应用主题');
        await randomDelay(2000, 3000);
      }

      // 保存主题设置（自动保存）
      this.addLog(`✅ 主题 "${themeName}" 应用完成`);
    } else {
      this.addLog(`⚠️ 未找到主题 "${themeName}"，调试信息: ${typeof themeApplied === 'string' ? themeApplied.slice(0, 200) : themeApplied}`);
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
