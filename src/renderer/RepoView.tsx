import { useEffect, useRef, useState } from "react";
import type { AiTextResult, Commit, DiffHunk, PullMode, SearchField } from "../shared/types";
import { branchActions } from "./actions/branchActions";
import { commitActions } from "./actions/commitActions";
import { OPERATION_LABEL, type ActionCtx } from "./actions/context";
import { discardActions } from "./actions/discardActions";
import { remoteActions } from "./actions/remoteActions";
import { AiStatus } from "./ai/AiStatus";
import { ExplainDialog } from "./ai/ExplainDialog";
import { useAi } from "./ai/useAi";
import { BlameView } from "./BlameView";
import { ChangesPanel } from "./ChangesPanel";
import { useContextMenu } from "./ContextMenu";
import { CommitGraph } from "./CommitGraph";
import { CommitPanel } from "./CommitPanel";
import { ConflictView } from "./ConflictView";
import { DiffView } from "./DiffView";
import { FileHistoryView } from "./FileHistoryView";
import { GitMonitor } from "./GitMonitor";
import { useDialogs } from "./hooks/useDialogs";
import { usePullMode } from "./hooks/usePullMode";
import { useRepoState } from "./hooks/useRepoState";
import { useStoredSize } from "./hooks/useStoredSize";
import { clampPanel, MIN_CENTER_W } from "./panelSize";
import { Splitter } from "./Splitter";
import { commitFileMenu, commitMenu, fileMenu, sidebarMenu, type MenuActions } from "./menus";
import { RepoToolbar } from "./RepoToolbar";
import { SearchBar } from "./SearchBar";
import { SearchResults } from "./SearchResults";
import { PullRequestsView } from "./PullRequestsView";
import { Sidebar } from "./Sidebar";
import { errorMessage, short } from "./util";

export interface RepoViewProps {
  root: string;
  /** Abre o diálogo de Configurações (usado pela tela de Pull Requests para conectar ao GitHub). */
  onOpenSettings(): void;
  /** Muda quando as Configurações são fechadas; recarrega o que depende delas. */
  settingsRev: number;
  /** Aba em primeiro plano. Abas em segundo plano continuam montadas, mas escondidas. */
  active: boolean;
  /** Repositórios do seletor da toolbar: abas abertas e recentes. */
  repoChoices: { root: string; open: boolean }[];
  /** Ativa (ou abre) outro repositório. */
  onSwitchRepo(root: string): void;
}

