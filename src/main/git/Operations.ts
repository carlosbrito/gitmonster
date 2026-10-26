import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CommitDetail,
  CommitFile,
  FileDiff,
  Operation,
  OperationResult,
  RebaseCandidate,
  RebasePlan,
  RebaseStep,
  ResetMode,
} from "../../shared/types";
import { assertCommitHash, assertRefName, checkout, assertStartPoint, NETWORK_TIMEOUT_MS, pickRemote } from "./Branches";
import { getStatus, GitError, runGit } from "./GitService";
import { assertSafePath, parseDiff } from "./WorkTree";

const FIELD = "\x1f";
const RECORD = "\x1e";

/** Impede que o git abra um editor (não há terminal): usa a mensagem que ele já preparou. */
const NO_EDITOR = { GIT_EDITOR: "true" };

/**
 * Operações que podem parar no meio. Depois do erro, o que decide se "parou aguardando o usuário"
 * é o marcador em .git (status.operation), não o texto da mensagem, que varia por versão/idioma.
 */
async function runResumable(
  root: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): Promise<OperationResult> {
  try {
    await runGit(root, args, { env: { ...NO_EDITOR, ...extraEnv } });
    return { conflicted: false };
  } catch (e) {
    if (e instanceof GitError && (await getStatus(root)).operation !== null) {
      return { conflicted: true, message: e.stderr.trim() };
    }
    throw e;
  }
}

async function currentOperation(root: string): Promise<Operation> {
  const { operation } = await getStatus(root);
  if (!operation) throw new Error("Não há nenhuma operação em andamento.");
  return operation;
}

export async function operationContinue(root: string): Promise<OperationResult> {
  const op = await currentOperation(root);
  return runResumable(root, [op, "--continue"]);
}

export async function operationAbort(root: string): Promise<void> {
  const op = await currentOperation(root);
  await runGit(root, [op, "--abort"], { env: NO_EDITOR });
}

/** Pular o passo atual: só faz sentido para cherry-pick, revert e rebase (o merge não tem passos). */
export async function operationSkip(root: string): Promise<OperationResult> {
  const op = await currentOperation(root);
  if (op === "merge") throw new Error("Um merge não pode ser pulado: conclua ou aborte.");
  return runResumable(root, [op, "--skip"]);
}

async function parentCount(root: string, hash: string): Promise<number> {
  const out = await runGit(root, ["rev-list", "--parents", "-n", "1", "--end-of-options", assertCommitHash(hash)]);
  return out.trim().split(" ").length - 1;
}

/** Em commit de merge o git exige dizer qual pai é a "linha principal": usamos o primeiro. */
export async function cherryPick(root: string, hash: string): Promise<OperationResult> {
  const mainline = (await parentCount(root, hash)) > 1 ? ["-m", "1"] : [];
  return runResumable(root, ["cherry-pick", ...mainline, "--end-of-options", assertCommitHash(hash)]);
}

export async function revertCommit(root: string, hash: string): Promise<OperationResult> {
  const mainline = (await parentCount(root, hash)) > 1 ? ["-m", "1"] : [];
  return runResumable(root, ["revert", "--no-edit", ...mainline, "--end-of-options", assertCommitHash(hash)]);
}

const RESET_MODES: readonly ResetMode[] = ["soft", "mixed", "hard"];

/** `hard` descarta alterações não commitadas: a confirmação é responsabilidade da interface. */
export async function reset(root: string, hash: string, mode: ResetMode): Promise<void> {
  if (!RESET_MODES.includes(mode)) throw new Error("Modo de reset inválido.");
  await runGit(root, ["reset", `--${mode}`, "--end-of-options", assertCommitHash(hash)]);
}

export async function createTag(root: string, name: string, hash: string | null, message: string): Promise<void> {
  const safe = assertRefName(name);
  const text = message.trim();
  const target = hash === null ? [] : [assertCommitHash(hash)];
  // Com mensagem vira tag anotada (guarda autor/data); sem mensagem, tag leve.
  await runGit(root, ["tag", ...(text ? ["--annotate", "--message", text] : []), "--end-of-options", safe, ...target]);
}

