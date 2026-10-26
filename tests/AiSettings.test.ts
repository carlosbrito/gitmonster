import { describe, expect, it } from "vitest";
import { defaultAiSettings, loadAiSettings, saveAiSettings, validateBaseUrl } from "../src/main/ai/AiSettings";

function memoryIo(initial: string | null = null) {
  let content = initial;
  return {
    io: {
      read: async () => content,
      write: async (_f: string, c: string) => {
        content = c;
      },
    },
    get content() {
      return content;
    },
  };
}

describe("validateBaseUrl", () => {
  it("vazio usa o padrão", () => expect(validateBaseUrl("  ")).toBe(""));
  it("aceita https e tira a barra final", () => expect(validateBaseUrl("https://api.exemplo.com/v1/")).toBe("https://api.exemplo.com/v1"));
  it("aceita http em localhost, 127.0.0.1 e [::1]", () => {
    expect(validateBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(validateBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
    expect(validateBaseUrl("http://[::1]:8080/v1")).toBe("http://[::1]:8080/v1");
  });
  it("recusa http fora de localhost", () => expect(() => validateBaseUrl("http://exemplo.com/v1")).toThrow(/https/));
  it("recusa credenciais, parâmetros e outros esquemas", () => {
    expect(() => validateBaseUrl("https://user:senha@host/v1")).toThrow(/usuário/);
    expect(() => validateBaseUrl("https://host/v1?key=1")).toThrow(/parâmetros/);
    expect(() => validateBaseUrl("file:///etc/passwd")).toThrow();
    expect(() => validateBaseUrl("javascript:alert(1)")).toThrow();
    expect(() => validateBaseUrl("não é url")).toThrow();
  });
});

describe("preferências de IA", () => {
  it("padrão: IA desligada, sem consentimento", async () => {
    const s = await loadAiSettings("x", memoryIo().io);
    expect(s).toEqual(defaultAiSettings());
    expect(s.enabled).toBe(false);
    expect(Object.values(s.sendCodeApproved).every((v) => !v)).toBe(true);
  });

  it("grava e lê de volta", async () => {
    const mem = memoryIo();
    const input = defaultAiSettings();
    input.enabled = true;
    input.provider = "openai-compatible";
    input.baseUrls["openai-compatible"] = "http://localhost:11434/v1/";
    input.globalInstructions = "escreva em português do Brasil";
    input.features.commitMessage = { model: " claude-sonnet-5-5 ", instructions: "conventional commits" };
    const saved = await saveAiSettings("x", input, mem.io);
    expect(saved.baseUrls["openai-compatible"]).toBe("http://localhost:11434/v1");
    expect(saved.features.commitMessage.model).toBe("claude-sonnet-5-5");
    expect(await loadAiSettings("x", mem.io)).toEqual(saved);
  });

  it("campo estragado volta ao padrão sem derrubar os outros", async () => {
    const mem = memoryIo(
      JSON.stringify({
        enabled: true,
        provider: "inexistente",
        globalInstructions: "ok",
        baseUrls: { anthropic: "http://exemplo.com", openai: "https://api.openai.com/v1" },
        features: { commitMessage: { model: 5, instructions: "x" }, explain: { model: "m", instructions: "i" } },
      }),
    );
    const s = await loadAiSettings("x", mem.io);
    expect(s.enabled).toBe(true);
    expect(s.provider).toBe("anthropic");
    expect(s.globalInstructions).toBe("ok");
    expect(s.baseUrls.anthropic).toBe("");
    expect(s.baseUrls.openai).toBe("https://api.openai.com/v1");
    expect(s.features.commitMessage).toEqual({ model: "", instructions: "x" });
    expect(s.features.explain).toEqual({ model: "m", instructions: "i" });
  });

  it("arquivo ilegível volta ao padrão", async () => {
    expect(await loadAiSettings("x", memoryIo("{{{").io)).toEqual(defaultAiSettings());
  });

  it("recusa instruções com mais de 4000 caracteres e URL insegura", async () => {
    const long = defaultAiSettings();
    long.globalInstructions = "a".repeat(4001);
    await expect(saveAiSettings("x", long, memoryIo().io)).rejects.toThrow();
    const bad = defaultAiSettings();
    bad.baseUrls.openai = "http://exemplo.com/v1";
    await expect(saveAiSettings("x", bad, memoryIo().io)).rejects.toThrow(/https/);
  });
});
