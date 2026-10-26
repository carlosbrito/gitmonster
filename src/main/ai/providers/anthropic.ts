import type { AiModel } from "../../../shared/types";
import { num, obj, requestJson, str } from "./http";
import type { AiClient, AiClientOptions, CompleteRequest, CompleteResult } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";

export function createAnthropicClient(opts: AiClientOptions): AiClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = (): Record<string, string> => ({
    "x-api-key": opts.key ?? "",
    "anthropic-version": ANTHROPIC_VERSION,
  });

  return {
    async complete(req: CompleteRequest): Promise<CompleteResult> {
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [{ role: "user", content: req.prompt }],
      };
      if (req.temperature !== undefined) body["temperature"] = req.temperature;
      const res = obj(
        await requestJson({
          method: "POST",
          url: `${opts.baseUrl}/messages`,
          headers: headers(),
          body,
          key: opts.key,
          fetchImpl,
          ...(req.timeoutMs === undefined ? {} : { timeoutMs: req.timeoutMs }),
          ...(req.signal === undefined ? {} : { signal: req.signal }),
        }),
      );
      const content = Array.isArray(res["content"]) ? (res["content"] as unknown[]) : [];
      const text = content
        .map(obj)
        .filter((b) => b["type"] === "text")
        .map((b) => str(b["text"]))
        .join("");
      const usage = obj(res["usage"]);
      return {
        text,
        usage: "input_tokens" in usage || "output_tokens" in usage ? { input: num(usage["input_tokens"]), output: num(usage["output_tokens"]) } : null,
      };
    },

    async listModels(signal?: AbortSignal): Promise<AiModel[]> {
      const res = obj(
        await requestJson({
          method: "GET",
          url: `${opts.baseUrl}/models?limit=100`,
          headers: headers(),
          key: opts.key,
          fetchImpl,
          ...(signal === undefined ? {} : { signal }),
        }),
      );
      const data = Array.isArray(res["data"]) ? (res["data"] as unknown[]) : [];
      return data
        .map(obj)
        .filter((m) => str(m["id"]) !== "")
        .map((m) => ({ id: str(m["id"]), name: str(m["display_name"]) || str(m["id"]) }));
    },
  };
}
