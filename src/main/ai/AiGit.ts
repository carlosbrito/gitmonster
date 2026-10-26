import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConflicts, type ConflictBlock, type ConflictSegment } from "../../shared/conflict";
import type { FileChange } from "../../shared/types";
import { assertCommitHash, assertRefName } from "../git/Branches";
import { getConflict } from "../git/Conflicts";
import { getStatus, runGit } from "../git/GitService";
import { assertSafePath } from "../git/WorkTree";
import type { ConflictBlockInput } from "./templates";

/** Árvore vazia do Git: comparar com ela mostra o índice inteiro como "novo". */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const DIFF = ["-c", "core.quotepath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U3"];
/** Arquivos não rastreados entram no diff do WIP; o limite evita montar centenas de diffs. */
const MAX_UNTRACKED_DIFFS = 30;
const HISTORY_COUNT = 5;
const HISTORY_MESSAGE_CHARS = 600;
const CONTEXT_LINES = 20;
const PR_COMMITS = 60;
const PR_TEMPLATE_BYTES = 20_000;

export const hasCommits = (root: string) =>
  runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"], { okExitCodes: [1] }).then((out) => out.trim() !== "");

async function untrackedDiffs(root: string, files: readonly FileChange[]): Promise<string> {
  const untracked = files.filter((f) => f.untracked).slice(0, MAX_UNTRACKED_DIFFS);
  const parts = await Promise.all(
    // `--no-index` sai com 1 quando há diferença.
    untracked.map((f) =>
      runGit(root, [...DIFF, "--no-index", "--", "/dev/null", assertSafePath(f.path)], { okExitCodes: [1] }).catch(() => ""),
    ),
  );
  return parts.join("");
}

/** Diff do que vai no commit: o stage; com amend, o último commit somado ao stage. */
export async function commitDiff(root: string, amend: boolean): Promise<string> {
  if (!amend) return runGit(root, [...DIFF, "--cached"]);
  const parent = (await runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD~1"], { okExitCodes: [1] })).trim();
  return runGit(root, [...DIFF, "--cached", parent || EMPTY_TREE]);
}

/** Alterações locais: stage e árvore de trabalho (contra HEAD), mais os arquivos novos quando pedido. */
export async function worktreeDiff(root: string, includeUntracked: boolean): Promise<{ diff: string; untracked: string[] }> {
  const { files } = await getStatus(root);
  const tracked = (await hasCommits(root)) ? await runGit(root, [...DIFF, "HEAD"]) : (await runGit(root, [...DIFF, "--cached"])) + (await runGit(root, DIFF));
  const untracked = files.filter((f) => f.untracked).map((f) => f.path);
  const extra = includeUntracked ? await untrackedDiffs(root, files) : "";
  return { diff: tracked + extra, untracked };
}

/** Arquivos que o stash levaria (mesma regra do `stashPush`). */
export async function stashableFiles(root: string, includeUntracked: boolean): Promise<FileChange[]> {
  const { files } = await getStatus(root);
  return files.filter((f) => includeUntracked || !f.untracked);
}

export async function currentBranch(root: string): Promise<string | null> {
  return (await getStatus(root)).branch;
}

/** Mensagens completas dos últimos commits (opcionalmente só do autor), cortadas para não pesar no prompt. */
export async function recentMessages(root: string, authorEmail?: string): Promise<string[]> {
  if (!(await hasCommits(root))) return [];
  const args = ["log", "-n", String(HISTORY_COUNT), "--no-merges", "--format=%B", "-z", ...(authorEmail ? ["--fixed-strings", `--author=${authorEmail}`] : [])];
  const raw = await runGit(root, args).catch(() => "");
  return raw
    .split("\0")
    .map((m) => m.trim().slice(0, HISTORY_MESSAGE_CHARS))
    .filter(Boolean);
}

export async function authorEmail(root: string): Promise<string | undefined> {
  const email = (await runGit(root, ["config", "user.email"], { okExitCodes: [1] })).trim();
  return email === "" ? undefined : email;
}

/** Mensagem e diff de um commit (merge: contra o primeiro pai). */
export async function commitContent(root: string, hash: string): Promise<{ message: string; diff: string }> {
  const safe = assertCommitHash(hash);
  const [message, diff] = await Promise.all([
    runGit(root, ["show", "--no-patch", "--format=%B", "--end-of-options", safe]),
    runGit(root, ["-c", "core.quotepath=false", "show", "--no-color", "--no-ext-diff", "--no-textconv", "-U3", "--format=", "--first-parent", "-m", "--end-of-options", safe]),
  ]);
  return { message: message.trim(), diff };
}

const refExists = async (root: string, ref: string) =>
  (await runGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { okExitCodes: [1] })).trim() !== "";

/** Branch de destino: a informada, senão a padrão do remote (`origin/HEAD`), senão `main` ou `master`. */
export async function resolveBase(root: string, requested: string): Promise<string> {
  const wanted = requested.trim();
  if (wanted !== "") return assertRefName(wanted);
  const head = (await runGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { okExitCodes: [1] })).trim();
  if (head.startsWith("origin/")) return head.slice("origin/".length);
  for (const name of ["main", "master"]) if (await refExists(root, name) || (await refExists(root, `origin/${name}`))) return name;
  throw new Error("Informe a branch de destino do Pull Request.");
}

