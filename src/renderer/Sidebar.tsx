import { useEffect, useMemo, useRef, useState } from "react";
import { filterRefs, shortRemoteName } from "./branchFilter";
import { buildBranchTree, folderPaths } from "./branchTree";
import { Icon } from "./icons";
import { BranchTree } from "./sidebar/BranchTree";
import { RefRow } from "./sidebar/RefRow";
import { SectionHeader } from "./sidebar/SectionHeader";
import type { AiTextResult, BranchInfo, CheckoutTarget, RefsSnapshot, RemoteBranchInfo, RemoteInfo, TagInfo } from "../shared/types";
import type { MenuPoint } from "./ContextMenu";

/** O que recebeu o clique direito; quem monta o menu é o dono da sidebar. */
export type SidebarTarget =
  | { kind: "branch"; branch: BranchInfo }
  | { kind: "remote"; branch: RemoteBranchInfo }
  | { kind: "remote-group"; remote: RemoteInfo }
  | { kind: "tag"; tag: TagInfo };

export interface SidebarProps {
  refs: RefsSnapshot | null;
  busy: boolean;
  onCheckout(target: CheckoutTarget): void;
  onMerge(name: string): void;
  onRebase(name: string): void;
  onPushTag(name: string): void;
  onDeleteTag(name: string): void;
  onDelete(name: string): void;
  /** Apaga várias branches locais de uma vez (uma confirmação). */
  onDeleteMany(names: string[]): Promise<boolean>;
  /** Apaga várias branches de um remote de uma vez; `fullNames` são os nomes de rastreamento (origin/x). */
  onDeleteRemoteMany(remote: string, fullNames: string[]): Promise<boolean>;
  onStashPush(message: string, includeUntracked: boolean): Promise<boolean>;
  /** Arquivos que um stash levaria: rastreados alterados e novos (não rastreados). */
  stashable: { tracked: number; untracked: number };
  /** Por que a IA não pode ser usada agora, ou null. */
  aiReason: string | null;
  /** Gera a mensagem do stash; null se foi bloqueado, cancelado ou falhou. */
  onAiStashMessage(includeUntracked: boolean): Promise<AiTextResult | null>;
  onStashPop(index: number): void;
  onStashDrop(index: number): void;
  onMenu(point: MenuPoint, target: SidebarTarget): void;
  /** Abre o diálogo de adicionar remote (nome e URL). */
  onAddRemote(): void;
  onRemoveRemote(name: string): void;
  /** Uma branch foi arrastada e solta sobre uma branch local: a tela pergunta se é merge ou rebase. */
  onMergeDrop(source: string, target: string): void;
  /** Arraste em curso no grafo (ponteiro): origem e a branch local da sidebar sob o ponteiro, se houver. */
  externalDrag: { source: string; over: string | null } | null;
}

