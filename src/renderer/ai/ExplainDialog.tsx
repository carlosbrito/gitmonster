import { useEffect, useRef, useState } from "react";
import type { AiTextResult } from "../../shared/types";

export interface ExplainDialogProps {
  title: string;
  result: AiTextResult;
  onClose(): void;
}

/** Resumo e explicação gerados pela IA, com botão de copiar. */
export function ExplainDialog({ title, result, onClose }: ExplainDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const copy = () => {
    const text = result.body ? `${result.summary}\n\n${result.body}` : result.summary;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <dialog ref={ref} className="confirm explain" aria-label={title} onCancel={onClose}>
      <h3 className="dialog-title">{title}</h3>
      <p className="explain-summary">{result.summary}</p>
      {result.body && <pre className="explain-body">{result.body}</pre>}
      {result.truncated && <p className="notice">Diff grande: parte foi omitida do envio à IA.</p>}
      <p className="dim">Gerado por IA: confira antes de confiar.</p>
      <div className="confirm-actions">
        <button onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
        <button autoFocus onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
