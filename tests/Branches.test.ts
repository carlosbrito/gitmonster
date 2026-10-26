import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertCommitHash,
  assertRefName,
  checkout,
  createBranch,
  deleteBranch,
  fetchAll,
  listRefs,
  merge,
  mergeBranches,
  pull,
  push,
  stashDrop,
  stashPop,
  stashPush,
} from "../src/main/git/Branches";
import { remoteCheckoutPlan } from "../src/main/git/Branches";
import { getStatus } from "../src/main/git/GitService";
import { operationAbort, rebaseBranches } from "../src/main/git/Operations";

describe("assertRefName / assertCommitHash", () => {
  it.each(["feature/x", "bug-55712", "release/2026.10", "a_b", "ção/ok"])("aceita %j", (n) => {
    expect(assertRefName(n)).toBe(n);
  });

  it.each(["", "-D", "--force", "a..b", "a b", "x.lock", "a@{1}", "a/", "/a", "a//b", ".oculta", "a/.b", "a~1", "a^", "a:b", "a?", "a*", "a[", "a\\b", "x.", "@", "a\nb"])(
    "rejeita %j",
    (n) => {
      expect(() => assertRefName(n)).toThrow(/inválido/);
    },
  );

  it("hash: só hexadecimal de 7 a 40 caracteres", () => {
    expect(assertCommitHash("abc1234")).toBe("abc1234");
    for (const bad of ["", "abc12", "xyz1234", "abc1234; rm -rf", "-abc1234", "a".repeat(41)]) {
      expect(() => assertCommitHash(bad)).toThrow(/inválido/);
    }
  });
});

