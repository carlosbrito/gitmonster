import { useCallback, useEffect, useRef, useState } from "react";
import { emptyGraphState, layoutGraph, type GraphRow, type GraphState } from "../../shared/graph/layoutGraph";
import type {
  Commit,
  CommitDetail,
  CommitFile,
  DiffHunk,
  DiffTarget,
  FileChange,
  FileDiff,
  LogPage,
  RefsSnapshot,
  RepoStatus,
  UndoInfo,
} from "../../shared/types";
import { PAGE, errorMessage } from "../util";

export interface OpenDiff {
  target: DiffTarget;
  conflicted: boolean;
  diff: FileDiff | null;
  /** Presente quando o diff é de um commit (somente leitura), não da árvore de trabalho. */
  commitHash?: string;
}

export type RunAfter = "status" | "all";

/** Limite de páginas (de `PAGE` commits) que o `revealHead` carrega à procura do commit de HEAD. */
const MAX_REVEAL_PAGES = 200;

/**
 * Todo o estado de UM repositório (uma aba): dados do Git, grafo paginado, seleção, diff aberto e o
 * executor de operações. `active=false` (aba em segundo plano) suspende a atualização ao voltar à janela.
 */
export function useRepoState(root: string, active: boolean) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [refs, setRefs] = useState<RefsSnapshot | null>(null);
  const [undoInfo, setUndoInfo] = useState<UndoInfo | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [rows, setRows] = useState<GraphRow[]>([]);
  const [maxLane, setMaxLane] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [openDiff, setOpenDiff] = useState<OpenDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Estado das pistas entre páginas; fora do React para não disparar render.
  const graphState = useRef<GraphState>(emptyGraphState());
  const loading = useRef(false);
  /** Quantos commits já foram carregados e se há mais; lidos fora do React pelo `revealHead`. */
  const loaded = useRef({ count: 0, hasMore: false, hashes: new Set<string>() });
  /** Pedido para o grafo rolar até um commit e destacá-lo; `nonce` permite revelar o mesmo commit de novo. */
  const [reveal, setReveal] = useState<{ hash: string; nonce: number } | null>(null);

  const applyPage = useCallback((page: LogPage, reset: boolean) => {
    if (reset) graphState.current = emptyGraphState();
    const layout = layoutGraph(page.commits, graphState.current);
    graphState.current = layout.state;
    const hashes = reset ? new Set<string>() : loaded.current.hashes;
    for (const c of page.commits) hashes.add(c.hash);
    loaded.current = { count: hashes.size, hasMore: page.hasMore, hashes };
    setCommits((prev) => (reset ? page.commits : prev.concat(page.commits)));
    setRows((prev) => (reset ? layout.rows : prev.concat(layout.rows)));
    setMaxLane(layout.state.maxLane);
    setHasMore(page.hasMore);
  }, []);

  /** Recarrega status e refs e, se houver diff da árvore de trabalho aberto, o diff dele. */
  const refreshStatus = useCallback(
    async (diffNow: OpenDiff | null) => {
      const [st, rf, un] = await Promise.all([window.gitmonster.status(root), window.gitmonster.refs(root), window.gitmonster.undoInfo(root)]);
      setStatus(st);
      setRefs(rf);
      setUndoInfo(un);
      if (!diffNow || diffNow.commitHash) return; // diff de commit é imutável
      if (!st.files.some((f) => f.path === diffNow.target.path)) {
        setOpenDiff(null);
        return;
      }
      const diff = await window.gitmonster.diff(root, diffNow.target);
      setOpenDiff({ ...diffNow, diff });
    },
    [root],
  );

  const reloadAll = useCallback(async () => {
    const [st, rf, un, page] = await Promise.all([
      window.gitmonster.status(root),
      window.gitmonster.refs(root),
      window.gitmonster.undoInfo(root),
      window.gitmonster.log(root, 0, PAGE),
    ]);
    setStatus(st);
    setRefs(rf);
    setUndoInfo(un);
    applyPage(page, true);
  }, [root, applyPage]);

  /** Executa uma operação, mostra erro se falhar e sempre sincroniza a tela com o repositório. */
  const run = useCallback(
    async (op: () => Promise<unknown>, after: RunAfter = "status"): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      let ok = true;
      try {
        await op();
      } catch (e) {
        ok = false;
        setError(errorMessage(e));
      }
      try {
        if (after === "all" && ok) {
          setOpenDiff(null);
          await reloadAll();
        } else {
          await refreshStatus(openDiff);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
      return ok;
    },
    [openDiff, reloadAll, refreshStatus],
  );

  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      applyPage(await window.gitmonster.log(root, commits.length, PAGE), false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      loading.current = false;
    }
  }, [root, commits.length, applyPage]);

  /**
   * Leva o grafo até o commit de HEAD (depois de um checkout): carrega páginas até achá-lo, com um limite de
   * segurança, e pede ao grafo que role até ele e o destaque.
   */
  const revealHead = useCallback(
    async () => {
      try {
        const head = (await window.gitmonster.status(root)).headOid;
        if (!head) return;
        let pages = 0;
        let found = loaded.current.hashes.has(head);
        while (!found && loaded.current.hasMore && pages < MAX_REVEAL_PAGES) {
          if (loading.current) break;
          loading.current = true;
          try {
            const page = await window.gitmonster.log(root, loaded.current.count, PAGE);
            applyPage(page, false);
            found = page.commits.some((c) => c.hash === head);
          } finally {
            loading.current = false;
          }
          pages++;
        }
        if (found) setReveal((prev) => ({ hash: head, nonce: (prev?.nonce ?? 0) + 1 }));
        else setNotice("Não foi possível mostrar a posição da branch no grafo: o commit está além dos commits carregados.");
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [root, applyPage],
  );

  // Carga inicial da aba.
  useEffect(() => {
    reloadAll().catch((e) => setError(errorMessage(e)));
  }, [reloadAll]);

  // Voltar para a janela (ex.: depois de editar arquivos no editor) atualiza o status da aba ativa.
  useEffect(() => {
    if (!active) return;
    const onFocus = () => void refreshStatus(openDiff).catch((e) => setError(errorMessage(e)));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, openDiff, refreshStatus]);

  // Ao voltar para esta aba, o disco pode ter mudado enquanto ela estava em segundo plano.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) void refreshStatus(openDiff).catch((e) => setError(errorMessage(e)));
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de `active`
  }, [active]);

  // Detalhe do commit selecionado; `cancelled` descarta resposta de uma seleção que já ficou para trás.
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    window.gitmonster
      .commitDetail(root, selected.hash)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root, selected]);

  const showDiff = useCallback(
    async (target: DiffTarget, file: FileChange) => {
      setOpenDiff({ target, conflicted: file.conflicted, diff: null });
      if (file.conflicted) return;
      try {
        const diff = await window.gitmonster.diff(root, target);
        setOpenDiff({ target, conflicted: false, diff });
      } catch (e) {
        setError(errorMessage(e));
        setOpenDiff(null);
      }
    },
    [root],
  );

  const showCommitFile = useCallback(
    async (file: CommitFile) => {
      if (!selected) return;
      const target: DiffTarget = { path: file.path, staged: false, untracked: false };
      setOpenDiff({ target, conflicted: false, diff: null, commitHash: selected.hash });
      try {
        const diff = await window.gitmonster.commitFileDiff(root, selected.hash, file.path);
        setOpenDiff({ target, conflicted: false, diff, commitHash: selected.hash });
      } catch (e) {
        setError(errorMessage(e));
        setOpenDiff(null);
      }
    },
    [root, selected],
  );

  /** Stage/unstage do hunk do diff da árvore de trabalho aberto. */
  const onHunk = useCallback(
    (hunkIndex: number, hunk: DiffHunk) => {
      if (!openDiff || openDiff.commitHash) return;
      const ref = { path: openDiff.target.path, hunkIndex, hunkHeader: hunk.header };
      void run(() => (openDiff.target.staged ? window.gitmonster.unstageHunk(root, ref) : window.gitmonster.stageHunk(root, ref)));
    },
    [openDiff, root, run],
  );

  /** Descarta um hunk não staged (o diff aberto é recarregado por `run`). */
  const onDiscardHunk = useCallback(
    (hunkIndex: number, hunk: DiffHunk) => {
      if (!openDiff || openDiff.commitHash || openDiff.target.staged || openDiff.target.untracked) return;
      const ref = { path: openDiff.target.path, hunkIndex, hunkHeader: hunk.header };
      void run(() => window.gitmonster.discardHunk(root, ref));
    },
    [openDiff, root, run],
  );

  return {
    status,
    refs,
    undoInfo,
    commits,
    rows,
    maxLane,
    hasMore,
    selected,
    setSelected,
    detail,
    openDiff,
    setOpenDiff,
    busy,
    error,
    setError,
    notice,
    setNotice,
    run,
    loadMore,
    reveal,
    revealHead,
    showDiff,
    showCommitFile,
    onHunk,
    onDiscardHunk,
  };
}
