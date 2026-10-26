import type {
  BranchInfo,
  CheckoutTarget,
  OperationResult,
  PullMode,
  RefsSnapshot,
  RemoteCheckoutPlan,
  RemoteBranchInfo,
  StashInfo,
  TagInfo,
} from "../../shared/types";
import { getStatus, GitError, runGit } from "./GitService";
import { assertRemoteName, listRemotes } from "./Remotes";

const FIELD = "\x1f";
const RECORD = "\x1e";
export const NETWORK_TIMEOUT_MS = 120_000;

/**
 * Valida um nome de branch/ref vindo do renderer segundo as regras de `git check-ref-format`.
 * Recusa principalmente o que viraria opção (`-x`) ou sintaxe de revisão (`a..b`, `a@{1}`).
 */
export function assertRefName(name: string): string {
  const invalid = () => new Error(`Nome de branch inválido: "${String(name).slice(0, 80)}".`);
  if (typeof name !== "string" || name.length === 0 || name.length > 255) throw invalid();
  if (name.startsWith("-") || name === "@") throw invalid();
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) throw invalid();
  if (name.includes("..") || name.includes("@{") || name.endsWith("/") || name.endsWith(".") || name.endsWith(".lock")) {
    throw invalid();
  }
  if (name.split("/").some((part) => part === "" || part.startsWith("."))) throw invalid();
  return name;
}

export function assertCommitHash(hash: string): string {
  if (typeof hash !== "string" || !/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error("Hash de commit inválido.");
  return hash;
}

export function assertStashIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 100_000) throw new Error("Índice de stash inválido.");
  return index;
}

/** Ponto de partida de uma nova branch: um nome de ref ou um hash de commit. */
export function assertStartPoint(value: string): string {
  return /^[0-9a-f]{7,40}$/i.test(value) ? value : assertRefName(value);
}

function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  if (track.includes("gone")) return { ahead: 0, behind: 0, gone: true };
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0, gone: false };
}

export async function listRefs(root: string): Promise<RefsSnapshot> {
  const format =
    ["%(refname)", "%(refname:short)", "%(objectname)", "%(*objectname)", "%(upstream:short)", "%(upstream:track)", "%(HEAD)"].join(
      FIELD,
    ) + RECORD;

  const [refsRaw, stashRaw] = await Promise.all([
    runGit(root, ["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes", "refs/tags"]),
    runGit(root, ["stash", "list", `--format=%gd${FIELD}%gs${RECORD}`]),
  ]);

  const snapshot: RefsSnapshot = { branches: [], remoteBranches: [], tags: [], stashes: [], remotes: await listRemotes(root) };

  for (const record of refsRaw.split(RECORD)) {
    const text = record.replace(/^\n/, "");
    if (!text) continue;
    const [ref = "", short = "", oid = "", peeled = "", upstream = "", track = "", head = ""] = text.split(FIELD);

    if (ref.startsWith("refs/heads/")) {
      const branch: BranchInfo = {
        name: short,
        isCurrent: head === "*",
        upstream: upstream || null,
        ...parseTrack(track),
        hash: oid,
      };
      snapshot.branches.push(branch);
    } else if (ref.startsWith("refs/remotes/")) {
      const full = ref.slice("refs/remotes/".length);
      const slash = full.indexOf("/");
      // `refs/remotes/origin/HEAD` é um alias simbólico, não uma branch.
      if (slash === -1 || full.endsWith("/HEAD")) continue;
      const remote: RemoteBranchInfo = { name: full, remote: full.slice(0, slash), hash: oid };
      snapshot.remoteBranches.push(remote);
    } else if (ref.startsWith("refs/tags/")) {
      const tag: TagInfo = { name: short, hash: peeled || oid };
      snapshot.tags.push(tag);
    }
  }

  for (const record of stashRaw.split(RECORD)) {
    const text = record.replace(/^\n/, "");
    if (!text) continue;
    const [gd = "", message = ""] = text.split(FIELD);
    const m = /^stash@\{(\d+)\}$/.exec(gd);
    if (m) {
      const stash: StashInfo = { index: Number(m[1]), message };
      snapshot.stashes.push(stash);
    }
  }
  return snapshot;
}

