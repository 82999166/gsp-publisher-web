/**
 * 检查数据库表结构
 * 用法: node scripts/check-db.mjs
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
    // 检查 generation_batches 表是否存在
    const [tables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'generation_batches'"
    );
    
    if (tables.length === 0) {
      console.log("❌ generation_batches 表不存在");
      return;
    }
    
    console.log("✅ generation_batches 表存在");
    
    // 查看表结构
    const [columns] = await conn.execute("DESCRIBE generation_batches");
    console.log("\ngeneration_batches 表结构:");
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // 查看表中的数据
    const [rows] = await conn.execute("SELECT COUNT(*) as count FROM generation_batches");
    console.log(`\n表中数据条数: ${rows[0].count}`);
    
    // 尝试查询表数据
    if (rows[0].count > 0) {
      const [data] = await conn.execute("SELECT * FROM generation_batches LIMIT 1");
      console.log("\n第一条数据:");
      console.log(JSON.stringify(data[0], null, 2));
    }
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌ 检查失败:", err.message);
  process.exit(1);
});
