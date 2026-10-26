import type { AiController } from "./useAi";

/** Faixa com o andamento da IA (com cancelar), o aviso de diff cortado e o erro da última tentativa. */
export function AiStatus({ ai }: { ai: AiController }) {
  return (
    <>
      {ai.busy && (
        <p role="status" className="ai-status">
          <span className="spinner" aria-hidden="true" /> IA trabalhando…{" "}
          <button className="link" onClick={ai.cancel}>
            Cancelar
          </button>
        </p>
      )}
      {ai.notice && (
        <p role="status" className="notice">
          {ai.notice}
        </p>
      )}
      {ai.error && (
        <p role="alert" className="error">
          {ai.error}
        </p>
      )}
    </>
  );
}
