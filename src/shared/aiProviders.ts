import type { AiProvider } from "./types";

export interface ProviderInfo {
  label: string;
  defaultBaseUrl: string;
  /** Modelo usado quando o recurso está em "Recomendado". */
  recommendedModel: string;
  /** Falso só para modelos locais (Ollama, LM Studio). */
  keyRequired: boolean;
}

/**
 * Ids recomendados são sugestões fixas; se um sair do ar, a API responde 404 e a tela
 * orienta a escolher outro modelo (a lista completa vem sempre de `GET /models`).
 */
export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: { label: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", recommendedModel: "claude-sonnet-5-5", keyRequired: true },
  openai: { label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", recommendedModel: "gpt-5.6-terra", keyRequired: true },
  gemini: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    recommendedModel: "gemini-3.8-flash",
    keyRequired: true,
  },
  "openai-compatible": { label: "Compatível com OpenAI", defaultBaseUrl: "http://localhost:11434/v1", recommendedModel: "", keyRequired: false },
};

/** Mensagem do erro de uma requisição cancelada pelo usuário; a tela a ignora em vez de mostrar como falha. */
export const CANCELLED_MESSAGE = "Requisição cancelada.";
