/**
 * 直接调用 GoogleSitesPublisher 执行10个发布任务
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 获取待执行的任务（id 2-11）
const [tasks] = await conn.execute(
  "SELECT t.id, t.name, t.accountId, t.materialId, t.siteId, t.status FROM publish_tasks t WHERE t.id BETWEEN 2 AND 11 ORDER BY t.id"
);

console.log(`找到 ${tasks.length} 个待执行任务`);

// 获取账号
const [accounts] = await conn.execute("SELECT id, name, cookieParsed, defaultSiteUrl, defaultSiteName FROM accounts WHERE id=1");
const account = accounts[0];

// 获取站点
const [sites] = await conn.execute("SELECT id, siteName, siteUrl FROM google_sites WHERE id=1");
const site = sites[0];

console.log(`账号: ${account.name}`);
console.log(`站点: ${site?.siteName || '无'}, URL: ${site?.siteUrl || '无'}`);

const cookieParsed = typeof account.cookieParsed === 'string' 
  ? JSON.parse(account.cookieParsed) 
  : account.cookieParsed;

console.log(`Cookie 数量: ${cookieParsed.length}`);
console.log('');

// 直接通过 HTTP API 调用 executeTask（需要认证）
// 改为直接调用发布引擎
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 动态导入 googleSitesPublisher
const { googleSitesPublisher } = await import('./server/googleSitesPublisher.js').catch(async () => {
  // 尝试 ts 版本
  const { googleSitesPublisher } = await import('./server/googleSitesPublisher.ts');
  return { googleSitesPublisher };
});

let successCount = 0;
let failCount = 0;
const results = [];

for (const task of tasks) {
  // 获取素材
  const [materials] = await conn.execute("SELECT id, title, keyword, content, language, wordCount, qualityScore FROM materials WHERE id=?", [task.materialId]);
  const material = materials[0];
  
  if (!material) {
    console.log(`任务 ${task.id}: 素材不存在，跳过`);
    failCount++;
    continue;
  }

  console.log(`\n[${successCount + failCount + 1}/10] 执行任务 ${task.id}: ${task.name}`);
  console.log(`  素材: ${material.title}`);
  
  // 更新任务状态为 running
  await conn.execute("UPDATE publish_tasks SET status='running', startedAt=NOW(), updatedAt=NOW() WHERE id=?", [task.id]);
  
  try {
    const result = await googleSitesPublisher.publish({
      cookieParsed,
      siteName: account.defaultSiteName || 'gsp-site',
      title: material.title,
      content: material.content,
      siteUrl: site?.siteUrl || account.defaultSiteUrl || undefined,
      headless: true,
      timeout: 120000,
    });
    
    if (result.success) {
      successCount++;
      console.log(`  ✓ 发布成功: ${result.publishedUrl}`);
      
      // 更新任务状态
      await conn.execute(
        "UPDATE publish_tasks SET status='success', completedAt=NOW(), publishedUrl=?, engineLog=?, updatedAt=NOW() WHERE id=?",
        [result.publishedUrl || null, result.log.join('\n'), task.id]
      );
      
      // 更新素材状态
      await conn.execute("UPDATE materials SET status='published', updatedAt=NOW() WHERE id=?", [task.materialId]);
      
      // 保存已发布链接
      if (result.publishedUrl) {
        await conn.execute(
          `INSERT INTO published_pages (taskId, materialId, accountId, siteId, title, keyword, publishedUrl, language, wordCount, qualityScore, indexStatus, gscSubmitted, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NOW(), NOW())`,
          [task.id, task.materialId, task.accountId, task.siteId || null, material.title, material.keyword || null, result.publishedUrl, material.language || 'zh-CN', material.wordCount || null, material.qualityScore || null]
        );
        console.log(`  ✓ 已保存到已发布链接`);
      }
      
      results.push({ taskId: task.id, title: material.title, url: result.publishedUrl, success: true });
    } else {
      failCount++;
      console.log(`  ✗ 发布失败: ${result.errorMessage}`);
      console.log(`  日志: ${result.log.slice(-3).join(' | ')}`);
      
      await conn.execute(
        "UPDATE publish_tasks SET status='failed', completedAt=NOW(), errorMessage=?, engineLog=?, updatedAt=NOW() WHERE id=?",
        [result.errorMessage || '未知错误', result.log.join('\n'), task.id]
      );
      
      results.push({ taskId: task.id, title: material.title, url: null, success: false, error: result.errorMessage });
    }
  } catch (err) {
    failCount++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ 异常: ${msg}`);
    
    await conn.execute(
      "UPDATE publish_tasks SET status='failed', completedAt=NOW(), errorMessage=?, updatedAt=NOW() WHERE id=?",
      [msg, task.id]
    );
    
    results.push({ taskId: task.id, title: material.title, url: null, success: false, error: msg });
  }
}

console.log('\n========== 发布结果汇总 ==========');
console.log(`成功: ${successCount} / ${tasks.length}`);
console.log(`失败: ${failCount} / ${tasks.length}`);
console.log('');
for (const r of results) {
  if (r.success) {
    console.log(`✓ [${r.taskId}] ${r.title}`);
    console.log(`  URL: ${r.url}`);
  } else {
    console.log(`✗ [${r.taskId}] ${r.title}`);
    console.log(`  错误: ${r.error}`);
  }
}

await conn.end();
