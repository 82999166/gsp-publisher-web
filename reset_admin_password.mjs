import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const newPassword = 'admin123';
const username = 'admin';

try {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log(`正在重置 ${username} 账户的密码...`);
  
  // 生成新密码的 bcrypt hash
  const passwordHash = await bcrypt.hash(newPassword, 12);
  console.log('密码已加密');
  
  // 更新数据库中的密码
  const [result] = await conn.execute(
    'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE openId = ?',
    [passwordHash, username]
  );
  
  if (result.affectedRows === 0) {
    console.error(`❌ 错误：找不到用户名为 "${username}" 的账户`);
    console.log('请检查数据库中是否存在该用户');
    process.exit(1);
  }
  
  console.log(`✅ 成功重置 ${username} 的密码`);
  console.log(`\n登录凭证：`);
  console.log(`  用户名: ${username}`);
  console.log(`  密码: ${newPassword}`);
  console.log(`\n请使用这些凭证登录: https://site.tdavip.com/login`);
  
  await conn.end();
} catch (error) {
  console.error('❌ 重置密码失败:', error.message);
  process.exit(1);
}