/** Já existe branch local com o nome da remota (sem o prefixo do remote)? E é um commit diferente? */
export async function remoteCheckoutPlan(root: string, remoteRef: string): Promise<RemoteCheckoutPlan> {
  const ref = assertRefName(remoteRef);
  const remoteName = (await listRemotes(root)).map((r) => r.name).find((n) => ref.startsWith(n + "/"));
  const localName = remoteName ? ref.slice(remoteName.length + 1) : null;
  if (!localName || !(await localBranchExists(root, localName))) return { localName: null, differs: false, ahead: 0, behind: 0 };
  const [local, remote] = await Promise.all([
    runGit(root, ["rev-parse", "--verify", "--end-of-options", `refs/heads/${localName}`]),
    runGit(root, ["rev-parse", "--verify", "--end-of-options", `refs/remotes/${ref}`]),
  ]);
  if (local.trim() === remote.trim()) return { localName, differs: false, ahead: 0, behind: 0 };
  const counts = (await runGit(root, ["rev-list", "--left-right", "--count", `refs/heads/${localName}...refs/remotes/${ref}`])).trim().split(/\s+/);
  return { localName, differs: true, ahead: Number(counts[0] ?? 0), behind: Number(counts[1] ?? 0) };
}

async function localBranchExists(root: string, name: string): Promise<boolean> {
  try {
    await runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function checkout(root: string, target: CheckoutTarget): Promise<void> {
  switch (target.kind) {
    case "local":
      await runGit(root, ["switch", "--end-of-options", assertRefName(target.name)]);
      return;
    case "remote":
      // Cria a branch local com o mesmo nome rastreando o remoto; se ela já existe, apenas muda para ela
      // (o `switch --track` falharia com "a branch named ... already exists").
      const remoteRef = assertRefName(target.name);
      const plan = await remoteCheckoutPlan(root, remoteRef);
      if (plan.localName === null) {
        await runGit(root, ["switch", "--track", "--end-of-options", remoteRef]);
        return;
      }
      if (plan.differs) {
        if (!target.matchRemote) {
          throw new Error(`A branch local "${plan.localName}" é diferente de "${remoteRef}": confirme para igualá-la à remota.`);
        }
        // reset --hard descartaria alterações não commitadas: recusa antes de mexer em qualquer coisa.
        if ((await getStatus(root)).files.length > 0) {
          throw new Error("Há alterações não commitadas: faça commit, stash ou descarte antes de igualar a branch local à remota.");
        }
        await runGit(root, ["switch", "--end-of-options", plan.localName]);
        await runGit(root, ["reset", "--hard", "--end-of-options", remoteRef]);
        return;
      }
      await runGit(root, ["switch", "--end-of-options", plan.localName]);
      return;
    case "commit":
      await runGit(root, ["switch", "--detach", "--end-of-options", assertCommitHash(target.hash)]);
      return;
  }
}

export async function createBranch(
  root: string,
  name: string,
  startPoint: string | null,
  checkoutAfter: boolean,
): Promise<void> {
  const safe = assertRefName(name);
  const start = startPoint === null ? [] : [assertStartPoint(startPoint)];
  if (checkoutAfter) await runGit(root, ["switch", "--create", safe, ...(start.length ? ["--end-of-options"] : []), ...start]);
  else await runGit(root, ["branch", "--end-of-options", safe, ...start]);
}

/** `force=false` usa `-d`, que recusa branch com commits ainda não mesclados. */
export async function deleteBranch(root: string, name: string, force: boolean): Promise<void> {
  await runGit(root, ["branch", force ? "-D" : "-d", "--end-of-options", assertRefName(name)]);
}

/** Renomeia uma branch local (a atual inclusive). Recusa se já existir uma com o novo nome. */
export async function renameBranch(root: string, oldName: string, newName: string): Promise<void> {
  const from = assertRefName(oldName);
  const to = assertRefName(newName);
  await runGit(root, ["branch", "-m", "--end-of-options", from, to]);
}

/** Apaga a branch no servidor (`git push <remote> --delete <branch>`). A cópia local de rastreamento some junto. */
export async function deleteRemoteBranch(root: string, remote: string, branch: string): Promise<void> {
  const safeRemote = assertRemoteName(remote);
  const safeBranch = assertRefName(branch);
  if (!(await listRemotes(root)).some((r) => r.name === safeRemote)) throw new Error(`O remote "${safeRemote}" não existe.`);
  await runGit(root, ["push", safeRemote, "--delete", safeBranch], { timeoutMs: NETWORK_TIMEOUT_MS });
}

export async function merge(root: string, name: string): Promise<OperationResult> {
  try {
    await runGit(root, ["merge", "--no-edit", "--end-of-options", assertRefName(name)]);
    return { conflicted: false };
  } catch (e) {
    // Conflito não é falha: o merge fica em andamento para o usuário resolver ou abortar.
    if (e instanceof GitError && /CONFLICT|Automatic merge failed/i.test(e.stderr)) {
      return { conflicted: true, message: e.stderr.trim() };
    }
    throw e;
  }
}

/**
 * Merge de `source` em `target` (arrastar uma branch sobre outra). O Git só mescla na branch atual, então, se
 * `target` não for a atual, muda para ela antes (o Git recusa a troca se houver alterações que conflitem) e
 * fica nela. Conflito deixa o merge em andamento em `target`, como num merge comum.
 */
export async function mergeBranches(root: string, source: string, target: string): Promise<OperationResult> {
  const from = assertRefName(source);
  const into = assertRefName(target);
  if (from === into) throw new Error("Escolha duas branches diferentes.");

  const status = await getStatus(root);
  if (status.operation) throw new Error("Já existe uma operação em andamento: conclua ou aborte antes.");

  // O destino precisa ser uma branch local (não dá para mesclar "dentro" de uma branch remota ou de uma tag).
  try {
    await runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${into}`]);
  } catch {
    throw new Error(`"${into}" não é uma branch local: só é possível mesclar dentro de uma branch local.`);
  }
  // A origem pode ser local ou remota, mas tem que existir.
  try {
    await runGit(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${from}^{commit}`]);
  } catch {
    throw new Error(`A branch "${from}" não existe.`);
  }

  if (status.branch !== into) await checkout(root, { kind: "local", name: into });
  return merge(root, from);
}