/** Prefere a cópia remota da base (`origin/x`), que é contra o que o GitHub compara; cai para a local. */
async function baseRef(root: string, base: string): Promise<string> {
  for (const ref of [`origin/${base}`, base]) if (await refExists(root, ref)) return ref;
  throw new Error(`A branch "${base}" não existe neste repositório.`);
}

const TEMPLATES = [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "pull_request_template.md", "PULL_REQUEST_TEMPLATE.md", "docs/pull_request_template.md"];

async function pullTemplate(root: string): Promise<string | null> {
  for (const file of TEMPLATES) {
    try {
      const text = await readFile(join(root, file), "utf8");
      if (text.trim() !== "") return text.slice(0, PR_TEMPLATE_BYTES);
    } catch {
      /* próximo candidato */
    }
  }
  return null;
}

/** Commits e diff de `base..HEAD`, mais o template de PR do repositório. */
export async function pullContent(root: string, requestedBase: string): Promise<{ base: string; head: string; commits: string; diff: string; template: string | null }> {
  const base = await resolveBase(root, requestedBase);
  const ref = await baseRef(root, base);
  const head = (await currentBranch(root)) ?? "HEAD";
  const count = Number((await runGit(root, ["rev-list", "--count", "--end-of-options", `${ref}..HEAD`])).trim());
  if (!Number.isFinite(count) || count === 0) throw new Error(`Não há commits para descrever em relação a ${base}.`);
  const [commits, diff, template] = await Promise.all([
    runGit(root, ["log", `-n${PR_COMMITS}`, "--no-merges", "--format=%h %s%n%b%n---", "--end-of-options", `${ref}..HEAD`]),
    runGit(root, [...DIFF, `${ref}...HEAD`]),
    pullTemplate(root),
  ]);
  return { base, head, commits: commits.trim(), diff, template };
}

const lastLines = (text: string, n: number) => text.split("\n").slice(-n - 1).join("\n").replace(/^\n+/, "");
const firstLines = (text: string, n: number) => text.split("\n").slice(0, n).join("\n");

/** Ancestral de cada bloco, para arquivos que o Git deixou sem `diff3`: refaz a mescla à parte, sem tocar no arquivo. */
async function baseTexts(root: string, path: string, expectedBlocks: number): Promise<(string | null)[] | null> {
  const dir = await mkdtemp(join(tmpdir(), "gitmonster-ai-"));
  try {
    const stage = async (n: 1 | 2 | 3) => runGit(root, ["show", `:${n}:${path}`], { okExitCodes: [128] }).then((t) => t, () => null);
    const [base, ours, theirs] = await Promise.all([stage(1), stage(2), stage(3)]);
    if (base === null || ours === null || theirs === null || base === "" || ours === "" || theirs === "") return null;
    const files = { base: join(dir, "base"), ours: join(dir, "ours"), theirs: join(dir, "theirs") };
    await Promise.all([writeFile(files.base, base), writeFile(files.ours, ours), writeFile(files.theirs, theirs)]);
    // `merge-file` sai com o número de conflitos (até 127).
    const merged = await runGit(root, ["merge-file", "-p", "--diff3", "-L", "ours", "-L", "base", "-L", "theirs", files.ours, files.base, files.theirs], {
      okExitCodes: Array.from({ length: 128 }, (_, i) => i),
    });
    const blocks = parseConflicts(merged).filter((s): s is ConflictBlock => s.kind === "conflict");
    return blocks.length === expectedBlocks ? blocks.map((b) => b.base) : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface ConflictContent {
  blocks: ConflictBlockInput[];
}

/** Os blocos do arquivo em conflito, na mesma ordem e contagem que o editor de conflitos usa. */
export async function conflictContent(root: string, path: string): Promise<ConflictContent> {
  const file = await getConflict(root, path);
  if (!file.editable) throw new Error(file.reason ?? "Este arquivo não pode ser resolvido com IA.");
  const segments: ConflictSegment[] = parseConflicts(file.content);
  const conflicts = segments.filter((s): s is ConflictBlock => s.kind === "conflict");
  if (conflicts.length === 0) throw new Error("Não há marcadores de conflito no arquivo.");
  const needBase = conflicts.some((c) => c.base === null);
  const derived = needBase ? await baseTexts(root, file.path, conflicts.length) : null;

  const blocks: ConflictBlockInput[] = [];
  segments.forEach((seg, i) => {
    if (seg.kind !== "conflict") return;
    const prev = segments[i - 1];
    const next = segments[i + 1];
    blocks.push({
      ours: seg.ours,
      theirs: seg.theirs,
      base: seg.base ?? derived?.[seg.id] ?? null,
      oursLabel: seg.oursLabel,
      theirsLabel: seg.theirsLabel,
      before: prev?.kind === "text" ? lastLines(prev.text, CONTEXT_LINES) : "",
      after: next?.kind === "text" ? firstLines(next.text, CONTEXT_LINES) : "",
    });
  });
  return { blocks };
}
