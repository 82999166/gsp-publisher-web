import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

console.log('Launching with path: /usr/lib/chromium-browser/chromium-browser');
try {
  const browser = await puppeteerExtra.launch({
    executablePath: '/usr/lib/chromium-browser/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  console.log('Browser launched successfully!');
  await browser.close();
  console.log('Browser closed.');
} catch(e) {
  console.error('Launch error:', e.message);
}
