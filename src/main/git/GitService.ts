import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordGitCommand } from "./GitLog";
import type { Commit, FileChange, LogPage, Operation, RepoStatus } from "../../shared/types";

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: readonly string[],
    readonly stderr: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "GitError";
  }
}

const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Executa `git` sem shell (argumentos em array), com saída previsível.
 * GIT_OPTIONAL_LOCKS=0 evita que leituras (status) criem index.lock e
 * briguem com outras ferramentas abertas no mesmo repositório.
 */
export interface RunGitOptions {
  /** Conteúdo enviado ao stdin do git (ex.: patch para `git apply`, mensagem para `commit -F -`). */
  input?: string;
  /** Códigos de saída não-zero que não são erro (ex.: `diff --no-index` sai com 1 quando há diferença). */
  okExitCodes?: readonly number[];
  /** Mata o processo após este tempo (operações de rede). Sem isso, o git espera indefinidamente. */
  timeoutMs?: number;
  /** Variáveis de ambiente extras (ex.: GIT_EDITOR=true para concluir operações sem abrir editor). */
  env?: Record<string, string>;
}

export function runGit(cwd: string, args: readonly string[], options: RunGitOptions = {}): Promise<string> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      [...args],
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: "utf8",
        ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
        // GIT_TERMINAL_PROMPT=0: sem TTY o git não pode perguntar senha; falha rápido em vez de travar.
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", ...options.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed && options.timeoutMs !== undefined) {
            recordGitCommand({ cwd, args, startedAt, exitCode: null, ok: false, error: "tempo limite excedido" });
            reject(new GitError(`git ${args[0]} excedeu o tempo limite de ${options.timeoutMs / 1000}s.`, args, stderr, null));
            return;
          }
          const code = typeof error.code === "number" ? error.code : null;
          if (code !== null && options.okExitCodes?.includes(code)) {
            recordGitCommand({ cwd, args, startedAt, exitCode: code, ok: true });
            resolve(stdout);
            return;
          }
          // `git commit` e `git apply` às vezes explicam a falha no stdout, não no stderr.
          const detail = stderr.trim() || stdout.trim() || error.message;
          recordGitCommand({ cwd, args, startedAt, exitCode: code, ok: false, error: detail });
          reject(new GitError(`git ${args.join(" ")} falhou: ${detail}`, args, stderr || stdout, code));
          return;
        }
        recordGitCommand({ cwd, args, startedAt, exitCode: 0, ok: true });
        resolve(stdout);
      },
    );
    if (options.input !== undefined) {
      // Se o git encerrar antes de ler tudo, o EPIPE no stdin não deve derrubar o processo.
      child.stdin?.on("error", () => {});
      child.stdin?.end(options.input);
    }
  });
}

/** Resolve a raiz canônica do repositório que contém `dir`. */
export async function resolveRepoRoot(dir: string): Promise<string> {
  const out = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  return out.trim();
}

/** Divide `line` em até `n` campos por espaço; o resto (com espaços) vira o último campo. */
function splitFields(line: string, n: number): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < n - 1; i++) {
    const idx = line.indexOf(" ", start);
    if (idx === -1) break;
    parts.push(line.slice(start, idx));
    start = idx + 1;
  }
  parts.push(line.slice(start));
  return parts;
}

/**
 * Parser de `git status --porcelain=v2 -z --branch`.
 * Com -z os registros são separados por NUL e caminhos não são escapados;
 * entradas de rename/cópia (tipo 2) trazem o caminho original no registro seguinte.
 */
