import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStatus } from "../src/main/git/GitService";
import {
  assertSafePath,
  buildHunkPatch,
  commit,
  getDiff,
  parseDiff,
  stageFiles,
  stageHunk,
  unstageFiles,
  unstageHunk,
} from "../src/main/git/WorkTree";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `linha ${i + 1}`);

describe("parseDiff / buildHunkPatch", () => {
  const RAW = [
    "diff --git a/f.txt b/f.txt",
    "index 111..222 100644",
    "--- a/f.txt",
    "+++ b/f.txt",
    "@@ -1,3 +1,3 @@",
    " a",
    "-b",
    "+B",
    " c",
    "@@ -20 +20,2 @@ funcao",
    " x",
    "+y",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  it("lê hunks, contagens (inclusive o padrão 1) e tipos de linha", () => {
    const { hunks, binary, headerLines } = parseDiff(RAW);

    expect(binary).toBe(false);
    expect(headerLines).toHaveLength(4);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3 });
    expect(hunks[0]!.lines.map((l) => l.kind)).toEqual([" ", "-", "+", " "]);
    expect(hunks[1]).toMatchObject({ header: "@@ -20 +20,2 @@ funcao", oldStart: 20, oldLines: 1, newLines: 2 });
    expect(hunks[1]!.lines.at(-1)).toEqual({ kind: "\\", text: " No newline at end of file" });
  });

  it("preserva \\r de arquivos CRLF no conteúdo das linhas", () => {
    const { hunks } = parseDiff("--- a/f\n+++ b/f\n@@ -1 +1 @@\n-velho\r\n+novo\r\n".replace(/\r\n/g, "\r\n"));

    expect(hunks[0]!.lines).toEqual([
      { kind: "-", text: "velho\r" },
      { kind: "+", text: "novo\r" },
    ]);
  });

  it("detecta arquivo binário", () => {
    const parsed = parseDiff("diff --git a/i.png b/i.png\nindex 1..2\nBinary files a/i.png and b/i.png differ\n");

    expect(parsed.binary).toBe(true);
    expect(parsed.hunks).toEqual([]);
  });

  it("buildHunkPatch inclui o cabeçalho do arquivo e SÓ o hunk pedido", () => {
    const patch = buildHunkPatch(parseDiff(RAW), 1);

    expect(patch.startsWith("diff --git a/f.txt b/f.txt\n")).toBe(true);
    expect(patch).toContain("@@ -20 +20,2 @@ funcao\n x\n+y\n\\ No newline at end of file\n");
    expect(patch).not.toContain("@@ -1,3 +1,3 @@");
    expect(() => buildHunkPatch(parseDiff(RAW), 5)).toThrow(RangeError);
  });
});

describe("assertSafePath", () => {
  it("aceita caminhos relativos aninhados e com espaço", () => {
    expect(assertSafePath("src/main/a b.ts")).toBe("src/main/a b.ts");
    expect(assertSafePath("-arquivo-que-parece-opcao")).toBe("-arquivo-que-parece-opcao");
  });

  it.each(["", "../fora", "a/../../fora", "a\\..\\b", "/etc/passwd", "C:/Windows", "\\\\srv\\share", "a\0b"])(
    "rejeita %j",
    (p) => {
      expect(() => assertSafePath(p)).toThrow();
    },
  );
});

