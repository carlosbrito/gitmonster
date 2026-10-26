import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openInEditor, resolveEditorExecutable, resolveRepoFile, type EditorDeps } from "../src/main/Editor";
import { getGitProfile, setGitProfile, validateIdentity } from "../src/main/git/GitConfig";

describe("validateIdentity", () => {
  it("aceita e apara", () => {
    expect(validateIdentity("  Ana  ", " ana@example.com ")).toEqual({ name: "Ana", email: "ana@example.com" });
    expect(validateIdentity("", "")).toEqual({ name: "", email: "" });
  });

  it.each([
    ["-x", "a@b.c"],
    ["Ana", "-a@b.c"],
    ["Ana\nRoot", "a@b.c"],
    ["Ana", "sem-arroba"],
    ["Ana", "a b@c.d"],
    ["x".repeat(201), "a@b.c"],
  ])("recusa %j / %j", (n, e) => expect(() => validateIdentity(n, e)).toThrow());
});

describe("perfil do Git (config isolada)", () => {
  let base: string;
  let repo: string;
  let savedGlobal: string | undefined;
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gitmonster-cfg-"));
    repo = join(base, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-b", "main"], { cwd: repo });
    // O global aponta para um arquivo temporário: o teste nunca toca o ~/.gitconfig de verdade.
    savedGlobal = process.env["GIT_CONFIG_GLOBAL"];
    process.env["GIT_CONFIG_GLOBAL"] = join(base, "global.gitconfig");
    writeFileSync(process.env["GIT_CONFIG_GLOBAL"], "");
  });

  afterEach(() => {
    if (savedGlobal === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
    else process.env["GIT_CONFIG_GLOBAL"] = savedGlobal;
    rmSync(base, { recursive: true, force: true });
  });

  it("grava e lê no escopo global", async () => {
    await setGitProfile(repo, "global", "Ana Global", "ana@global.com");
    const profile = await getGitProfile(repo);
    expect(profile.global).toEqual({ name: "Ana Global", email: "ana@global.com" });
    expect(profile.local).toEqual({ name: "", email: "" });
    expect(profile.effective.email).toBe("ana@global.com");
  });

  it("o local vence o global no efetivo, sem alterar o global", async () => {
    await setGitProfile(repo, "global", "Ana Global", "ana@global.com");
    await setGitProfile(repo, "local", "Ana Local", "ana@local.com");

    const profile = await getGitProfile(repo);
    expect(profile.effective).toEqual({ name: "Ana Local", email: "ana@local.com" });
    expect(profile.global.name).toBe("Ana Global");
    expect(git(repo, "config", "--local", "user.name")).toBe("Ana Local");
  });

  it("valor vazio remove a chave; remover o que não existe não dá erro", async () => {
    await setGitProfile(repo, "local", "Ana", "ana@x.com");
    await setGitProfile(repo, "local", "", "");
    expect((await getGitProfile(repo)).local).toEqual({ name: "", email: "" });
    await expect(setGitProfile(repo, "local", "", "")).resolves.toBeUndefined();
  });

  it("local sem repositório é recusado; global funciona sem repositório", async () => {
    await expect(setGitProfile(null, "local", "A", "a@b.c")).rejects.toThrow(/repositório/);
    await setGitProfile(null, "global", "Sem Repo", "s@r.com");
    expect((await getGitProfile(null)).global.name).toBe("Sem Repo");
    expect((await getGitProfile(null)).local).toEqual({ name: "", email: "" });
  });

  it("recusa escopo inválido e valor que viraria opção", async () => {
    await expect(setGitProfile(repo, "system" as never, "A", "a@b.c")).rejects.toThrow(/Escopo/);
    await expect(setGitProfile(repo, "global", "--system", "a@b.c")).rejects.toThrow();
  });
});

describe("abrir no editor", () => {
  let base: string;
  let repo: string;

  function fakeDeps() {
    const calls: { opened: string[]; launched: { exe: string; args: string[] }[] } = { opened: [], launched: [] };
    const deps: EditorDeps = {
      openPath: async (p) => {
        calls.opened.push(p);
        return "";
      },
      launch: (exe, args) => void calls.launched.push({ exe, args }),
    };
    return { deps, calls };
  }

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gitmonster-editor-"));
    repo = join(base, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.txt"), "x\n");
    writeFileSync(join(base, "fora.txt"), "segredo\n");
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("sem editor configurado, usa o programa padrão do sistema", async () => {
    const { deps, calls } = fakeDeps();
    await openInEditor(repo, "src/a.txt", "", deps);
    expect(calls.opened).toHaveLength(1);
    expect(calls.opened[0]!.replace(/\x5c/g, "/")).toMatch(/src\/a\.txt$/);
    expect(calls.launched).toEqual([]);
  });

  it("com editor, inicia o executável com o caminho do arquivo como argumento único", async () => {
    const { deps, calls } = fakeDeps();
    await openInEditor(repo, "src/a.txt", process.execPath, deps);
    expect(calls.launched).toHaveLength(1);
    expect(calls.launched[0]!.exe).toBe(process.execPath);
    expect(calls.launched[0]!.args).toHaveLength(1);
  });

  it("recusa arquivo inexistente, caminho inseguro e diretório", async () => {
    const { deps } = fakeDeps();
    await expect(openInEditor(repo, "nao-existe.txt", "", deps)).rejects.toThrow(/não existe/);
    await expect(openInEditor(repo, "../fora.txt", "", deps)).rejects.toThrow();
    await expect(openInEditor(repo, "src", "", deps)).rejects.toThrow(/não existe/);
  });

  it("recusa link simbólico que aponta para fora do repositório", () => {
    try {
      symlinkSync(join(base, "fora.txt"), join(repo, "atalho.txt"));
    } catch {
      return; // sem permissão de symlink neste Windows: o caso não se aplica
    }
    expect(() => resolveRepoFile(repo, "atalho.txt")).toThrow(/fora do repositório/);
  });

  it("resolveEditorExecutable: caminho completo, .cmd recusado, inexistente e nome no PATH", () => {
    expect(resolveEditorExecutable(process.execPath)).toBe(process.execPath);
    expect(() => resolveEditorExecutable("C:\\x\\code.cmd")).toThrow(/\.exe/);
    expect(() => resolveEditorExecutable("C:\\nao\\existe\\editor.exe")).toThrow(/não encontrado/);
    expect(() => resolveEditorExecutable("editor-que-nao-existe", { PATH: "" })).toThrow(/PATH/);
    expect(() => resolveEditorExecutable("a\nb")).toThrow(/inválido/);

    const dir = join(base, "bin");
    mkdirSync(dir);
    writeFileSync(join(dir, "meueditor.exe"), "");
    expect(resolveEditorExecutable("meueditor", { PATH: dir })).toBe(join(dir, "meueditor.exe"));
  });

  it("resolveEditorExecutable: 'code' no Windows acha o Code.exe ao lado de bin/code.cmd", () => {
    const install = join(base, "VSCode");
    mkdirSync(join(install, "bin"), { recursive: true });
    writeFileSync(join(install, "bin", "code.cmd"), "");
    writeFileSync(join(install, "Code.exe"), "");
    expect(resolveEditorExecutable("code", { PATH: join(install, "bin") })).toBe(join(install, "Code.exe"));
  });
});
