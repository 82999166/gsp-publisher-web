import { describe, expect, it } from "vitest";
import { cleanPublishedHeading, markdownToPlainSections, normalizeExternalHttpUrl } from "./googleSitesPublisher";

describe("Google Sites 内容解析", () => {
  it("忽略已废弃的 iframe 标签，不将其写入发布文本", () => {
    const sections = markdownToPlainSections([
      "# 美国移民申请流程",
      "开场正文。",
      '<iframe src="https://example.com/widget" width="100%" height="480" frameborder="0"></iframe>',
      "结尾正文。",
    ].join("\n"));

    expect(sections).toEqual([
      { type: "h1", text: "美国移民申请流程" },
      { type: "p", text: "开场正文。" },
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

  it("发布前清理标题中的字数配额痕迹", () => {
    expect(cleanPublishedHeading("认识职场逆袭的本质（150+字）")).toBe("认识职场逆袭的本质");
    expect(cleanPublishedHeading("制定清晰的职业规划（不少于 300 字）")).toBe("制定清晰的职业规划");
    expect(markdownToPlainSections("## 提升核心竞争力（150+字）")).toEqual([
      { type: "h2", text: "提升核心竞争力" },
    ]);
    expect(markdownToPlainSections("1. 制定清晰的职业规划（150+字）")).toEqual([
      { type: "ol", text: "1. 制定清晰的职业规划" },
    ]);
  });
});