export async function fetchAll(root: string): Promise<void> {
  await runGit(root, ["fetch", "--all", "--prune"], { timeoutMs: NETWORK_TIMEOUT_MS });
}

const PULL_ARGS: Record<PullMode, string[]> = {
  // Só avança em fast-forward: nunca cria commit de merge sem o usuário pedir.
  "ff-only": ["pull", "--ff-only"],
  merge: ["pull", "--no-rebase", "--no-edit"],
  rebase: ["pull", "--rebase"],
};

/**
 * Pull no modo escolhido. `merge` e `rebase` podem parar em conflito: isso não é falha, a operação fica em
 * andamento (decidido pelo marcador em .git) para o usuário resolver, continuar ou abortar.
 */
export async function pull(root: string, mode: PullMode = "ff-only"): Promise<OperationResult> {
  const args = PULL_ARGS[mode];
  if (!args) throw new Error("Modo de pull inválido.");
  try {
    await runGit(root, args, { timeoutMs: NETWORK_TIMEOUT_MS, env: { GIT_EDITOR: "true" } });
    return { conflicted: false };
  } catch (e) {
    if (e instanceof GitError && /not possible to fast-forward|diverging branches/i.test(e.stderr)) {
      throw new Error("A branch local e a remota divergiram. Troque o modo do pull para merge ou rebase e tente de novo.");
    }
    if (e instanceof GitError && /no tracking information/i.test(e.stderr)) {
      throw new Error("Esta branch não tem upstream configurado. Faça push primeiro.");
    }
    if (e instanceof GitError && mode !== "ff-only" && (await getStatus(root)).operation !== null) {
      return { conflicted: true, message: e.stderr.trim() };
    }
    throw e;
  }
}

export async function push(root: string): Promise<void> {
  const status = await getStatus(root);
  if (!status.branch) throw new Error("HEAD destacado: não há branch para enviar.");

  if (status.upstream) {
    await runGit(root, ["push"], { timeoutMs: NETWORK_TIMEOUT_MS });
    return;
  }
  // Primeira publicação: escolhe o remote (origin se existir) e grava o upstream.
  const remote = await pickRemote(root);
  await runGit(root, ["push", "--set-upstream", remote, status.branch], { timeoutMs: NETWORK_TIMEOUT_MS });
}

/** Remote padrão: `origin` se existir, senão o primeiro configurado. */
export async function pickRemote(root: string): Promise<string> {
  const remotes = (await runGit(root, ["remote"])).split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!remote) throw new Error("Nenhum remote configurado neste repositório.");
  return remote;
}

export async function stashPush(root: string, message: string, includeUntracked: boolean): Promise<void> {
  const { files } = await getStatus(root);
  if (!files.some((f) => includeUntracked || !f.untracked)) throw new Error("Não há alterações para guardar no stash.");
  const text = message.trim();
  await runGit(root, [
    "stash",
    "push",
    ...(includeUntracked ? ["--include-untracked"] : []),
    ...(text ? ["--message", text] : []),
  ]);
}

export async function stashPop(root: string, index: number): Promise<void> {
  await runGit(root, ["stash", "pop", `stash@{${assertStashIndex(index)}}`]);
}

export async function stashDrop(root: string, index: number): Promise<void> {
  await runGit(root, ["stash", "drop", `stash@{${assertStashIndex(index)}}`]);
}
