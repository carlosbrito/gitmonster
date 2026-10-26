import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openProjectFolder } from "../src/main/Editor";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gm-folder-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("openProjectFolder", () => {
  it("abre a pasta raiz com o programa padrão do sistema", async () => {
    const opened: string[] = [];
    await openProjectFolder(dir, { openPath: async (p) => (opened.push(p), "") });
    expect(opened).toEqual([dir]);
  });

  it("recusa pasta que não existe, sem chamar o sistema", async () => {
    let called = false;
    await expect(openProjectFolder(join(dir, "sumiu"), { openPath: async () => ((called = true), "") })).rejects.toThrow(/não existe mais/);
    expect(called).toBe(false);
  });

  it("recusa caminho que é arquivo", async () => {
    const file = join(dir, "a.txt");
    writeFileSync(file, "x");
    await expect(openProjectFolder(file, { openPath: async () => "" })).rejects.toThrow(/Não foi possível abrir a pasta/);
  });

  it("repassa o erro do sistema", async () => {
    await expect(openProjectFolder(dir, { openPath: async () => "sem programa associado" })).rejects.toThrow("Não foi possível abrir a pasta: sem programa associado");
  });
});
