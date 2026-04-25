import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(url);

// Add templateId and autoQueue columns if not exist
const alterStatements = [
  `ALTER TABLE generation_batches ADD COLUMN IF NOT EXISTS autoQueue tinyint NOT NULL DEFAULT 0`,
  `ALTER TABLE generation_batches ADD COLUMN IF NOT EXISTS templateId int DEFAULT NULL`,
];

for (const sql of alterStatements) {
  try {
    await conn.execute(sql);
    console.log("✓ Executed:", sql.substring(0, 80));
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("⚠ Column already exists, skipping:", sql.substring(0, 80));
    } else {
      console.error("✗ Error:", err.message);
    }
  }
}

await conn.end();
console.log("Migration complete.");
