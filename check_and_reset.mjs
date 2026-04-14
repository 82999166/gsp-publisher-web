import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 检查账号 Cookie 是否已更新
const [accounts] = await conn.execute('SELECT id, name, status, cookieParsed, updatedAt FROM accounts WHERE id=1');
const acc = accounts[0];
console.log('账号:', acc.name);
console.log('状态:', acc.status);
console.log('更新时间:', acc.updatedAt);

if (acc.cookieParsed) {
  const parsed = typeof acc.cookieParsed === 'string' ? JSON.parse(acc.cookieParsed) : acc.cookieParsed;
  console.log('Cookie 数量:', Array.isArray(parsed) ? parsed.length : 'not array');
  if (Array.isArray(parsed) && parsed.length > 0) {
    console.log('Cookie 名称列表:', parsed.map(c => c.name).join(', '));
  }
} else {
  console.log('cookieParsed: NULL');
}

// 重置任务 2-11 为 pending 状态
const [resetResult] = await conn.execute(
  "UPDATE publish_tasks SET status='pending', startedAt=NULL, completedAt=NULL, publishedUrl=NULL, errorMessage=NULL, engineLog=NULL, retryCount=0, updatedAt=NOW() WHERE id BETWEEN 2 AND 11"
);
console.log('\n已重置任务数量:', resetResult.affectedRows);

// 确认任务状态
const [tasks] = await conn.execute(
  "SELECT id, name, status, materialId FROM publish_tasks WHERE id BETWEEN 2 AND 11 ORDER BY id"
);
console.log('\n任务列表:');
for (const t of tasks) {
  console.log(`  [${t.id}] ${t.name} → ${t.status} (materialId=${t.materialId})`);
}

await conn.end();
console.log('\n准备就绪，可以开始发布！');
