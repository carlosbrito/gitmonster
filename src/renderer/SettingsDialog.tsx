import { useEffect, useRef, useState } from "react";
import type { AppSettings, GitHubStatus, GitProfile, ThemeChoice, UpdaterState } from "../shared/types";
import { AiSettingsSection } from "./ai/AiSettingsSection";
import { errorMessage } from "./util";

export interface SettingsDialogProps {
  /** Repositório da aba ativa, ou null (então só o perfil global pode ser editado). */
  root: string | null;
  onClose(): void;
}

type Scope = "global" | "local";

/** Diálogo de Configurações: aparência, perfil do Git, editor externo e atualização. */
function updaterText(s: UpdaterState | null): string {
  switch (s?.status) {
    case "checking":
      return "Verificando…";
    case "none":
      return "Você já está na versão mais recente.";
    case "available":
      return `Há uma versão nova: ${s.version}.`;
    case "downloading":
      return `Baixando… ${s.percent}%`;
    case "ready":
      return `Versão ${s.version} baixada e pronta para instalar.`;
    case "disabled":
    case "error":
      return s.message;
    default:
      return "";
  }
}

export function SettingsDialog({ root, onClose }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [profile, setProfile] = useState<GitProfile | null>(null);
  const [scope, setScope] = useState<Scope>(root ? "local" : "global");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [token, setToken] = useState("");
  const [upd, setUpd] = useState<UpdaterState | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([window.gitmonster.getSettings(), window.gitmonster.getGitProfile(root), window.gitmonster.githubStatus(root)])
      .then(([s, p, g]) => {
        if (cancelled) return;
        setSettings(s);
        setProfile(p);
        setGithub(g);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root]);

  // O main avisa cada mudança de estado (verificação automática, progresso); aqui só acompanhamos.
  useEffect(() => {
    window.gitmonster.updaterState().then(setUpd).catch(() => undefined);
    window.gitmonster.appVersion().then(setVersion).catch(() => undefined);
    return window.gitmonster.onUpdaterChanged(setUpd);
  }, []);
  const updating = upd?.status === "checking" || upd?.status === "downloading";

  // O formulário do perfil mostra a identidade do escopo escolhido.
  useEffect(() => {
    const identity = profile?.[scope];
    setName(identity?.name ?? "");
    setEmail(identity?.email ?? "");
  }, [profile, scope]);

  const run = async (op: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await op();
      setMessage(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (change: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...change } : s));

  const saveSettings = () =>
    run(async () => {
      if (!settings) return;
      setSettings(await window.gitmonster.setSettings(settings));
    }, "Configurações salvas.");

  const checkUpdates = async () => {
    setError(null);
    setUpd({ status: "checking" });
    try {
      setUpd(await window.gitmonster.updaterCheck());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const downloadUpdate = async () => {
    try {
      setUpd(await window.gitmonster.updaterDownload());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const connectGithub = () =>
    run(async () => {
      await window.gitmonster.githubConnect(token);
      setToken("");
      setGithub(await window.gitmonster.githubStatus(root));
    }, "Conectado ao GitHub.");

  const disconnectGithub = () =>
    run(async () => {
      await window.gitmonster.githubDisconnect();
      setGithub(await window.gitmonster.githubStatus(root));
    }, "Desconectado do GitHub.");

  const saveProfile = () =>
    run(async () => {
      await window.gitmonster.setGitProfile(root, scope, name, email);
      setProfile(await window.gitmonster.getGitProfile(root));
    }, scope === "global" ? "Perfil global salvo." : "Perfil do repositório salvo.");

  return (
    <dialog ref={ref} className="confirm settings" aria-label="Configurações" onCancel={onClose}>
      <h3 className="dialog-title">Configurações</h3>

      {!settings && !error && <p className="dim">Carregando…</p>}

      {settings && (
        <>
          <fieldset>
            <legend>Aparência e programas</legend>
            <label className="field">
              Tema
              <select aria-label="Tema" value={settings.theme} onChange={(e) => patch({ theme: e.target.value as ThemeChoice })}>
                <option value="system">Seguir o sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </label>
            <label className="field">
              Editor externo
              <input
                aria-label="Editor externo"
                value={settings.editor}
                onChange={(e) => patch({ editor: e.target.value })}
                placeholder='ex.: code, ou C:\Programas\Editor\editor.exe (vazio = programa padrão)'
              />
            </label>
            <button disabled={busy} onClick={() => void saveSettings()}>
              Salvar configurações
            </button>
          </fieldset>

          <fieldset>
            <legend>Atualizações</legend>
            <p className="dim">
              Versão instalada: {version || "…"}. O GitMonster verifica sozinho e avisa quando houver versão nova.
            </p>
            <p role="status" aria-label="Estado da atualização">{updaterText(upd)}</p>
            <div className="conflict-actions">
              <button disabled={busy || updating} onClick={() => void checkUpdates()}>
                Verificar agora
              </button>
              {upd?.status === "available" && <button onClick={() => void downloadUpdate()}>Baixar versão {upd.version}</button>}
              {upd?.status === "ready" && <button onClick={() => void window.gitmonster.updaterInstall().catch((e) => setError(errorMessage(e)))}>Reiniciar e instalar</button>}
            </div>
          </fieldset>

          <fieldset>
            <legend>GitHub</legend>
            {github?.connected ? (
              <>
                <p>
                  Conectado{github.login ? " como " + github.login : ""}.
                </p>
                <button disabled={busy} onClick={() => void disconnectGithub()}>
                  Desconectar
                </button>
              </>
            ) : (
              <>
                <label className="field">
                  Token pessoal (permissão de leitura e escrita em Pull Requests)
                  <input
                    type="password"
                    aria-label="Token do GitHub"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_… ou github_pat_…"
                  />
                </label>
                {github && !github.secureStorage && (
                  <p className="error">Este sistema não oferece armazenamento seguro: o token não poderá ser guardado.</p>
                )}
                <button disabled={busy || token.trim() === ""} onClick={() => void connectGithub()}>
                  Conectar
                </button>
              </>
            )}
          </fieldset>

          <AiSettingsSection />

          <fieldset>
            <legend>Perfil do Git</legend>
            <label className="field">
              Onde gravar
              <select aria-label="Escopo do perfil" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                <option value="global">Global (todos os repositórios)</option>
                {root && <option value="local">Só este repositório</option>}
              </select>
            </label>
            <label className="field">
              Nome
              <input aria-label="Nome do autor" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              E-mail
              <input aria-label="E-mail do autor" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {profile && (
              <p className="dim">
                Nos commits deste repositório vale: {profile.effective.name || "(sem nome)"} &lt;{profile.effective.email || "sem e-mail"}&gt;
              </p>
            )}
            <button disabled={busy} onClick={() => void saveProfile()}>
              Salvar perfil
            </button>
          </fieldset>
        </>
      )}

      {message && <p role="status" className="notice">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="confirm-actions">
        <button onClick={onClose}>Fechar</button>
      </div>
    </dialog>
  );
}
