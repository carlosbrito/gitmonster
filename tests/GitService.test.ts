import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLog, getStatus, parseLog, parseStatusV2, resolveRepoRoot } from "../src/main/git/GitService";

const NUL = "\0";

describe("parseStatusV2", () => {
  it("lê cabeçalhos de branch, upstream e ahead/behind", () => {
    const raw = [
      "# branch.oid 1111111111111111111111111111111111111111",
      "# branch.head feature/x",
      "# branch.upstream origin/feature/x",
      "# branch.ab +3 -2",
    ].join(NUL) + NUL;

    const s = parseStatusV2(raw);

    expect(s.branch).toBe("feature/x");
    expect(s.headOid).toBe("1111111111111111111111111111111111111111");
    expect(s.upstream).toBe("origin/feature/x");
    expect(s.ahead).toBe(3);
    expect(s.behind).toBe(2);
  });

  it("HEAD destacado vira branch null e repositório inicial vira headOid null", () => {
    const detached = parseStatusV2(["# branch.oid abc", "# branch.head (detached)"].join(NUL) + NUL);
    expect(detached.branch).toBeNull();

    const initial = parseStatusV2(["# branch.oid (initial)", "# branch.head main"].join(NUL) + NUL);
    expect(initial.headOid).toBeNull();
    expect(initial.branch).toBe("main");
  });

  it("preserva espaços no caminho e distingue stage de worktree", () => {
    const h = "a".repeat(40);
    const raw = `1 M. N... 100644 100644 100644 ${h} ${h} dir com espaco/arquivo final.txt${NUL}` +
      `1 .M N... 100644 100644 100644 ${h} ${h} outro.txt${NUL}`;

    const [staged, unstaged] = parseStatusV2(raw).files;

    expect(staged).toMatchObject({ path: "dir com espaco/arquivo final.txt", index: "M", worktree: " " });
    expect(unstaged).toMatchObject({ path: "outro.txt", index: " ", worktree: "M" });
  });

  it("rename consome o registro seguinte como caminho original", () => {
    const h = "b".repeat(40);
    const raw = `2 R. N... 100644 100644 100644 ${h} ${h} R100 novo nome.txt${NUL}antigo nome.txt${NUL}` +
      `? solto.txt${NUL}`;

    const files = parseStatusV2(raw).files;

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "novo nome.txt", origPath: "antigo nome.txt", index: "R" });
    expect(files[1]).toMatchObject({ path: "solto.txt", untracked: true });
  });

  it("marca conflito de merge", () => {
    const h = "c".repeat(40);
    const raw = `u UU N... 100644 100644 100644 100644 ${h} ${h} ${h} conflito.txt${NUL}`;

    const [f] = parseStatusV2(raw).files;

    expect(f).toMatchObject({ path: "conflito.txt", conflicted: true, index: "U", worktree: "U" });
  });
});

describe("parseLog", () => {
  it("separa campos, pais múltiplos (merge) e refs", () => {
    const F = "\x1f";
    const R = "\x1e";
    const raw =
      ["h1", "p1 p2", "Ana", "ana@x.com", "2026-10-13T10:00:00-03:00", "HEAD -> main, tag: v1", "merge: x"].join(F) + R +
      "\n" +
      ["h2", "", "Beto", "b@x.com", "2026-10-12T09:00:00-03:00", "", "raiz"].join(F) + R;

    const [merge, root] = parseLog(raw);

    expect(merge).toMatchObject({ hash: "h1", parents: ["p1", "p2"], refs: ["HEAD -> main", "tag: v1"], subject: "merge: x" });
    expect(root).toMatchObject({ hash: "h2", parents: [], refs: [], authorName: "Beto" });
  });
});

