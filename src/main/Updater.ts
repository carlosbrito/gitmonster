import type { UpdaterState } from "../shared/types";

/** O que usamos do `electron-updater`; separado para os testes trocarem por um falso. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  setFeedURL(options: { provider: "generic"; url: string }): void;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: "update-available" | "update-not-available" | "update-downloaded" | "download-progress" | "error", listener: (...args: any[]) => void): unknown;
}

export interface UpdaterDeps {
  /**
   * Feed alternativo (`GITMONSTER_UPDATE_URL`, para testes e homologação). `null` usa o feed embutido no build
   * (`app-update.yml`, gerado pelo electron-builder a partir de `build.publish`: as releases públicas no GitHub).
   */
  feedUrl: string | null;
  isPackaged: boolean;
  /** Carrega o `electron-updater` só quando precisa (em desenvolvimento nem é importado). */
  loadAutoUpdater(): Promise<AutoUpdaterLike>;
  /** Avisado a cada mudança de estado (o main repassa às janelas). */
  onChange?(state: UpdaterState): void;
}

/** Notas da versão em texto puro: o electron-updater entrega HTML (corpo da Release) ou uma lista por versão. */
export function releaseNotesText(notes: unknown): string {
  const raw = Array.isArray(notes)
    ? notes.map((n: { version?: string; note?: string | null }) => `${n?.version ?? ""}\n${n?.note ?? ""}`).join("\n\n")
    : typeof notes === "string"
      ? notes
      : "";
  const text = raw
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 20_000 ? text.slice(0, 20_000) + "…" : text;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "erro desconhecido";

/**
 * Máquina de estados da atualização: verificar → (há versão nova) → baixar → pronta → reiniciar e instalar.
 * Nada roda fora do app instalado. Não baixa sozinho: só avisa.
 */
export function createUpdater(deps: UpdaterDeps) {
  let state: UpdaterState = { status: "idle" };
  let updater: AutoUpdaterLike | null = null;

  /** Última versão encontrada: permite "Tentar de novo" depois de um download que falhou. */
  let found: { version: string; notes: string } | null = null;

  const set = (next: UpdaterState) => {
    state = next;
    deps.onChange?.(state);
  };

  /** Erro durante o download leva a versão junto (a tela oferece "Tentar de novo"); na verificação, não. */
  const setError = (e: unknown) =>
    set(state.status === "downloading" && found ? { status: "error", message: errorText(e), version: found.version } : { status: "error", message: errorText(e) });

  async function ensure(): Promise<AutoUpdaterLike | null> {
    if (!deps.isPackaged) {
      set({ status: "disabled", message: "A atualização só funciona no app instalado." });
      return null;
    }
    if (!updater) {
      const u = await deps.loadAutoUpdater();
      u.autoDownload = false;
      u.autoInstallOnAppQuit = true;
      u.on("update-available", (info: { version?: string; releaseNotes?: unknown }) => {
        found = { version: info?.version ?? "", notes: releaseNotesText(info?.releaseNotes) };
        set({ status: "available", ...found });
      });
      u.on("update-not-available", () => {
        found = null;
        set({ status: "none" });
      });
      u.on("download-progress", (p: { percent?: number }) => set({ status: "downloading", percent: Math.round(p?.percent ?? 0) }));
      u.on("update-downloaded", (info: { version?: string }) => set({ status: "ready", version: info?.version ?? "" }));
      u.on("error", (e: unknown) => setError(e));
      if (deps.feedUrl) u.setFeedURL({ provider: "generic", url: deps.feedUrl });
      updater = u;
    }
    return updater;
  }

  return {
    getState: (): UpdaterState => state,

    async check(): Promise<UpdaterState> {
      const u = await ensure();
      if (!u) return state;
      // Baixando ou pronta: verificar de novo só apagaria o progresso.
      if (state.status === "downloading" || state.status === "ready") return state;
      set({ status: "checking" });
      try {
        await u.checkForUpdates();
      } catch (e) {
        setError(e);
      }
      return state;
    },

    async download(): Promise<UpdaterState> {
      const retry = state.status === "error" && state.version !== undefined;
      if ((state.status !== "available" && !retry) || !updater || !found) throw new Error("Não há atualização para baixar. Verifique primeiro.");
      set({ status: "downloading", percent: 0 });
      try {
        await updater.downloadUpdate();
      } catch (e) {
        setError(e);
      }
      return state;
    },

    install(): void {
      if (state.status !== "ready" || !updater) throw new Error("A atualização ainda não foi baixada.");
      updater.quitAndInstall();
    },
  };
}

export type Updater = ReturnType<typeof createUpdater>;

export interface ScheduleOptions {
  firstDelayMs?: number;
  everyMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  setInterval?: (fn: () => void, ms: number) => unknown;
}

/** Verifica sozinho pouco depois de abrir e depois periodicamente; falhas ficam só no estado (nada de diálogo). */
export function scheduleChecks(updater: Pick<Updater, "check">, opts: ScheduleOptions = {}): void {
  const { firstDelayMs = 10_000, everyMs = 6 * 60 * 60 * 1000 } = opts;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const every = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const run = () => void updater.check().catch(() => undefined);
  later(() => {
    run();
    every(run, everyMs);
  }, firstDelayMs);
}
