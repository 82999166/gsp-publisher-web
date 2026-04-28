import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // 添加 siteNameSuffix 字段
  await conn.execute("ALTER TABLE seo_templates ADD COLUMN IF NOT EXISTS siteNameSuffix VARCHAR(256) DEFAULT NULL").catch(() => {});
  // 添加 embedUrl 字段
  await conn.execute("ALTER TABLE seo_templates ADD COLUMN IF NOT EXISTS embedUrl VARCHAR(1024) DEFAULT NULL").catch(() => {});
  // 添加 embedWidth 字段
  await conn.execute("ALTER TABLE seo_templates ADD COLUMN IF NOT EXISTS embedWidth VARCHAR(32) DEFAULT '100%'").catch(() => {});
  // 添加 embedHeight 字段
  await conn.execute("ALTER TABLE seo_templates ADD COLUMN IF NOT EXISTS embedHeight VARCHAR(32) DEFAULT '600px'").catch(() => {});
  // 添加 embedPosition 字段
  await conn.execute("ALTER TABLE seo_templates ADD COLUMN IF NOT EXISTS embedPosition ENUM('top','bottom') DEFAULT 'bottom'").catch(() => {});

  console.log("✅ seo_templates 表字段迁移完成");
} catch (err) {
  console.error("迁移失败:", err);
} finally {
  await conn.end();
}
