import { useEffect, useMemo, useState } from "react";
import type { BlameLine, Commit } from "../shared/types";
import { highlightLines, languageFor } from "./syntax";
import { errorMessage, short } from "./util";

export interface BlameViewProps {
  root: string;
  path: string;
  /** Hash ou ref em que o blame é calculado; null = árvore de trabalho. */
  rev: string | null;
  onSelect(commit: Commit): void;
  onClose(): void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

/** Commit mínimo para abrir o painel de detalhe; o resto (mensagem, arquivos) é carregado pelo hash. */
const asCommit = (l: BlameLine): Commit => ({
  hash: l.hash,
  parents: [],
  authorName: l.author,
  authorEmail: "",
  authorDate: l.authorTime,
  refs: [],
  subject: l.summary,
});

/** Quem escreveu cada linha. Linhas seguidas do mesmo commit mostram a legenda só na primeira. */
export function BlameView({ root, path, rev, onSelect, onClose }: BlameViewProps) {
  const [lines, setLines] = useState<BlameLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLines(null);
    setError(null);
    window.gitmonster
      .blame(root, path, rev)
      .then((l) => !cancelled && setLines(l))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root, path, rev]);

  const html = useMemo(() => highlightLines(lines?.map((l) => l.text) ?? [], languageFor(path)), [lines, path]);

  return (
    <section className="blame" aria-label="Blame">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>Blame: {path}</strong>
        <span className="dim">{rev === null ? "árvore de trabalho" : `em ${short(rev)}`}</span>
      </header>
      {error && <p role="alert" className="error">{error}</p>}
      {!lines && !error && <p className="dim pad">Carregando…</p>}
      <div className="blame-body">
        {lines?.map((l, i) => {
          const first = i === 0 || lines[i - 1]!.hash !== l.hash;
          return (
            <div key={l.line} className={`blame-row${first ? " blame-first" : ""}`}>
              <button
                className="blame-meta"
                disabled={l.uncommitted}
                onClick={() => onSelect(asCommit(l))}
                title={l.uncommitted ? "Ainda não commitado" : `${l.hash}\n${l.summary}`}
                tabIndex={first ? 0 : -1}
              >
                {first ? (
                  <>
                    <code>{l.uncommitted ? "········" : short(l.hash)}</code>
                    <span className="blame-author">{l.uncommitted ? "não commitado" : l.author}</span>
                    <span className="dim">{formatDate(l.authorTime)}</span>
                  </>
                ) : null}
              </button>
              <span className="ln">{l.line}</span>
              <span className="code" dangerouslySetInnerHTML={{ __html: html[i] ?? "" }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
