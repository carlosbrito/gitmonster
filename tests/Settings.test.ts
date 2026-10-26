import { describe, expect, it } from "vitest";
import { defaultSettings, loadSettings, saveSettings, validateUpdateUrl, type SettingsIo } from "../src/main/Settings";

function memoryIo(files: Record<string, string> = {}): SettingsIo & { files: Record<string, string> } {
  return {
    files,
    read: async (f) => files[f] ?? null,
    write: async (f, c) => {
      files[f] = c;
    },
  };
}

const F = "settings.json";
const valid = { version: 1, theme: "dark", editor: "code" };

describe("validateUpdateUrl", () => {
  it("vazio desliga; https é aceito", () => {
    expect(validateUpdateUrl("")).toBe("");
    expect(validateUpdateUrl("   ")).toBe("");
    expect(validateUpdateUrl(" https://exemplo.com/releases ")).toBe("https://exemplo.com/releases");
  });

  it.each(["http://exemplo.com", "file:///C:/x", "javascript:alert(1)", "ftp://x", "exemplo.com/releases", "https://"])("recusa %j", (v) =>
    expect(() => validateUpdateUrl(v)).toThrow(),
  );
});

describe("loadSettings", () => {
  it("sem arquivo: padrão", async () => {
    expect(await loadSettings(F, memoryIo())).toEqual(defaultSettings());
  });

  it("arquivo corrompido: padrão, sem erro", async () => {
    expect(await loadSettings(F, memoryIo({ [F]: "{ não é json" }))).toEqual(defaultSettings());
    expect(await loadSettings(F, memoryIo({ [F]: "[]" }))).toEqual(defaultSettings());
  });

  it("campo inválido volta ao padrão e os outros são mantidos", async () => {
    const io = memoryIo({ [F]: JSON.stringify({ version: 1, theme: "roxo", editor: "code" }) });
    expect(await loadSettings(F, io)).toEqual({ version: 1, theme: "system", editor: "code" });
  });

  it("campo antigo de URL de atualização é ignorado", async () => {
    const io = memoryIo({ [F]: JSON.stringify({ ...valid, updateUrl: "https://x.com/u" }) });
    expect(await loadSettings(F, io)).toEqual({ version: 1, theme: "dark", editor: "code" });
  });
});

describe("saveSettings", () => {
  it("normaliza e grava", async () => {
    const io = memoryIo();
    const saved = await saveSettings(F, { ...valid, editor: "  code  ", updateUrl: "https://ignorado" }, io);
    expect(saved).toEqual({ version: 1, theme: "dark", editor: "code" });
    expect(JSON.parse(io.files[F]!)).toEqual(saved);
  });

  it.each([
    [{ ...valid, theme: "roxo" }],
    [{ ...valid, editor: "code\nrm -rf" }],
    [{ ...valid, editor: "x".repeat(300) }],
    [{ ...valid, version: 2 }],
    [null],
    ["texto"],
  ])("recusa %j sem gravar nada", async (bad) => {
    const io = memoryIo();
    await expect(saveSettings(F, bad, io)).rejects.toThrow();
    expect(io.files[F]).toBeUndefined();
  });
});
