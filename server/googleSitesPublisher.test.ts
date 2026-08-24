import { describe, expect, it } from "vitest";
import { markdownToPlainSections, normalizeExternalHttpUrl } from "./googleSitesPublisher";

describe("Google Sites 内容解析", () => {
  it("将 iframe 解析为嵌入块，而不是作为代码文字写入页面", () => {
    const sections = markdownToPlainSections([
      "# 美国移民申请流程",
      "开场正文。",
      '<iframe src="https://example.com/widget" width="100%" height="480" frameborder="0"></iframe>',
      "结尾正文。",
    ].join("\n"));

    expect(sections).toEqual([
      { type: "h1", text: "美国移民申请流程" },
      { type: "p", text: "开场正文。" },
      { type: "embed", text: "", embedUrl: "https://example.com/widget", embedHeight: 480 },
      { type: "p", text: "结尾正文。" },
    ]);
  });

  it("保留 Markdown 标题层级并移除普通链接的 Markdown 语法", () => {
    const sections = markdownToPlainSections("## 办理条件\n[查看官方说明](https://example.com)");

    expect(sections).toEqual([
      { type: "h2", text: "办理条件" },
      { type: "p", text: "查看官方说明" },
    ]);
  });

  it("按空行合并段落，并保留有序和无序列表的视觉标记", () => {
    const sections = markdownToPlainSections([
      "第一行正文",
      "第二行正文",
      "",
      "## 第二部分",
      "1. 第一项",
      "2. 第二项",
      "- 补充项",
    ].join("\n"));

    expect(sections).toEqual([
      { type: "p", text: "第一行正文 第二行正文" },
      { type: "h2", text: "第二部分" },
      { type: "ol", text: "1. 第一项" },
      { type: "ol", text: "2. 第二项" },
      { type: "ul", text: "• 补充项" },
    ]);
  });

  it("只接受 HTTP(S) Banner 标题跳转链接", () => {
    expect(normalizeExternalHttpUrl("https://tdavips.com")).toBe("https://tdavips.com/");
    expect(normalizeExternalHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeExternalHttpUrl("not a url")).toBeUndefined();
  });
});
