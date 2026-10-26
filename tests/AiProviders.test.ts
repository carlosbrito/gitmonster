import { describe, expect, it } from "vitest";
import { createAiClient, PROVIDERS, resolveBaseUrl } from "../src/main/ai/providers";
import { describeAiError } from "../src/main/ai/providers/http";
import { AiError } from "../src/main/ai/providers/types";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => { status?: number; body?: unknown; raw?: string } | Promise<never>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const r = await respond(call);
    const text = r.raw ?? JSON.stringify(r.body ?? {});
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => text, headers: new Headers() } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** A promessa precisa falhar; devolve o erro já como `AiError`. */
async function rejection(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (e) {
    return e as AiError;
  }
  throw new Error("a chamada deveria ter falhado");
}

const headersOf = (c: Call) => c.init.headers as Record<string, string>;
const bodyOf = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;

describe("Anthropic", () => {
  it("monta a requisição e lê só os blocos de texto", async () => {
    const f = fakeFetch(() => ({
      body: { content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "Olá " }, { type: "text", text: "mundo" }], usage: { input_tokens: 10, output_tokens: 3 } },
    }));
    const client = createAiClient("anthropic", "", "sk-ant-segredo", f.impl);
    const out = await client.complete({ model: "claude-sonnet-5-5", prompt: "oi", maxTokens: 1024 });
    expect(out).toEqual({ text: "Olá mundo", usage: { input: 10, output: 3 } });
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("error");
    expect(headersOf(call)).toMatchObject({ "x-api-key": "sk-ant-segredo", "anthropic-version": "2023-06-01", "Content-Type": "application/json" });
    expect(bodyOf(call)).toEqual({ model: "claude-sonnet-5-5", max_tokens: 1024, messages: [{ role: "user", content: "oi" }] });
  });

  it("usa a URL configurada e só manda temperature quando pedida", async () => {
    const f = fakeFetch(() => ({ body: { content: [{ type: "text", text: "x" }] } }));
    const client = createAiClient("anthropic", "https://proxy.interno/v1/", "k", f.impl);
    await client.complete({ model: "m", prompt: "p", maxTokens: 5, temperature: 0 });
    expect(f.calls[0]!.url).toBe("https://proxy.interno/v1/messages");
    expect(bodyOf(f.calls[0]!)["temperature"]).toBe(0);
  });

  it("lista modelos com GET /models", async () => {
    const f = fakeFetch(() => ({ body: { data: [{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5" }, { id: "claude-haiku-5-5" }, {}] } }));
    const models = await createAiClient("anthropic", "", "k", f.impl).listModels();
    expect(models).toEqual([
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", name: "claude-haiku-5-5" },
    ]);
    expect(f.calls[0]!.init.method).toBe("GET");
    expect(f.calls[0]!.url).toMatch(/\/v1\/models/);
  });
});

describe("compatíveis com OpenAI", () => {
  const reply = { body: { choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } } };

  it("OpenAI: Bearer e max_completion_tokens", async () => {
    const f = fakeFetch(() => reply);
    const out = await createAiClient("openai", "", "sk-openai", f.impl).complete({ model: "gpt-x", prompt: "oi", maxTokens: 900 });
    expect(out).toEqual({ text: "ok", usage: { input: 4, output: 2 } });
    expect(f.calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headersOf(f.calls[0]!)["Authorization"]).toBe("Bearer sk-openai");
    expect(bodyOf(f.calls[0]!)).toMatchObject({ model: "gpt-x", max_completion_tokens: 900, messages: [{ role: "user", content: "oi" }] });
    expect(bodyOf(f.calls[0]!)).not.toHaveProperty("max_tokens");
  });

  it("Gemini e URL própria usam max_tokens", async () => {
    const f = fakeFetch(() => reply);
    await createAiClient("gemini", "", "AIza", f.impl).complete({ model: "m", prompt: "p", maxTokens: 10 });
    await createAiClient("openai-compatible", "http://localhost:11434/v1", null, f.impl).complete({ model: "llama3", prompt: "p", maxTokens: 10 });
    expect(f.calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(bodyOf(f.calls[0]!)).toHaveProperty("max_tokens", 10);
    expect(f.calls[1]!.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("sem chave (modelo local) omite Authorization", async () => {
    const f = fakeFetch(() => reply);
    await createAiClient("openai-compatible", "http://localhost:11434/v1", null, f.impl).complete({ model: "m", prompt: "p", maxTokens: 10 });
    expect(headersOf(f.calls[0]!)).not.toHaveProperty("Authorization");
  });

  it("OpenAI: só modelos de chat; Gemini: sem o prefixo models/", async () => {
    const openai = fakeFetch(() => ({ body: { data: [{ id: "gpt-5" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }, { id: "o3" }, { id: "gpt-4o-audio-preview" }] } }));
    expect((await createAiClient("openai", "", "k", openai.impl).listModels()).map((m) => m.id)).toEqual(["gpt-5", "o3"]);
    const gemini = fakeFetch(() => ({ body: { data: [{ id: "models/gemini-2.5-flash" }] } }));
    expect((await createAiClient("gemini", "", "k", gemini.impl).listModels()).map((m) => m.id)).toEqual(["gemini-2.5-flash"]);
  });

  it("resposta sem texto devolve string vazia", async () => {
    const f = fakeFetch(() => ({ body: { choices: [] } }));
    expect((await createAiClient("openai", "", "k", f.impl).complete({ model: "m", prompt: "p", maxTokens: 1 })).text).toBe("");
  });
});

describe("erros", () => {
  const status = async (code: number, body: unknown = {}) => {
    const f = fakeFetch(() => ({ status: code, body }));
    return rejection(createAiClient("anthropic", "", "sk-ant-segredo", f.impl).complete({ model: "m", prompt: "p", maxTokens: 1 }));
  };

  it.each([
    [401, /Chave inválida/],
    [403, /Chave inválida/],
    [404, /Modelo ou endpoint não encontrado/],
    [429, /Limite de uso/],
    [500, /indisponível/],
    [503, /indisponível/],
  ])("HTTP %i vira mensagem em português", async (code, re) => {
    const e = await status(code);
    expect(e).toBeInstanceOf(AiError);
    expect(e.message).toMatch(re);
    expect(e.status).toBe(code);
  });

  it("anexa a mensagem do provedor", async () => {
    const e = await status(400, { error: { type: "invalid_request_error", message: "max_tokens: precisa ser maior que 0" } });
    expect(e.message).toContain("max_tokens: precisa ser maior que 0");
  });

  it("a chave nunca aparece na mensagem, nem se o provedor a repetir", async () => {
    const e = await status(401, { error: { message: "invalid x-api-key: sk-ant-segredo" } });
    expect(e.message).not.toContain("sk-ant-segredo");
    expect(describeAiError(401, { error: { message: "chave sk-ant-segredo" } }, "sk-ant-segredo")).not.toContain("sk-ant-segredo");
  });

  it("falha de rede", async () => {
    const f = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    const e = await rejection(createAiClient("anthropic", "", "k", f.impl).complete({ model: "m", prompt: "p", maxTokens: 1 }));
    expect(e).toMatchObject({ kind: "network", status: 0 });
    expect(e.message).toMatch(/Não foi possível falar com o provedor/);
  });

  it("timeout", async () => {
    const impl = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const e = await rejection(createAiClient("anthropic", "", "k", impl).complete({ model: "m", prompt: "p", maxTokens: 1, timeoutMs: 20 }));
    expect(e).toMatchObject({ kind: "timeout" });
    expect(e.message).toBe("O provedor não respondeu a tempo.");
  });

  it("cancelamento pelo usuário", async () => {
    const impl = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const ctrl = new AbortController();
    const p = rejection(createAiClient("anthropic", "", "k", impl).complete({ model: "m", prompt: "p", maxTokens: 1, signal: ctrl.signal }));
    ctrl.abort();
    expect(await p).toMatchObject({ kind: "cancelled" });
  });
});

describe("tabela de provedores", () => {
  it("só modelos locais dispensam a chave", () => {
    expect(Object.entries(PROVIDERS).filter(([, p]) => !p.keyRequired).map(([k]) => k)).toEqual(["openai-compatible"]);
  });
  it("URL configurada vence o padrão", () => {
    expect(resolveBaseUrl("openai", "")).toBe("https://api.openai.com/v1");
    expect(resolveBaseUrl("openai", "https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
  });
});
