import { useCallback, useEffect, useState } from "react";
import type { Commit } from "../shared/types";
import { errorMessage, short } from "./util";

const PAGE_SIZE = 200;

export interface FileHistoryViewProps {
  root: string;
  path: string;
  selectedHash: string | null;
  onSelect(commit: Commit): void;
  onClose(): void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

/** Commits que mexeram no arquivo (segue renomeações). Clicar seleciona o commit. */
export function FileHistoryView({ root, path, selectedHash, onSelect, onClose }: FileHistoryViewProps) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (skip: number) => {
      try {
        const page = await window.gitmonster.fileHistory(root, path, skip, PAGE_SIZE);
        setCommits((prev) => (skip === 0 ? page.commits : [...(prev ?? []), ...page.commits]));
        setHasMore(page.hasMore);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [root, path],
  );

  useEffect(() => {
    setCommits(null);
    setError(null);
    void load(0);
  }, [load]);

  return (
    <section className="search-results file-history" aria-label="Histórico do arquivo">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>Histórico: {path}</strong>
        <span className="dim">{commits === null ? "carregando…" : `${commits.length}${hasMore ? "+" : ""} commit(s)`}</span>
      </header>
      {error && <p role="alert" className="error">{error}</p>}
      {commits !== null && commits.length === 0 && !error && <p className="dim pad">Nenhum commit mexeu neste arquivo.</p>}
      <ul>
        {commits?.map((c) => (
          <li key={c.hash} className={c.hash === selectedHash ? "result active" : "result"}>
            <button onClick={() => onSelect(c)} title={c.hash}>
              <code>{short(c.hash)}</code>
              <span className="result-subject">{c.subject}</span>
              <span className="dim">
                {c.authorName} · {formatDate(c.authorDate)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button className="load-more" onClick={() => void load(commits?.length ?? 0)}>
          Carregar mais
        </button>
      )}
    </section>
  );
}
