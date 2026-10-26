import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStatus } from "../src/main/git/GitService";
import {
  cherryPick,
  commitDetail,
  commitFileDiff,
  createTag,
  deleteTag,
  forcePush,
  operationAbort,
  operationContinue,
  operationSkip,
  parseNameStatus,
  pushTag,
  rebase,
  rebaseInteractive,
  rebasePlan,
  reset,
  revertCommit,
} from "../src/main/git/Operations";

describe("parseNameStatus", () => {
  it("lê A/M/D e renomeações com caminho antigo e novo (-z)", () => {
    const raw = "A\0novo.txt\0M\0a b.txt\0D\0velho.txt\0R100\0antes.txt\0depois.txt\0";

    expect(parseNameStatus(raw)).toEqual([
      { status: "A", path: "novo.txt" },
      { status: "M", path: "a b.txt" },
      { status: "D", path: "velho.txt" },
      { status: "R", path: "depois.txt", origPath: "antes.txt" },
    ]);
  });

  it("saída vazia (commit sem mudanças de arquivo) vira lista vazia", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("operações do git com repositório real", () => {
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
    return g(cwd, "rev-parse", "HEAD").trim();
  };
  const subjects = (...extra: string[]) => w("log", "--format=%s", ...extra).trim().split("\n");
  const identity = (cwd: string) => {
    g(cwd, "config", "user.name", "Teste");
    g(cwd, "config", "user.email", "t@example.com");
    g(cwd, "config", "commit.gpgsign", "false");
    g(cwd, "config", "core.autocrlf", "false");
  };

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "gitmonster-op-"));
    remote = join(base, "remote.git");
    work = join(base, "work");
    other = join(base, "other");
    execFileSync("git", ["init", "--bare", "-b", "main", remote]);
    execFileSync("git", ["init", "-b", "main", work]);
    identity(work);
    commitFile(work, "f.txt", "um\ndois\ntres\n", "inicial");
    w("remote", "add", "origin", remote);
    w("push", "-u", "origin", "main");
    execFileSync("git", ["clone", "-c", "core.autocrlf=false", remote, other]);
    identity(other);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  // ---------- detalhe do commit ----------

  it("commitDetail: mensagem completa, autor, pais e arquivos (A/M/D/R)", async () => {
    commitFile(work, "velho.txt", "conteudo bem grande para o git detectar a renomeacao\nlinha 2\nlinha 3\n", "prepara");
    w("mv", "velho.txt", "novo.txt");
    write(work, "f.txt", "um\nDOIS\ntres\n");
    write(work, "add.txt", "a\n");
    w("add", ".");
    w("commit", "-m", "mexe em tudo", "-m", "corpo da mensagem\nsegunda linha");
    const hash = w("rev-parse", "HEAD").trim();

    const d = await commitDetail(work, hash);

    expect(d).toMatchObject({ hash, authorName: "Teste", authorEmail: "t@example.com", committerName: "Teste" });
    expect(d.parents).toHaveLength(1);
    expect(d.message).toBe("mexe em tudo\n\ncorpo da mensagem\nsegunda linha");
    const byPath = Object.fromEntries(d.files.map((f) => [f.path, f]));
    expect(byPath["f.txt"]).toMatchObject({ status: "M" });
    expect(byPath["add.txt"]).toMatchObject({ status: "A" });
    expect(byPath["novo.txt"]).toMatchObject({ status: "R", origPath: "velho.txt" });
  });

  it("commitDetail de commit de merge lista o que veio da branch mesclada (vs. 1º pai)", async () => {
    w("switch", "-c", "lado");
    commitFile(work, "lado.txt", "l\n", "no lado");
    w("switch", "main");
    commitFile(work, "main.txt", "m\n", "na main");
    w("merge", "--no-ff", "lado", "-m", "merge lado");
    const hash = w("rev-parse", "HEAD").trim();

    const d = await commitDetail(work, hash);

    expect(d.parents).toHaveLength(2);
    expect(d.files).toEqual([{ status: "A", path: "lado.txt" }]);
  });

  it("commitFileDiff: hunks do arquivo naquele commit, também no commit raiz", async () => {
    const hash = commitFile(work, "f.txt", "um\nDOIS\ntres\n", "troca dois");
    const diff = await commitFileDiff(work, hash, "f.txt");

    expect(diff.binary).toBe(false);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]!.lines.filter((l) => l.kind !== " ").map((l) => l.kind + l.text)).toEqual(["-dois", "+DOIS"]);

    const root = w("rev-list", "--max-parents=0", "HEAD").trim();
    const first = await commitFileDiff(work, root, "f.txt");
    expect(first.hunks[0]!.lines.every((l) => l.kind === "+")).toBe(true);
  });

  it("commitFileDiff recusa caminho fora do repositório e hash inválido", async () => {
    await expect(commitFileDiff(work, w("rev-parse", "HEAD").trim(), "../fora")).rejects.toThrow();
    await expect(commitFileDiff(work, "--output=x", "f.txt")).rejects.toThrow(/inválido/);
  });

  // ---------- cherry-pick / revert ----------

  it("cherry-pick traz o commit para a branch atual", async () => {
    w("switch", "-c", "origem");
    const pick = commitFile(work, "extra.txt", "x\n", "commit a pegar");
    w("switch", "main");

    expect(await cherryPick(work, pick)).toEqual({ conflicted: false });

    expect(subjects()[0]).toBe("commit a pegar");
    expect(w("ls-files")).toContain("extra.txt");
  });

  it("cherry-pick de commit de merge usa o 1º pai (-m 1) em vez de falhar", async () => {
    w("switch", "-c", "lado");
    commitFile(work, "lado.txt", "l\n", "no lado");
    w("switch", "main");
    commitFile(work, "main.txt", "m\n", "na main");
    w("merge", "--no-ff", "lado", "-m", "merge lado");
    const merge = w("rev-parse", "HEAD").trim();
    w("switch", "-c", "destino", "main~2");

    expect(await cherryPick(work, merge)).toEqual({ conflicted: false });

    expect(w("ls-files")).toContain("lado.txt");
  });

  it("cherry-pick com conflito para em andamento; abortar volta ao estado anterior", async () => {
    w("switch", "-c", "origem");
    const pick = commitFile(work, "f.txt", "um\nVERSAO ORIGEM\ntres\n", "muda dois na origem");
    w("switch", "main");
    commitFile(work, "f.txt", "um\nVERSAO MAIN\ntres\n", "muda dois na main");
    const before = w("rev-parse", "HEAD").trim();

    const result = await cherryPick(work, pick);

    expect(result.conflicted).toBe(true);
    expect(result.message).toMatch(/conflict/i);
    expect((await getStatus(work)).operation).toBe("cherry-pick");

    await operationAbort(work);
    expect((await getStatus(work)).operation).toBeNull();
    expect(w("rev-parse", "HEAD").trim()).toBe(before);
    expect(w("status", "--porcelain")).toBe("");
  });

  it("continuar depois de resolver conclui o cherry-pick; continuar sem resolver continua parado", async () => {
    w("switch", "-c", "origem");
    const pick = commitFile(work, "f.txt", "um\nVERSAO ORIGEM\ntres\n", "muda dois na origem");
    w("switch", "main");
    commitFile(work, "f.txt", "um\nVERSAO MAIN\ntres\n", "muda dois na main");
    await cherryPick(work, pick);

    const stuck = await operationContinue(work);
    expect(stuck.conflicted).toBe(true);
    expect((await getStatus(work)).operation).toBe("cherry-pick");

    write(work, "f.txt", "um\nRESOLVIDO\ntres\n");
    w("add", "f.txt");
    expect(await operationContinue(work)).toEqual({ conflicted: false });

    expect((await getStatus(work)).operation).toBeNull();
    expect(subjects()[0]).toBe("muda dois na origem");
    expect(w("show", "HEAD:f.txt")).toBe("um\nRESOLVIDO\ntres\n");
  });

  it("cherry-pick que fica vazio (já aplicado) para em andamento e pode ser pulado", async () => {
    w("switch", "-c", "origem");
    const pick = commitFile(work, "f.txt", "um\nigual\ntres\n", "igual na origem");
    w("switch", "main");
    commitFile(work, "f.txt", "um\nigual\ntres\n", "igual na main");

    const result = await cherryPick(work, pick);

    expect(result.conflicted).toBe(true);
    expect((await getStatus(work)).operation).toBe("cherry-pick");
    await operationSkip(work);
    expect((await getStatus(work)).operation).toBeNull();
  });

  it("revert cria o commit inverso; com conflito para em andamento e pode abortar", async () => {
    const bad = commitFile(work, "g.txt", "g\n", "adiciona g");
    expect(await revertCommit(work, bad)).toEqual({ conflicted: false });
    expect(subjects()[0]).toBe('Revert "adiciona g"');
    expect(w("ls-files")).not.toContain("g.txt");

    const alvo = commitFile(work, "f.txt", "um\nA\ntres\n", "troca para A");
    commitFile(work, "f.txt", "um\nB\ntres\n", "troca para B");
    const result = await revertCommit(work, alvo);

    expect(result.conflicted).toBe(true);
    expect((await getStatus(work)).operation).toBe("revert");
    await operationAbort(work);
    expect((await getStatus(work)).operation).toBeNull();
  });

  it("continue/abort/skip sem operação em andamento são recusados; merge não pode ser pulado", async () => {
    await expect(operationContinue(work)).rejects.toThrow(/nenhuma operação/);
    await expect(operationAbort(work)).rejects.toThrow(/nenhuma operação/);
    await expect(operationSkip(work)).rejects.toThrow(/nenhuma operação/);

    w("switch", "-c", "conflita");
    commitFile(work, "f.txt", "um\nA\ntres\n", "A");
    w("switch", "main");
    commitFile(work, "f.txt", "um\nB\ntres\n", "B");
    try {
      w("merge", "conflita");
    } catch {
      /* conflito esperado */
    }
    expect((await getStatus(work)).operation).toBe("merge");
    await expect(operationSkip(work)).rejects.toThrow(/não pode ser pulado/);
  });

  // ---------- reset ----------

  it("reset soft mantém no stage, mixed mantém no disco, hard descarta", async () => {
    const first = w("rev-parse", "HEAD").trim();
    commitFile(work, "novo.txt", "n\n", "segundo");

    await reset(work, first, "soft");
    expect(w("status", "--porcelain").trim()).toBe("A  novo.txt");

    w("commit", "-m", "refeito");
    await reset(work, first, "mixed");
    expect(w("status", "--porcelain").trim()).toBe("?? novo.txt");

    w("add", ".");
    w("commit", "-m", "refeito 2");
    await reset(work, first, "hard");
    expect(w("status", "--porcelain").trim()).toBe("");
    expect(w("ls-files")).not.toContain("novo.txt");
  });

  it("reset recusa modo e hash inválidos", async () => {
    const head = w("rev-parse", "HEAD").trim();
    await expect(reset(work, head, "bogus" as never)).rejects.toThrow(/inválido/);
    await expect(reset(work, "--hard", "hard")).rejects.toThrow(/inválido/);
    await expect(reset(work, "HEAD~1", "hard")).rejects.toThrow(/inválido/);
  });

  // ---------- tags ----------

  it("createTag: leve sem mensagem, anotada com mensagem, em commit específico; deleteTag remove", async () => {
    const first = w("rev-list", "--max-parents=0", "HEAD").trim();
    commitFile(work, "x.txt", "x\n", "segundo");

    await createTag(work, "leve", null, "");
    await createTag(work, "anotada", first, "versão um");

    expect(w("cat-file", "-t", "leve").trim()).toBe("commit");
    expect(w("cat-file", "-t", "anotada").trim()).toBe("tag");
    expect(w("rev-parse", "anotada^{commit}").trim()).toBe(first);
    expect(w("tag", "-l", "-n1", "anotada")).toContain("versão um");

    await expect(createTag(work, "leve", null, "")).rejects.toThrow(/already exists/i);
    await expect(createTag(work, "-f", null, "")).rejects.toThrow(/inválido/);

    await deleteTag(work, "leve");
    expect(w("tag", "-l").split("\n")).not.toContain("leve");
  });

  it("pushTag publica só a tag pedida no remote", async () => {
    await createTag(work, "v1", null, "");
    await createTag(work, "v2", null, "");

    await pushTag(work, "v1");

    expect(g(remote, "tag", "-l").trim().split("\n")).toEqual(["v1"]);
  });

  // ---------- force push ----------

  it("forcePush reescreve o remoto depois de um amend; push normal seria recusado", async () => {
    w("commit", "--amend", "-m", "inicial reescrito");
    expect(() => w("push")).toThrow();

    await forcePush(work);

    expect(g(remote, "log", "-1", "--format=%s", "main").trim()).toBe("inicial reescrito");
  });

  it("forcePush usa lease: recusa se o remoto andou desde o último fetch", async () => {
    commitFile(other, "o.txt", "o\n", "do colega");
    o("push");
    w("commit", "--amend", "-m", "reescrito sem saber do colega");

    await expect(forcePush(work)).rejects.toThrow(/stale info|rejected/i);
    expect(g(remote, "log", "-1", "--format=%s", "main").trim()).toBe("do colega");
  });

  it("forcePush exige branch com upstream", async () => {
    w("switch", "-c", "sem-upstream");
    await expect(forcePush(work)).rejects.toThrow(/upstream/);
    w("switch", "--detach", "HEAD");
    await expect(forcePush(work)).rejects.toThrow(/destacado/);
  });

  // ---------- rebase ----------

  it("rebase coloca os commits da branch em cima do destino (histórico linear)", async () => {
    w("switch", "-c", "feature");
    commitFile(work, "feat.txt", "f\n", "da feature");
    w("switch", "main");
    commitFile(work, "main.txt", "m\n", "novo na main");
    w("switch", "feature");

    expect(await rebase(work, "main")).toEqual({ conflicted: false });

    expect(subjects()).toEqual(["da feature", "novo na main", "inicial"]);
    expect(w("rev-list", "--merges", "--count", "HEAD").trim()).toBe("0");
  });

  it("rebase com conflito para em andamento; continuar após resolver e abortar funcionam", async () => {
    w("switch", "-c", "feature");
    commitFile(work, "f.txt", "um\nFEATURE\ntres\n", "feature muda dois");
    const featureTip = w("rev-parse", "HEAD").trim();
    w("switch", "main");
    commitFile(work, "f.txt", "um\nMAIN\ntres\n", "main muda dois");
    w("switch", "feature");

    const result = await rebase(work, "main");
    expect(result.conflicted).toBe(true);
    expect((await getStatus(work)).operation).toBe("rebase");
    await operationAbort(work);
    expect((await getStatus(work)).operation).toBeNull();
    expect(w("rev-parse", "HEAD").trim()).toBe(featureTip);

    await rebase(work, "main");
    write(work, "f.txt", "um\nRESOLVIDO\ntres\n");
    w("add", "f.txt");
    expect(await operationContinue(work)).toEqual({ conflicted: false });
    expect((await getStatus(work)).operation).toBeNull();
    expect(subjects()[0]).toBe("feature muda dois");
  });

  it("rebase recusa HEAD destacado e operação já em andamento", async () => {
    w("switch", "--detach", "HEAD");
    await expect(rebase(work, "main")).rejects.toThrow(/destacado/);
    w("switch", "main");

    w("switch", "-c", "conflita");
    commitFile(work, "f.txt", "um\nA\ntres\n", "A");
    w("switch", "main");
    commitFile(work, "f.txt", "um\nB\ntres\n", "B");
    w("switch", "conflita");
    await rebase(work, "main");
    await expect(rebase(work, "main")).rejects.toThrow(/em andamento/);
  });

  // ---------- rebase interativo ----------

  /** Branch `feat` com c1, c2, c3 sobre `main`; devolve os hashes. */
  function threeCommits() {
    w("switch", "-c", "feat");
    const c1 = commitFile(work, "a.txt", "a\n", "c1");
    const c2 = commitFile(work, "b.txt", "b\n", "c2");
    const c3 = commitFile(work, "c.txt", "c\n", "c3");
    return { c1, c2, c3 };
  }

  it("rebasePlan lista os commits do mais antigo ao mais novo e detecta merges", async () => {
    const { c1, c2, c3 } = threeCommits();

    expect(await rebasePlan(work, "main")).toEqual({
      commits: [
        { hash: c1, subject: "c1" },
        { hash: c2, subject: "c2" },
        { hash: c3, subject: "c3" },
      ],
      hasMerges: false,
    });

    w("switch", "-c", "lado", "main");
    commitFile(work, "lado.txt", "l\n", "lado");
    w("switch", "feat");
    w("merge", "--no-ff", "lado", "-m", "merge no meio");
    expect((await rebasePlan(work, "main")).hasMerges).toBe(true);
  });

  it("interativo: reordenar commits", async () => {
    const { c1, c2, c3 } = threeCommits();

    const result = await rebaseInteractive(work, "main", [
      { action: "pick", hash: c3 },
      { action: "pick", hash: c1 },
      { action: "pick", hash: c2 },
    ]);

    expect(result).toEqual({ conflicted: false });
    expect(subjects("main..HEAD")).toEqual(["c2", "c1", "c3"]);
  });

  it("interativo: squash junta mensagens, fixup descarta a do commit absorvido, drop remove o commit", async () => {
    const { c1, c2, c3 } = threeCommits();
    await rebaseInteractive(work, "main", [
      { action: "pick", hash: c1 },
      { action: "squash", hash: c2 },
      { action: "fixup", hash: c3 },
    ]);

    expect(subjects("main..HEAD")).toEqual(["c1"]);
    const body = w("log", "-1", "--format=%B");
    expect(body).toContain("c2"); // squash preserva a mensagem do absorvido
    expect(body).not.toContain("c3"); // fixup descarta
    expect(w("ls-files")).toEqual(expect.stringContaining("c.txt")); // mas o conteúdo dos 3 permanece

    w("reset", "--hard", "main");
    const again = threeCommits2();
    await rebaseInteractive(work, "main", [
      { action: "pick", hash: again.x1 },
      { action: "drop", hash: again.x2 },
    ]);
    expect(subjects("main..HEAD")).toEqual(["x1"]);
    expect(w("ls-files")).not.toContain("y.txt");
  });

  function threeCommits2() {
    const x1 = commitFile(work, "x.txt", "x\n", "x1");
    const x2 = commitFile(work, "y.txt", "y\n", "x2");
    return { x1, x2 };
  }

  it("interativo: plano inválido é recusado ANTES de rodar o git (histórico intacto)", async () => {
    const { c1, c2, c3 } = threeCommits();
    const head = w("rev-parse", "HEAD").trim();
    const intruso = w("rev-parse", "main").trim(); // hash real, mas fora do intervalo

    const plans: Array<[string, Parameters<typeof rebaseInteractive>[2]]> = [
      ["faltam commits", [{ action: "pick", hash: c1 }]],
      ["hash repetido", [{ action: "pick", hash: c1 }, { action: "pick", hash: c1 }, { action: "pick", hash: c2 }]],
      ["hash fora do intervalo", [{ action: "pick", hash: c1 }, { action: "pick", hash: c2 }, { action: "pick", hash: intruso }]],
      ["primeiro é squash", [{ action: "squash", hash: c1 }, { action: "pick", hash: c2 }, { action: "pick", hash: c3 }]],
      ["tudo descartado", [{ action: "drop", hash: c1 }, { action: "drop", hash: c2 }, { action: "drop", hash: c3 }]],
      ["ação inventada (exec)", [{ action: "exec" as never, hash: c1 }, { action: "pick", hash: c2 }, { action: "pick", hash: c3 }]],
    ];
    for (const [, steps] of plans) {
      await expect(rebaseInteractive(work, "main", steps)).rejects.toThrow();
    }

    expect(w("rev-parse", "HEAD").trim()).toBe(head);
    expect((await getStatus(work)).operation).toBeNull();
  });

  it("interativo recusa intervalo com merges", async () => {
    threeCommits();
    w("switch", "-c", "lado", "main");
    const l = commitFile(work, "lado.txt", "l\n", "lado");
    w("switch", "feat");
    w("merge", "--no-ff", "lado", "-m", "merge no meio");

    await expect(rebaseInteractive(work, "main", [{ action: "pick", hash: l }])).rejects.toThrow(/merges/);
  });
});
