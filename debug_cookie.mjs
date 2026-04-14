/**
 * 调试 Cookie 验证：截图查看实际页面
 */
import mysql from 'mysql2/promise';
import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [accounts] = await conn.execute('SELECT cookieParsed FROM accounts WHERE id=1');
await conn.end();

const acc = accounts[0];
const cookies = typeof acc.cookieParsed === 'string' ? JSON.parse(acc.cookieParsed) : acc.cookieParsed;

console.log(`Cookie 数量: ${cookies.length}`);
console.log('Cookie 名称:', cookies.map(c => c.name).join(', '));

// 检查关键 Cookie 的过期时间
const now = Date.now() / 1000;
for (const c of cookies) {
  if (['SID', 'SSID', '__Secure-1PSID', '__Secure-3PSID', 'SIDCC'].includes(c.name)) {
    const expiry = c.expirationDate || c.expires;
    const expired = expiry && expiry < now;
    console.log(`  ${c.name}: expires=${expiry ? new Date(expiry * 1000).toISOString() : '无'} ${expired ? '【已过期!】' : '【有效】'}`);
  }
}

console.log('\n启动浏览器进行验证...');

const browser = await puppeteer.launch({
  executablePath: CHROMIUM_PATH,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

// 先导航到 Google
await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('初始 URL:', page.url());

// 注入 Cookie
for (const cookie of cookies) {
  try {
    await page.setCookie({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.google.com',
      path: cookie.path || '/',
      expires: cookie.expirationDate || cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    });
  } catch (e) {
    // ignore
  }
}

// 访问 myaccount
await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));

const finalUrl = page.url();
console.log('最终 URL:', finalUrl);

const title = await page.title();
console.log('页面标题:', title);

// 截图
await page.screenshot({ path: '/tmp/google_verify.png', fullPage: false });
console.log('截图已保存到 /tmp/google_verify.png');

// 检查页面内容
const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
console.log('页面内容片段:', bodyText.slice(0, 200));

const isLoggedIn = !finalUrl.includes('accounts.google.com/signin') && !finalUrl.includes('accounts.google.com/v3');
console.log('\n登录状态:', isLoggedIn ? '✓ 已登录' : '✗ 未登录');

await browser.close();
