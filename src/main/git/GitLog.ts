import type { GitLogEntry } from "../../shared/types";

const MAX_ENTRIES = 1000;

/** Comandos que só leem: o monitor os esconde por padrão (o app os dispara o tempo todo para atualizar a tela). */
const READ_ONLY = new Set([
  "status", "rev-parse", "log", "show", "show-ref", "for-each-ref", "rev-list", "diff", "cat-file", "ls-files",
  "ls-tree", "blame", "symbolic-ref", "merge-base", "reflog", "describe", "check-ref-format", "grep", "diff-tree",
  "count-objects", "var", "version",
]);

const SAFE_ARG = /^[A-Za-z0-9_\-./:=@%+,~]+$/;

/** Esconde credenciais embutidas em URLs (`https://usuario:token@host`) e cabeçalhos de autorização. */
export function redact(text: string): string {
  return text
    .replace(/(\w+:\/\/)[^/@\s]+@/g, "$1REDACTED@")
    .replace(/(authorization:\s*\w+\s+)\S+/gi, "$1REDACTED");
}

/** Argumento pronto para colar num terminal: aspas quando preciso; caracteres de controle viram `%xNN` (formatos do git). */
export function quoteArg(arg: string): string {
  let a = redact(arg);
  if (/[\x00-\x1f]/.test(a)) {
    a = a.replace(/[\x00-\x1f]/g, (c) => `%x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  }
  if (a !== "" && SAFE_ARG.test(a)) return a;
  return `"${a.replace(/(["\\$`])/g, "\\$1")}"`;
}

export function formatCommand(args: readonly string[]): string {
  return ["git", ...args.map(quoteArg)].join(" ");
}

export function isReadOnly(args: readonly string[]): boolean {
  const sub = args.find((a, i) => !a.startsWith("-") && (i === 0 || args[i - 1] !== "-c"));
  if (!sub) return false;
  if (sub === "config") return args.includes("--get") || args.includes("--list") || args.includes("--get-all");
  if (sub === "branch") return args.includes("--show-current") || args.includes("--list");
  if (sub === "stash") return args.includes("list");
  if (sub === "remote") return args.length === 1 || args.includes("-v") || args.includes("get-url");
  return READ_ONLY.has(sub);
}

type Listener = (entry: GitLogEntry) => void;

const entries: GitLogEntry[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

export interface RecordInput {
  cwd: string;
  args: readonly string[];
  startedAt: number;
  exitCode: number | null;
  ok: boolean;
  error?: string;
}

export function recordGitCommand(input: RecordInput): GitLogEntry {
  const entry: GitLogEntry = {
    id: nextId++,
    at: input.startedAt,
    cwd: input.cwd,
    command: formatCommand(input.args),
    durationMs: Date.now() - input.startedAt,
    exitCode: input.exitCode,
    ok: input.ok,
    readOnly: isReadOnly(input.args),
    ...(input.error ? { error: redact(input.error).slice(0, 400) } : {}),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
      /* um ouvinte com defeito não pode derrubar o git */
    }
  }
  return entry;
}

export const listGitLog = (): GitLogEntry[] => entries.slice();
export const clearGitLog = (): void => {
  entries.length = 0;
};
export function onGitCommand(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
