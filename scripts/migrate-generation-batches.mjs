/**
 * 迁移 generation_batches 表 - 更新表结构
 * 用法: node scripts/migrate-generation-batches.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 环境变量未设置");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    console.log("开始迁移 generation_batches 表...");
    
    // 备份旧表
    await conn.execute("DROP TABLE IF EXISTS generation_batches_old");
    await conn.execute("RENAME TABLE generation_batches TO generation_batches_old");
    console.log("✅ 旧表已备份为 generation_batches_old");
    
    // 创建新表
    await conn.execute(`
      CREATE TABLE generation_batches (
        id INT AUTO_INCREMENT NOT NULL,
        name VARCHAR(256) NOT NULL,
        status ENUM('pending','running','paused','completed','failed') NOT NULL DEFAULT 'pending',
        totalCount INT NOT NULL DEFAULT 0,
        completedCount INT NOT NULL DEFAULT 0,
        failedCount INT NOT NULL DEFAULT 0,
        language ENUM('zh-CN','en','zh-TW') NOT NULL DEFAULT 'zh-CN',
        minWords INT NOT NULL DEFAULT 800,
        style ENUM('informational','commercial','navigational') NOT NULL DEFAULT 'informational',
        concurrency INT NOT NULL DEFAULT 3,
        insertKeywords JSON,
        anchorLinks JSON,
        insertParagraph TEXT,
        autoApproveThreshold INT DEFAULT 0,
        autoQueue BOOLEAN DEFAULT false,
        startedAt TIMESTAMP,
        completedAt TIMESTAMP,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT generation_batches_id PRIMARY KEY(id)
      )
    `);
    console.log("✅ 新表已创建");
    
    // 迁移数据（如果有的话）
    const [oldRows] = await conn.execute("SELECT COUNT(*) as count FROM generation_batches_old");
    if (oldRows[0].count > 0) {
      await conn.execute(`
        INSERT INTO generation_batches (
          id, name, status, totalCount, completedCount, failedCount, 
          language, minWords, style, concurrency, startedAt, completedAt, createdAt, updatedAt
        )
        SELECT 
          id, name, status, totalCount, successCount, failedCount,
          language, minWords, style, concurrency, startedAt, completedAt, createdAt, updatedAt
        FROM generation_batches_old
      `);
      console.log(`✅ 已迁移 ${oldRows[0].count} 条数据`);
    }
    
    // 显示新表结构
    const [columns] = await conn.execute("DESCRIBE generation_batches");
    console.log("\n新表结构:");
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}`);
    });
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌ 迁移失败:", err.message);
  process.exit(1);
});
