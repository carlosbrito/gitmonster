import { useEffect, useRef } from "react";

export type DropChoice = "merge" | "rebase";

export interface DropDialogProps {
  source: string;
  target: string;
  /** Branch atual: o merge muda para o destino, o rebase muda para a origem, se for outra. */
  current: string | null;
  /** Só uma branch local pode ser reescrita pelo rebase. */
  canRebase: boolean;
  onResolve(choice: DropChoice | null): void;
}

/** Depois de arrastar uma branch sobre outra: escolher entre merge e rebase (ou cancelar). */
export function DropDialog({ source, target, current, canRebase, onResolve }: DropDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="confirm drop-choice" onCancel={() => onResolve(null)}>
      <p>
        O que fazer com <b>{source}</b> e <b>{target}</b>?
      </p>
      <ul className="drop-options">
        <li>
          <b>Merge:</b> mescla "{source}" em "{target}"{current !== target ? `; o app muda para "${target}"` : ""}. "{source}" não é alterada.
        </li>
        <li>
          <b>Rebase:</b> reaplica os commits de "{source}" em cima de "{target}"
          {current !== source ? `; o app muda para "${source}"` : ""}. Reescreve a história de "{source}"
          {canRebase ? "" : " (indisponível: só branches locais)"}.
        </li>
      </ul>
      <div className="confirm-actions">
        <button autoFocus onClick={() => onResolve(null)}>
          Cancelar
        </button>
        <button className="danger" disabled={!canRebase} onClick={() => onResolve("rebase")}>
          Fazer rebase
        </button>
        <button className="danger" onClick={() => onResolve("merge")}>
          Fazer merge
        </button>
      </div>
    </dialog>
  );
}
