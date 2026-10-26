import { describe, expect, it } from "vitest";
import { createAiKeyStore, validateAiKey } from "../src/main/ai/AiKeyStore";
import type { SecretCrypto, TokenIo } from "../src/main/GitHubAuth";

function setup(available = true) {
  const files = new Map<string, string>();
  const crypto: SecretCrypto = {
    isAvailable: () => available,
    encrypt: (plain) => Buffer.from(`enc:${plain}`.split("").reverse().join("")),
    decrypt: (data) => data.toString().split("").reverse().join("").replace(/^enc:/, ""),
  };
  const io: TokenIo = {
    read: async (f) => files.get(f) ?? null,
    write: async (f, c) => void files.set(f, c),
    remove: async (f) => void files.delete(f),
  };
  return { files, store: createAiKeyStore("dir", crypto, io, (...p) => p.join("/")) };
}

describe("validateAiKey", () => {
  it("aceita formatos comuns", () => {
    expect(validateAiKey("  sk-ant-api03-AbC_123-xyz  ")).toBe("sk-ant-api03-AbC_123-xyz");
    expect(validateAiKey("AIzaSyA-bcd")).toBe("AIzaSyA-bcd");
  });
  it.each(["", "   ", "com espaço", "quebra\nde linha", "a".repeat(513), "acentuação"])("recusa %j", (k) =>
    expect(() => validateAiKey(k)).toThrow(/Chave inválida/),
  );
});

describe("createAiKeyStore", () => {
  it("salva, carrega e remove por provedor, sem misturar", async () => {
    const { store, files } = setup();
    await store.save("anthropic", "sk-ant-secreta");
    await store.save("openai", "sk-openai");
    expect(await store.load("anthropic")).toBe("sk-ant-secreta");
    expect(await store.load("openai")).toBe("sk-openai");
    expect(await store.hasKey("gemini")).toBe(false);
    expect([...files.keys()].sort()).toEqual(["dir/ai-key-anthropic.json", "dir/ai-key-openai.json"]);
    await store.clear("anthropic");
    expect(await store.load("anthropic")).toBeNull();
    expect(await store.hasKey("openai")).toBe(true);
  });

  it("nunca grava a chave em texto puro", async () => {
    const { store, files } = setup();
    await store.save("anthropic", "sk-ant-secreta");
    expect([...files.values()].join("")).not.toContain("sk-ant-secreta");
  });

  it("sem armazenamento seguro, recusa guardar", async () => {
    const { store, files } = setup(false);
    await expect(store.save("anthropic", "sk-ant-x")).rejects.toThrow(/armazenamento seguro/);
    expect(files.size).toBe(0);
    expect(await store.load("anthropic")).toBeNull();
  });

  it("arquivo corrompido devolve null", async () => {
    const { store, files } = setup();
    files.set("dir/ai-key-openai.json", "{{{ lixo");
    expect(await store.load("openai")).toBeNull();
  });

  it("recusa provedor desconhecido (nome de arquivo vem do renderer)", async () => {
    const { store } = setup();
    await expect(store.save("../evil" as never, "sk-x")).rejects.toThrow(/Provedor/);
    await expect(store.load("../evil" as never)).rejects.toThrow(/Provedor/);
  });
});
