import { describe, expect, it } from "vitest";
import {
  assertSupportedAiModel,
  defaultAiModel,
  normalizeAiModel,
} from "./aiConfig";

describe("AI 供应商与模型兼容性", () => {
  it("Groq 会将历史失效模型回退到已验证的 GPT-OSS 120B", () => {
    expect(normalizeAiModel("groq", "llama-3.1-8b-instant")).toBe("openai/gpt-oss-120b");
    expect(defaultAiModel("groq")).toBe("openai/gpt-oss-120b");
  });

  it("拒绝不兼容的供应商与模型组合", () => {
    expect(() => assertSupportedAiModel("groq", "gpt-4o")).toThrow("不支持提供商");
    expect(() => assertSupportedAiModel("openai", "openai/gpt-oss-120b")).toThrow("不支持提供商");
  });

  it("接受当前支持的 Groq 模型", () => {
    expect(() => assertSupportedAiModel("groq", "openai/gpt-oss-120b")).not.toThrow();
  });
});
