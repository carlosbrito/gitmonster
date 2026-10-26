import { useEffect, useMemo, useRef, useState } from "react";
import type { RebaseAction, RebasePlan, RebaseStep } from "../shared/types";

export interface RebaseDialogProps {
  /** Rótulo do destino (nome da branch ou hash curto), só para o texto. */
  ontoLabel: string;
  plan: RebasePlan;
  onResolve(steps: RebaseStep[] | null): void;
}

interface Row {
  hash: string;
  subject: string;
  action: RebaseAction;
}

const ACTION_LABEL: Record<RebaseAction, string> = {
  pick: "manter (pick)",
  squash: "juntar (squash)",
  fixup: "juntar sem mensagem (fixup)",
  drop: "remover (drop)",
};

/** Edita o roteiro do rebase interativo: reordenar e escolher a ação de cada commit. */
export function RebaseDialog({ ontoLabel, plan, onResolve }: RebaseDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>(() => plan.commits.map((c) => ({ ...c, action: "pick" })));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const problem = useMemo(() => {
    const kept = rows.filter((r) => r.action !== "drop");
    if (kept.length === 0) return "O plano remove todos os commits.";
    if (kept[0]!.action !== "pick") return "O primeiro commit mantido precisa ser 'pick': não há anterior para juntar.";
    return null;
  }, [rows]);

  const move = (index: number, delta: -1 | 1) =>
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const setAction = (index: number, action: RebaseAction) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, action } : r)));

  return (
    <dialog ref={ref} className="confirm rebase" onCancel={() => onResolve(null)}>
      <h3 className="dialog-title">Rebase interativo sobre {ontoLabel}</h3>
      <p className="dim">
        Do mais antigo (topo) ao mais novo. Isto reescreve o histórico: se estes commits já foram publicados, será preciso force push.
      </p>
      <ol className="rebase-rows">
        {rows.map((r, i) => (
          <li key={r.hash} className={r.action === "drop" ? "dropped" : ""}>
            <span className="rebase-arrows">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${r.subject}`}>
                ↑
              </button>
              <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${r.subject}`}>
                ↓
              </button>
            </span>
            <code>{r.hash.slice(0, 7)}</code>
            <span className="rebase-subject" title={r.subject}>
              {r.subject}
            </span>
            <select value={r.action} onChange={(e) => setAction(i, e.target.value as RebaseAction)} aria-label={`Ação de ${r.subject}`}>
              {(Object.keys(ACTION_LABEL) as RebaseAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
      {problem && <p role="alert" className="error pad">{problem}</p>}
      <div className="confirm-actions">
        <button type="button" onClick={() => onResolve(null)}>
          Cancelar
        </button>
        <button
          type="button"
          className="danger"
          disabled={problem !== null}
          onClick={() => onResolve(rows.map(({ hash, action }) => ({ hash, action })))}
        >
          Executar rebase
        </button>
      </div>
    </dialog>
  );
}
