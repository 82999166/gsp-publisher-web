/**
 * 初始化管理员账号脚本
 * 用法: npx tsx scripts/init-admin.ts [username] [password]
 * 默认: username=admin, password=Admin@2024!
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}

const username = process.argv[2] || "admin";
const password = process.argv[3] || "Admin@2024!";

async function main() {
  console.log(`\n🔧 Initializing admin account: ${username}`);

  const connection = await mysql.createConnection(DATABASE_URL!);
  const db = drizzle(connection);

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.openId, username)).limit(1);

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing.length > 0) {
    // Update existing user
    await db.update(users)
      .set({ passwordHash, role: "admin", name: username })
      .where(eq(users.openId, username));
    console.log(`✅ Admin account updated: ${username}`);
  } else {
    // Create new user
    await db.insert(users).values({
      openId: username,
      name: username,
      email: null,
      loginMethod: "local",
      passwordHash,
      role: "admin",
      lastSignedIn: new Date(),
    });
    console.log(`✅ Admin account created: ${username}`);
  }

  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password}`);
  console.log(`\n⚠️  Please change the password after first login!\n`);

  await connection.end();
}

main().catch(err => {
  console.error("❌ Failed to initialize admin:", err);
  process.exit(1);
});
