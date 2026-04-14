import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// 查看 google_sites 表结构
console.log('=== GOOGLE SITES TABLE STRUCTURE ===');
try {
  const [cols] = await conn.execute('DESCRIBE google_sites');
  console.log(JSON.stringify(cols.map(c => c.Field), null, 2));
  const [sites] = await conn.execute('SELECT * FROM google_sites LIMIT 10');
  console.log(JSON.stringify(sites, null, 2));
} catch(e) { console.log('Error:', e.message); }

// 查看 system_settings 表结构
console.log('\n=== SYSTEM SETTINGS TABLE STRUCTURE ===');
try {
  const [cols] = await conn.execute('DESCRIBE system_settings');
  console.log(JSON.stringify(cols.map(c => c.Field), null, 2));
  const [settings] = await conn.execute('SELECT * FROM system_settings LIMIT 20');
  console.log(JSON.stringify(settings, null, 2));
} catch(e) { console.log('Error:', e.message); }

// 查看 publish_tasks 表
console.log('\n=== PUBLISH TASKS ===');
try {
  const [tasks] = await conn.execute('SELECT id, name, status, accountId, materialId, publishedUrl FROM publish_tasks LIMIT 10');
  console.log(JSON.stringify(tasks, null, 2));
} catch(e) { console.log('Error:', e.message); }

// 查看 published_pages 表
console.log('\n=== PUBLISHED PAGES ===');
try {
  const [pages] = await conn.execute('SELECT * FROM published_pages LIMIT 10');
  console.log(JSON.stringify(pages, null, 2));
} catch(e) { console.log('Error:', e.message); }

await conn.end();
