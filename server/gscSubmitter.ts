/**
 * GSC 自动提交服务
 * 发布成功后自动调用 Google Search Console Indexing API 提交 URL
 * 可大幅缩短收录时间（从 3 天缩短到 24 小时内）
 */

interface GscSubmitResult {
  success: boolean;
  url: string;
  response?: string;
  error?: string;
}

/**
 * 通过 Google Indexing API 提交单个 URL
 * 需要 Google Service Account 的 OAuth2 token
 */
export async function submitUrlToGsc(
  url: string,
  serviceAccountKey?: string
): Promise<GscSubmitResult> {
  if (!serviceAccountKey) {
    return {
      success: false,
      url,
      error: "未配置 GSC Service Account Key，跳过提交",
    };
  }

  try {
    // 解析 Service Account JSON
    const keyData = JSON.parse(serviceAccountKey);
    const token = await getGscAccessToken(keyData);

    const response = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url,
          type: "URL_UPDATED",
        }),
      }
    );

    const data = await response.json() as any;

    if (response.ok) {
      return {
        success: true,
        url,
        response: JSON.stringify(data),
      };
    } else {
      return {
        success: false,
        url,
        error: data.error?.message ?? `HTTP ${response.status}`,
        response: JSON.stringify(data),
      };
    }
  } catch (error) {
    return {
      success: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 批量提交 URL 到 GSC（每次最多 100 个，带延迟）
 */
export async function batchSubmitToGsc(
  urls: string[],
  serviceAccountKey?: string,
  delayMs = 200
): Promise<GscSubmitResult[]> {
  const results: GscSubmitResult[] = [];
  for (const url of urls) {
    const result = await submitUrlToGsc(url, serviceAccountKey);
    results.push(result);
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

/**
 * 获取 GSC API 的 OAuth2 Access Token（使用 Service Account JWT）
 */
async function getGscAccessToken(keyData: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: keyData.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${headerB64}.${payloadB64}`;

  // 使用 Node.js crypto 签名
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign
    .sign(keyData.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signingInput}.${signature}`;

  // 换取 Access Token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json() as any;
  if (!tokenData.access_token) {
    throw new Error(`获取 GSC Token 失败: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token as string;
}

// ─── 发布队列智能调度引擎 ──────────────────────────────────────────────────────

export interface AccountPublishLimit {
  accountId: number;
  accountAge: number; // 账号年龄（天）
  dailyLimit: number; // 每日发布上限
  todayCount: number; // 今日已发布数
  available: number;  // 今日剩余可发布数
}

/**
 * 根据账号年龄计算安全的每日发布上限
 * 新账号需要养号，老账号可以多发
 */
export function calcSafeDailyLimit(accountAge: number, configuredLimit: number): number {
  let safeLimit: number;

  if (accountAge < 7) {
    // 0-7天新账号：每日最多 3 篇（养号期）
    safeLimit = 3;
  } else if (accountAge < 30) {
    // 7-30天：每日最多 10 篇
    safeLimit = 10;
  } else if (accountAge < 90) {
    // 30-90天：每日最多 30 篇
    safeLimit = 30;
  } else if (accountAge < 180) {
    // 90-180天：每日最多 60 篇
    safeLimit = 60;
  } else {
    // 180天以上老账号：不限制（使用用户配置的上限）
    safeLimit = configuredLimit;
  }

  // 取安全上限和用户配置上限的最小值
  return Math.min(safeLimit, configuredLimit);
}

/**
 * 计算两次发布之间的随机延迟（模拟真人操作）
 * 基础延迟 + 随机抖动，防止被识别为机器人
 */
export function calcPublishDelay(accountAge: number): number {
  let baseDelay: number;

  if (accountAge < 7) {
    // 新账号：5-15 分钟间隔
    baseDelay = 5 * 60 * 1000;
  } else if (accountAge < 30) {
    // 成长期：3-8 分钟间隔
    baseDelay = 3 * 60 * 1000;
  } else {
    // 成熟账号：1-3 分钟间隔
    baseDelay = 60 * 1000;
  }

  // 加入 ±50% 随机抖动
  const jitter = baseDelay * (0.5 + Math.random());
  return Math.floor(baseDelay + jitter);
}

/**
 * 智能调度：从等待中的发布任务中选出可以立即执行的任务
 * 考虑因素：账号年龄、今日已发布数、账号状态
 */
export function selectNextTasks(
  pendingTasks: Array<{ id: number; accountId: number; priority: number }>,
  accountLimits: AccountPublishLimit[]
): Array<{ taskId: number; accountId: number; delayMs: number }> {
  const limitMap = new Map(accountLimits.map((l) => [l.accountId, l]));
  const selected: Array<{ taskId: number; accountId: number; delayMs: number }> = [];

  for (const task of pendingTasks) {
    const limit = limitMap.get(task.accountId);
    if (!limit) continue;
    if (limit.available <= 0) continue;

    // 计算发布延迟
    const delayMs = calcPublishDelay(limit.accountAge);
    selected.push({ taskId: task.id, accountId: task.accountId, delayMs });

    // 减少可用配额
    limit.available -= 1;
  }

  return selected;
}
