import fs from "fs";
import puppeteer from "puppeteer-core";

function detectChromiumPath() {
  const candidates = [
    "/usr/lib/chromium-browser/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p);
      if (stat.isFile() && (stat.mode & 0o111)) return p;
    } catch {}
  }
  return "/usr/bin/chromium-browser";
}

const path = detectChromiumPath();
console.log("Using Chromium:", path);

try {
  const browser = await puppeteer.launch({
    executablePath: path,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    timeout: 30000,
  });
  const page = await browser.newPage();
  await page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeout: 15000 });
  const title = await page.title();
  console.log("✅ 浏览器启动成功！页面标题:", title);
  await browser.close();
} catch (e) {
  console.error("❌ 浏览器启动失败:", e.message);
}
