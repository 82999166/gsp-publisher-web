import { describe, expect, it } from "vitest";
import { getTemplatePublishSettings } from "../shared/templateEmbedMigration";

describe("模板级发布设置", () => {
  it("读取模板结构中的 Banner 跳转链接和自动排版开关", () => {
    expect(getTemplatePublishSettings({
      blocks: [],
      publish: { bannerTitleLinkUrl: "https://tdavips.com", autoFormatContent: false },
    })).toEqual({ bannerTitleLinkUrl: "https://tdavips.com", autoFormatContent: false });
  });

  it("旧模板默认启用自动排版，且不使用系统级标题链接", () => {
    expect(getTemplatePublishSettings({ blocks: [] })).toEqual({
      bannerTitleLinkUrl: undefined,
      autoFormatContent: true,
    });
  });
});
