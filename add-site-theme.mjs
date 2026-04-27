import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

// 读取 .env 文件获取 DATABASE_URL
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const env = readFileSync('/home/ubuntu/gsp-publisher-web/.env', 'utf8');
    const match = env.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
}

if (!dbUrl) {
  console.error('❌ 未找到 DATABASE_URL');
  process.exit(1);
}

const conn = await createConnection(dbUrl);
try {
  await conn.execute('ALTER TABLE seo_templates ADD COLUMN siteTheme VARCHAR(64) DEFAULT "Simple"');
  console.log('✅ siteTheme 列已添加');
} catch (e) {
  if (e.message && (e.message.includes('Duplicate column') || e.message.includes('already exists'))) {
    console.log('✅ siteTheme 列已存在，无需添加');
  } else {
    console.error('❌ 失败:', e.message);
  }
}
await conn.end();
