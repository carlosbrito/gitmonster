import { PROVIDERS, type ProviderInfo } from "../../../shared/aiProviders";
import type { AiModel, AiProvider } from "../../../shared/types";
import { createAnthropicClient } from "./anthropic";
import { createOpenAiCompatibleClient } from "./openaiCompatible";
import type { AiClient } from "./types";

/** A OpenAI lista também embeddings, áudio e imagem: fica só o que conversa. */
const onlyOpenAiChat = (models: AiModel[]) => models.filter((m) => /^(gpt|chatgpt|o\d)/.test(m.id) && !/(embedding|audio|realtime|tts|transcribe|image|moderation|search)/.test(m.id));

/** O Gemini devolve `models/gemini-...`: o id usado nas chamadas não leva o prefixo. */
const stripGeminiPrefix = (models: AiModel[]) => models.map((m) => ({ id: m.id.replace(/^models\//, ""), name: m.name.replace(/^models\//, "") }));

export { PROVIDERS, type ProviderInfo };

export function resolveBaseUrl(provider: AiProvider, configured: string): string {
  return (configured.trim() || PROVIDERS[provider].defaultBaseUrl).replace(/\/+$/, "");
}

export function createAiClient(provider: AiProvider, baseUrl: string, key: string | null, fetchImpl?: typeof fetch): AiClient {
  const common = { baseUrl: resolveBaseUrl(provider, baseUrl), key, ...(fetchImpl === undefined ? {} : { fetchImpl }) };
  switch (provider) {
    case "anthropic":
      return createAnthropicClient(common);
    case "openai":
      return createOpenAiCompatibleClient({ ...common, tokenParam: "max_completion_tokens", normalizeModels: onlyOpenAiChat });
    case "gemini":
      return createOpenAiCompatibleClient({ ...common, tokenParam: "max_tokens", normalizeModels: stripGeminiPrefix });
    case "openai-compatible":
      return createOpenAiCompatibleClient({ ...common, tokenParam: "max_tokens" });
  }
}