/** Um repositório inteiro: toolbar, sidebar, grafo, diff e painéis. Não conhece as abas. */
export function RepoView({ root, active, onOpenSettings, settingsRev, repoChoices, onSwitchRepo }: RepoViewProps) {
  const dialogs = useDialogs();
  const [pullMode, setPullMode] = usePullMode();
  const s = useRepoState(root, active);
  const { status, openDiff, busy } = s;

  // ----- IA -----
  const ai = useAi(dialogs.ask, settingsRev);
  const [explain, setExplain] = useState<{ title: string; result: AiTextResult } | null>(null);
  const aiCommitMessage = (amend: boolean) => ai.run((id) => window.gitmonster.aiCommitMessage(root, amend, id));
  const aiStashMessage = (includeUntracked: boolean) => ai.run((id) => window.gitmonster.aiStashMessage(root, includeUntracked, id));
  const aiPullRequest = (base: string) => ai.run((id) => window.gitmonster.aiPullRequest(root, base, id));
  const aiExplain = async (target: { kind: "worktree" } | { kind: "commit"; hash: string }) => {
    const result = await ai.run((id) => window.gitmonster.aiExplain(root, target, id));
    if (result) setExplain({ title: target.kind === "commit" ? `Commit ${short(target.hash)}` : "Alterações locais", result });
  };

  const ctx: ActionCtx = {
    root,
    status,
    run: s.run,
    ask: dialogs.ask,
    askForm: dialogs.askForm,
    askRebase: dialogs.askRebase,
    askDrop: dialogs.askDrop,
    setNotice: s.setNotice,
    revealHead: () => revealHead(),
  };
  const branches = branchActions(ctx);
  const onBranchDrop = (source: string, target: string) =>
    branches.dropOnto(source, target, s.refs?.branches.some((b) => b.name === source) ?? false);
  const [graphDrag, setGraphDrag] = useState<{ source: string; over: string | null } | null>(null);
  const remotes = remoteActions(ctx);
  const commits = commitActions(ctx);
  const discard = discardActions(ctx);

  /** Depois de um checkout: fecha o que cobre o grafo e o leva até o commit de HEAD. */
  const revealHead = async () => {
    setSearch(null);
    setFileView(null);
    setPullsOpen(false);
    await s.revealHead();
  };

  // ----- busca de commits -----
  const [search, setSearch] = useState<{ field: SearchField; query: string; commits: Commit[] | null } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // Painéis redimensionáveis: larguras da sidebar e do painel direito, e a divisão commit / alterações (fração da altura).
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const leftW = useStoredSize("gitmonster.sidebarWidth", 230);
  const sideW = useStoredSize("gitmonster.sidePanelWidth", 340);
  const sideSplit = useStoredSize("gitmonster.sideSplit", 0.5);
  /** Espaço que sobra para um painel lateral sem espremer o centro abaixo do mínimo. */
  const roomFor = (other: number) => (workspaceRef.current?.clientWidth ?? Infinity) - other - MIN_CENTER_W;

  const runSearch = (field: SearchField, query: string) => {
    setFileView(null);
    setSearch({ field, query, commits: null });
    s.setError(null);
    window.gitmonster
      .searchCommits(root, field, query)
      .then((commits) => setSearch((cur) => (cur && cur.field === field && cur.query === query ? { field, query, commits } : cur)))
      .catch((e) => {
        s.setError(errorMessage(e));
        setSearch(null);
      });
  };

  // A barra de busca fica escondida até o botão Pesquisar ou o Ctrl+F; ao abrir, o campo recebe o foco.
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInput.current?.focus();
      searchInput.current?.select();
    }, 0);
  };

  // Ctrl+F abre a busca da aba ativa e foca o campo.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Visão de arquivo no centro: histórico de commits ou blame (opcionalmente numa revisão).
  const [fileView, setFileView] = useState<{ kind: "history" | "blame"; path: string; rev: string | null } | null>(null);

  const [pullsOpen, setPullsOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);

  const contextMenu = useContextMenu();
  const menuActions: MenuActions = {
    branches,
    commits,
    remotes,
    discard,
    stage: (paths) => void s.run(() => window.gitmonster.stage(root, paths)),
    unstage: (paths) => void s.run(() => window.gitmonster.unstage(root, paths)),
    openDiff: (target, file) => void s.showDiff(target, file),
    openFolder: () => void s.run(() => window.gitmonster.openFolder(root)),
    openInEditor: (path) => void s.run(() => window.gitmonster.openInEditor(root, path)),
    fileHistory: (path) => setFileView({ kind: "history", path, rev: null }),
    blame: (path, rev) => setFileView({ kind: "blame", path, rev }),
    copy: (text) => void navigator.clipboard?.writeText(text).catch(() => undefined),
  };

  /** Resolve o conflito aberto e, se deu certo, fecha o editor. */
  const resolveOpenConflict = async (op: () => Promise<unknown>) => {
    if (await s.run(op)) s.setOpenDiff(null);
  };

  // Alterações não commitadas viram a linha "// WIP" do grafo.
  const changed = status?.files ?? [];
  const wip =
    changed.length === 0
      ? null
      : { modified: changed.filter((f) => !f.untracked).length, added: changed.filter((f) => f.untracked).length };

  const createBranchFromToolbar = () =>
    void dialogs.askForm({ title: "Nova branch", nameLabel: "Nome da branch", confirmLabel: "Criar" }).then((result) => result && branches.create(result.name));

  const workDiffTarget = openDiff && !openDiff.commitHash ? openDiff.target : null;
  const { selected } = s;

  return (
    <div className="repo-view" style={{ display: active ? "flex" : "none" }} data-root={root}>
      <RepoToolbar
        root={root}
        status={status}
        refs={s.refs}
        undoInfo={s.undoInfo}
        busy={busy}
        pullMode={pullMode}
        onPullMode={setPullMode}
        repoChoices={repoChoices}
        onSwitchRepo={onSwitchRepo}
        onCheckout={branches.checkout}
        onUndo={commits.undo}
        onRedo={commits.redo}
        onFetch={remotes.fetch}
        onPull={() => remotes.pull(pullMode)}
        onPush={remotes.push}
        onForcePush={remotes.forcePush}
        onCreateBranch={createBranchFromToolbar}
        onStash={() => void branches.stashPush("", true)}
        onPop={() => s.refs?.stashes[0] && branches.stashPop(s.refs.stashes[0].index)}
        hasChanges={changed.length > 0}
        pullsOpen={pullsOpen}
        onTogglePulls={() => setPullsOpen((o) => !o)}
        monitorOpen={monitorOpen}
        onToggleMonitor={() => setMonitorOpen((o) => !o)}
        searchOpen={searchOpen}
        onToggleSearch={() => (searchOpen ? setSearchOpen(false) : openSearch())}
      />
      {searchOpen && (
        <div className="search-strip">
          <SearchBar ref={searchInput} busy={busy} onSearch={runSearch} onClear={() => setSearch(null)} />
        </div>
      )}

      {status?.operation && (
        <p role="status" className="merging">
          {OPERATION_LABEL[status.operation]} em andamento. Resolva os conflitos (marque os arquivos com &quot;+&quot;) e{" "}
          <button className="link" disabled={busy} onClick={branches.continueOperation}>
            continue
          </button>
          {status.operation !== "merge" && (
            <>
              , <button className="link" disabled={busy} onClick={branches.skipOperation}>pule este passo</button>
            </>
          )}{" "}
          ou{" "}
          <button className="link" disabled={busy} onClick={branches.abortOperation}>
            aborte
          </button>
          .
        </p>
      )}
      <AiStatus ai={ai} />
      {s.notice && <p role="status" className="notice">{s.notice}</p>}
      {s.error && (
        <p role="alert" className="error">
          {s.error}
        </p>
      )}

      <div
        className="workspace"
        ref={workspaceRef}
        style={{ "--left-w": `${clampPanel(leftW.size, 180, 480)}px`, "--side-w": `${clampPanel(sideW.size, 260, 720)}px` } as React.CSSProperties}
      >
        <Sidebar
          refs={s.refs}
          busy={busy}
          onCheckout={branches.checkout}
          onMerge={branches.merge}
          onRebase={branches.rebase}
          onPushTag={remotes.pushTag}
          onDeleteTag={commits.deleteTag}
          onDelete={branches.deleteBranch}
          onDeleteMany={branches.deleteBranches}
          onDeleteRemoteMany={remotes.deleteRemoteBranches}
          onStashPush={branches.stashPush}
          stashable={{ tracked: changed.filter((f) => !f.untracked).length, untracked: changed.filter((f) => f.untracked).length }}
          aiReason={ai.disabledReason}
          onAiStashMessage={aiStashMessage}
          onStashPop={branches.stashPop}
          onStashDrop={branches.stashDrop}
          onMenu={(point, target) => contextMenu.open(point, sidebarMenu(target, menuActions, status?.branch ?? null))}
          onMergeDrop={onBranchDrop}
          externalDrag={graphDrag}
          onAddRemote={remotes.addRemote}
          onRemoveRemote={remotes.removeRemote}
        />
        <Splitter
          orientation="vertical"
          label="Largura da barra lateral"
          value={leftW.size}
          onChange={(next) => leftW.set(clampPanel(next, 180, 480, roomFor(sideW.size)))}
          onCommit={leftW.commit}
          onReset={leftW.reset}
        />
        <div className="center" style={{ display: openDiff || search || fileView || pullsOpen ? "none" : "flex" }}>
          <CommitGraph
            commits={s.commits}
            rows={s.rows}
            maxLane={s.maxLane}
            hasMore={s.hasMore}
            selectedHash={selected?.hash ?? null}
            refs={s.refs}
            wip={wip}
            onSelect={s.setSelected}
            onSelectWip={() => s.setSelected(null)}
            onBranchDrop={onBranchDrop}
            onCheckout={branches.checkout}
            onContextMenu={(commit, point) => contextMenu.open(point, commitMenu(commit, menuActions))}
            onLoadMore={() => void s.loadMore()}
            onDragTarget={(source, over) => setGraphDrag(source ? { source, over } : null)}
            reveal={s.reveal}
          />
        </div>
        {pullsOpen && !openDiff && !fileView && (
          <div className="center">
            <PullRequestsView
              key={settingsRev}
              root={root}
              onClose={() => setPullsOpen(false)}
              onOpenSettings={onOpenSettings}
              aiReason={ai.disabledReason}
              onAiPull={aiPullRequest}
              onCheckout={(number) => {
                void s.run(async () => {
                  const branch = await window.gitmonster.githubCheckoutPull(root, number);
                  s.setNotice(`Pull Request #${number} trazido para a branch "${branch}".`);
                }, "all").then((ok) => ok && setPullsOpen(false));
              }}
            />
          </div>
        )}
        {fileView && !openDiff && (
          <div className="center">
            {fileView.kind === "history" ? (
              <FileHistoryView
                root={root}
                path={fileView.path}
                selectedHash={selected?.hash ?? null}
                onSelect={s.setSelected}
                onClose={() => setFileView(null)}
              />
            ) : (
              <BlameView root={root} path={fileView.path} rev={fileView.rev} onSelect={s.setSelected} onClose={() => setFileView(null)} />
            )}
          </div>
        )}
        {search && !pullsOpen && !fileView && !openDiff && (
          <div className="center">
            <SearchResults
              field={search.field}
              query={search.query}
              commits={search.commits}
              selectedHash={selected?.hash ?? null}
              onSelect={s.setSelected}
              onClose={() => setSearch(null)}
            />
          </div>
        )}
        {openDiff?.conflicted && (
          <div className="center">
            <ConflictView
              root={root}
              path={openDiff.target.path}
              busy={busy}
              onClose={() => s.setOpenDiff(null)}
              onResolve={(content) => void resolveOpenConflict(() => window.gitmonster.resolveConflict(root, openDiff.target.path, content))}
              onResolveSide={(side) => void resolveOpenConflict(() => window.gitmonster.resolveConflictSide(root, openDiff.target.path, side))}
              aiReason={ai.disabledReason}
              onAiResolve={() => ai.run((id) => window.gitmonster.aiConflict(root, openDiff.target.path, id))}
            />
          </div>
        )}
        {openDiff && !openDiff.conflicted && (
          <div className="center">
            <DiffView
              target={openDiff.target}
              diff={openDiff.diff}
              conflicted={openDiff.conflicted}
              busy={busy}
              onHunk={s.onHunk}
              onClose={() => s.setOpenDiff(null)}
              {...(openDiff.commitHash ? { readOnlyLabel: `commit ${short(openDiff.commitHash)}` } : {})}
              {...(workDiffTarget && !workDiffTarget.staged && !workDiffTarget.untracked
                ? { onDiscardHunk: (i: number, h: DiffHunk) => discard.hunk(workDiffTarget.path, () => s.onDiscardHunk(i, h)) }
                : {})}
            />
          </div>
        )}
        <Splitter
          orientation="vertical"
          direction={-1}
          label="Largura do painel direito"
          value={sideW.size}
          onChange={(next) => sideW.set(clampPanel(next, 260, 720, roomFor(leftW.size)))}
          onCommit={sideW.commit}
          onReset={sideW.reset}
        />
        <aside className="side" ref={sideRef}>
          {selected && !workDiffTarget && (
            <>
              <div className="side-top" style={{ flexBasis: `${clampPanel(sideSplit.size * 100, 20, 80)}%` }}>
                <CommitPanel
                  commit={selected}
                  detail={s.detail}
                  openFile={openDiff?.commitHash ? openDiff.target.path : null}
                  busy={busy}
                  onOpenFile={(f) => void s.showCommitFile(f)}
                  onFileMenu={(point, file) => contextMenu.open(point, commitFileMenu(file, selected.hash, menuActions))}
                  onCheckout={() => branches.checkout({ kind: "commit", hash: selected.hash })}
                  onBranchHere={() => commits.branchHere(selected.hash)}
                  onTagHere={() => commits.tagHere(selected.hash)}
                  onCherryPick={() => commits.cherryPick(selected.hash)}
                  onRevert={() => commits.revert(selected.hash)}
                  onReset={(mode) => commits.reset(selected.hash, mode)}
                  onInteractiveRebase={() => branches.interactiveRebase(selected.hash, short(selected.hash))}
                  aiReason={ai.disabledReason}
                  onAiExplain={() => void aiExplain({ kind: "commit", hash: selected.hash })}
                />
              </div>
              <Splitter
                orientation="horizontal"
                label="Divisão entre o commit e as alterações"
                value={sideSplit.size * (sideRef.current?.clientHeight ?? 1)}
                onChange={(next) => sideSplit.set(Math.min(0.8, Math.max(0.2, next / (sideRef.current?.clientHeight || 1))))}
                onCommit={sideSplit.commit}
                onReset={sideSplit.reset}
              />
            </>
          )}
          <div className="side-bottom">
            <ChangesPanel
              files={status?.files ?? []}
              branch={status?.branch ?? null}
              selected={workDiffTarget}
              busy={busy}
              onOpen={(target, file) => void s.showDiff(target, file)}
              onStage={(paths) => void s.run(() => window.gitmonster.stage(root, paths))}
              onUnstage={(paths) => void s.run(() => window.gitmonster.unstage(root, paths))}
              onDiscard={discard.files}
              onFileMenu={(point, file, staged) => contextMenu.open(point, fileMenu(file, staged, menuActions))}
              onCommit={(message, amend) => s.run(() => window.gitmonster.commit(root, message, amend), "all")}
              aiReason={ai.disabledReason}
              onAiCommitMessage={aiCommitMessage}
              onAiExplain={() => void aiExplain({ kind: "worktree" })}
            />
          </div>
        </aside>
      </div>

      {monitorOpen && <GitMonitor root={root} onClose={() => setMonitorOpen(false)} />}

      {explain && <ExplainDialog title={explain.title} result={explain.result} onClose={() => setExplain(null)} />}

      {dialogs.element}
      {contextMenu.element}
    </div>
  );
}
