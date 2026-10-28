import { useEffect, useRef, useState } from "react";
import type { ErrorInfo } from "./errorInfo";

export interface ErrorDialogProps {
  info: ErrorInfo;
  onClose(): void;
}

/** Erro de operação em modal: mensagem curta, comando sugerido e o texto completo sob demanda. */
export function ErrorDialog({ info, onClose }: ErrorDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState<"command" | "detail" | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const copy = (text: string, what: "command" | "detail") =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(what))
      .catch(() => undefined);

  return (
    <dialog ref={ref} className="confirm error-dialog" aria-label={info.title} data-kind={info.kind} onCancel={onClose}>
      <h3 className="dialog-title">{info.title}</h3>
      <p>{info.message}</p>
      {info.command && (
        <div className="error-command">
          <code>{info.command}</code>
          <button onClick={() => copy(info.command!, "command")}>{copied === "command" ? "Copiado" : "Copiar comando"}</button>
        </div>
      )}
      {showDetail && <pre className="error-detail">{info.detail}</pre>}
      <div className="confirm-actions">
        <button onClick={() => setShowDetail((v) => !v)}>{showDetail ? "Ocultar detalhes" : "Ver detalhes"}</button>
        {showDetail && <button onClick={() => copy(info.detail, "detail")}>{copied === "detail" ? "Copiado" : "Copiar"}</button>}
        <button autoFocus onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
