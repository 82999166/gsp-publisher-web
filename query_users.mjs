import mysql from 'mysql2/promise';

try {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('查询所有用户:');
  const [users] = await conn.execute('SELECT id, openId, name, role, passwordHash, createdAt FROM users');
  
  if (users.length === 0) {
    console.log('❌ 数据库中没有用户');
  } else {
    for (const user of users) {
      console.log(`\n用户 ID: ${user.id}`);
      console.log(`  openId: ${user.openId}`);
      console.log(`  name: ${user.name}`);
      console.log(`  role: ${user.role}`);
      console.log(`  passwordHash: ${user.passwordHash ? '已设置' : '未设置'}`);
      console.log(`  createdAt: ${user.createdAt}`);
    }
  }
  
  await conn.end();
} catch (error) {
  console.error('查询失败:', error.message);
  process.exit(1);
}
