import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL || '');
try {
  await conn.execute('ALTER TABLE accounts ADD COLUMN browserFingerprint JSON NULL AFTER proxyConfig');
  console.log('✅ browserFingerprint 列添加成功');
} catch(e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('✅ browserFingerprint 列已存在');
  } else {
    console.error('❌ 错误:', e.message);
  }
}
await conn.end();
