#!/usr/bin/env node

/**
 * 启动脚本 - 在运行时加载 .env 文件
 * 这确保环境变量在应用启动时被正确加载
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 从 .env 文件加载环境变量
const envPath = path.join(__dirname, '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`[Start] Warning: Could not load .env file from ${envPath}`);
} else {
  console.log(`[Start] Loaded environment variables from ${envPath}`);
}

// 打印关键环境变量（用于调试）
console.log('[Start] Environment variables:');
console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  OAUTH_SERVER_URL: ${process.env.OAUTH_SERVER_URL}`);
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? 'configured' : 'not configured'}`);
console.log(`  PORT: ${process.env.PORT || 3000}`);

// 启动应用
const appProcess = spawn('node', [path.join(__dirname, 'dist/index.js')], {
  stdio: 'inherit',
  env: process.env,
});

appProcess.on('error', (error) => {
  console.error('[Start] Failed to start application:', error);
  process.exit(1);
});

appProcess.on('exit', (code) => {
  process.exit(code || 0);
});
