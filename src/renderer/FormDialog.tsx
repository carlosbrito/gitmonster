import { useEffect, useRef, useState } from "react";

export interface FormDialogProps {
  title: string;
  nameLabel: string;
  messageLabel?: string;
  /** Segundo campo de uma linha, obrigatório quando presente (ex.: URL do remote). */
  secondLabel?: string;
  confirmLabel: string;
  onResolve(result: { name: string; message: string; second: string } | null): void;
}

/** Diálogo modal com um campo de nome e, opcionalmente, um segundo campo ou uma mensagem (ex.: criar tag anotada). */
export function FormDialog({ title, nameLabel, messageLabel, secondLabel, confirmLabel, onResolve }: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [second, setSecond] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const valid = name.trim() !== "" && (secondLabel === undefined || second.trim() !== "");

  return (
    <dialog ref={ref} className="confirm" onCancel={() => onResolve(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onResolve({ name: name.trim(), message, second: second.trim() });
        }}
      >
        <h3 className="dialog-title">{title}</h3>
        <label className="field">
          {nameLabel}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {secondLabel !== undefined && (
          <label className="field">
            {secondLabel}
            <input value={second} onChange={(e) => setSecond(e.target.value)} />
          </label>
        )}
        {messageLabel !== undefined && (
          <label className="field">
            {messageLabel}
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        )}
        <div className="confirm-actions">
          <button type="button" onClick={() => onResolve(null)}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
