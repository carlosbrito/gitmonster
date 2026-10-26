import { useEffect, useRef, useState } from "react";
import type { UpdaterState } from "../shared/types";
import { errorMessage } from "./util";

/** Notas da versão, só como texto (nada de HTML remoto). */
function NotesDialog({ version, notes, onClose }: { version: string; notes: string; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const title = `Novidades do GitMonster ${version}`;
  return (
    <dialog ref={ref} className="confirm explain" aria-label={title} onCancel={onClose}>
      <h3 className="dialog-title">{title}</h3>
      <pre className="explain-body">{notes || "Esta versão não trouxe notas."}</pre>
      <div className="confirm-actions">
        <button autoFocus onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}

/**
 * Faixa de atualização na janela principal: só avisa. Baixa quando o usuário pede e oferece reiniciar;
 * "Depois" esconde a versão até o app ser reaberto (uma versão maior volta a aparecer).
 */
export function UpdateBanner() {
  const [state, setState] = useState<UpdaterState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    window.gitmonster.updaterState().then(setState).catch(() => undefined);
    return window.gitmonster.onUpdaterChanged(setState);
  }, []);

  const act = (op: () => Promise<unknown>) => {
    setFailure(null);
    void op().catch((e) => setFailure(errorMessage(e)));
  };

  if (!state) return null;
  // Erros da verificação automática ficam quietos; só o erro do download (que traz a versão) aparece aqui.
  const version = state.status === "available" || state.status === "ready" ? state.version : state.status === "error" ? state.version : undefined;
  if (state.status !== "downloading" && (!version || version === dismissed)) return null;

  return (
    <div className="update-banner" role="status" aria-label="Atualização do GitMonster">
      {state.status === "available" && (
        <>
          <span className="update-text">⬆ GitMonster {state.version} disponível</span>
          <button onClick={() => setNotesOpen(true)}>Ver novidades</button>
          <button className="primary" onClick={() => act(() => window.gitmonster.updaterDownload())}>
            Atualizar
          </button>
          <button onClick={() => setDismissed(state.version)}>Depois</button>
        </>
      )}
      {state.status === "downloading" && (
        <>
          <span className="update-text">Baixando atualização… {state.percent}%</span>
          <progress max={100} value={state.percent} aria-label="Progresso do download" />
        </>
      )}
      {state.status === "ready" && (
        <>
          <span className="update-text">GitMonster {state.version} pronto. Será instalado ao fechar o app.</span>
          <button className="primary" onClick={() => act(() => window.gitmonster.updaterInstall())}>
            Reiniciar agora
          </button>
        </>
      )}
      {state.status === "error" && (
        <>
          <span className="update-text">Não foi possível baixar a atualização: {state.message}</span>
          <button onClick={() => act(() => window.gitmonster.updaterDownload())}>Tentar de novo</button>
          <button onClick={() => setDismissed(version ?? null)}>Depois</button>
        </>
      )}
      {failure && <span className="update-error">{failure}</span>}
      {notesOpen && state.status === "available" && <NotesDialog version={state.version} notes={state.notes} onClose={() => setNotesOpen(false)} />}
    </div>
  );
}