describe("branches, remotos e stash com git real", () => {
  let base: string;
  let work: string;
  let other: string;
  let remote: string;

  const g = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const w = (...args: string[]) => g(work, ...args);
  const o = (...args: string[]) => g(other, ...args);
  const write = (cwd: string, name: string, content: string) => writeFileSync(join(cwd, name), content);
  const commitFile = (cwd: string, name: string, content: string, msg: string) => {
    write(cwd, name, content);
    g(cwd, "add", ".");
    g(cwd, "commit", "-m", msg);
  };
  const identity = (cwd: string) => {
    g(cwd, "config", "user.name", "Teste");
    g(cwd, "config", "user.email", "t@example.com");
    g(cwd, "config", "commit.gpgsign", "false");
    g(cwd, "config", "core.autocrlf", "false");
  };

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gitmonster-br-"));
    remote = join(base, "remote.git");
    work = join(base, "work");
    other = join(base, "other");
    execFileSync("git", ["init", "--bare", "-b", "main", remote]);
    execFileSync("git", ["init", "-b", "main", work]);
    identity(work);
    commitFile(work, "f.txt", "um\n", "inicial");
    w("remote", "add", "origin", remote);
    w("push", "-u", "origin", "main");
    execFileSync("git", ["clone", remote, other]);
    identity(other);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("listRefs: branch atual, upstream com ahead/behind, remotas sem HEAD, tag anotada e stash", async () => {
    w("remote", "set-head", "origin", "main"); // cria o alias refs/remotes/origin/HEAD, que não é uma branch
    w("branch", "feature");
    w("tag", "-a", "v1", "-m", "versão 1");
    commitFile(work, "g.txt", "g\n", "local à frente");
    write(work, "f.txt", "sujo\n");
    w("stash", "push", "-m", "meu stash");

    const refs = await listRefs(work);
    const main = refs.branches.find((b) => b.name === "main")!;

    expect(main).toMatchObject({ isCurrent: true, upstream: "origin/main", ahead: 1, behind: 0, gone: false });
    expect(refs.branches.find((b) => b.name === "feature")).toMatchObject({ isCurrent: false, upstream: null });
    expect(refs.remoteBranches.map((r) => r.name)).toEqual(["origin/main"]);
    expect(refs.remoteBranches[0]).toMatchObject({ remote: "origin" });
    // tag anotada aponta para o objeto da tag; o snapshot precisa expor o COMMIT
    expect(refs.tags).toEqual([{ name: "v1", hash: w("rev-parse", "v1^{commit}").trim() }]);
    expect(refs.stashes).toEqual([{ index: 0, message: expect.stringContaining("meu stash") }]);
  });

  it("checkout de branch local, de remota (cria rastreando) e de commit (HEAD destacado)", async () => {
    w("branch", "feature");
    await checkout(work, { kind: "local", name: "feature" });
    expect((await getStatus(work)).branch).toBe("feature");

    o("switch", "-c", "so-no-remoto");
    commitFile(other, "r.txt", "r\n", "no remoto");
    o("push", "-u", "origin", "so-no-remoto");
    await fetchAll(work);
    await checkout(work, { kind: "remote", name: "origin/so-no-remoto" });
    expect(await getStatus(work)).toMatchObject({ branch: "so-no-remoto", upstream: "origin/so-no-remoto" });

    // a local já existe: dar checkout na remota só muda para ela, sem erro
    w("switch", "main");
    await checkout(work, { kind: "remote", name: "origin/so-no-remoto" });
    expect((await getStatus(work)).branch).toBe("so-no-remoto");
    await checkout(work, { kind: "remote", name: "origin/so-no-remoto" });
    expect((await getStatus(work)).branch).toBe("so-no-remoto");

    const first = w("rev-list", "--max-parents=0", "HEAD").trim();
    await checkout(work, { kind: "commit", hash: first });
    expect((await getStatus(work)).branch).toBeNull();
  });

  describe("checkout de remota com local de mesmo nome diferente", () => {
    /** origin/main avança (colega) e a local main também (commit só local). */
    function diverge() {
      commitFile(other, "colega.txt", "c", "do colega");
      o("push");
      commitFile(work, "meu.txt", "m", "so local");
      w("fetch");
    }

    it("o plano descreve quanto cada lado tem a mais", async () => {
      expect(await remoteCheckoutPlan(work, "origin/main")).toMatchObject({ localName: "main", differs: false });
      diverge();
      expect(await remoteCheckoutPlan(work, "origin/main")).toEqual({ localName: "main", differs: true, ahead: 1, behind: 1 });
    });

    it("sem confirmação recusa e não mexe em nada", async () => {
      diverge();
      const before = w("rev-parse", "HEAD").trim();
      await expect(checkout(work, { kind: "remote", name: "origin/main" })).rejects.toThrow(/confirme para igualá-la/);
      expect(w("rev-parse", "HEAD").trim()).toBe(before);
    });

    it("com confirmação iguala a local à remota", async () => {
      diverge();
      w("switch", "-c", "outra");
      await checkout(work, { kind: "remote", name: "origin/main", matchRemote: true });
      expect(w("branch", "--show-current").trim()).toBe("main");
      expect(w("rev-parse", "main").trim()).toBe(w("rev-parse", "origin/main").trim());
    });

    it("alterações não commitadas bloqueiam o reset", async () => {
      diverge();
      write(work, "meu.txt", "sujo");
      await expect(checkout(work, { kind: "remote", name: "origin/main", matchRemote: true })).rejects.toThrow(/alterações não commitadas/);
      expect(w("log", "-1", "--format=%s").trim()).toBe("so local");
    });
  });

  it("checkout que sobrescreveria alterações locais falha sem perder nada", async () => {
    w("switch", "-c", "outra");
    commitFile(work, "f.txt", "da outra\n", "muda f");
    w("switch", "main");
    write(work, "f.txt", "alteração local não commitada\n");

    await expect(checkout(work, { kind: "local", name: "outra" })).rejects.toThrow(/overwritten|local changes/i);

    expect((await getStatus(work)).branch).toBe("main");
    expect(w("diff", "--stat")).toContain("f.txt");
  });

  it("createBranch (com e sem checkout, com ponto de partida) e deleteBranch -d x -D", async () => {
    const first = w("rev-parse", "HEAD").trim();
    commitFile(work, "g.txt", "g\n", "segundo");

    await createBranch(work, "antiga", first, false);
    expect((await getStatus(work)).branch).toBe("main");
    expect(w("rev-parse", "antiga").trim()).toBe(first);

    await createBranch(work, "nova", null, true);
    expect((await getStatus(work)).branch).toBe("nova");

    commitFile(work, "h.txt", "h\n", "só na nova");
    w("switch", "main");
    await expect(deleteBranch(work, "nova", false)).rejects.toThrow(/not fully merged/i);
    expect((await listRefs(work)).branches.map((b) => b.name)).toContain("nova");

    await deleteBranch(work, "nova", true);
    expect((await listRefs(work)).branches.map((b) => b.name)).not.toContain("nova");
  });

  it("nome inválido é recusado antes de chamar o git (nada é criado)", async () => {
    await expect(createBranch(work, "-D", null, false)).rejects.toThrow(/inválido/);
    await expect(createBranch(work, "a..b", null, false)).rejects.toThrow(/inválido/);
    await expect(createBranch(work, "ok", "--upload-pack=x", false)).rejects.toThrow(/inválido/);
    expect((await listRefs(work)).branches.map((b) => b.name)).toEqual(["main"]);
  });

  it("merge em fast-forward, e merge com conflito fica em andamento até abortar", async () => {
    w("switch", "-c", "ff");
    commitFile(work, "g.txt", "g\n", "avanço");
    const tip = w("rev-parse", "HEAD").trim();
    w("switch", "main");
    expect(await merge(work, "ff")).toEqual({ conflicted: false });
    expect(w("rev-parse", "HEAD").trim()).toBe(tip);

    w("switch", "-c", "conflita");
    commitFile(work, "f.txt", "versão A\n", "A");
    w("switch", "main");
    commitFile(work, "f.txt", "versão B\n", "B");

    const stopped = await merge(work, "conflita");
    expect(stopped.conflicted).toBe(true);
    expect(stopped.message).toMatch(/CONFLICT/);
    const during = await getStatus(work);
    expect(during.operation).toBe("merge");
    expect(during.files.find((f) => f.path === "f.txt")).toMatchObject({ conflicted: true });

    await operationAbort(work);
    const after = await getStatus(work);
    expect(after.operation).toBeNull();
    expect(after.files).toEqual([]);
    expect(w("show", "HEAD:f.txt")).toBe("versão B\n");
  });

  it("fetch --prune remove do snapshot a branch apagada no remoto", async () => {
    o("switch", "-c", "temporaria");
    commitFile(other, "t.txt", "t\n", "t");
    o("push", "origin", "temporaria");
    await fetchAll(work);
    expect((await listRefs(work)).remoteBranches.map((r) => r.name)).toContain("origin/temporaria");

    o("push", "origin", "--delete", "temporaria");
    await fetchAll(work);

    expect((await listRefs(work)).remoteBranches.map((r) => r.name)).not.toContain("origin/temporaria");
  });

  it("push: primeira publicação grava o upstream; depois só envia os commits novos", async () => {
    w("switch", "-c", "publicar");
    commitFile(work, "p.txt", "p\n", "p1");

    await push(work);
    expect((await getStatus(work)).upstream).toBe("origin/publicar");
    expect(g(remote, "rev-parse", "publicar").trim()).toBe(w("rev-parse", "HEAD").trim());

    commitFile(work, "p.txt", "p2\n", "p2");
    await push(work);
    expect(g(remote, "rev-parse", "publicar").trim()).toBe(w("rev-parse", "HEAD").trim());
  });

  it("push em HEAD destacado é recusado", async () => {
    w("switch", "--detach", "HEAD");
    await expect(push(work)).rejects.toThrow(/destacado/);
  });

  it("pull avança em fast-forward; se divergiu, recusa com mensagem clara e não mexe no histórico", async () => {
    commitFile(other, "r.txt", "r\n", "do outro");
    o("push");
    await pull(work);
    expect(w("log", "-1", "--format=%s").trim()).toBe("do outro");

    commitFile(other, "r.txt", "r2\n", "outro 2");
    o("push");
    commitFile(work, "l.txt", "l\n", "meu local");
    const before = w("rev-parse", "HEAD").trim();

    await expect(pull(work)).rejects.toThrow(/divergiram/);
    expect(w("rev-parse", "HEAD").trim()).toBe(before);
  });

  describe("pull com modo", () => {
    function diverge(conflicting: boolean) {
      commitFile(other, conflicting ? "f.txt" : "r.txt", conflicting ? "do outro\n" : "r\n", "do outro");
      o("push");
      commitFile(work, conflicting ? "f.txt" : "l.txt", conflicting ? "meu local\n" : "l\n", "meu local");
    }

    it("merge: integra o que divergiu com um commit de merge", async () => {
      diverge(false);

      expect(await pull(work, "merge")).toEqual({ conflicted: false });

      expect(w("log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
      expect(w("log", "--format=%s").split("\n")).toEqual(expect.arrayContaining(["do outro", "meu local"]));
    });

    it("rebase: reaplica os commits locais em cima da remota (histórico linear)", async () => {
      diverge(false);

      expect(await pull(work, "rebase")).toEqual({ conflicted: false });

      expect(w("log", "--format=%s", "-2").trim().split("\n")).toEqual(["meu local", "do outro"]);
      expect(w("log", "-1", "--format=%P").trim().split(" ")).toHaveLength(1);
    });

    it("merge com conflito deixa o merge em andamento em vez de falhar", async () => {
      diverge(true);

      const result = await pull(work, "merge");

      expect(result.conflicted).toBe(true);
      expect((await getStatus(work)).operation).toBe("merge");
      await operationAbort(work);
    });

    it("rebase com conflito deixa o rebase em andamento", async () => {
      diverge(true);

      const result = await pull(work, "rebase");

      expect(result.conflicted).toBe(true);
      expect((await getStatus(work)).operation).toBe("rebase");
      await operationAbort(work);
    });

    it("ff-only continua recusando divergência e sugere trocar o modo", async () => {
      diverge(false);
      await expect(pull(work, "ff-only")).rejects.toThrow(/modo do pull/);
    });

    it("recusa modo desconhecido", async () => {
      await expect(pull(work, "force" as never)).rejects.toThrow(/inválido/);
    });
  });

  describe("mergeBranches (arrastar uma branch sobre outra)", () => {
    /** main (atual) e feature, que têm um commit cada um depois da base. */
    function twoBranches() {
      w("switch", "-c", "feature");
      commitFile(work, "feat.txt", "f\n", "na feature");
      w("switch", "main");
      commitFile(work, "main.txt", "m\n", "na main");
    }

    it("destino é a branch atual: mescla direto", async () => {
      twoBranches();

      expect(await mergeBranches(work, "feature", "main")).toEqual({ conflicted: false });

      expect(w("branch", "--show-current").trim()).toBe("main");
      expect(w("log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
    });

    it("destino é outra branch: muda para ela e mescla lá, sem mexer na branch de origem", async () => {
      twoBranches();
      const featureBefore = w("rev-parse", "feature").trim();
      w("switch", "-c", "terceira"); // a atual passa a ser uma terceira

      await mergeBranches(work, "main", "feature");

      expect(w("branch", "--show-current").trim()).toBe("feature");
      expect(w("log", "--format=%s").split("\n")).toEqual(expect.arrayContaining(["na main", "na feature"]));
      expect(w("rev-parse", "main").trim()).not.toBe(featureBefore); // main continua como estava
      expect(w("log", "main", "--format=%s", "-1").trim()).toBe("na main");
    });

    it("a origem pode ser uma branch remota", async () => {
      o("switch", "-c", "do-colega");
      commitFile(other, "colega.txt", "c\n", "do colega");
      o("push", "-u", "origin", "do-colega");
      w("fetch");

      await mergeBranches(work, "origin/do-colega", "main");

      expect(w("log", "--format=%s").split("\n")).toContain("do colega");
    });

    it("conflito deixa o merge em andamento na branch de destino", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "f.txt", "da feature\n", "feature edita f");
      w("switch", "main");
      commitFile(work, "f.txt", "da main\n", "main edita f");
      w("switch", "-c", "terceira");

      const result = await mergeBranches(work, "feature", "main");

      expect(result.conflicted).toBe(true);
      const status = await getStatus(work);
      expect(status.branch).toBe("main");
      expect(status.operation).toBe("merge");
      await operationAbort(work);
    });

    it("alterações que conflitam com a troca de branch bloqueiam tudo (nada é mesclado)", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "f.txt", "da feature\n", "feature edita f");
      w("switch", "main");
      write(work, "f.txt", "sujo na main\n"); // alteração local no mesmo arquivo

      await expect(mergeBranches(work, "main", "feature")).rejects.toThrow();

      expect(w("branch", "--show-current").trim()).toBe("main");
      expect(w("log", "-1", "--format=%s").trim()).toBe("inicial");
    });

    it("recusa a mesma branch, destino que não é branch local, origem inexistente e nomes suspeitos", async () => {
      twoBranches();
      w("tag", "v1");

      await expect(mergeBranches(work, "main", "main")).rejects.toThrow(/diferentes/);
      await expect(mergeBranches(work, "feature", "origin/main")).rejects.toThrow(/não é uma branch local/);
      await expect(mergeBranches(work, "feature", "v1")).rejects.toThrow(/não é uma branch local/);
      await expect(mergeBranches(work, "nao-existe", "main")).rejects.toThrow(/não existe/);
      await expect(mergeBranches(work, "--all", "main")).rejects.toThrow(/inválido/);
      await expect(mergeBranches(work, "feature", "-D")).rejects.toThrow(/inválido/);
    });

    it("recusa com outra operação em andamento", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "f.txt", "da feature\n", "feature edita f");
      w("switch", "main");
      commitFile(work, "f.txt", "da main\n", "main edita f");
      try {
        w("merge", "feature");
      } catch {
        /* conflito esperado */
      }

      await expect(mergeBranches(work, "feature", "main")).rejects.toThrow(/em andamento/);
      await operationAbort(work);
    });
  });

  describe("rebaseBranches (arrastar e escolher rebase)", () => {
    function twoBranches() {
      w("switch", "-c", "feature");
      commitFile(work, "feat.txt", "f\n", "na feature");
      w("switch", "main");
      commitFile(work, "main.txt", "m\n", "na main");
    }

    it("muda para a branch arrastada e a reaplica em cima do destino", async () => {
      twoBranches();

      expect(await rebaseBranches(work, "feature", "main")).toEqual({ conflicted: false });

      expect(w("branch", "--show-current").trim()).toBe("feature");
      expect(w("log", "--format=%s").split("\n").slice(0, 3)).toEqual(["na feature", "na main", "inicial"]);
      expect(w("log", "main", "-1", "--format=%s").trim()).toBe("na main"); // o destino não mudou
    });

    it("a branch arrastada já é a atual: rebase direto", async () => {
      twoBranches();
      w("switch", "feature");

      await rebaseBranches(work, "feature", "main");

      expect(w("log", "-1", "--format=%s").trim()).toBe("na feature");
      expect(w("log", "-2", "--format=%s").split("\n")[1]).toBe("na main");
    });

    it("conflito deixa o rebase em andamento", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "f.txt", "da feature\n", "feature edita f");
      w("switch", "main");
      commitFile(work, "f.txt", "da main\n", "main edita f");

      const result = await rebaseBranches(work, "feature", "main");

      expect(result.conflicted).toBe(true);
      expect((await getStatus(work)).operation).toBe("rebase");
      await operationAbort(work);
      expect(w("branch", "--show-current").trim()).toBe("feature");
    });

    it("recusa a mesma branch, origem que não é local, destino inexistente e nomes suspeitos", async () => {
      twoBranches();
      w("tag", "v1");

      await expect(rebaseBranches(work, "main", "main")).rejects.toThrow(/diferentes/);
      await expect(rebaseBranches(work, "origin/main", "feature")).rejects.toThrow(/não é uma branch local/);
      await expect(rebaseBranches(work, "v1", "feature")).rejects.toThrow(/não é uma branch local/);
      await expect(rebaseBranches(work, "feature", "nao-existe")).rejects.toThrow(/não existe/);
      await expect(rebaseBranches(work, "--all", "main")).rejects.toThrow(/inválido/);
      await expect(rebaseBranches(work, "feature", "-D")).rejects.toThrow(/inválido/);
    });

    it("o destino pode ser uma branch remota", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "feat.txt", "f\n", "na feature");

      await rebaseBranches(work, "feature", "origin/main");

      expect(w("branch", "--show-current").trim()).toBe("feature");
    });

    it("recusa com outra operação em andamento", async () => {
      w("switch", "-c", "feature");
      commitFile(work, "f.txt", "da feature\n", "feature edita f");
      w("switch", "main");
      commitFile(work, "f.txt", "da main\n", "main edita f");
      try {
        w("merge", "feature");
      } catch {
        /* conflito esperado */
      }

      await expect(rebaseBranches(work, "feature", "main")).rejects.toThrow(/em andamento/);
      await operationAbort(work);
    });
  });

  it("pull em branch sem upstream explica o que fazer", async () => {
    w("switch", "-c", "sem-upstream");
    await expect(pull(work)).rejects.toThrow(/upstream/);
  });

  it("stash: push (com/sem não rastreados), pop restaura, drop remove, validações", async () => {
    await expect(stashPush(work, "", false)).rejects.toThrow(/Não há alterações/);

    write(work, "f.txt", "modificado\n");
    write(work, "novo.txt", "novo\n");
    await stashPush(work, "primeiro", false);
    expect(w("status", "--porcelain")).toBe("?? novo.txt\n"); // não rastreado ficou de fora
    expect((await listRefs(work)).stashes).toHaveLength(1);

    await stashPop(work, 0);
    expect(w("status", "--porcelain")).toContain(" M f.txt");
    expect((await listRefs(work)).stashes).toEqual([]);

    await stashPush(work, "com tudo", true);
    expect(w("status", "--porcelain")).toBe("");
    expect(w("stash", "show", "--include-untracked", "--name-only", "stash@{0}")).toContain("novo.txt");

    await stashDrop(work, 0);
    expect((await listRefs(work)).stashes).toEqual([]);
    await expect(stashDrop(work, -1)).rejects.toThrow(/inválido/);
    await expect(stashPop(work, 1.5)).rejects.toThrow(/inválido/);
  });
});
