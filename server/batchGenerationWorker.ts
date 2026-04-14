/**
 * 批量生成 Worker 引擎
 * 支持万级任务、并发控制（1-10路）、暂停/继续/取消、失败自动重试
 */
import { invokeLLM } from "./_core/llm";
import {
  getGenerationBatchById,
  updateGenerationBatch,
  getGenerationItemsPending,
  updateGenerationItem,
  createMaterial,
  getGenerationBatchProgress,
} from "./db";

// 全局 Worker 状态表（batchId → 控制信号）
const workerSignals = new Map<number, { paused: boolean; cancelled: boolean }>();

/**
 * 为单条条目生成文章
 */
async function generateOneItem(item: {
  id: number;
  batchId: number;
  keyword: string;
  title: string | null;
  extraKeywords: unknown;
}, options: {
  language: "zh-CN" | "en" | "zh-TW";
  style: "informational" | "commercial" | "navigational";
  minWords: number;
  seoTemplateId?: number | null;
}): Promise<{ success: boolean; materialId?: number; generatedTitle?: string; wordCount?: number; qualityScore?: number; error?: string }> {
  const langMap = { "zh-CN": "简体中文", "en": "英文", "zh-TW": "繁体中文" };
  const styleMap = {
    informational: "信息型（科普、解答用户问题）",
    commercial: "商业型（产品推广、评测对比）",
    navigational: "导航型（品牌介绍、官方说明）",
  };
  const langName = langMap[options.language];
  const styleName = styleMap[options.style];
  const extraKws = Array.isArray(item.extraKeywords) ? (item.extraKeywords as string[]) : [];
  const allKeywords = [item.keyword, ...extraKws].filter(Boolean).join("、");

  const titleHint = item.title
    ? `文章标题已指定为：「${item.title}」，请严格按此标题创作。`
    : `请根据关键词自动生成合适的文章标题。`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一位专业的SEO内容创作专家，擅长为Google Sites创作高质量、符合Google收录标准的文章。
要求：
1. 语言：${langName}
2. 文章类型：${styleName}
3. 字数：不少于${options.minWords}字
4. 结构：包含H1标题、3-5个H2小节、每节有2-3段正文
5. SEO要求：关键词密度0.5%-2%，自然融入，绝不堆砌
6. 内容质量：逻辑清晰，对用户有实际价值，避免广告语气
7. 返回JSON格式`,
        },
        {
          role: "user",
          content: `主关键词：${item.keyword}
相关关键词：${allKeywords}
${titleHint}

请创作一篇高质量SEO文章，返回JSON格式：
{"title": "文章标题", "content": "文章正文（Markdown格式，包含H1/H2/H3结构）", "metaDescription": "Meta描述（不超过160字符）", "urlSlug": "url-slug（英文小写，含关键词）"}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              metaDescription: { type: "string" },
              urlSlug: { type: "string" },
            },
            required: ["title", "content", "metaDescription", "urlSlug"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    const content = parsed.content ?? "";
    const wordCount = content.replace(/\s+/g, "").length;
    const qualityScore = Math.min(98, 55 + Math.floor(wordCount / 40));

    // 保存到素材库
    await createMaterial({
      title: parsed.title || item.title || item.keyword,
      keyword: item.keyword,
      language: options.language,
      content,
      wordCount,
      qualityScore,
      status: "pending",
      seoTemplateId: options.seoTemplateId ?? undefined,
      metaDescription: parsed.metaDescription?.slice(0, 160),
      urlSlug: parsed.urlSlug?.slice(0, 60),
    });

    // 获取刚插入的素材 ID
    const { getMaterials } = await import("./db");
    const recent = await getMaterials({ keyword: item.keyword });
    const materialId = recent[0]?.id;

    return {
      success: true,
      materialId,
      generatedTitle: parsed.title,
      wordCount,
      qualityScore,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 启动批次 Worker（后台异步运行，不阻塞请求）
 */
export async function startBatchWorker(batchId: number): Promise<void> {
  // 初始化控制信号
  workerSignals.set(batchId, { paused: false, cancelled: false });

  const batch = await getGenerationBatchById(batchId);
  if (!batch) return;

  await updateGenerationBatch(batchId, { status: "running", startedAt: new Date() });

  const concurrency = Math.min(Math.max(batch.concurrency ?? 3, 1), 10);
  const language = batch.language as "zh-CN" | "en" | "zh-TW";
  const style = batch.style as "informational" | "commercial" | "navigational";
  const minWords = batch.minWords ?? 800;
  const seoTemplateId = batch.seoTemplateId;

  // 异步后台运行，不 await
  runWorkerLoop(batchId, concurrency, { language, style, minWords, seoTemplateId }).catch(err => {
    console.error(`[BatchWorker] Batch ${batchId} error:`, err);
  });
}

async function runWorkerLoop(
  batchId: number,
  concurrency: number,
  options: { language: "zh-CN" | "en" | "zh-TW"; style: "informational" | "commercial" | "navigational"; minWords: number; seoTemplateId?: number | null }
): Promise<void> {
  while (true) {
    const signal = workerSignals.get(batchId);
    if (!signal || signal.cancelled) {
      await updateGenerationBatch(batchId, { status: "cancelled" });
      workerSignals.delete(batchId);
      return;
    }

    if (signal.paused) {
      await updateGenerationBatch(batchId, { status: "paused" });
      // 等待恢复信号（每秒检查一次）
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    // 取 concurrency 条待处理条目
    const pendingItems = await getGenerationItemsPending(batchId, concurrency);
    if (pendingItems.length === 0) {
      // 没有更多待处理条目，检查是否全部完成
      const progress = await getGenerationBatchProgress(batchId);
      if (progress.pending === 0 && progress.running === 0) {
        await updateGenerationBatch(batchId, {
          status: "completed",
          completedAt: new Date(),
          successCount: progress.success,
          failedCount: progress.failed,
          pendingCount: 0,
          runningCount: 0,
        });
        workerSignals.delete(batchId);
        return;
      }
      // 还有 running 中的，等待
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // 标记为 running
    await Promise.all(pendingItems.map(item =>
      updateGenerationItem(item.id, { status: "running", startedAt: new Date() })
    ));

    // 并发生成
    await Promise.all(pendingItems.map(async (item) => {
      const result = await generateOneItem(
        {
          id: item.id,
          batchId: item.batchId,
          keyword: item.keyword,
          title: item.title ?? null,
          extraKeywords: item.extraKeywords,
        },
        options
      );

      if (result.success) {
        await updateGenerationItem(item.id, {
          status: "success",
          materialId: result.materialId,
          generatedTitle: result.generatedTitle,
          generatedWordCount: result.wordCount,
          generatedQualityScore: result.qualityScore,
          completedAt: new Date(),
        });
      } else {
        const retryCount = (item.retryCount ?? 0) + 1;
        if (retryCount < 3) {
          // 自动重试：重置为 pending
          await updateGenerationItem(item.id, {
            status: "pending",
            retryCount,
            errorMessage: result.error,
          });
        } else {
          await updateGenerationItem(item.id, {
            status: "failed",
            errorMessage: result.error,
            completedAt: new Date(),
          });
        }
      }
    }));

    // 更新批次进度
    const progress = await getGenerationBatchProgress(batchId);
    await updateGenerationBatch(batchId, {
      successCount: progress.success,
      failedCount: progress.failed,
      pendingCount: progress.pending,
      runningCount: progress.running,
    });

    // 随机延迟 500-2000ms，避免 API 限速
    const delay = 500 + Math.random() * 1500;
    await new Promise(r => setTimeout(r, delay));
  }
}

/**
 * 暂停批次
 */
export function pauseBatchWorker(batchId: number): void {
  const signal = workerSignals.get(batchId);
  if (signal) signal.paused = true;
}

/**
 * 继续批次
 */
export function resumeBatchWorker(batchId: number): void {
  const signal = workerSignals.get(batchId);
  if (signal) {
    signal.paused = false;
  } else {
    // Worker 已退出，重新启动
    startBatchWorker(batchId);
  }
}

/**
 * 取消批次
 */
export function cancelBatchWorker(batchId: number): void {
  const signal = workerSignals.get(batchId);
  if (signal) {
    signal.cancelled = true;
  }
}

/**
 * 查询 Worker 是否活跃
 */
export function isBatchWorkerActive(batchId: number): boolean {
  return workerSignals.has(batchId);
}
