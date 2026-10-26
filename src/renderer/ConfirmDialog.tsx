import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onResolve(confirmed: boolean): void;
}

/** Diálogo modal nativo (<dialog>): foco preso, Esc cancela. Substitui window.confirm. */
export function ConfirmDialog({ message, confirmLabel, onResolve }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="confirm" onCancel={() => onResolve(false)}>
      <p>{message}</p>
      <div className="confirm-actions">
        <button autoFocus onClick={() => onResolve(false)}>
          Cancelar
        </button>
        <button className="danger" onClick={() => onResolve(true)}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
