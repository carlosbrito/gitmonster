import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blame, fileHistory, parseBlame } from "../src/main/git/FileInfo";

const H1 = "a".repeat(40);
const H2 = "b".repeat(40);

describe("parseBlame", () => {
  it("lê grupos, reaproveita os metadados do commit e converte a data", () => {
    const raw = [
      `${H1} 1 1 2`,
      "author Ana",
      "author-mail <ana@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "summary primeiro",
      "filename f.txt",
      "\tlinha 1",
      `${H1} 2 2`,
      "\tlinha 2",
      `${H2} 1 3 1`,
      "author Bruno",
      "author-time 1700003600",
      "summary segundo",
      "filename f.txt",
      "\tlinha 3\r",
      "",
    ].join("\n");

    const lines = parseBlame(raw);

    expect(lines.map((l) => [l.line, l.hash === H1 ? "H1" : "H2", l.author, l.text])).toEqual([
      [1, "H1", "Ana", "linha 1"],
      [2, "H1", "Ana", "linha 2"],
      [3, "H2", "Bruno", "linha 3"],
    ]);
    expect(lines[0]).toMatchObject({ summary: "primeiro", authorTime: "2023-11-14T22:13:20.000Z", uncommitted: false });
  });

  it("marca linhas não commitadas", () => {
    const raw = `${"0".repeat(40)} 1 1 1\nauthor Not Committed Yet\nauthor-time 1700000000\nsummary Version of f.txt\nfilename f.txt\n\tnova\n`;
    expect(parseBlame(raw)[0]).toMatchObject({ uncommitted: true, text: "nova" });
  });

  it("saída vazia: nenhuma linha", () => {
    expect(parseBlame("")).toEqual([]);
  });
});

describe("fileHistory e blame (git real)", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
  const commit = (msg: string, author = "Ana <ana@example.com>") => {
    git("add", ".");
    git("commit", "-m", msg, `--author=${author}`);
    return git("rev-parse", "HEAD");
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-file-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fileHistory lista só os commits do arquivo, do mais novo para o mais antigo", async () => {
    write("a.txt", "1\n");
    commit("cria a");
    write("b.txt", "x\n");
    commit("cria b");
    write("a.txt", "1\n2\n");
    commit("edita a");

    const page = await fileHistory(dir, "a.txt", 0, 10);

    expect(page.commits.map((c) => c.subject)).toEqual(["edita a", "cria a"]);
    expect(page.hasMore).toBe(false);
  });

  it("fileHistory segue renomeações", async () => {
    write("velho.txt", "conteudo bem comprido para o git detectar a renomeação\n");
    commit("cria velho");
    git("mv", "velho.txt", "novo.txt");
    commit("renomeia");
    write("novo.txt", "conteudo bem comprido para o git detectar a renomeação\nmais\n");
    commit("edita novo");

    const page = await fileHistory(dir, "novo.txt", 0, 10);

    expect(page.commits.map((c) => c.subject)).toEqual(["edita novo", "renomeia", "cria velho"]);
  });

  it("fileHistory pagina com hasMore", async () => {
    for (let i = 1; i <= 3; i++) {
      write("a.txt", `${i}\n`);
      commit(`v${i}`);
    }
    const first = await fileHistory(dir, "a.txt", 0, 2);
    expect(first.commits).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await fileHistory(dir, "a.txt", 2, 2);
    expect(second.commits.map((c) => c.subject)).toEqual(["v1"]);
    expect(second.hasMore).toBe(false);
  });

  it("fileHistory valida caminho e limites; repositório vazio dá lista vazia", async () => {
    await expect(fileHistory(dir, "../x", 0, 10)).rejects.toThrow();
    await expect(fileHistory(dir, "a.txt", -1, 10)).rejects.toThrow();
    await expect(fileHistory(dir, "a.txt", 0, 0)).rejects.toThrow();
    expect(await fileHistory(dir, "a.txt", 0, 10)).toEqual({ commits: [], hasMore: false });
  });

  it("blame atribui cada linha ao commit certo", async () => {
    write("a.txt", "um\ndois\n");
    const h1 = commit("primeiro", "Ana <ana@example.com>");
    write("a.txt", "um\nDOIS\ntres\n");
    const h2 = commit("segundo", "Bruno <bruno@example.com>");

    const lines = await blame(dir, "a.txt", null);

    expect(lines.map((l) => [l.text, l.hash, l.author])).toEqual([
      ["um", h1, "Ana"],
      ["DOIS", h2, "Bruno"],
      ["tres", h2, "Bruno"],
    ]);
    expect(lines[0]!.summary).toBe("primeiro");
  });

  it("blame de uma revisão antiga ignora o que veio depois", async () => {
    write("a.txt", "um\n");
    const h1 = commit("primeiro");
    write("a.txt", "um\ndois\n");
    commit("segundo");

    const lines = await blame(dir, "a.txt", h1);

    expect(lines.map((l) => l.text)).toEqual(["um"]);
  });

  it("blame marca linhas ainda não commitadas", async () => {
    write("a.txt", "um\n");
    commit("primeiro");
    write("a.txt", "um\nnovo\n");

    const lines = await blame(dir, "a.txt", null);

    expect(lines.map((l) => l.uncommitted)).toEqual([false, true]);
  });

  it("blame recusa caminho inseguro, revisão suspeita e arquivo inexistente", async () => {
    write("a.txt", "um\n");
    commit("primeiro");
    await expect(blame(dir, "../x", null)).rejects.toThrow();
    await expect(blame(dir, "a.txt", "--contents=x")).rejects.toThrow(/inválido/);
    await expect(blame(dir, "nao-existe.txt", null)).rejects.toThrow(/não existe/);
  });
});
