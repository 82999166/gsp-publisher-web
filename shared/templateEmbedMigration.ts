export type EmbedTemplateBlock = Record<string, unknown> & {
  id?: string;
  type?: string;
  embedUrl?: string;
  embedWidth?: string;
  embedHeight?: string | number;
  embedPosition?: string;
};

export type LegacyEmbedSettings = {
  templateId: number | string;
  embedUrl?: string | null;
  embedWidth?: string | null;
  embedHeight?: string | number | null;
  embedPosition?: string | null;
};

export type TemplatePublishSettings = {
  bannerTitleLinkUrl?: string;
  autoFormatContent: boolean;
};

/** 从模板结构读取发布偏好；旧模板没有该字段时保持当前的自动排版行为。 */
export function getTemplatePublishSettings(structure: unknown): TemplatePublishSettings {
  const root = structure && typeof structure === "object" && !Array.isArray(structure)
    ? structure as { publish?: unknown }
    : null;
  const publish = root?.publish && typeof root.publish === "object" && !Array.isArray(root.publish)
    ? root.publish as { bannerTitleLinkUrl?: unknown; autoFormatContent?: unknown }
    : null;
  return {
    bannerTitleLinkUrl: typeof publish?.bannerTitleLinkUrl === "string" ? publish.bannerTitleLinkUrl.trim() || undefined : undefined,
    autoFormatContent: publish?.autoFormatContent !== false,
  };
}

/**
 * 将旧 seo_templates 的模板级 embed* 字段转换为版块配置。
 * 已有任何已配置 URL 的内嵌版块时，以版块为唯一真相，绝不再追加旧 URL。
 */
export function migrateLegacyTemplateEmbedBlocks(
  structure: unknown,
  legacy: LegacyEmbedSettings,
): EmbedTemplateBlock[] {
  const root = structure && typeof structure === "object" ? structure as { blocks?: unknown } : null;
  const rawBlocks = Array.isArray(structure)
    ? structure
    : Array.isArray(root?.blocks)
      ? root.blocks
      : [];
  const blocks = rawBlocks.map((block) => ({ ...(block as EmbedTemplateBlock) }));
  const legacyUrl = typeof legacy.embedUrl === "string" ? legacy.embedUrl.trim() : "";
  if (!legacyUrl) return blocks;

  const configuredEmbedExists = blocks.some((block) =>
    block.type === "embed" && typeof block.embedUrl === "string" && block.embedUrl.trim().length > 0,
  );
  if (configuredEmbedExists) return blocks;

  const emptyEmbed = blocks.find((block) => block.type === "embed");
  const settings = {
    embedUrl: legacyUrl,
    embedWidth: legacy.embedWidth || "100%",
    embedHeight: legacy.embedHeight || "300",
    embedPosition: legacy.embedPosition || "bottom",
  };
  if (emptyEmbed) {
    Object.assign(emptyEmbed, settings);
  } else {
    blocks.push({
      id: `legacy-embed-${legacy.templateId}`,
      type: "embed",
      title: "内嵌网站",
      contentHint: "",
      ...settings,
    });
  }
  return blocks;
}
