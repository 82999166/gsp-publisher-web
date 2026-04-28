/**
 * 浏览器指纹生成器
 * 为每个账号生成独立的、稳定的浏览器指纹，防止多账号被 Google 关联
 */

export interface BrowserFingerprint {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  language: string;
  platform: string;
  colorDepth: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  // 用于 Puppeteer 启动参数
  windowWidth: number;
  windowHeight: number;
}

// 常见的真实 User-Agent 列表（Windows + Mac + Linux 混合，模拟真实用户分布）
const USER_AGENTS = [
  // Windows Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  // Mac Chrome
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Mac Safari
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15",
  // Windows Edge
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

// 常见屏幕分辨率（真实用户分布）
const SCREEN_RESOLUTIONS: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1536, 864],
  [1366, 768],
  [2560, 1440],
  [1280, 800],
  [1600, 900],
  [1920, 1200],
  [2560, 1600],
  [1680, 1050],
];

// 常见时区
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Denver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Australia/Sydney",
  "America/Toronto",
  "America/Vancouver",
];

// 常见语言
const LANGUAGES = [
  "en-US",
  "en-GB",
  "en-CA",
  "en-AU",
  "zh-CN",
  "zh-TW",
  "ja-JP",
  "ko-KR",
  "de-DE",
  "fr-FR",
];

// 平台
const PLATFORMS = [
  "Win32",
  "Win32",
  "Win32",  // Windows 占多数
  "MacIntel",
  "MacIntel",
  "Linux x86_64",
];

// 硬件并发数（CPU 核心数）
const HARDWARE_CONCURRENCY = [2, 4, 4, 4, 6, 8, 8, 12, 16];

// 设备内存（GB）
const DEVICE_MEMORY = [2, 4, 4, 8, 8, 8, 16];

/**
 * 基于账号 ID 生成确定性随机数（同一账号每次生成相同指纹）
 */
function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9301 + index * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function seededPick<T>(arr: T[], seed: number, index: number): T {
  const i = Math.floor(seededRandom(seed, index) * arr.length);
  return arr[i];
}

/**
 * 根据账号 ID 生成独立的浏览器指纹
 * 同一账号 ID 每次生成相同的指纹（确定性），不同账号 ID 生成不同指纹
 */
export function generateFingerprint(accountId: number): BrowserFingerprint {
  const seed = accountId;

  const userAgent = seededPick(USER_AGENTS, seed, 0);
  const [screenWidth, screenHeight] = seededPick(SCREEN_RESOLUTIONS, seed, 1);
  const timezone = seededPick(TIMEZONES, seed, 2);
  const language = seededPick(LANGUAGES, seed, 3);
  const platform = seededPick(PLATFORMS, seed, 4);
  const hardwareConcurrency = seededPick(HARDWARE_CONCURRENCY, seed, 5);
  const deviceMemory = seededPick(DEVICE_MEMORY, seed, 6);

  // 窗口大小略小于屏幕（模拟真实浏览器有标题栏/任务栏）
  const windowWidth = screenWidth;
  const windowHeight = screenHeight - Math.floor(seededRandom(seed, 7) * 100 + 80);

  return {
    userAgent,
    screenWidth,
    screenHeight,
    timezone,
    language,
    platform,
    colorDepth: 24,
    hardwareConcurrency,
    deviceMemory,
    windowWidth,
    windowHeight,
  };
}
