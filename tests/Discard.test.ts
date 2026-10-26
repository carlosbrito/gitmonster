import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discardHunk, discardPaths } from "../src/main/git/Discard";
import { getStatus } from "../src/main/git/GitService";
import { getDiff } from "../src/main/git/WorkTree";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `linha ${i + 1}`);

describe("descartar alterações (git real)", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
  const read = (name: string) => readFileSync(join(dir, name), "utf8");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gitmonster-discard-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function commitBase() {
    write("a.txt", "original\n");
    write("b.txt", "bbb\n");
    git("add", ".");
    git("commit", "-m", "base");
  }

  it("restaura arquivo modificado e arquivo apagado", async () => {
    commitBase();
    write("a.txt", "mudou\n");
    unlinkSync(join(dir, "b.txt"));

    await discardPaths(dir, ["a.txt", "b.txt"]);

    expect(read("a.txt")).toBe("original\n");
    expect(read("b.txt")).toBe("bbb\n");
    expect((await getStatus(dir)).files).toEqual([]);
  });

  it("apaga arquivo novo (untracked), inclusive dentro de pasta nova", async () => {
    commitBase();
    mkdirSync(join(dir, "pasta"));
    write("pasta/novo.txt", "x\n");
    write("solto.txt", "y\n");

    await discardPaths(dir, ["pasta/novo.txt", "solto.txt"]);

    expect(existsSync(join(dir, "solto.txt"))).toBe(false);
    expect(existsSync(join(dir, "pasta/novo.txt"))).toBe(false);
  });

  it("não toca no que já está no stage, só na árvore de trabalho", async () => {
    commitBase();
    write("a.txt", "no stage\n");
    git("add", "a.txt");
    write("a.txt", "depois do stage\n");

    await discardPaths(dir, ["a.txt"]);

    expect(read("a.txt")).toBe("no stage\n");
    expect(git("diff", "--cached", "--name-only").trim()).toBe("a.txt");
  });

  it("ignora arquivo sem alteração e o que não foi pedido", async () => {
    commitBase();
    write("a.txt", "mudou\n");
    write("b.txt", "mudou tambem\n");

    await discardPaths(dir, ["a.txt", "inexistente.txt"]);

    expect(read("a.txt")).toBe("original\n");
    expect(read("b.txt")).toBe("mudou tambem\n");
  });

  it("ignora arquivo em conflito", async () => {
    write("c.txt", "base\n");
    git("add", ".");
    git("commit", "-m", "base");
    git("switch", "-c", "outra");
    write("c.txt", "outra\n");
    git("commit", "-am", "outra");
    git("switch", "main");
    write("c.txt", "main\n");
    git("commit", "-am", "main");
    expect(() => git("merge", "outra")).toThrow();

    await discardPaths(dir, ["c.txt"]);

    expect(read("c.txt")).toContain("<<<<<<<");
    expect((await getStatus(dir)).operation).toBe("merge");
  });

  it("recusa caminho inseguro", async () => {
    commitBase();
    await expect(discardPaths(dir, ["../fora.txt"])).rejects.toThrow();
    await expect(discardPaths(dir, ["C:/x.txt"])).rejects.toThrow();
  });

  describe("por hunk", () => {
    function twoHunks() {
      write("f.txt", lines(30).join("\n") + "\n");
      git("add", ".");
      git("commit", "-m", "base");
      const edited = lines(30);
      edited[1] = "linha 2 EDITADA";
      edited[27] = "linha 28 EDITADA";
      write("f.txt", edited.join("\n") + "\n");
    }

    it("desfaz só o hunk escolhido", async () => {
      twoHunks();
      const diff = await getDiff(dir, { path: "f.txt", staged: false, untracked: false });
      expect(diff.hunks).toHaveLength(2);

      await discardHunk(dir, { path: "f.txt", hunkIndex: 0, hunkHeader: diff.hunks[0]!.header });

      const text = read("f.txt");
      expect(text).toContain("linha 2\n");
      expect(text).not.toContain("linha 2 EDITADA");
      expect(text).toContain("linha 28 EDITADA");
    });

    it("recusa hunk desatualizado", async () => {
      twoHunks();
      const diff = await getDiff(dir, { path: "f.txt", staged: false, untracked: false });
      const header = diff.hunks[1]!.header;
      write("f.txt", lines(30).join("\n") + "\n"); // arquivo voltou ao original: diff mudou

      await expect(discardHunk(dir, { path: "f.txt", hunkIndex: 1, hunkHeader: header })).rejects.toThrow(/mudou/);
    });
  });
});
