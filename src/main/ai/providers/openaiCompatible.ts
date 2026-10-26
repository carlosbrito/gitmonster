import type { AiModel } from "../../../shared/types";
import { num, obj, requestJson, str } from "./http";
import type { AiClient, AiClientOptions, CompleteRequest, CompleteResult } from "./types";

export interface OpenAiCompatibleOptions extends AiClientOptions {
  /** A OpenAI exige `max_completion_tokens`; os demais servidores só entendem `max_tokens`. */
  tokenParam: "max_completion_tokens" | "max_tokens";
  /** Tira prefixos e modelos que não conversam (embeddings, áudio...). */
  normalizeModels?: (models: AiModel[]) => AiModel[];
}

export function createOpenAiCompatibleClient(opts: OpenAiCompatibleOptions): AiClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  // Modelo local não precisa de chave: sem ela, o cabeçalho Authorization é omitido.
  const headers = (): Record<string, string> => (opts.key ? { Authorization: `Bearer ${opts.key}` } : {});

  return {
    async complete(req: CompleteRequest): Promise<CompleteResult> {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: [{ role: "user", content: req.prompt }],
        [opts.tokenParam]: req.maxTokens,
      };
      if (req.temperature !== undefined) body["temperature"] = req.temperature;
      const res = obj(
        await requestJson({
          method: "POST",
          url: `${opts.baseUrl}/chat/completions`,
          headers: headers(),
          body,
          key: opts.key,
          fetchImpl,
          ...(req.timeoutMs === undefined ? {} : { timeoutMs: req.timeoutMs }),
          ...(req.signal === undefined ? {} : { signal: req.signal }),
        }),
      );
      const choices = Array.isArray(res["choices"]) ? (res["choices"] as unknown[]) : [];
      const text = str(obj(obj(choices[0])["message"])["content"]);
      const usage = obj(res["usage"]);
      return {
        text,
        usage: "prompt_tokens" in usage || "completion_tokens" in usage ? { input: num(usage["prompt_tokens"]), output: num(usage["completion_tokens"]) } : null,
      };
    },

    async listModels(signal?: AbortSignal): Promise<AiModel[]> {
      const res = obj(
        await requestJson({
          method: "GET",
          url: `${opts.baseUrl}/models`,
          headers: headers(),
          key: opts.key,
          fetchImpl,
          ...(signal === undefined ? {} : { signal }),
        }),
      );
      const data = Array.isArray(res["data"]) ? (res["data"] as unknown[]) : [];
      const models = data
        .map(obj)
        .filter((m) => str(m["id"]) !== "")
        .map((m) => ({ id: str(m["id"]), name: str(m["id"]) }));
      return opts.normalizeModels ? opts.normalizeModels(models) : models;
    },
  };
}
