import type { Commit, SearchField } from "../shared/types";
import { FIELD_LABEL } from "./SearchBar";
import { short } from "./util";

export interface SearchResultsProps {
  field: SearchField;
  query: string;
  /** null enquanto a busca roda. */
  commits: Commit[] | null;
  selectedHash: string | null;
  onSelect(commit: Commit): void;
  onClose(): void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

/** Resultado de uma busca, no lugar do grafo. Clicar num item seleciona o commit (detalhe no painel lateral). */
export function SearchResults({ field, query, commits, selectedHash, onSelect, onClose }: SearchResultsProps) {
  return (
    <section className="search-results" aria-label="Resultados da busca">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>
          {FIELD_LABEL[field]}: {query}
        </strong>
        <span className="dim">{commits === null ? "buscando…" : `${commits.length} resultado(s)`}</span>
      </header>
      {commits !== null && commits.length === 0 && <p className="dim pad">Nenhum commit encontrado.</p>}
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
    </section>
  );
}
