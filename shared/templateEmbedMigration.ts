export type TemplatePublishSettings = {
  bannerTitleLinkUrl?: string;
  articleContentLinkUrl?: string;
  autoFormatContent: boolean;
};

/** 从模板结构读取发布偏好；旧模板没有该字段时保持当前的自动排版行为。 */
export function getTemplatePublishSettings(structure: unknown): TemplatePublishSettings {
  const root = structure && typeof structure === "object" && !Array.isArray(structure)
    ? structure as { publish?: unknown }
    : null;
  const publish = root?.publish && typeof root.publish === "object" && !Array.isArray(root.publish)
    ? root.publish as { bannerTitleLinkUrl?: unknown; articleContentLinkUrl?: unknown; autoFormatContent?: unknown }
    : null;
  return {
    bannerTitleLinkUrl: typeof publish?.bannerTitleLinkUrl === "string" ? publish.bannerTitleLinkUrl.trim() || undefined : undefined,
    articleContentLinkUrl: typeof publish?.articleContentLinkUrl === "string" ? publish.articleContentLinkUrl.trim() || undefined : undefined,
    autoFormatContent: publish?.autoFormatContent !== false,
  };
}
