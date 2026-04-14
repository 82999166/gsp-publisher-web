import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, name, status, cookieParsed, defaultSiteUrl, defaultSiteName FROM accounts WHERE id=1');
const acc = rows[0];
console.log('name:', acc.name);
console.log('status:', acc.status);
console.log('defaultSiteUrl:', acc.defaultSiteUrl);
console.log('defaultSiteName:', acc.defaultSiteName);

if (acc.cookieParsed) {
  const parsed = typeof acc.cookieParsed === 'string' ? JSON.parse(acc.cookieParsed) : acc.cookieParsed;
  console.log('cookie count:', Array.isArray(parsed) ? parsed.length : 'not array');
  if (Array.isArray(parsed) && parsed.length > 0) {
    console.log('first cookie name:', parsed[0].name);
    console.log('has SID:', parsed.some(c => c.name === 'SID'));
    console.log('has SSID:', parsed.some(c => c.name === 'SSID'));
    console.log('has __Secure-1PSID:', parsed.some(c => c.name === '__Secure-1PSID'));
  }
} else {
  console.log('cookieParsed: NULL (没有 Cookie)');
}

await conn.end();
