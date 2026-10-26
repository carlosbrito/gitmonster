import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { SessionState } from "../shared/types";

export const MAX_RECENTS = 20;

const rootStr = z.string().min(1).max(32_767);

const sessionSchema = z.object({
  version: z.literal(1),
  tabs: z.array(rootStr).max(200),
  active: rootStr.nullable(),
  recents: z.array(z.object({ root: rootStr, openedAt: z.string().max(64) })).max(1000),
});

export interface SessionDeps {
  /** Conteúdo do arquivo, ou null se não existir. */
  read(file: string): Promise<string | null>;
  write(file: string, content: string): Promise<void>;
  /** A raiz ainda existe e continua sendo a raiz de um repositório Git? */
  isRepoRoot(root: string): Promise<boolean>;
}

export const emptySession = (): SessionState => ({ version: 1, tabs: [], active: null, recents: [] });

export interface LoadedSession {
  session: SessionState;
  /** Raízes que estavam salvas mas não existem mais (ou deixaram de ser repositórios). */
  removed: string[];
}

const dedupe = (items: string[]) => [...new Set(items)];

function dedupeRecents(items: SessionState["recents"]): SessionState["recents"] {
  const seen = new Set<string>();
  return items.filter((r) => {
    if (seen.has(r.root)) return false;
    seen.add(r.root);
    return true;
  });
}

/** Lê e valida a sessão. Arquivo ausente ou corrompido nunca impede o app de abrir. */
export async function loadSession(file: string, deps: SessionDeps): Promise<LoadedSession> {
  let parsed: SessionState;
  try {
    const raw = await deps.read(file);
    if (raw === null) return { session: emptySession(), removed: [] };
    parsed = sessionSchema.parse(JSON.parse(raw));
  } catch {
    return { session: emptySession(), removed: [] };
  }

  const roots = new Set([...parsed.tabs, ...parsed.recents.map((r) => r.root)]);
  const checked = await Promise.all(
    [...roots].map(async (r) => [r, await deps.isRepoRoot(r).catch(() => false)] as const),
  );
  const valid = new Set(checked.filter(([, ok]) => ok).map(([r]) => r));
  const removed = checked.filter(([, ok]) => !ok).map(([r]) => r);

  const tabs = dedupe(parsed.tabs.filter((r) => valid.has(r)));
  const recents = dedupeRecents(parsed.recents.filter((r) => valid.has(r.root)));
  const active = parsed.active !== null && tabs.includes(parsed.active) ? parsed.active : (tabs.at(-1) ?? null);
  return { session: { version: 1, tabs, active, recents }, removed };
}

/**
 * Grava a sessão mantendo só raízes que o usuário abriu nesta execução (ou que `loadSession` validou).
 * Um renderer comprometido não consegue, assim, fazer o main reabrir uma pasta arbitrária no próximo start.
 */
export async function saveSession(
  file: string,
  incoming: unknown,
  opened: ReadonlySet<string>,
  deps: SessionDeps,
): Promise<SessionState> {
  const parsed = sessionSchema.parse(incoming);
  const tabs = dedupe(parsed.tabs.filter((r) => opened.has(r)));
  const recents = dedupeRecents(parsed.recents.filter((r) => opened.has(r.root))).slice(0, MAX_RECENTS);
  const active = parsed.active !== null && tabs.includes(parsed.active) ? parsed.active : null;
  const session: SessionState = { version: 1, tabs, active, recents };
  await deps.write(file, JSON.stringify(session, null, 2));
  return session;
}

/** Leitura e escrita reais em disco; a escrita é atômica (arquivo temporário + rename). */
export const fsSessionIo = {
  async read(file: string): Promise<string | null> {
    try {
      return await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },
  async write(file: string, content: string): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, file);
  },
};