describe("working tree com git real", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
  const cached = () => git("diff", "--cached", "--no-color", "-U0");
  const worktree = () => git("diff", "--no-color", "-U0");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-wt-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Commit inicial com um arquivo de 30 linhas e duas edições distantes (2 hunks). */
  function twoHunks(eol = "\n") {
    write("f.txt", lines(30).join(eol) + eol);
    git("add", ".");
    git("commit", "-m", "base");
    const edited = lines(30);
    edited[1] = "linha 2 EDITADA";
    edited[27] = "linha 28 EDITADA";
    write("f.txt", edited.join(eol) + eol);
  }

  it("stage e unstage de arquivo, inclusive em repositório sem nenhum commit", async () => {
    write("novo.txt", "x\n");

    await stageFiles(dir, ["novo.txt"]);
    expect((await getStatus(dir)).files[0]).toMatchObject({ path: "novo.txt", index: "A" });

    await unstageFiles(dir, ["novo.txt"]); // sem HEAD: usa rm --cached
    expect((await getStatus(dir)).files[0]).toMatchObject({ path: "novo.txt", untracked: true });
  });

  it("stage de arquivo apagado registra a deleção; unstage devolve ao worktree", async () => {
    write("a.txt", "1\n");
    git("add", ".");
    git("commit", "-m", "a");
    unlinkSync(join(dir, "a.txt"));

    await stageFiles(dir, ["a.txt"]);
    expect((await getStatus(dir)).files[0]).toMatchObject({ index: "D", worktree: " " });

    await unstageFiles(dir, ["a.txt"]);
    expect((await getStatus(dir)).files[0]).toMatchObject({ index: " ", worktree: "D" });
  });

  it("stageHunk coloca no stage SÓ o hunk escolhido", async () => {
    twoHunks();
    const diff = await getDiff(dir, { path: "f.txt", staged: false, untracked: false });
    expect(diff.hunks).toHaveLength(2);

    await stageHunk(dir, { path: "f.txt", hunkIndex: 1, hunkHeader: diff.hunks[1]!.header });

    expect(cached()).toContain("+linha 28 EDITADA");
    expect(cached()).not.toContain("linha 2 EDITADA");
    expect(worktree()).toContain("+linha 2 EDITADA");
    expect(worktree()).not.toContain("linha 28 EDITADA");
  });

  it("unstageHunk tira do stage SÓ o hunk escolhido", async () => {
    twoHunks();
    await stageFiles(dir, ["f.txt"]);
    const staged = await getDiff(dir, { path: "f.txt", staged: true, untracked: false });
    expect(staged.hunks).toHaveLength(2);

    await unstageHunk(dir, { path: "f.txt", hunkIndex: 0, hunkHeader: staged.hunks[0]!.header });

    expect(cached()).toContain("+linha 28 EDITADA");
    expect(cached()).not.toContain("linha 2 EDITADA");
    expect(worktree()).toContain("+linha 2 EDITADA");
  });

  it("hunk com CRLF entra no stage sem corromper o arquivo", async () => {
    twoHunks("\r\n");
    const diff = await getDiff(dir, { path: "f.txt", staged: false, untracked: false });

    await stageHunk(dir, { path: "f.txt", hunkIndex: 0, hunkHeader: diff.hunks[0]!.header });

    expect(cached()).toContain("+linha 2 EDITADA\r");
    expect(cached()).not.toContain("linha 28 EDITADA");
  });

  it("recusa hunk desatualizado e não toca o índice", async () => {
    twoHunks();
    const diff = await getDiff(dir, { path: "f.txt", staged: false, untracked: false });

    await expect(
      stageHunk(dir, { path: "f.txt", hunkIndex: 0, hunkHeader: "@@ -99,1 +99,1 @@" }),
    ).rejects.toThrow(/mudou/);
    await expect(
      stageHunk(dir, { path: "f.txt", hunkIndex: 7, hunkHeader: diff.hunks[0]!.header }),
    ).rejects.toThrow(/mudou/);

    expect(cached()).toBe("");
  });

  it("diff de arquivo novo (não rastreado) mostra tudo como adição", async () => {
    write("novo.txt", "um\ndois\n");

    const diff = await getDiff(dir, { path: "novo.txt", staged: false, untracked: true });

    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]!.lines).toEqual([
      { kind: "+", text: "um" },
      { kind: "+", text: "dois" },
    ]);
  });

  it("commit exige mensagem e algo no stage; grava o commit e devolve o hash do HEAD", async () => {
    write("a.txt", "1\n");
    await expect(commit(dir, "msg", false)).rejects.toThrow(/stage/);

    await stageFiles(dir, ["a.txt"]);
    await expect(commit(dir, "   \n ", false)).rejects.toThrow(/mensagem/i);

    const { hash } = await commit(dir, "primeiro commit\n\n# linha que começa com cerquilha", false);

    expect(hash).toBe(git("rev-parse", "HEAD").trim());
    expect(git("log", "-1", "--format=%B")).toContain("# linha que começa com cerquilha");
    expect((await getStatus(dir)).files).toEqual([]);
  });

  it("amend troca a mensagem sem criar commit novo; mensagem vazia mantém a anterior", async () => {
    write("a.txt", "1\n");
    git("add", ".");
    git("commit", "-m", "original");
    write("b.txt", "2\n");
    await stageFiles(dir, ["b.txt"]);

    await commit(dir, "corrigida", true);
    expect(git("rev-list", "--count", "HEAD").trim()).toBe("1");
    expect(git("log", "-1", "--format=%s").trim()).toBe("corrigida");
    expect(git("show", "--name-only", "--format=", "HEAD")).toContain("b.txt");

    await commit(dir, "", true); // --no-edit
    expect(git("log", "-1", "--format=%s").trim()).toBe("corrigida");
  });
});
