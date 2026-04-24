import { GoogleSitesPublisherAPI } from "./googleSitesPublisherAPI";
import { updatePublishTask, getMaterialById, updateMaterial, createLog, getGoogleSiteById, createIndexingRecord, createPublishedPage, getSettingByKey, getPublishedPages, updatePublishedPage } from "./db";
import { submitUrlToGsc } from "./gscSubmitter";

/**
 * 使用 Google Sites API 发布页面
 * 这是浏览器自动化的替代方案，更可靠和稳定
 */

interface PublishViaAPIOptions {
  taskId: number;
  accountId: number;
  materialId: number;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  siteId?: number;
  defaultSiteUrl?: string;
  defaultSiteName?: string;
}

export async function publishViaAPI(options: PublishViaAPIOptions) {
  const {
    taskId,
    accountId,
    materialId,
    accessToken,
    refreshToken,
    expiresAt,
    siteId,
    defaultSiteUrl,
    defaultSiteName,
  } = options;

  const logs: string[] = [];

  try {
    logs.push("[API] 初始化 Google Sites API 发布器...");

    // 获取素材内容
    const material = await getMaterialById(materialId);
    if (!material) {
      throw new Error("素材不存在");
    }

    logs.push(`[API] 获取素材：${material.title}`);

    // 获取 Site ID（从 Google Sites URL 中提取）
    let siteIdFromUrl: string | undefined;
    if (defaultSiteUrl) {
      // 从 URL 中提取 Site ID
      // 例如：https://sites.google.com/view/xxx/home -> xxx
      const match = defaultSiteUrl.match(/\/view\/([^/]+)/);
      if (match) {
        siteIdFromUrl = match[1];
      }
    }

    if (!siteIdFromUrl) {
      throw new Error("无法从 Site URL 中提取 Site ID，请确保已配置正确的 Google Site 编辑器地址");
    }

    logs.push(`[API] Site ID: ${siteIdFromUrl}`);

    // 初始化 Google Sites API 发布器
    const publisher = new GoogleSitesPublisherAPI({
      accessToken,
      refreshToken,
      expiresAt,
      siteId: siteIdFromUrl,
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
    });

    logs.push("[API] 开始发布页面...");

    // 创建页面
    const result = await publisher.createPage({
      title: material.title,
      content: material.content,
    });

    if (!result.success) {
      throw new Error(result.error || "创建页面失败");
    }

    logs.push(`[API] ✅ 页面创建成功`);
    logs.push(`[API] 页面 ID: ${result.pageId}`);
    logs.push(`[API] 页面 URL: ${result.pageUrl}`);

    // 更新任务状态
    await updatePublishTask(taskId, {
      status: "success",
      completedAt: new Date(),
      publishedUrl: result.pageUrl,
      engineLog: logs.join("\n"),
      publishMethod: "google_sites_api",
    });

    // 更新素材状态
    if (materialId) {
      await updateMaterial(materialId, { status: "published" });
    }

    // 记录日志
    await createLog({
      level: "success",
      category: "publish",
      title: `API 发布成功：${material.title}`,
      message: `任务 #${taskId} 通过 Google Sites API 发布成功\n发布链接：${result.pageUrl}\n\n${logs.slice(-5).join("\n")}`,
      entityType: "task",
      entityId: taskId,
    });

    // 创建索引记录
    if (result.pageUrl) {
      await createIndexingRecord({
        publishedUrl: result.pageUrl,
        title: material.title,
        keyword: material.keyword ?? undefined,
        accountId,
        siteId: siteId ?? undefined,
        taskId,
        indexStatus: "pending",
      });

      // 创建已发布页面记录
      await createPublishedPage({
        taskId,
        materialId: materialId ?? undefined,
        accountId,
        siteId: siteId ?? undefined,
        title: material.title,
        keyword: material.keyword ?? undefined,
        publishedUrl: result.pageUrl,
        siteUrl: siteId ? (await getGoogleSiteById(siteId))?.siteUrl ?? undefined : undefined,
        language: material.language ?? "zh-CN",
        wordCount: material.wordCount ?? undefined,
        qualityScore: material.qualityScore ?? undefined,
        indexStatus: "pending",
        gscSubmitted: 0,
      });

      // 提交到 GSC
      const gscKey = await getSettingByKey("gscServiceAccountKey");
      if (gscKey?.value && result.pageUrl) {
        submitUrlToGsc(result.pageUrl, gscKey.value)
          .then(async (gscResult) => {
            if (gscResult.success) {
              const pages = await getPublishedPages({ limit: 5 });
              const page = (pages as Array<{ id: number; publishedUrl: string | null }>).find(
                (p) => p.publishedUrl === result.pageUrl
              );
              if (page) {
                await updatePublishedPage(page.id, {
                  gscSubmitted: 1,
                  gscSubmittedAt: new Date(),
                  gscResponse: gscResult.response,
                });
              }
            }
          })
          .catch(() => {});
      }
    }

    return { success: true, pageUrl: result.pageUrl };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logs.push(`[API] ❌ 发布失败: ${errorMsg}`);

    await updatePublishTask(taskId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: errorMsg,
      engineLog: logs.join("\n"),
      publishMethod: "google_sites_api",
    });

    await createLog({
      level: "error",
      category: "publish",
      title: `API 发布失败`,
      message: `任务 #${taskId} 通过 Google Sites API 发布失败\n错误：${errorMsg}\n\n${logs.slice(-5).join("\n")}`,
      entityType: "task",
      entityId: taskId,
    });

    return { success: false, error: errorMsg };
  }
}

export default publishViaAPI;