export async function deleteTag(root: string, name: string): Promise<void> {
  await runGit(root, ["tag", "--delete", "--end-of-options", assertRefName(name)]);
}

export async function pushTag(root: string, name: string): Promise<void> {
  const remote = await pickRemote(root);
  await runGit(root, ["push", remote, `refs/tags/${assertRefName(name)}`], { timeoutMs: NETWORK_TIMEOUT_MS });
}

/**
 * Push que reescreve a branch remota, mas só se ninguém publicou nada novo desde o último fetch
 * (`--force-with-lease`). A confirmação é responsabilidade da interface.
 */
export async function forcePush(root: string): Promise<void> {
  const status = await getStatus(root);
  if (!status.branch) throw new Error("HEAD destacado: não há branch para enviar.");
  if (!status.upstream) throw new Error("A branch não tem upstream: faça um push normal primeiro.");
  await runGit(root, ["push", "--force-with-lease"], { timeoutMs: NETWORK_TIMEOUT_MS });
}

// ---------- rebase ----------

export async function rebase(root: string, onto: string): Promise<OperationResult> {
  await assertCanRebase(root);
  return runResumable(root, ["rebase", "--end-of-options", assertStartPoint(onto)]);
}

/**
 * Rebase de `branch` em cima de `onto` (arrastar uma branch sobre outra e escolher "rebase"). O Git só faz
 * rebase da branch atual, então muda para `branch` antes, se preciso, e fica nela. Só branches locais podem
 * ser reescritas; `onto` pode ser qualquer referência. Conflito deixa o rebase em andamento.
 */
export async function rebaseBranches(root: string, branch: string, onto: string): Promise<OperationResult> {
  const moving = assertRefName(branch);
  const base = assertRefName(onto);
  if (moving === base) throw new Error("Escolha duas branches diferentes.");

  const status = await getStatus(root);
  if (status.operation) throw new Error("Já existe uma operação em andamento: conclua ou aborte antes.");

  try {
    await runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${moving}`]);
  } catch {
    throw new Error(`"${moving}" não é uma branch local: só é possível fazer rebase de uma branch local.`);
  }
  try {
    await runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${base}^{commit}`]);
  } catch {
    throw new Error(`A referência "${base}" não existe.`);
  }

  if (status.branch !== moving) await checkout(root, { kind: "local", name: moving });
  return runResumable(root, ["rebase", "--end-of-options", base]);
}

async function assertCanRebase(root: string): Promise<void> {
  const status = await getStatus(root);
  // Primeiro a operação em andamento: durante um rebase parado o HEAD fica destacado, e a
  // mensagem útil é "conclua ou aborte", não "faça checkout de uma branch".
  if (status.operation) throw new Error("Já existe uma operação em andamento: conclua ou aborte antes.");
  if (!status.branch) throw new Error("HEAD destacado: faça checkout de uma branch antes do rebase.");
}

export async function rebasePlan(root: string, onto: string): Promise<RebasePlan> {
  const raw = await runGit(root, [
    "log",
    "--reverse",
    "--max-count=500",
    `--format=%H${FIELD}%P${FIELD}%s${RECORD}`,
    `${assertStartPoint(onto)}..HEAD`,
  ]);
  const commits: RebaseCandidate[] = [];
  let hasMerges = false;
  for (const record of raw.split(RECORD)) {
    const text = record.replace(/^\n/, "");
    if (!text) continue;
    const [hash = "", parents = "", subject = ""] = text.split(FIELD);
    if (parents.split(" ").filter(Boolean).length > 1) hasMerges = true;
    commits.push({ hash, subject });
  }
  return { commits, hasMerges };
}

const ACTIONS = ["pick", "squash", "fixup", "drop"];

