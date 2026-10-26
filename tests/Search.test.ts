import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchCommits } from "../src/main/git/Search";

describe("searchCommits (git real)", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const commit = (file: string, content: string, msg: string, author = "Ana <ana@example.com>") => {
    writeFileSync(join(dir, file), content);
    git("add", ".");
    git("commit", "-m", msg, `--author=${author}`);
    return git("rev-parse", "HEAD");
  };
  const subjects = async (...args: Parameters<typeof searchCommits> extends [string, ...infer R] ? R : never) =>
    (await searchCommits(dir, ...args)).map((c) => c.subject);

  let h1: string;
  let h2: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-search-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    h1 = commit("a.txt", "alfa\n", "feat: cria alfa");
    h2 = commit("b.txt", "beta SEGREDO\n", "fix: corrige a.b", "Bruno <bruno@example.com>");
    commit("a.txt", "alfa 2\n", "chore: ajusta alfa");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("mensagem: ignora maiúsculas e trata a consulta como texto, não regex", async () => {
    expect(await subjects("message", "ALFA")).toEqual(["chore: ajusta alfa", "feat: cria alfa"]);
    expect(await subjects("message", "a.b")).toEqual(["fix: corrige a.b"]);
    expect(await subjects("message", "a.*b")).toEqual([]);
  });

  it("autor", async () => {
    expect(await subjects("author", "bruno")).toEqual(["fix: corrige a.b"]);
    expect(await subjects("author", "ana")).toHaveLength(2);
  });

  it("conteúdo: commits que adicionaram ou removeram o texto", async () => {
    expect(await subjects("content", "SEGREDO")).toEqual(["fix: corrige a.b"]);
    expect(await subjects("content", "inexistente")).toEqual([]);
  });

  it("arquivo", async () => {
    expect(await subjects("file", "a.txt")).toEqual(["chore: ajusta alfa", "feat: cria alfa"]);
    expect(await subjects("file", "b.txt")).toEqual(["fix: corrige a.b"]);
  });

  it("hash completo ou abreviado devolve só aquele commit", async () => {
    expect((await searchCommits(dir, "hash", h2)).map((c) => c.hash)).toEqual([h2]);
    expect((await searchCommits(dir, "hash", h1.slice(0, 8))).map((c) => c.hash)).toEqual([h1]);
  });

  it("hash que não existe: lista vazia, sem erro", async () => {
    expect(await searchCommits(dir, "hash", "deadbeef")).toEqual([]);
  });

  it("consulta que parece opção do Git é só texto", async () => {
    expect(await subjects("message", "--oneline")).toEqual([]);
    expect(await subjects("message", "--all")).toEqual([]);
    expect(await subjects("author", "--exec=calc")).toEqual([]);
    expect(await subjects("content", "--output=x")).toEqual([]);
  });

  it("valida a entrada", async () => {
    await expect(searchCommits(dir, "message", "   ")).rejects.toThrow(/Informe/);
    await expect(searchCommits(dir, "message", "x".repeat(201))).rejects.toThrow(/inválida/);
    await expect(searchCommits(dir, "message", "a\nb")).rejects.toThrow(/inválida/);
    await expect(searchCommits(dir, "file", "../fora")).rejects.toThrow();
    await expect(searchCommits(dir, "hash", "-abc1234")).rejects.toThrow(/inválido/);
    await expect(searchCommits(dir, "message", "x", 0)).rejects.toThrow();
    await expect(searchCommits(dir, "nada" as never, "x")).rejects.toThrow(/inválido/);
  });

  it("respeita o limite", async () => {
    expect(await searchCommits(dir, "author", "ana", 1)).toHaveLength(1);
  });

  it("repositório sem commits: vazio, sem erro", async () => {
    const empty = mkdtempSync(join(tmpdir(), "gitmonster-search-empty-"));
    try {
      execFileSync("git", ["init", "-b", "main"], { cwd: empty });
      expect(await searchCommits(empty, "message", "x")).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
