import { describe, expect, it } from "vitest";
import { migrateLegacyTemplateEmbedBlocks } from "./templateEmbedMigration";

describe("migrateLegacyTemplateEmbedBlocks", () => {
  const legacy = { templateId: 12, embedUrl: "https://legacy.example.com", embedWidth: "100%", embedHeight: "300", embedPosition: "bottom" };

  it("回填没有 URL 的内嵌网站版块", () => {
    const blocks = migrateLegacyTemplateEmbedBlocks({ blocks: [{ id: "embed-1", type: "embed" }] }, legacy);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "embed-1", embedUrl: legacy.embedUrl, embedHeight: "300" });
  });

  it("已有版块 URL 时只以版块配置为准，不重复追加旧 URL", () => {
    const blocks = migrateLegacyTemplateEmbedBlocks({ blocks: [{ id: "embed-1", type: "embed", embedUrl: "https://new.example.com" }] }, legacy);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].embedUrl).toBe("https://new.example.com");
  });

  it("旧模板没有嵌入版块时创建一个可编辑的迁移版块", () => {
    const blocks = migrateLegacyTemplateEmbedBlocks({ blocks: [{ id: "p-1", type: "paragraph" }] }, legacy);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ id: "legacy-embed-12", type: "embed", embedUrl: legacy.embedUrl });
  });
});
