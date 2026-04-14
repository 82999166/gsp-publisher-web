import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(20) NOT NULL DEFAULT 'info',
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    title VARCHAR(200) NOT NULL,
    message TEXT,
    entityType VARCHAR(50),
    entityId INT,
    duration INT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('system_logs table created successfully');
await conn.end();
