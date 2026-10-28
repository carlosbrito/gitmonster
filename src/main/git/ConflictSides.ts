import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConflictSides, Operation, RepoStatus } from "../../shared/types";
import { runGit } from "./GitService";

/** Commit citado por um lado (cherry-pick, revert, passo do rebase). */
export interface CommitRef {
  hash: string;
  subject: string;
}

/** O que o git deixou em .git sobre a operação; null = não existe ou não deu para ler. */
export interface SideFacts {
  branch: string | null;
  /** SHA curto de HEAD. */
  head: string | null;
  /** 1ª linha de .git/MERGE_MSG. */
  mergeMsg: string | null;
  /** SHA curto de MERGE_HEAD. */
  mergeHead: string | null;
  /** CHERRY_PICK_HEAD, REVERT_HEAD ou REBASE_HEAD, conforme a operação. */
  commit: CommitRef | null;
  /** Branch sendo rebaseada (sem refs/heads/). */
  rebaseBranch: string | null;
  /** Base do rebase: nome da branch ou SHA curto. */
  rebaseOnto: string | null;
}

/** A linha que o git grava sempre em inglês: "Merge [remote-tracking ]branch 'x'[ into y]", "Merge tag 'x'", "Merge commit 'x'". */
export function mergedRef(mergeMsg: string | null): string | null {
  const m = /^Merge (?:remote-tracking branch|branch|tag|commit) '(.+?)'/.exec(mergeMsg ?? "");
  return m ? m[1]! : null;
}

/** Monta os lados a partir dos fatos; null quando falta o essencial (o editor cai nos rótulos dos marcadores). */
export function describeSides(op: Operation | null, f: SideFacts): ConflictSides | null {
  const current = f.branch ? { name: f.branch, detail: null } : f.head ? { name: "HEAD destacado", detail: f.head } : null;
  switch (op) {
    case "merge": {
      const theirs = mergedRef(f.mergeMsg) ?? f.mergeHead;
      return current && theirs ? { ours: current, theirs: { name: theirs, detail: null } } : null;
    }
    case "cherry-pick":
      return current && f.commit ? { ours: current, theirs: { name: f.commit.hash, detail: f.commit.subject } } : null;
    case "revert":
      return current && f.commit ? { ours: current, theirs: { name: f.commit.hash, detail: `revertendo: ${f.commit.subject}` } } : null;
    case "rebase":
      if (!f.rebaseOnto) return null;
      return {
        ours: { name: f.rebaseOnto, detail: "base do rebase" },
        theirs: {
          name: f.rebaseBranch ?? "HEAD destacado",
          detail: f.commit ? `${f.commit.hash} ${f.commit.subject}` : null,
        },
      };
    default:
      return null;
  }
}

async function text(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

async function commitRef(root: string, rev: string): Promise<CommitRef | null> {
  try {
    const [hash = "", subject = ""] = (await runGit(root, ["log", "-1", "--format=%h%x1f%s", rev, "--"])).trim().split("\x1f");
    return hash ? { hash, subject } : null;
  } catch {
    return null;
  }
}

async function shortHash(root: string, rev: string): Promise<string | null> {
  try {
    return (await runGit(root, ["rev-parse", "--short", rev])).trim() || null;
  } catch {
    return null;
  }
}

/** Nome de branch (local ou remota) que aponta exatamente para o commit; senão o SHA curto. */
async function branchAt(root: string, oid: string): Promise<string | null> {
  try {
    const name = (await runGit(root, ["name-rev", "--name-only", "--no-undefined", "--refs=refs/heads/*", "--refs=refs/remotes/*", oid])).trim();
    if (name && !/[~^]/.test(name)) return name.replace(/^remotes\//, "");
  } catch {
    /* sem nome: cai no SHA */
  }
  return shortHash(root, oid);
}

async function rebaseDir(gitDir: string): Promise<string | null> {
  for (const d of ["rebase-merge", "rebase-apply"]) {
    if ((await text(join(gitDir, d, "onto"))) !== null) return join(gitDir, d);
  }
  return null;
}

async function collectFacts(root: string, status: RepoStatus): Promise<SideFacts> {
  const gitDir = (await runGit(root, ["rev-parse", "--absolute-git-dir"])).trim();
  const facts: SideFacts = {
    branch: status.branch,
    head: status.branch ? null : await shortHash(root, "HEAD"),
    mergeMsg: null,
    mergeHead: null,
    commit: null,
    rebaseBranch: null,
    rebaseOnto: null,
  };
  switch (status.operation) {
    case "merge":
      facts.mergeMsg = (await text(join(gitDir, "MERGE_MSG")))?.split(/\r?\n/)[0] ?? null;
      facts.mergeHead = await shortHash(root, "MERGE_HEAD");
      break;
    case "cherry-pick":
      facts.commit = await commitRef(root, "CHERRY_PICK_HEAD");
      break;
    case "revert":
      facts.commit = await commitRef(root, "REVERT_HEAD");
      break;
    case "rebase": {
      const dir = await rebaseDir(gitDir);
      if (!dir) break;
      const onto = await text(join(dir, "onto"));
      facts.rebaseOnto = onto ? await branchAt(root, onto) : null;
      const headName = await text(join(dir, "head-name"));
      facts.rebaseBranch = headName?.startsWith("refs/heads/") ? headName.slice("refs/heads/".length) : null;
      facts.commit = await commitRef(root, "REBASE_HEAD");
      break;
    }
  }
  return facts;
}

/** Quem é cada lado do conflito. Nunca lança: qualquer falha vira null e o editor usa os marcadores. */
export async function conflictSides(root: string, status: RepoStatus): Promise<ConflictSides | null> {
  if (!status.operation) return null;
  try {
    return describeSides(status.operation, await collectFacts(root, status));
  } catch {
    return null;
  }
}
