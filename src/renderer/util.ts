/** Commits carregados por página do grafo. */
export const PAGE = 1000;

export const short = (hash: string) => hash.slice(0, 7);

/** O Electron prefixa erros de IPC com "Error invoking remote method '...': "; o usuário não precisa disso. */
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, "");
}
