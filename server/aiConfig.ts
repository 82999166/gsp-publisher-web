export const AI_PROVIDER_MODELS = {
  groq: [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "groq/compound",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "kimi-k2-0711-preview",
  ],
} as const;

export type AiProvider = keyof typeof AI_PROVIDER_MODELS;

export function isAiProvider(value: string): value is AiProvider {
  return value === "groq" || value === "openai";
}

export function defaultAiModel(provider: AiProvider): string {
  return AI_PROVIDER_MODELS[provider][0];
}

export function isSupportedAiModel(provider: AiProvider, model: string): boolean {
  return (AI_PROVIDER_MODELS[provider] as readonly string[]).includes(model);
}

export function normalizeAiModel(provider: AiProvider, model?: string): string {
  return model && isSupportedAiModel(provider, model)
    ? model
    : defaultAiModel(provider);
}

export function assertSupportedAiModel(provider: AiProvider, model: string): void {
  if (isSupportedAiModel(provider, model)) return;
  throw new Error(
    `模型「${model}」不支持提供商「${provider}」。请在系统设置中选择该提供商当前可用的模型。`,
  );
}
