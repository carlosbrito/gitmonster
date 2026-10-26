import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteRemoteBranch, listRefs, renameBranch } from "../src/main/git/Branches";
import { addRemote, assertRemoteName, listRemotes, parseRemotes, removeRemote } from "../src/main/git/Remotes";

describe("assertRemoteName", () => {
  it.each(["origin", "upstream", "meu-fork", "a.b", "r_1"])("aceita %j", (n) => expect(assertRemoteName(n)).toBe(n));
  it.each(["", "-origin", ".x", "a b", "a/b", "x.lock", "a..b", "a;rm", "--upload-pack=x", "a\nb"])("recusa %j", (n) =>
    expect(() => assertRemoteName(n)).toThrow(/inválido/),
  );
});

describe("parseRemotes", () => {
  it("junta fetch e push de cada remote", () => {
    const raw = "origin\thttps://h/a.git (fetch)\norigin\thttps://h/a.git (push)\nfork\tgit@h:b.git (fetch)\nfork\tgit@h:c.git (push)\n";
    expect(parseRemotes(raw)).toEqual([
      { name: "origin", fetchUrl: "https://h/a.git", pushUrl: "https://h/a.git" },
      { name: "fork", fetchUrl: "git@h:b.git", pushUrl: "git@h:c.git" },
    ]);
  });
  it("saída vazia: nenhum remote", () => expect(parseRemotes("")).toEqual([]));
});

describe("remotas e branches (git real)", () => {
  let base: string;
  let work: string;
  let remote: string;
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const fileUrl = (p: string) => `file:///${p.replace(/\x5c/g, "/")}`;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gitmonster-rem-"));
    remote = join(base, "remote.git");
    work = join(base, "work");
    execFileSync("git", ["init", "--bare", "-b", "main", remote]);
    execFileSync("git", ["init", "-b", "main", work]);
    for (const [k, v] of [["user.name", "T"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"]]) git(work, "config", k!, v!);
    writeFileSync(join(work, "f.txt"), "um\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "inicial");
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("adiciona, lista e remove remotes", async () => {
    expect(await listRemotes(work)).toEqual([]);

    await addRemote(work, "origin", fileUrl(remote));
    const [origin] = await listRemotes(work);
    expect(origin).toMatchObject({ name: "origin", fetchUrl: fileUrl(remote) });
    expect((await listRefs(work)).remotes.map((r) => r.name)).toEqual(["origin"]);

    await removeRemote(work, "origin");
    expect(await listRemotes(work)).toEqual([]);
  });

  it("recusa nome duplicado, URL perigosa, nome suspeito e remote inexistente", async () => {
    await addRemote(work, "origin", fileUrl(remote));
    await expect(addRemote(work, "origin", fileUrl(remote))).rejects.toThrow(/Já existe/);
    await expect(addRemote(work, "outro", "--upload-pack=calc")).rejects.toThrow(/inválida/);
    await expect(addRemote(work, "outro", "ext::sh -c calc")).rejects.toThrow();
    await expect(addRemote(work, "-x", fileUrl(remote))).rejects.toThrow(/inválido/);
    await expect(removeRemote(work, "nao-existe")).rejects.toThrow(/não existe/);
    expect((await listRemotes(work)).map((r) => r.name)).toEqual(["origin"]);
  });

  it("renomeia branch local, inclusive a atual; recusa nome existente ou inválido", async () => {
    git(work, "branch", "outra");

    await renameBranch(work, "main", "principal");
    expect(git(work, "branch", "--show-current")).toBe("principal");

    await expect(renameBranch(work, "outra", "principal")).rejects.toThrow();
    await expect(renameBranch(work, "outra", "a..b")).rejects.toThrow(/inválido/);
    await expect(renameBranch(work, "outra", "--force")).rejects.toThrow(/inválido/);
  });

  it("apaga branch no remote e a cópia local de rastreamento some", async () => {
    await addRemote(work, "origin", fileUrl(remote));
    git(work, "push", "-u", "origin", "main");
    git(work, "branch", "feature");
    git(work, "push", "origin", "feature");
    expect((await listRefs(work)).remoteBranches.map((b) => b.name)).toContain("origin/feature");

    await deleteRemoteBranch(work, "origin", "feature");

    expect(git(remote, "branch", "--list", "feature")).toBe("");
    expect((await listRefs(work)).remoteBranches.map((b) => b.name)).not.toContain("origin/feature");
  });

  it("apagar no remote valida os nomes e a existência do remote", async () => {
    await expect(deleteRemoteBranch(work, "origin", "x")).rejects.toThrow(/não existe/);
    await expect(deleteRemoteBranch(work, "-o", "x")).rejects.toThrow(/inválido/);
    await addRemote(work, "origin", fileUrl(remote));
    await expect(deleteRemoteBranch(work, "origin", "--all")).rejects.toThrow(/inválido/);
  });
});
