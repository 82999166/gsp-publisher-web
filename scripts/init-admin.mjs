/**
 * 初始化管理员账号脚本
 * 用法: node scripts/init-admin.mjs [username] [password]
 * 默认: username=admin, password=Admin@123456
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const username = process.argv[2] || "admin";
const password = process.argv[3] || "Admin@123456";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 环境变量未设置");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    // 检查是否已存在
    const [rows] = await conn.execute(
      "SELECT id FROM users WHERE openId = ?",
      [username]
    );
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    if (rows.length > 0) {
      // 更新密码
      await conn.execute(
        "UPDATE users SET passwordHash = ?, role = 'admin', name = ? WHERE openId = ?",
        [passwordHash, username, username]
      );
      console.log(`✅ 管理员账号已更新: ${username}`);
    } else {
      // 创建新账号
      await conn.execute(
        `INSERT INTO users (openId, name, role, passwordHash, loginMethod, lastSignedIn, createdAt, updatedAt)
         VALUES (?, ?, 'admin', ?, 'local', NOW(), NOW(), NOW())`,
        [username, username, passwordHash]
      );
      console.log(`✅ 管理员账号已创建: ${username}`);
    }
    
    console.log(`   用户名: ${username}`);
    console.log(`   密码: ${password}`);
    console.log(`   角色: admin`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌ 初始化失败:", err.message);
  process.exit(1);
});
