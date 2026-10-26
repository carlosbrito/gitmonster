import { CANCELLED_MESSAGE } from "../../../shared/aiProviders";
import { AiError, DEFAULT_TIMEOUT_MS } from "./types";

type Json = Record<string, unknown>;

export const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** Mensagem em português para o erro HTTP de um provedor; `detail` é a mensagem do próprio provedor. */
export function describeAiError(status: number, body: unknown, key?: string | null): string {
  const b = obj(body);
  const raw = str(obj(b["error"])["message"]) || str(b["error"]) || str(b["message"]);
  let detail = raw.trim().slice(0, 300);
  // Nunca devolve a chave, nem que o provedor a repita na mensagem de erro.
  if (key) detail = detail.split(key).join("***");
  const tail = detail ? ` (${detail})` : "";
  switch (status) {
    case 400:
      return `O provedor recusou a requisição${tail}`;
    case 401:
    case 403:
      return `Chave inválida ou sem permissão para este modelo${tail}`;
    case 404:
      return `Modelo ou endpoint não encontrado. Confira o modelo e a URL nas Configurações${tail}`;
    case 413:
      return `Entrada grande demais para o modelo${tail}`;
    case 429:
      return `Limite de uso do provedor atingido (ou sem créditos). Tente de novo mais tarde${tail}`;
    default:
      if (status >= 500) return `O provedor está indisponível no momento (HTTP ${status})${tail}`;
      return `O provedor respondeu com erro (HTTP ${status})${tail}`;
  }
}

export interface RequestOptions {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  key: string | null;
  fetchImpl: typeof fetch;
}

/** Faz a requisição, aplica timeout/cancelamento e devolve o JSON; qualquer falha vira `AiError` sem a chave. */
export async function requestJson(opts: RequestOptions): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await opts.fetchImpl(opts.url, {
      method: opts.method,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }), ...opts.headers },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      // Redirecionamento levaria os cabeçalhos com a chave a outro endereço.
      redirect: "error",
    });
    const text = await res.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* resposta que não é JSON */
    }
    if (!res.ok) throw new AiError(describeAiError(res.status, parsed, opts.key), res.status);
    return parsed;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      if (timedOut) throw new AiError("O provedor não respondeu a tempo.", 0, "timeout");
      throw new AiError(CANCELLED_MESSAGE, 0, "cancelled");
    }
    throw new AiError("Não foi possível falar com o provedor. Verifique a conexão e a URL do endpoint.", 0, "network");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