/**
 * Rebase interativo sem editor: o roteiro (todo) é gerado aqui e entregue ao git por
 * GIT_SEQUENCE_EDITOR, que apenas copia o nosso arquivo por cima do todo dele.
 * Só aceita um plano que seja permutação exata do intervalo, para o renderer não poder
 * injetar linhas arbitrárias (como `exec`) no roteiro.
 */
export async function rebaseInteractive(root: string, onto: string, steps: readonly RebaseStep[]): Promise<OperationResult> {
  await assertCanRebase(root);
  const plan = await rebasePlan(root, onto);
  if (plan.hasMerges) throw new Error("O intervalo contém merges; o rebase interativo os achataria.");
  if (plan.commits.length === 0) throw new Error("Não há commits para reordenar.");

  const expected = new Set(plan.commits.map((c) => c.hash));
  const given = new Set(steps.map((s) => s.hash));
  if (steps.length !== expected.size || given.size !== expected.size || [...given].some((h) => !expected.has(h))) {
    throw new Error("O plano não corresponde aos commits do intervalo. Recarregue e tente de novo.");
  }
  if (steps.some((s) => !ACTIONS.includes(s.action))) throw new Error("Ação de rebase inválida.");
  const firstKept = steps.find((s) => s.action !== "drop");
  if (!firstKept) throw new Error("O plano descarta todos os commits.");
  if (firstKept.action !== "pick") throw new Error("O primeiro commit mantido precisa ser 'pick' (não há anterior para juntar).");

  const dir = mkdtempSync(join(tmpdir(), "gitmonster-rebase-"));
  try {
    const todo = join(dir, "todo.txt");
    writeFileSync(todo, steps.map((s) => `${s.action} ${s.hash}`).join("\n") + "\n");
    // O git roda o editor via sh, que entende C:/...; `cp <nosso todo> <todo do git>` substitui o roteiro.
    const forward = todo.split("\\").join("/");
    return await runResumable(root, ["rebase", "--interactive", "--end-of-options", assertStartPoint(onto)], {
      GIT_SEQUENCE_EDITOR: `cp "${forward}"`,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- detalhe do commit ----------

/** Lê `--name-status -z`: "M\0path\0" e, para renomear/copiar, "R100\0antigo\0novo\0". */
export function parseNameStatus(raw: string): CommitFile[] {
  const tokens = raw.split("\0");
  const files: CommitFile[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!status) continue;
    const letter = status[0]!;
    if (letter === "R" || letter === "C") {
      const origPath = tokens[++i] ?? "";
      const path = tokens[++i] ?? "";
      files.push({ status: letter, path, origPath });
    } else {
      files.push({ status: letter, path: tokens[++i] ?? "" });
    }
  }
  return files;
}

export async function commitDetail(root: string, hash: string): Promise<CommitDetail> {
  const safe = assertCommitHash(hash);
  const [meta, names] = await Promise.all([
    runGit(root, ["show", "--no-patch", `--format=%H${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%cn${FIELD}%B`, "--end-of-options", safe]),
    runGit(root, ["show", "--no-color", "--name-status", "-M", "-z", "--format=", "--first-parent", "-m", "--end-of-options", safe]),
  ]);
  const [h = "", parents = "", authorName = "", authorEmail = "", authorDate = "", committerName = "", ...rest] = meta.split(FIELD);
  return {
    hash: h,
    parents: parents ? parents.split(" ") : [],
    authorName,
    authorEmail,
    authorDate,
    committerName,
    message: rest.join(FIELD).trim(),
    files: parseNameStatus(names),
  };
}

export async function commitFileDiff(root: string, hash: string, path: string): Promise<FileDiff> {
  const raw = await runGit(root, [
    "-c",
    "core.quotepath=false",
    "show",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "-U3",
    "--format=",
    "--first-parent",
    "-m",
    "--end-of-options",
    assertCommitHash(hash),
    "--",
    assertSafePath(path),
  ]);
  const { binary, hunks } = parseDiff(raw);
  return { path, binary, hunks };
}
