import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildResult, parseConflicts } from "../src/shared/conflict";
import { getConflict, resolveConflict, resolveConflictSide } from "../src/main/git/Conflicts";
import { getStatus } from "../src/main/git/GitService";

describe("conflitos com git real", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const tryGit = (...args: string[]) => {
    try {
      git(...args);
    } catch {
      /* conflito esperado: o merge sai com erro e fica em andamento */
    }
  };
  const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  const commitAll = (msg: string) => {
    git("add", ".");
    git("commit", "-m", msg);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-conf-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
    write("a.txt", "linha 1\nlinha 2\nlinha 3\n");
    commitAll("base");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** main e feature editam a linha 2 de formas diferentes. */
  function conflictOnA() {
    git("switch", "-c", "feature");
    write("a.txt", "linha 1\ndeles\nlinha 3\n");
    commitAll("feature");
    git("switch", "main");
    write("a.txt", "linha 1\nnosso\nlinha 3\n");
    commitAll("main");
    tryGit("merge", "feature");
  }

  it("getConflict devolve o arquivo com marcadores, editável, e o tipo do conflito", async () => {
    conflictOnA();

    const c = await getConflict(dir, "a.txt");

    expect(c).toMatchObject({ path: "a.txt", kind: "both-modified", editable: true, reason: null });
    expect(c.content).toContain("<<<<<<<");
    expect(parseConflicts(c.content).filter((s) => s.kind === "conflict")).toHaveLength(1);
  });

  it("resolveConflict grava o resultado montado, marca como resolvido e deixa o merge concluir", async () => {
    conflictOnA();
    const { content } = await getConflict(dir, "a.txt");
    const { text } = buildResult(parseConflicts(content), { 0: "both-ours-first" });

    await resolveConflict(dir, "a.txt", text);

    expect(read("a.txt")).toBe("linha 1\nnosso\ndeles\nlinha 3\n");
    const status = await getStatus(dir);
    expect(status.files.find((f) => f.path === "a.txt")).toMatchObject({ conflicted: false, index: "M" });
    git("commit", "--no-edit");
    expect((await getStatus(dir)).operation).toBeNull();
  });

  it("resolveConflict recusa resultado que ainda tem marcadores", async () => {
    conflictOnA();
    const { content } = await getConflict(dir, "a.txt");

    await expect(resolveConflict(dir, "a.txt", content)).rejects.toThrow(/marcadores/);
    expect((await getStatus(dir)).files.find((f) => f.path === "a.txt")?.conflicted).toBe(true);
  });

  it("recusa arquivo que não está em conflito (leitura e escrita)", async () => {
    conflictOnA();
    write("limpo.txt", "x\n");

    await expect(getConflict(dir, "limpo.txt")).rejects.toThrow(/não está em conflito/);
    await expect(resolveConflict(dir, "limpo.txt", "invadido\n")).rejects.toThrow(/não está em conflito/);
    await expect(resolveConflictSide(dir, "limpo.txt", "ours")).rejects.toThrow(/não está em conflito/);
    expect(read("limpo.txt")).toBe("x\n");
  });

  it("recusa caminho inseguro", async () => {
    conflictOnA();
    await expect(getConflict(dir, "../fora.txt")).rejects.toThrow();
    await expect(resolveConflict(dir, "C:/fora.txt", "x\n")).rejects.toThrow();
  });

  it("resolveConflictSide usa a versão inteira de um dos lados", async () => {
    conflictOnA();

    await resolveConflictSide(dir, "a.txt", "theirs");

    expect(read("a.txt")).toBe("linha 1\ndeles\nlinha 3\n");
    expect((await getStatus(dir)).files.find((f) => f.path === "a.txt")?.conflicted).toBe(false);
  });

  it("modify/delete: escolher o lado que removeu apaga o arquivo", async () => {
    git("switch", "-c", "feature");
    write("a.txt", "linha 1\nmudou na feature\nlinha 3\n");
    commitAll("feature edita");
    git("switch", "main");
    git("rm", "a.txt");
    git("commit", "-m", "main remove");
    tryGit("merge", "feature");

    const c = await getConflict(dir, "a.txt");
    expect(c.kind).toBe("deleted-by-us");

    await resolveConflictSide(dir, "a.txt", "ours"); // "nosso" removeu o arquivo
    expect(existsSync(join(dir, "a.txt"))).toBe(false);
    expect((await getStatus(dir)).files.some((f) => f.conflicted)).toBe(false);
  });

  it("modify/delete: escolher o lado que mantém restaura o arquivo", async () => {
    git("switch", "-c", "feature");
    write("a.txt", "linha 1\nmudou na feature\nlinha 3\n");
    commitAll("feature edita");
    git("switch", "main");
    git("rm", "a.txt");
    git("commit", "-m", "main remove");
    tryGit("merge", "feature");

    await resolveConflictSide(dir, "a.txt", "theirs");

    expect(read("a.txt")).toBe("linha 1\nmudou na feature\nlinha 3\n");
  });

  it("arquivo binário não é editável pelo editor de blocos", async () => {
    git("switch", "-c", "feature");
    writeFileSync(join(dir, "i.bin"), Buffer.from([0, 1, 2, 3]));
    commitAll("bin feature");
    git("switch", "main");
    writeFileSync(join(dir, "i.bin"), Buffer.from([0, 9, 9, 9]));
    commitAll("bin main");
    tryGit("merge", "feature");

    const c = await getConflict(dir, "i.bin");

    expect(c.editable).toBe(false);
    expect(c.reason).toMatch(/binário/);
  });
});
