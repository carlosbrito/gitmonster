import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneRepo, deriveRepoName, initRepo, validateCloneUrl } from "../src/main/git/Clone";

describe("validateCloneUrl", () => {
  it.each([
    "https://github.com/a/b.git",
    "ssh://git@host/a/b.git",
    "git@github.com:a/b.git",
    "file:///C:/repos/x.git",
  ])("aceita %s", (url) => expect(validateCloneUrl(url)).toBe(url));

  it.each([
    "",
    "   ",
    "--upload-pack=calc",
    "-c core.x=y",
    "ext::sh -c calc",
    "http://inseguro/x.git",
    "ftp://x/y",
    String.raw`C:\repos\x`,
    "https://x/y\nz",
  ])("recusa %j", (url) => expect(() => validateCloneUrl(url)).toThrow());
});

describe("deriveRepoName", () => {
  it.each([
    ["https://github.com/a/projeto.git", "projeto"],
    ["https://github.com/a/projeto", "projeto"],
    ["https://github.com/a/projeto/", "projeto"],
    ["git@github.com:a/meu-repo.git", "meu-repo"],
    ["file:///C:/x/remoto.git", "remoto"],
  ])("%s → %s", (url, name) => expect(deriveRepoName(url)).toBe(name));

  it("recusa nome que não dá para usar como pasta", () => {
    expect(() => deriveRepoName("https://host/..")).toThrow();
    expect(() => deriveRepoName("https://host/a/.")).toThrow();
  });
});

describe("clone e init (git real)", () => {
  let base: string;
  let remote: string;
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const fwd = (p: string) => p.replace(/\x5c/g, "/");
  const fileUrl = (p: string) => `file:///${fwd(p)}`;

  beforeEach(() => {
    // Nome longo: no CI o TEMP vem em formato 8.3 (RUNNER~1) e o git devolve o caminho expandido.
    base = realpathSync.native(mkdtempSync(join(tmpdir(), "gitmonster-clone-")));
    const seed = join(base, "seed");
    mkdirSync(seed);
    git(seed, "init", "-b", "main");
    git(seed, "config", "user.name", "T");
    git(seed, "config", "user.email", "t@example.com");
    git(seed, "config", "commit.gpgsign", "false");
    writeFileSync(join(seed, "f.txt"), "oi\n");
    git(seed, "add", ".");
    git(seed, "commit", "-m", "um");
    remote = join(base, "remoto.git");
    git(base, "clone", "--bare", seed, remote);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("clona para <pasta>/<nome> e devolve a raiz", async () => {
    const dest = join(base, "destino");
    mkdirSync(dest);

    const root = await cloneRepo(fileUrl(remote), dest);

    expect(fwd(root).toLowerCase()).toBe(fwd(join(dest, "remoto")).toLowerCase());
    expect(existsSync(join(root, "f.txt"))).toBe(true);
  });

  it("não sobrescreve pasta existente", async () => {
    const dest = join(base, "destino");
    mkdirSync(join(dest, "remoto"), { recursive: true });
    writeFileSync(join(dest, "remoto", "meu.txt"), "meu\n");

    await expect(cloneRepo(fileUrl(remote), dest)).rejects.toThrow(/já existe/);
    expect(existsSync(join(dest, "remoto", "meu.txt"))).toBe(true);
  });

  it("remove a pasta parcial quando o clone falha", async () => {
    const dest = join(base, "destino");
    mkdirSync(dest);

    await expect(cloneRepo(fileUrl(join(base, "nao-existe.git")), dest)).rejects.toThrow();
    expect(existsSync(join(dest, "nao-existe"))).toBe(false);
  });

  it("recusa URL inválida antes de chamar o git", async () => {
    await expect(cloneRepo("--upload-pack=x", base)).rejects.toThrow(/inválida/);
  });

  it("init cria o repositório e, se já existir, só devolve a raiz", async () => {
    const dir = join(base, "novo");
    mkdirSync(dir);

    const root = await initRepo(dir);
    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(await initRepo(dir)).toBe(root);
  });
});
