import type { AiModel } from "../../../shared/types";

/** Erro de uma chamada ao provedor. `status` é o HTTP (0 = falha de rede, timeout ou cancelamento). */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "http" | "network" | "timeout" | "cancelled" = "http",
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface CompleteRequest {
  model: string;
  /** Mensagem única do usuário (os templates não usam system prompt). */
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompleteResult {
  text: string;
  /** Tokens, quando o provedor informa. */
  usage: { input: number; output: number } | null;
}

export interface AiClient {
  complete(req: CompleteRequest): Promise<CompleteResult>;
  listModels(signal?: AbortSignal): Promise<AiModel[]>;
}

export interface AiClientOptions {
  baseUrl: string;
  /** null = sem chave (só vale para modelos locais). */
  key: string | null;
  /** Só testes. */
  fetchImpl?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
