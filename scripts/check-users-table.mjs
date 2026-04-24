/**
 * 检查 users 表结构
 * 用法: node scripts/check-users-table.mjs
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
    // 查看 users 表结构
    const [columns] = await conn.execute("DESCRIBE users");
    console.log("✅ users 表结构:");
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // 查看表中的数据
    const [rows] = await conn.execute("SELECT COUNT(*) as count FROM users");
    console.log(`\n表中数据条数: ${rows[0].count}`);
    
    // 查看是否有 admin 用户
    const [adminUser] = await conn.execute("SELECT id, openId, name, loginMethod FROM users WHERE openId = 'admin'");
    if (adminUser.length > 0) {
      console.log("\n✅ admin 用户存在:");
      console.log(JSON.stringify(adminUser[0], null, 2));
    } else {
      console.log("\n❌ admin 用户不存在");
    }
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌ 检查失败:", err.message);
  process.exit(1);
});
