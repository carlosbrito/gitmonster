import { useMemo } from "react";
import type { DiffHunk, DiffTarget, FileDiff } from "../shared/types";
import { annotateHunk, pairLines, type DiffLineView, type SideCell } from "./diffRows";
import { useDiffMode } from "./hooks/useDiffMode";
import { languageFor } from "./syntax";

const MAX_LINES = 5000;

export interface DiffViewProps {
  target: DiffTarget;
  diff: FileDiff | null;
  conflicted: boolean;
  busy: boolean;
  onHunk(hunkIndex: number, hunk: DiffHunk): void;
  /** Só presente no diff de alterações não staged: habilita "Descartar hunk". */
  onDiscardHunk?(hunkIndex: number, hunk: DiffHunk): void;
  onClose(): void;
  /** Diff de um commit (somente leitura): sem botões de hunk, com este rótulo no lugar do estado. */
  readOnlyLabel?: string;
}

const CLASS = { " ": "ctx", "+": "add", "-": "del", "\\": "meta" } as const;

function UnifiedLines({ lines }: { lines: DiffLineView[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={`dl dl-${CLASS[line.kind]}`}>
          <span className="ln">{line.oldN ?? ""}</span>
          <span className="ln">{line.newN ?? ""}</span>
          <span className="sign">{line.kind === "\\" ? "" : line.kind}</span>
          {line.kind === "\\" ? <span className="code">{line.text}</span> : <span className="code" dangerouslySetInnerHTML={{ __html: line.html }} />}
        </div>
      ))}
    </>
  );
}

function Half({ cell }: { cell: SideCell | null }) {
  if (!cell) return <div className="sbs-cell sbs-empty" />;
  return (
    <div className={`sbs-cell dl-${cell.kind}`}>
      <span className="ln">{cell.n}</span>
      <span className="code" dangerouslySetInnerHTML={{ __html: cell.html }} />
    </div>
  );
}

function SplitLines({ lines }: { lines: DiffLineView[] }) {
  const rows = useMemo(() => pairLines(lines), [lines]);
  return (
    <>
      {rows.map((row, i) =>
        row.meta !== undefined ? (
          <div key={i} className="dl dl-meta sbs-meta">
            <span className="code">{row.meta}</span>
          </div>
        ) : (
          <div key={i} className="sbs-row">
            <Half cell={row.left} />
            <Half cell={row.right} />
          </div>
        ),
      )}
    </>
  );
}

export function DiffView({ target, diff, conflicted, busy, onHunk, onDiscardHunk, onClose, readOnlyLabel }: DiffViewProps) {
  const [mode, setMode] = useDiffMode();
  const canHunk = !target.untracked && !conflicted && readOnlyLabel === undefined;
  const language = languageFor(target.path);

  // Destaque e numeração só são recalculados quando o diff muda, não a cada render.
  const annotated = useMemo(() => diff?.hunks.map((h) => annotateHunk(h, language)) ?? [], [diff, language]);
  let remaining = MAX_LINES;

  return (
    <div className="diff">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>{target.path}</strong>
        <span className="dim">
          {readOnlyLabel ?? (target.untracked ? "arquivo novo" : target.staged ? "no stage" : "alterações")}
        </span>
        <span className="diff-mode" role="group" aria-label="Modo do diff">
          <button aria-pressed={mode === "unified"} onClick={() => setMode("unified")}>
            Unificado
          </button>
          <button aria-pressed={mode === "split"} onClick={() => setMode("split")}>
            Lado a lado
          </button>
        </span>
      </header>

      <div className="diff-body">
        {conflicted && <p className="dim pad">Arquivo em conflito: a resolução ainda não é suportada aqui.</p>}
        {!conflicted && diff === null && <p className="dim pad">Carregando…</p>}
        {diff?.binary && <p className="dim pad">Arquivo binário.</p>}
        {diff && !diff.binary && diff.hunks.length === 0 && !conflicted && (
          <p className="dim pad">Sem diferenças.</p>
        )}

        {diff?.hunks.map((hunk, index) => {
          const all = annotated[index] ?? [];
          const visible = all.slice(0, Math.max(0, remaining));
          remaining -= visible.length;
          return (
            <section key={`${index}:${hunk.header}`} className="hunk">
              <div className="hunk-bar">
                <code>{hunk.header}</code>
                {canHunk && (
                  <button disabled={busy} onClick={() => onHunk(index, hunk)}>
                    {target.staged ? "Remover hunk do stage" : "Stage hunk"}
                  </button>
                )}
                {canHunk && onDiscardHunk && (
                  <button className="danger-outline" disabled={busy} onClick={() => onDiscardHunk(index, hunk)}>
                    Descartar hunk
                  </button>
                )}
              </div>
              <div className={mode === "split" ? "hunk-lines split" : "hunk-lines"}>
                {mode === "split" ? <SplitLines lines={visible} /> : <UnifiedLines lines={visible} />}
                {visible.length < all.length && <p className="dim pad">… diff truncado ({MAX_LINES} linhas exibidas).</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
