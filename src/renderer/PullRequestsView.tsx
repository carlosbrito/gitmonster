import { useCallback, useEffect, useState } from "react";
import type { AiTextResult, GitHubStatus, PullDetail, PullState, PullSummary } from "../shared/types";
import { errorMessage } from "./util";

export interface PullRequestsViewProps {
  root: string;
  onClose(): void;
  /** Faz o checkout do PR (a operação e a atualização da tela ficam com quem chama). */
  onCheckout(number: number): void;
  onOpenSettings(): void;
  /** Por que a IA não pode ser usada agora, ou null. */
  aiReason: string | null;
  /** Gera título e descrição para a branch de destino informada; null se foi bloqueado, cancelado ou falhou. */
  onAiPull(base: string): Promise<AiTextResult | null>;
}

type Filter = "open" | "closed" | "all";

const STATE_LABEL: Record<PullState, string> = { open: "aberto", closed: "fechado", merged: "mesclado" };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

/** Pull Requests do repositório no GitHub: lista, detalhe, criar a partir da branch atual, checkout e abrir no navegador. */
export function PullRequestsView({ root, onClose, onCheckout, onOpenSettings, aiReason, onAiPull }: PullRequestsViewProps) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [pulls, setPulls] = useState<PullSummary[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", base: "", draft: false });
  const [busy, setBusy] = useState(false);

  const ready = status?.connected === true && status.repo !== null;

  useEffect(() => {
    let cancelled = false;
    window.gitmonster
      .githubStatus(root)
      .then((s) => !cancelled && setStatus(s))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root]);

  const load = useCallback(async () => {
    setPulls(null);
    setError(null);
    try {
      setPulls(await window.gitmonster.githubPulls(root, filter));
    } catch (e) {
      setError(errorMessage(e));
      setPulls([]);
    }
  }, [root, filter]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    window.gitmonster
      .githubPull(root, selected)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root, selected]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const pr = await window.gitmonster.githubCreatePull(root, form);
      setCreating(false);
      setForm({ title: "", body: "", base: "", draft: false });
      await load();
      setSelected(pr.number);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pulls" aria-label="Pull Requests">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>
          Pull Requests{status?.repo ? ` de ${status.repo.owner}/${status.repo.repo}` : ""}
        </strong>
        {ready && (
          <>
            <select aria-label="Filtro dos Pull Requests" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="open">Abertos</option>
              <option value="closed">Fechados</option>
              <option value="all">Todos</option>
            </select>
            <button onClick={() => setCreating((c) => !c)}>{creating ? "Cancelar" : "Novo Pull Request"}</button>
          </>
        )}
      </header>

      {error && <p role="alert" className="error">{error}</p>}

      {status && !ready && (
        <div className="pad">
          <p>{status.connected ? status.repoReason : "Conecte-se ao GitHub com um token pessoal para ver os Pull Requests."}</p>
          {!status.connected && <button onClick={onOpenSettings}>Abrir Configurações</button>}
        </div>
      )}

      {ready && creating && (
        <form
          className="pull-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            Título
            <input aria-label="Título do Pull Request" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="field">
            Branch de destino (vazio = a padrão do repositório)
            <input aria-label="Branch de destino" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} />
          </label>
          <label className="field">
            Descrição
            <textarea aria-label="Descrição do Pull Request" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label>
            <input type="checkbox" checked={form.draft} onChange={(e) => setForm({ ...form, draft: e.target.checked })} /> Rascunho (draft)
          </label>
          <button
            type="button"
            disabled={busy || aiReason !== null}
            title={aiReason ?? "Gera título e descrição com IA a partir dos commits e do diff da branch atual"}
            onClick={async () => {
              const result = await onAiPull(form.base);
              if (result) setForm((f) => ({ ...f, title: result.summary, body: result.body }));
            }}
          >
            ✨ Gerar com IA
          </button>
          <button type="submit" disabled={busy || form.title.trim() === ""}>
            Criar Pull Request
          </button>
        </form>
      )}

      {ready && (
        <div className="pulls-body">
          <ul className="pulls-list">
            {pulls === null && <li className="dim pad">Carregando…</li>}
            {pulls?.length === 0 && <li className="dim pad">Nenhum Pull Request.</li>}
            {pulls?.map((p) => (
              <li key={p.number} className={p.number === selected ? "result active" : "result"}>
                <button onClick={() => setSelected(p.number)}>
                  <code>#{p.number}</code>
                  <span className="result-subject">{p.title}</span>
                  <span className={`pr-state pr-${p.state}`}>{p.draft ? "rascunho" : STATE_LABEL[p.state]}</span>
                </button>
              </li>
            ))}
          </ul>

          <aside className="pull-detail" aria-label="Detalhe do Pull Request">
            {selected !== null && !detail && <p className="dim pad">Carregando…</p>}
            {detail && (
              <>
                <h3>
                  #{detail.number} {detail.title}
                </h3>
                <p className="dim">
                  {detail.author} · {detail.headRef} → {detail.baseRef} · {STATE_LABEL[detail.state]} · {formatDate(detail.updatedAt)}
                </p>
                <p>
                  {detail.commits} commit(s) · {detail.changedFiles} arquivo(s) · <span className="pr-add">+{detail.additions}</span>{" "}
                  <span className="pr-del">−{detail.deletions}</span> · {detail.comments} comentário(s)
                  {detail.mergeable === false ? " · com conflitos" : ""}
                </p>
                <pre className="commit-message">{detail.body || "(sem descrição)"}</pre>
                <div className="commit-actions">
                  <button onClick={() => onCheckout(detail.number)} title="Traz o PR para a branch local pr-N e muda para ela">
                    Checkout do PR
                  </button>
                  <button onClick={() => void window.gitmonster.githubOpenPull(root, detail.number).catch((e) => setError(errorMessage(e)))}>
                    Abrir no GitHub
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
