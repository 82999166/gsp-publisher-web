import { describe, expect, it } from "vitest";
import { getTemplatePublishSettings } from "./templateEmbedMigration";

describe("getTemplatePublishSettings", () => {
  it("读取模板级链接和自动排版开关", () => {
    expect(getTemplatePublishSettings({
      blocks: [],
      publish: { bannerTitleLinkUrl: "https://tdavips.com", articleContentLinkUrl: "https://example.com", autoFormatContent: false },
    })).toEqual({ bannerTitleLinkUrl: "https://tdavips.com", articleContentLinkUrl: "https://example.com", autoFormatContent: false });
  });

  it("旧模板默认启用自动排版且不继承系统级链接", () => {
    expect(getTemplatePublishSettings({ blocks: [] })).toEqual({
      bannerTitleLinkUrl: undefined,
      articleContentLinkUrl: undefined,
      autoFormatContent: true,
    });
  });
});
