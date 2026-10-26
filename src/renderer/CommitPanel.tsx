import type { Commit, CommitDetail, CommitFile, ResetMode } from "../shared/types";

export interface CommitPanelProps {
  commit: Commit;
  detail: CommitDetail | null;
  openFile: string | null;
  busy: boolean;
  onOpenFile(file: CommitFile): void;
  /** Botão direito num arquivo do commit. */
  onFileMenu(point: { x: number; y: number }, file: CommitFile): void;
  onCheckout(): void;
  onBranchHere(): void;
  onTagHere(): void;
  onCherryPick(): void;
  onRevert(): void;
  onReset(mode: ResetMode): void;
  onInteractiveRebase(): void;
  /** Por que a IA não pode ser usada agora, ou null. */
  aiReason: string | null;
  onAiExplain(): void;
}

const STATUS_TITLE: Record<string, string> = {
  A: "Adicionado",
  M: "Modificado",
  D: "Removido",
  R: "Renomeado",
  C: "Copiado",
  T: "Tipo alterado",
};

/** Detalhe do commit selecionado no grafo: mensagem, arquivos (abrem o diff) e ações. */
export function CommitPanel(props: CommitPanelProps) {
  const { commit, detail, openFile, busy } = props;
  const shown = detail?.hash === commit.hash ? detail : null;

  return (
    <section className="commit-panel" aria-label="Commit selecionado">
      <h3>Commit</h3>
      <div className="detail">
        <code>{commit.hash}</code>
        <div>
          {commit.authorName} &lt;{commit.authorEmail}&gt;
        </div>
        <div>{commit.authorDate}</div>
        <pre className="commit-message">{shown?.message ?? commit.subject}</pre>
      </div>

      <div className="commit-actions">
        <button disabled={busy} onClick={props.onCheckout} title="Ver este commit (HEAD destacado)">
          Checkout
        </button>
        <button disabled={busy} onClick={props.onBranchHere} title="Criar uma branch neste commit e mudar para ela">
          Branch aqui
        </button>
        <button disabled={busy} onClick={props.onTagHere} title="Criar uma tag neste commit">
          Tag aqui
        </button>
        <button disabled={busy} onClick={props.onCherryPick} title="Aplicar este commit na branch atual">
          Cherry-pick
        </button>
        <button disabled={busy} onClick={props.onRevert} title="Criar um commit que desfaz este">
          Revert
        </button>
        <button disabled={busy} onClick={props.onInteractiveRebase} title="Reordenar, juntar ou remover os commits depois deste">
          Rebase interativo
        </button>
        <button disabled={busy || props.aiReason !== null} onClick={props.onAiExplain} title={props.aiReason ?? "Pede à IA uma explicação deste commit"}>
          ✨ Explicar commit
        </button>
      </div>
      <div className="commit-actions reset">
        <span className="dim">Reset da branch para aqui:</span>
        <button disabled={busy} onClick={() => props.onReset("soft")} title="Mantém tudo no stage">
          soft
        </button>
        <button disabled={busy} onClick={() => props.onReset("mixed")} title="Mantém as alterações no disco, fora do stage">
          mixed
        </button>
        <button disabled={busy} className="danger-outline" onClick={() => props.onReset("hard")} title="DESCARTA as alterações não commitadas">
          hard
        </button>
      </div>

      <h4>Arquivos {shown ? `(${shown.files.length})` : ""}</h4>
      {!shown && <p className="dim">Carregando…</p>}
      <ul className="commit-files">
        {shown?.files.map((f) => (
          <li
            key={f.path}
            className={openFile === f.path ? "file active" : "file"}
            onContextMenu={(e) => {
              e.preventDefault();
              props.onFileMenu({ x: e.clientX, y: e.clientY }, f);
            }}
          >
            <button className="file-open" title={f.origPath ? `${f.origPath} → ${f.path}` : f.path} onClick={() => props.onOpenFile(f)}>
              <code className={`badge badge-${f.status}`} title={STATUS_TITLE[f.status] ?? f.status}>
                {f.status}
              </code>
              <span className="file-name">{f.origPath ? `${f.origPath} → ${f.path}` : f.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