describe("integração com git real", () => {
  let dir: string;

  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Teste",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "Teste",
        GIT_COMMITTER_EMAIL: "t@example.com",
      },
    });

  beforeEach(() => {
    // Nome longo: no CI o TEMP vem em formato 8.3 (RUNNER~1) e o git devolve o caminho expandido.
    dir = realpathSync.native(mkdtempSync(join(tmpdir(), "gitmonster-")));
    git("init", "-b", "main");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("repositório sem commits: log vazio e status com branch main", async () => {
    expect(await getLog(dir, 0, 10)).toEqual({ commits: [], hasMore: false });
    const s = await getStatus(dir);
    expect(s.branch).toBe("main");
    expect(s.headOid).toBeNull();
  });

  it("status reflete stage, modificação e arquivo novo em subpasta", async () => {
    writeFileSync(join(dir, "a.txt"), "1");
    git("add", "a.txt");
    git("commit", "-m", "primeiro");
    writeFileSync(join(dir, "a.txt"), "2");
    mkdirSync(join(dir, "sub dir"));
    writeFileSync(join(dir, "sub dir", "novo.txt"), "x");
    writeFileSync(join(dir, "staged.txt"), "s");
    git("add", "staged.txt");

    const byPath = Object.fromEntries((await getStatus(dir)).files.map((f) => [f.path, f]));

    expect(byPath["a.txt"]).toMatchObject({ index: " ", worktree: "M" });
    expect(byPath["staged.txt"]).toMatchObject({ index: "A", worktree: " " });
    expect(byPath["sub dir/novo.txt"]).toMatchObject({ untracked: true });
  });

  it("log pagina em ordem topológica e informa hasMore", async () => {
    for (const n of ["c1", "c2", "c3"]) {
      writeFileSync(join(dir, `${n}.txt`), n);
      git("add", ".");
      git("commit", "-m", n);
    }

    const p1 = await getLog(dir, 0, 2);
    const p2 = await getLog(dir, 2, 2);

    expect(p1.commits.map((c) => c.subject)).toEqual(["c3", "c2"]);
    expect(p1.hasMore).toBe(true);
    expect(p2.commits.map((c) => c.subject)).toEqual(["c1"]);
    expect(p2.hasMore).toBe(false);
    expect(p1.commits[0]?.parents).toEqual([p1.commits[1]?.hash]);
    expect(p1.commits[0]?.refs).toContain("HEAD -> main");
  });

  it("log inclui commits de outras branches (--all) com merge de dois pais", async () => {
    writeFileSync(join(dir, "base.txt"), "b");
    git("add", ".");
    git("commit", "-m", "base");
    git("checkout", "-b", "feat");
    writeFileSync(join(dir, "f.txt"), "f");
    git("add", ".");
    git("commit", "-m", "na feat");
    git("checkout", "main");
    writeFileSync(join(dir, "m.txt"), "m");
    git("add", ".");
    git("commit", "-m", "na main");
    git("merge", "--no-ff", "feat", "-m", "merge feat");

    const { commits } = await getLog(dir, 0, 50);

    expect(commits.map((c) => c.subject)).toEqual(expect.arrayContaining(["base", "na feat", "na main", "merge feat"]));
    expect(commits.find((c) => c.subject === "merge feat")?.parents).toHaveLength(2);
  });

  it("rejeita paginação inválida antes de chamar o git", async () => {
    await expect(getLog(dir, -1, 10)).rejects.toThrow(RangeError);
    await expect(getLog(dir, 0, 0)).rejects.toThrow(RangeError);
    await expect(getLog(dir, 0, 5001)).rejects.toThrow(RangeError);
  });

  it("resolveRepoRoot acha a raiz a partir de subpasta e falha fora de repositório", async () => {
    mkdirSync(join(dir, "x", "y"), { recursive: true });
    const root = await resolveRepoRoot(join(dir, "x", "y"));
    expect(root.toLowerCase().replace(/\\/g, "/")).toBe(dir.toLowerCase().replace(/\\/g, "/"));

    const outside = mkdtempSync(join(tmpdir(), "gitmonster-fora-"));
    try {
      await expect(resolveRepoRoot(outside)).rejects.toThrow();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