export function parseStatusV2(raw: string): RepoStatus {
  const status: RepoStatus = {
    branch: null,
    headOid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    operation: null,
    files: [],
  };
  const records = raw.split("\0");
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec) continue;

    if (rec.startsWith("# ")) {
      const header = rec.slice(2);
      if (header.startsWith("branch.oid ")) {
        const oid = header.slice("branch.oid ".length);
        status.headOid = oid === "(initial)" ? null : oid;
      } else if (header.startsWith("branch.head ")) {
        const head = header.slice("branch.head ".length);
        status.branch = head === "(detached)" ? null : head;
      } else if (header.startsWith("branch.upstream ")) {
        status.upstream = header.slice("branch.upstream ".length);
      } else if (header.startsWith("branch.ab ")) {
        const m = /^branch\.ab \+(\d+) -(\d+)$/.exec(header);
        if (m) {
          status.ahead = Number(m[1]);
          status.behind = Number(m[2]);
        }
      }
      continue;
    }

    const kind = rec[0];
    if (kind === "1") {
      const f = splitFields(rec, 9);
      const xy = f[1] ?? "..";
      status.files.push(change(f[8] ?? "", xy));
    } else if (kind === "2") {
      const f = splitFields(rec, 10);
      const xy = f[1] ?? "..";
      const origPath = records[++i] ?? "";
      status.files.push({ ...change(f[9] ?? "", xy), origPath });
    } else if (kind === "u") {
      const f = splitFields(rec, 11);
      const xy = f[1] ?? "..";
      status.files.push({ ...change(f[10] ?? "", xy), conflicted: true });
    } else if (kind === "?") {
      status.files.push({
        path: rec.slice(2),
        index: " ",
        worktree: " ",
        untracked: true,
        conflicted: false,
      });
    }
    // kind === "!" (ignorado): não listamos.
  }
  return status;
}

function change(path: string, xy: string): FileChange {
  const norm = (c: string | undefined) => (!c || c === "." ? " " : c);
  return {
    path,
    index: norm(xy[0]),
    worktree: norm(xy[1]),
    untracked: false,
    conflicted: false,
  };
}

/** Marcadores que o git deixa em .git enquanto uma operação aguarda o usuário. */
function detectOperation(gitDir: string): Operation | null {
  const has = (name: string) => existsSync(join(gitDir, name));
  if (has("rebase-merge") || has("rebase-apply")) return "rebase";
  if (has("CHERRY_PICK_HEAD")) return "cherry-pick";
  if (has("REVERT_HEAD")) return "revert";
  if (has("MERGE_HEAD")) return "merge";
  return null;
}

export async function getStatus(root: string): Promise<RepoStatus> {
  const [raw, gitDir] = await Promise.all([
    runGit(root, ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all"]),
    runGit(root, ["rev-parse", "--absolute-git-dir"]),
  ]);
  const status = parseStatusV2(raw);
  status.operation = detectOperation(gitDir.trim());
  return status;
}

const FIELD = "\x1f";
const RECORD = "\x1e";
export const LOG_FORMAT = ["%H", "%P", "%an", "%ae", "%aI", "%D", "%s"].join(FIELD) + RECORD;

/** Parser do formato de `getLog`. Separadores de controle não aparecem em metadados reais de commit. */
export function parseLog(raw: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of raw.split(RECORD)) {
    const text = record.replace(/^\n/, "");
    if (!text) continue;
    const [hash = "", parents = "", authorName = "", authorEmail = "", authorDate = "", refs = "", subject = ""] =
      text.split(FIELD);
    if (!hash) continue;
    commits.push({
      hash,
      parents: parents ? parents.split(" ") : [],
      authorName,
      authorEmail,
      authorDate,
      refs: refs ? refs.split(", ") : [],
      subject,
    });
  }
  return commits;
}

/**
 * Página do histórico de todas as refs, em ordem topológica (filhos antes dos pais),
 * como o desenho do grafo exige. Pede `limit + 1` para saber se há mais páginas.
 */
export async function getLog(root: string, skip: number, limit: number): Promise<LogPage> {
  if (!Number.isInteger(skip) || skip < 0) throw new RangeError("skip inválido");
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new RangeError("limit inválido");

  let raw: string;
  try {
    raw = await runGit(root, [
      "log",
      "--all",
      "--topo-order",
      "--decorate=short",
      `--skip=${skip}`,
      `--max-count=${limit + 1}`,
      `--format=${LOG_FORMAT}`,
    ]);
  } catch (e) {
    // Repositório recém-criado, sem nenhum commit: histórico vazio, não erro.
    if (e instanceof GitError && /does not have any commits|bad default revision|unknown revision/i.test(e.stderr)) {
      return { commits: [], hasMore: false };
    }
    throw e;
  }
  const commits = parseLog(raw);
  const hasMore = commits.length > limit;
  return { commits: hasMore ? commits.slice(0, limit) : commits, hasMore };
}