export function Sidebar({ refs, busy, onCheckout, onMerge, onRebase, onPushTag, onDeleteTag, onDelete, onDeleteMany, onDeleteRemoteMany, onStashPush, stashable, aiReason, onAiStashMessage, onStashPop, onStashDrop, onMenu, onAddRemote, onRemoveRemote, onMergeDrop, externalDrag }: SidebarProps) {
  const [selLocal, setSelLocal] = useState<ReadonlySet<string>>(new Set());
  const [selRemote, setSelRemote] = useState<ReadonlySet<string>>(new Set());
  const [stashMessage, setStashMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const stashAiReason = aiReason ?? ((includeUntracked ? stashable.tracked + stashable.untracked : stashable.tracked) === 0 ? "Não há alterações para guardar no stash" : null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const filtering = query.trim() !== "";
  // Antes do early-return de `refs` nulo: a ordem dos hooks não pode mudar quando as refs carregam.
  const filtered = useMemo(() => (refs ? filterRefs(refs, query) : null), [refs, query]);
  const localTree = useMemo(() => (filtered ? buildBranchTree(filtered.branches, (b) => b.name) : []), [filtered]);
  const remoteTrees = useMemo(() => {
    const byRemote = new Map<string, RemoteBranchInfo[]>();
    for (const b of filtered?.remoteBranches ?? []) {
      const list = byRemote.get(b.remote);
      if (list) list.push(b);
      else byRemote.set(b.remote, [b]);
    }
    return new Map([...byRemote].map(([remote, list]) => [remote, buildBranchTree(list, shortRemoteName)]));
  }, [filtered]);

  // Ctrl+Alt+F foca o filtro. Abas inativas ficam ocultas: o campo sem `offsetParent` não é desta aba.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = searchRef.current;
      if (!input || input.offsetParent === null || !(e.ctrlKey || e.metaKey) || !e.altKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Arrastar uma branch sobre outra faz merge. `dragging` é a origem em curso; `over` é o destino sob o ponteiro.
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /**
   * A origem fica numa ref, não no estado: mudar o DOM dentro do `dragstart` faz o Chromium cancelar o arraste
   * na hora (`dragend` logo em seguida). O estado só serve ao visual e é atualizado no tick seguinte.
   */
  const source = useRef<string | null>(null);
  const draggingName = dragging ?? externalDrag?.source ?? null;
  const overName = over ?? externalDrag?.over ?? null;

  const dragProps = (name: string) => ({
    draggable: !busy,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", name);
      e.dataTransfer.effectAllowed = "move";
      source.current = name;
      setTimeout(() => setDragging(source.current), 0);
    },
    onDragEnd: () => {
      source.current = null;
      setDragging(null);
      setOver(null);
    },
  });

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!source.current || source.current === target || busy) return;
      e.preventDefault(); // sem isto o navegador não aceita o drop
      e.dataTransfer.dropEffect = "move";
      setOver(target);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur === target ? null : cur));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const from = source.current;
      source.current = null;
      if (from && from !== target && !busy) onMergeDrop(from, target);
      setDragging(null);
      setOver(null);
    },
  });

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  /** Recolhe (adiciona) ou expande (remove) um lote de chaves numa só atualização. */
  const setMany = (keys: string[], collapse: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (collapse) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const menu =(e: React.MouseEvent, target: SidebarTarget) => {
    e.preventDefault();
    onMenu({ x: e.clientX, y: e.clientY }, target);
  };

  if (!refs || !filtered) return <nav className="left sb" />;

  const isCollapsed = (key: string) => collapsed.has(key);
  /** Seções de branches abrem sozinhas com filtro ativo; tags e stash não dependem dele. */
  const sectionOpen = (key: string, filterable: boolean) => (filterable && filtering) || !collapsed.has(`section:${key}`);
  const ratio = (shown: number, total: number) => (filtering ? `${shown}/${total}` : String(total));

  // A seleção só vale para branches que ainda existem (e a atual nunca entra).
  const selectable = filtered.branches.filter((b) => !b.isCurrent).map((b) => b.name);
  const chosenLocal = refs.branches.filter((b) => !b.isCurrent && selLocal.has(b.name)).map((b) => b.name);
  const chosenRemote = (remote: string) => refs.remoteBranches.filter((r) => r.remote === remote && selRemote.has(r.name)).map((r) => r.name);
  const flip = (set: ReadonlySet<string>, name: string) => {
    const next = new Set(set);
    if (!next.delete(name)) next.add(name);
    return next;
  };
  /** "Selecionar todos": marca os itens visíveis; se já estão todos marcados, desmarca. */
  const toggleAll = (set: ReadonlySet<string>, visible: string[]) => {
    const next = new Set(set);
    if (visible.length > 0 && visible.every((n) => next.has(n))) visible.forEach((n) => next.delete(n));
    else visible.forEach((n) => next.add(n));
    return next;
  };
  const selectAll = (visible: string[], chosen: string[], onToggle: () => void, label: string) => (
    <label className="select-all" title={label}>
      <input
        type="checkbox"
        aria-label={label}
        disabled={busy || visible.length === 0}
        checked={visible.length > 0 && visible.every((n) => chosen.includes(n))}
        ref={(el) => {
          if (el) el.indeterminate = chosen.length > 0 && !visible.every((n) => chosen.includes(n));
        }}
        onChange={onToggle}
      />
    </label>
  );
  const deleteSelected = (count: number, onClick: () => void) =>
    count > 0 && (
      <button className="batch-delete" disabled={busy} onClick={onClick}>
        Apagar selecionadas ({count})
      </button>
    );
  // Chaves que "Expandir/Recolher tudo" alteram; sem filtro as árvores já cobrem todas as branches.
  const localKeys = folderPaths(localTree).map((path) => `folder:local:${path}`);
  const remoteKeys = refs.remotes.flatMap((remote) => [
    `remote:${remote.name}`,
    ...folderPaths(remoteTrees.get(remote.name) ?? []).map((path) => `folder:remote:${remote.name}:${path}`),
  ]);
  /** "Expandir tudo" abre também a seção; "Recolher tudo" só fecha o que está dentro dela. */
  const expandCollapse = (section: string, keys: string[]) => {
    const disabled = filtering || keys.length === 0;
    return (
      <>
        <button className="mini" disabled={disabled} title="Expandir tudo" aria-label="Expandir tudo" onClick={() => setMany([...keys, `section:${section}`], false)}>
          <Icon name="expandAll" size={14} />
        </button>
        <button className="mini" disabled={disabled} title="Recolher tudo" aria-label="Recolher tudo" onClick={() => setMany(keys, true)}>
          <Icon name="collapseAll" size={14} />
        </button>
      </>
    );
  };
  const mergeActions = (name: string) => (
    <>
      <button className="mini" disabled={busy} title="Fazer merge desta branch na atual" onClick={() => onMerge(name)}>
        ⇢
      </button>
      <button className="mini" disabled={busy} title="Rebase da branch atual em cima desta" onClick={() => onRebase(name)}>
        ⤴
      </button>
    </>
  );

  const localOpen = sectionOpen("local", true);
  const remoteOpen = sectionOpen("remote", true);
  const tagsOpen = sectionOpen("tags", false);
  const stashOpen = sectionOpen("stash", false);

  return (
    <nav className="left sb" aria-label="Branches e referências">
      <div className="sb-top">
        <p className="sb-viewing">
          Viewing <strong>{filtered.branches.length + filtered.remoteBranches.length}</strong>
        </p>
        <div className="sb-search">
          <input
            ref={searchRef}
            type="search"
            className="branch-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Filtrar (Ctrl + Alt + F)"
            aria-label="Pesquisar branches"
          />
          <Icon name="search" size={14} />
        </div>
      </div>
      {filtering && filtered.branches.length === 0 && filtered.remoteBranches.length === 0 && (
        <p className="empty-hint" role="status">
          Nenhuma branch encontrada
        </p>
      )}
      {draggingName && (
        <p className="drag-hint">
          Solte sobre a branch local que vai receber o merge de “{draggingName}”.
          {filtering && " Limpe a pesquisa para ver todas as locais."}
        </p>
      )}

      <section className={chosenLocal.length > 0 ? "sb-section sb-local has-selection" : "sb-section sb-local"} aria-label="Branches locais">
        <SectionHeader
          icon="laptop"
          title="LOCAL"
          count={ratio(filtered.branches.length, refs.branches.length)}
          open={localOpen}
          locked={filtering}
          hint="Arraste uma branch sobre outra para fazer merge"
          onToggle={() => toggle("section:local")}
        >
          {expandCollapse("local", localKeys)}
          {selectAll(selectable, chosenLocal,() => setSelLocal(toggleAll(selLocal, selectable)), "Selecionar todas as branches locais")}
          {deleteSelected(chosenLocal.length, async () => {
            if (await onDeleteMany(chosenLocal)) setSelLocal(new Set());
          })}
        </SectionHeader>
        {localOpen && (
          <div className="sb-body">
            <BranchTree
              nodes={localTree}
              scope="local"
              forceOpen={filtering}
              isCollapsed={isCollapsed}
              onToggle={toggle}
              renderLeaf={(b, label, depth) => (
                <RefRow
                  key={b.name}
                  depth={depth}
                  icon="branch"
                  label={label}
                  fullName={b.name}
                  current={b.isCurrent}
                  title={b.isCurrent ? `${b.name} (branch atual)` : `${b.name}: fazer checkout`}
                  disabled={busy || b.isCurrent}
                  onClick={() => onCheckout({ kind: "local", name: b.name })}
                  className={`${draggingName === b.name ? "dragging" : ""}${overName === b.name ? " drop-target" : ""}`.trim() || undefined}
                  data-branch={b.name}
                  onContextMenu={(e) => menu(e, { kind: "branch", branch: b })}
                  check={{ label: `Selecionar ${b.name}`, checked: !b.isCurrent && selLocal.has(b.name), disabled: busy || b.isCurrent, onChange: () => setSelLocal(flip(selLocal, b.name)) }}
                  badges={
                    <>
                      {b.gone && <span className="tag-gone" title="O upstream não existe mais no remoto">órfã</span>}
                      {b.ahead > 0 && <span className="track" title={`${b.ahead} commit(s) para enviar`}>↑{b.ahead}</span>}
                      {b.behind > 0 && <span className="track" title={`${b.behind} commit(s) para receber`}>↓{b.behind}</span>}
                    </>
                  }
                  actions={
                    !b.isCurrent && (
                      <>
                        {mergeActions(b.name)}
                        <button className="mini" disabled={busy} title="Apagar branch" onClick={() => onDelete(b.name)}>
                          ×
                        </button>
                      </>
                    )
                  }
                  {...dragProps(b.name)}
                  {...dropProps(b.name)}
                />
              )}
            />
          </div>
        )}
      </section>

      <section className="sb-section sb-remote" aria-label="Branches remotas">
        <SectionHeader icon="globe" title="REMOTE" count={ratio(filtered.remoteBranches.length, refs.remoteBranches.length)} open={remoteOpen} locked={filtering} onToggle={() => toggle("section:remote")}>
          {expandCollapse("remote", remoteKeys)}
          <button className="mini" disabled={busy} title="Adicionar remote" aria-label="Adicionar remote" onClick={onAddRemote}>
            <Icon name="plus" size={14} />
          </button>
        </SectionHeader>
        {remoteOpen && (
          <div className="sb-body">
            <>
              {refs.remotes.filter((remote) => !filtering || filtered.visibleRemotes.has(remote.name)).map((remote) => {
                const shown = filtered.remoteBranches.filter((r) => r.remote === remote.name);
                const total = refs.remoteBranches.filter((r) => r.remote === remote.name).length;
                const chosen = chosenRemote(remote.name);
                // Com termo ativo os grupos com casamento ficam abertos, sem mexer no `collapsed` do usuário.
                const open = filtering || !collapsed.has(`remote:${remote.name}`);
                return (
                  <div key={remote.name} className={chosen.length > 0 ? "remote-group has-selection" : "remote-group"}>
                    <div className={open ? "remote-head" : "remote-head collapsed"} onContextMenu={(e) => menu(e, { kind: "remote-group", remote })}>
                      <button className="ref-name" aria-expanded={open} aria-disabled={filtering || undefined} title={remote.fetchUrl} onClick={() => !filtering && toggle(`remote:${remote.name}`)}>
                        <Icon name="chevron" size={12} />
                        <Icon name="globe" size={14} />
                        <span className="sb-name">{remote.name}</span>
                      </button>
                      <span className="sb-actions">
                        {open &&
                          selectAll(
                            shown.map((r) => r.name),
                            chosen,
                            () => setSelRemote(toggleAll(selRemote, shown.map((r) => r.name))),
                            `Selecionar todas as branches de ${remote.name}`,
                          )}
                        {deleteSelected(chosen.length, async () => {
                          if (await onDeleteRemoteMany(remote.name, chosen)) setSelRemote(new Set());
                        })}
                        <button className="mini" disabled={busy} title="Remover este remote" onClick={() => onRemoveRemote(remote.name)}>
                          ×
                        </button>
                      </span>
                      <span className="sb-count">{filtering ? `${shown.length}/${total}` : shown.length}</span>
                    </div>
                    {open && (
                      <BranchTree
                        nodes={remoteTrees.get(remote.name) ?? []}
                        scope={`remote:${remote.name}`}
                        depth={1}
                        forceOpen={filtering}
                        isCollapsed={isCollapsed}
                        onToggle={toggle}
                        renderLeaf={(r, label, depth) => (
                          <RefRow
                            key={r.name}
                            depth={depth}
                            icon="branch"
                            label={label}
                            fullName={shortRemoteName(r)}
                            title={`${r.name}: criar branch local que rastreia esta e mudar para ela`}
                            disabled={busy}
                            onClick={() => onCheckout({ kind: "remote", name: r.name })}
                            className={dragging === r.name ? "dragging" : undefined}
                            onContextMenu={(e) => menu(e, { kind: "remote", branch: r })}
                            check={{ label: `Selecionar ${r.name}`, checked: selRemote.has(r.name), disabled: busy, onChange: () => setSelRemote(flip(selRemote, r.name)) }}
                            actions={mergeActions(r.name)}
                            {...dragProps(r.name)}
                          />
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </>
          </div>
        )}
      </section>

      <section className="sb-section sb-tags" aria-label="Tags">
        <SectionHeader icon="tag" title="TAGS" count={String(refs.tags.length)} open={tagsOpen} onToggle={() => toggle("section:tags")} />
        {tagsOpen && (
          <div className="sb-body">
            <ul className="sb-tree">
              {refs.tags.map((t) => (
                <RefRow
                  key={t.name}
                  icon="tag"
                  label={t.name}
                  title="Ver este commit (HEAD destacado)"
                  disabled={busy}
                  onClick={() => onCheckout({ kind: "commit", hash: t.hash })}
                  onContextMenu={(e) => menu(e, { kind: "tag", tag: t })}
                  actions={
                    <>
                      <button className="mini" disabled={busy} title="Publicar esta tag no remoto" onClick={() => onPushTag(t.name)}>
                        ↑
                      </button>
                      <button className="mini" disabled={busy} title="Apagar tag local" onClick={() => onDeleteTag(t.name)}>
                        ×
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="sb-section sb-stash" aria-label="Stash">
        <SectionHeader icon="stash" title="STASH" count={String(refs.stashes.length)} open={stashOpen} onToggle={() => toggle("section:stash")} />
        {stashOpen && (
          <div className="sb-body">
            <>
              <form
                className="stash-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onStashPush(stashMessage, includeUntracked)) setStashMessage("");
                }}
              >
                <div className="stash-message">
                  <input value={stashMessage} onChange={(e) => setStashMessage(e.target.value)} placeholder="mensagem (opcional)" disabled={busy} aria-label="Mensagem do stash" />
                  <button
                    type="button"
                    className="mini"
                    disabled={busy || stashAiReason !== null}
                    title={stashAiReason ?? "Gera a mensagem do stash com IA"}
                    aria-label="Gerar com IA"
                    onClick={async () => {
                      const result = await onAiStashMessage(includeUntracked);
                      if (result) setStashMessage(result.summary);
                    }}
                  >
                    ✨
                  </button>
                </div>
                <label>
                  <input type="checkbox" checked={includeUntracked} onChange={(e) => setIncludeUntracked(e.target.checked)} disabled={busy} /> incluir novos
                </label>
                <button type="submit" disabled={busy}>
                  Guardar alterações
                </button>
              </form>
              <ul className="sb-tree">
                {refs.stashes.map((s) => (
                  <RefRow
                    key={s.index}
                    icon="stash"
                    label={s.message || `stash@{${s.index}}`}
                    title={s.message}
                    actions={
                      <>
                        <button className="mini" disabled={busy} title="Aplicar e remover (pop)" onClick={() => onStashPop(s.index)}>
                          ↩
                        </button>
                        <button className="mini" disabled={busy} title="Descartar stash" onClick={() => onStashDrop(s.index)}>
                          ×
                        </button>
                      </>
                    }
                  />
                ))}
              </ul>
            </>
          </div>
        )}
      </section>
    </nav>
  );
}

