// 在运行时动态读取环境变量，确保 .env 文件被正确加载
function getEnvVar(key: string, defaultValue: string = ""): string {
  // 优先使用运行时环境变量
  const value = process.env[key];
  if (value && value.length > 0) {
    return value;
  }
  return defaultValue;
}

export const ENV = {
  appId: getEnvVar("VITE_APP_ID"),
  cookieSecret: getEnvVar("JWT_SECRET"),
  databaseUrl: getEnvVar("DATABASE_URL"),
  oAuthServerUrl: getEnvVar("OAUTH_SERVER_URL", "https://api.manus.im"),
  ownerOpenId: getEnvVar("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: getEnvVar("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: getEnvVar("BUILT_IN_FORGE_API_KEY"),
};

// 调试信息
if (process.env.NODE_ENV === "production") {
  console.log("[ENV] Loaded environment variables:");
  console.log(`  OAUTH_SERVER_URL: ${ENV.oAuthServerUrl}`);
  console.log(`  DATABASE_URL: ${ENV.databaseUrl ? "configured" : "not configured"}`);
}
