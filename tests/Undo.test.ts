import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merge } from "../src/main/git/Branches";
import { cherryPick, reset, revertCommit } from "../src/main/git/Operations";
import { commit, stageFiles } from "../src/main/git/WorkTree";
import { redo, undo, undoInfo } from "../src/main/git/Undo";

describe("desfazer e refazer (git real)", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
  const commitFile = (name: string, content: string, msg: string) => {
    write(name, content);
    git("add", ".");
    git("commit", "-m", msg);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-undo-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
    commitFile("a.txt", "um\n", "primeiro");
    commitFile("b.txt", "b\n", "segundo");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("repositório com um só commit: nada para desfazer", async () => {
    const solo = mkdtempSync(join(tmpdir(), "gitmonster-undo-solo-"));
    try {
      execFileSync("git", ["init", "-b", "main"], { cwd: solo });
      execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "--allow-empty", "-m", "i"], { cwd: solo });
      const info = await undoInfo(solo);
      expect(info.undo).toBeNull();
      expect(info.blocked).toMatch(/inicial/);
    } finally {
      rmSync(solo, { recursive: true, force: true });
    }
  });

  it("commit: desfazer volta as alterações ao stage; refazer restaura o mesmo commit", async () => {
    write("c.txt", "c\n");
    await stageFiles(dir, ["c.txt"]);
    await commit(dir, "terceiro", false);
    const commitOid = git("rev-parse", "HEAD");

    expect((await undoInfo(dir)).undo).toEqual({ label: "Desfazer commit" });
    await undo(dir);

    expect(git("log", "-1", "--format=%s")).toBe("segundo");
    expect(git("status", "--porcelain")).toBe("A  c.txt");
    const after = await undoInfo(dir);
    expect(after.undo).toBeNull();
    expect(after.redo).toEqual({ label: "Refazer commit" });

    await redo(dir);
    expect(git("rev-parse", "HEAD")).toBe(commitOid);
    expect((await undoInfo(dir)).redo).toBeNull();
  });

  it("amend: desfazer volta ao commit anterior ao amend", async () => {
    write("c.txt", "c\n");
    await stageFiles(dir, ["c.txt"]);
    const before = git("rev-parse", "HEAD");
    await commit(dir, "emendado", true);

    expect((await undoInfo(dir)).undo?.label).toBe("Desfazer amend");
    await undo(dir);

    expect(git("rev-parse", "HEAD")).toBe(before);
  });

  it("merge, cherry-pick, revert e reset: desfazer volta ao HEAD de antes (árvore limpa)", async () => {
    git("switch", "-c", "feature");
    commitFile("f.txt", "f\n", "na feature");
    const featureOid = git("rev-parse", "HEAD");
    git("switch", "main");
    commitFile("m.txt", "m\n", "na main");
    const mainOid = git("rev-parse", "HEAD");

    await merge(dir, "feature");
    expect((await undoInfo(dir)).undo?.label).toBe("Desfazer merge");
    await undo(dir);
    expect(git("rev-parse", "HEAD")).toBe(mainOid);

    await cherryPick(dir, featureOid);
    expect((await undoInfo(dir)).undo?.label).toBe("Desfazer cherry-pick");
    await undo(dir);
    expect(git("rev-parse", "HEAD")).toBe(mainOid);

    await revertCommit(dir, mainOid);
    expect((await undoInfo(dir)).undo?.label).toBe("Desfazer revert");
    await undo(dir);
    expect(git("rev-parse", "HEAD")).toBe(mainOid);

    await reset(dir, git("rev-parse", "HEAD~1"), "hard");
    expect((await undoInfo(dir)).undo?.label).toBe("Desfazer reset");
    await undo(dir);
    expect(git("rev-parse", "HEAD")).toBe(mainOid);
  });

  it("desfazer destrutivo é bloqueado com alterações não commitadas", async () => {
    git("switch", "-c", "feature");
    commitFile("f.txt", "f\n", "na feature");
    git("switch", "main");
    commitFile("m.txt", "m\n", "na main");
    await merge(dir, "feature");
    write("a.txt", "sujo\n");

    const info = await undoInfo(dir);
    expect(info.undo).toBeNull();
    expect(info.blocked).toMatch(/não commitadas/);
    await expect(undo(dir)).rejects.toThrow(/não commitadas/);
    expect(git("log", "-1", "--format=%s")).toMatch(/Merge/);
  });

  it("checkout de branch: desfazer volta para a anterior e refazer vai de novo", async () => {
    git("branch", "outra");
    git("checkout", "outra");

    expect((await undoInfo(dir)).undo?.label).toBe("Voltar para main");
    await undo(dir);
    expect(git("branch", "--show-current")).toBe("main");
    expect((await undoInfo(dir)).redo?.label).toBe("Ir para outra");

    await redo(dir);
    expect(git("branch", "--show-current")).toBe("outra");
  });

  it("qualquer mudança depois do desfazer invalida o refazer", async () => {
    write("c.txt", "c\n");
    await stageFiles(dir, ["c.txt"]);
    await commit(dir, "terceiro", false);
    await undo(dir);
    expect((await undoInfo(dir)).redo).not.toBeNull();

    await commit(dir, "outro commit no lugar", false);

    expect((await undoInfo(dir)).redo).toBeNull();
    await expect(redo(dir)).rejects.toThrow(/mudou|nada/i);
  });

  it("operações que não sabe desfazer (rebase) ficam indisponíveis, com motivo", async () => {
    git("switch", "-c", "y");
    commitFile("y.txt", "y\n", "em y");
    git("switch", "main");
    commitFile("m.txt", "m\n", "em main");
    git("rebase", "y");

    const info = await undoInfo(dir);
    expect(info.undo).toBeNull();
    expect(info.blocked).toMatch(/rebase.*não pode ser desfeita/);
  });

  it("recusa desfazer com operação em andamento", async () => {
    git("switch", "-c", "feature");
    commitFile("a.txt", "feature\n", "muda a na feature");
    git("switch", "main");
    commitFile("a.txt", "main\n", "muda a na main");
    expect(() => git("merge", "feature")).toThrow();

    const info = await undoInfo(dir);
    expect(info.undo).toBeNull();
    expect(info.blocked).toMatch(/em andamento/);
  });
});
