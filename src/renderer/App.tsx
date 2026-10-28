import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedRepo, SessionState } from "../shared/types";
import { ErrorDialog } from "./ErrorDialog";
import { describeError } from "./errorInfo";
import { RepoView } from "./RepoView";
import { SettingsDialog } from "./SettingsDialog";
import { MenuBar } from "./MenuBar";
import { StartScreen } from "./StartScreen";
import { TabBar } from "./TabBar";
import { TitleBar } from "./TitleBar";
import { UpdateBanner } from "./UpdateBanner";
import { errorMessage } from "./util";

const MAX_RECENTS = 20;
const SAVE_DEBOUNCE_MS = 300;

/**
 * Casca do app: abas, tela inicial e sessão. Cada aba é um `RepoView` que continua montado em segundo plano,
 * então cada repositório guarda a própria seleção, diff aberto e posição no grafo.
 */
export function App() {
  const [tabs, setTabs] = useState<string[]>([]);
  /** Raiz da aba ativa; null = tela inicial à frente. */
  const [active, setActive] = useState<string | null>(null);
  const [recents, setRecents] = useState<SessionState["recents"]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Sobe a cada fechamento das Configurações: telas que dependem delas (GitHub) recarregam. */
  const [settingsRev, setSettingsRev] = useState(0);

  // Restaura a sessão (abas, aba ativa, recentes) ao iniciar.
  useEffect(() => {
    window.gitmonster
      .loadSession()
      .then(({ session, removed }) => {
        setTabs(session.tabs);
        setActive(session.active);
        setRecents(session.recents);
        if (removed.length > 0) {
          setNotice(`${removed.length === 1 ? "1 repositório não existe mais" : `${removed.length} repositórios não existem mais`} e saiu da lista: ${removed.join(", ")}`);
        }
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setReady(true));
  }, []);

  // Grava a sessão quando abas, aba ativa ou recentes mudam.
  const latest = useRef<SessionState>({ version: 1, tabs, active, recents });
  latest.current = { version: 1, tabs, active, recents };
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void window.gitmonster.saveSession(latest.current).catch(() => undefined), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ready, tabs, active, recents]);

  const openRoot = useCallback((root: string) => {
    setTabs((prev) => (prev.includes(root) ? prev : [...prev, root]));
    setActive(root);
    setRecents((prev) =>
      [{ root, openedAt: new Date().toISOString() }, ...prev.filter((r) => r.root !== root)].slice(0, MAX_RECENTS),
    );
  }, []);

  const closeTab = useCallback(
    (root: string) => {
      setTabs((prev) => prev.filter((r) => r !== root));
      setActive((cur) => {
        if (cur !== root) return cur;
        const idx = tabs.indexOf(root);
        const rest = tabs.filter((r) => r !== root);
        return rest[idx] ?? rest[idx - 1] ?? null;
      });
    },
    [tabs],
  );

  /** Executa uma ação de tela inicial que devolve um repositório (ou null se o usuário cancelou). */
  const start = useCallback(
    async (action: () => Promise<OpenedRepo | null>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const repo = await action();
        if (repo) openRoot(repo.root);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [openRoot],
  );

  /** Seletor de repositório da toolbar: abas abertas primeiro, depois os recentes que não estão abertos. */
  const repoChoices = [...tabs.map((root) => ({ root, open: true })), ...recents.filter((r) => !tabs.includes(r.root)).map((r) => ({ root: r.root, open: false }))];

  // Comandos do menu/atalhos que dependem do estado do app (o main só os repassa).
  const commandHandlers = useRef({ openRepo: () => {}, initRepo: () => {}, closeActive: () => {} });
  commandHandlers.current = {
    openRepo: () => void start(() => window.gitmonster.pickRepo()),
    initRepo: () => void start(() => window.gitmonster.initRepo()),
    closeActive: () => active && closeTab(active),
  };
  useEffect(
    () =>
      window.gitmonster.onMenuCommand((command) => {
        const h = commandHandlers.current;
        switch (command) {
          case "new-tab":
            return setActive(null);
          case "open-repo":
            return h.openRepo();
          case "init-repo":
            return h.initRepo();
          case "clone-repo":
            setActive(null);
            // A tela inicial acaba de montar: foca o campo da URL.
            return void setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="URL do repositório"]')?.focus(), 0);
          case "close-tab":
            return h.closeActive();
          case "settings":
            return setSettingsOpen(true);
        }
      }),
    [],
  );

  return (
    <div className="app">
      <TitleBar />
      <MenuBar />
      <UpdateBanner />
      <TabBar
        tabs={tabs}
        active={active}
        onSelect={(root) => {
          setError(null);
          setActive(root);
        }}
        onClose={closeTab}
        onNew={() => setActive(null)}
        onSettings={() => setSettingsOpen(true)}
      />

      {active === null && (
        <>
          {notice && <p role="status" className="notice">{notice}</p>}
          {error && <ErrorDialog key={error} info={describeError(error)} onClose={() => setError(null)} />}
          <StartScreen
            recents={recents}
            busy={busy || !ready}
            onOpen={() => void start(() => window.gitmonster.pickRepo())}
            onClone={(url) => void start(() => window.gitmonster.cloneRepo(url))}
            onInit={() => void start(() => window.gitmonster.initRepo())}
            onOpenRecent={openRoot}
          />
        </>
      )}

      {tabs.map((root) => (
        <RepoView
          key={root}
          root={root}
          active={root === active}
          settingsRev={settingsRev}
          onOpenSettings={() => setSettingsOpen(true)}
          repoChoices={repoChoices}
          onSwitchRepo={openRoot}
        />
      ))}

      {settingsOpen && (
        <SettingsDialog
          root={active}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsRev((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
