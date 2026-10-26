import { Icon } from "../icons";
import type { SortDir } from "../changesTree";
import type { ViewMode } from "./useChangesUi";

export interface ChangesHeaderProps {
  count: number;
  branch: string | null;
  busy: boolean;
  /** Nada descartável (sem alterações ou só conflitos). */
  noDiscard: boolean;
  onDiscardAll(): void;
  explainReason: string | null;
  onExplain(): void;
  mode: ViewMode;
  onMode(mode: ViewMode): void;
  order: SortDir;
  onToggleOrder(): void;
}

/** Cabeçalho do painel: descartar tudo, resumo "N alterações em branch", IA e a barra de ordenação / Path | Tree. */
export function ChangesHeader({ count, branch, busy, noDiscard, onDiscardAll, explainReason, onExplain, mode, onMode, order, onToggleOrder }: ChangesHeaderProps) {
  const summary = count === 0 ? "Nenhuma alteração" : `${count} ${count === 1 ? "alteração" : "alterações"} em ${branch ?? "(HEAD destacado)"}`;
  return (
    <>
      <div className="ch-head">
        <button className="ch-trash" aria-label="Descartar todas as alterações" title="Descartar todas as alterações não staged" disabled={busy || noDiscard} onClick={onDiscardAll}>
          <Icon name="trash" size={16} />
        </button>
        <span className="ch-summary">{summary}</span>
        <button className="ch-ai" aria-label="Explicar alterações" title={explainReason ?? "Pede à IA uma explicação das alterações locais"} disabled={busy || explainReason !== null} onClick={onExplain}>
          <Icon name="sparkle" size={16} />
        </button>
      </div>
      <div className="ch-bar">
        <button className="ch-sort" aria-label="Ordenar por nome" title={order === "asc" ? "Ordem crescente (clique para inverter)" : "Ordem decrescente (clique para inverter)"} onClick={onToggleOrder}>
          <Icon name="sort" size={16} />
          <span className="ch-sort-dir" aria-hidden="true">
            {order === "asc" ? "A↓Z" : "Z↓A"}
          </span>
        </button>
        <div className="ch-mode" role="group" aria-label="Modo de exibição">
          <button aria-pressed={mode === "path"} onClick={() => onMode("path")}>
            <Icon name="list" size={14} />
            Path
          </button>
          <button aria-pressed={mode === "tree"} onClick={() => onMode("tree")}>
            <Icon name="tree" size={14} />
            Tree
          </button>
        </div>
      </div>
    </>
  );
}
