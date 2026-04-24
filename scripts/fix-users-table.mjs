/**
 * 修复 users 表 - 添加缺失的 passwordHash 列
 * 用法: node scripts/fix-users-table.mjs
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
    // 检查 passwordHash 列是否存在
    const [columns] = await conn.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordHash'"
    );
    
    if (columns.length === 0) {
      console.log("正在添加 passwordHash 列...");
      await conn.execute(
        "ALTER TABLE users ADD COLUMN passwordHash varchar(256) AFTER loginMethod"
      );
      console.log("✅ passwordHash 列已添加");
    } else {
      console.log("✅ passwordHash 列已存在");
    }
    
    // 显示 users 表结构
    const [tableInfo] = await conn.execute("DESCRIBE users");
    console.log("\nusers 表结构:");
    tableInfo.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}`);
    });
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌ 修复失败:", err.message);
  process.exit(1);
});
