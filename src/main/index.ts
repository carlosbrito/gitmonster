import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } from "electron";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { Channels } from "../shared/channels";
import { findMenuItem } from "../shared/appMenu";
import { installAppMenu, runMenuItem } from "./appMenu";
import { cloneRepo, initRepo } from "./git/Clone";
import { discardHunk, discardPaths } from "./git/Discard";
import { getConflict, resolveConflict, resolveConflictSide } from "./git/Conflicts";
import { blame, fileHistory } from "./git/FileInfo";
import { getGitProfile, setGitProfile } from "./git/GitConfig";
import { addRemote, removeRemote } from "./git/Remotes";
import { searchCommits } from "./git/Search";
import { redo, undo, undoInfo } from "./git/Undo";
import { openInEditor, openProjectFolder, realEditorDeps } from "./Editor";
import { createGitHubService, type GitHubService } from "./GitHub";
import { remainingSplashMs } from "./Splash";
import { createUpdater, scheduleChecks, type Updater } from "./Updater";
import { createAiKeyStore } from "./ai/AiKeyStore";
import { createAiService, type AiService } from "./ai/AiService";
import { createTokenStore } from "./GitHubAuth";
import { fsSessionIo, loadSession, saveSession, type SessionDeps } from "./Session";
import { loadSettings, saveSettings, validateUpdateUrl } from "./Settings";
import type {
  AiConflictResult,
  AiModelList,
  AiSettingsView,
  AiTextResult,
  AppSettings,
  UpdaterState,
  GitHubStatus,
  PullDetail,
  PullSummary,
  GitProfile,
  BlameLine,
  Commit,
  CommitDetail,
  CommitResult,
  FileDiff,
  ConflictFile,
  LoadedSessionInfo,
  UndoInfo,
  LogPage,
  OpenedRepo,
  OperationResult,
  RebasePlan,
  RefsSnapshot,
  RemoteCheckoutPlan,
  RepoStatus,
} from "../shared/types";
import { clearGitLog, listGitLog, onGitCommand } from "./git/GitLog";
import { getLog, getStatus, GitError, resolveRepoRoot } from "./git/GitService";
import {
  checkout,
  remoteCheckoutPlan,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  renameBranch,
  fetchAll,
  listRefs,
  merge,
  mergeBranches,
  pull,
  push,
  stashDrop,
  stashPop,
  stashPush,
} from "./git/Branches";
import {
  checkoutArgsSchema,
  remoteCheckoutPlanArgsSchema,
  addRemoteArgsSchema,
  blameArgsSchema,
  aiCancelArgsSchema,
  menuIdSchema,
  aiCommitMessageArgsSchema,
  aiConflictArgsSchema,
  aiExplainArgsSchema,
  aiKeyClearArgsSchema,
  aiKeySetArgsSchema,
  aiPullRequestArgsSchema,
  aiSettingsSetArgsSchema,
  aiStashMessageArgsSchema,
  aiTestArgsSchema,
  githubConnectArgsSchema,
  githubCreatePullArgsSchema,
  githubPullArgsSchema,
  githubPullsArgsSchema,
  githubStatusArgsSchema,
  gitProfileGetArgsSchema,
  gitProfileSetArgsSchema,
  openInEditorArgsSchema,
  openFolderArgsSchema,
  deleteRemoteBranchArgsSchema,
  removeRemoteArgsSchema,
  renameBranchArgsSchema,
  cloneArgsSchema,
  fileHistoryArgsSchema,
  searchArgsSchema,
  conflictPathArgsSchema,
  conflictResolveArgsSchema,
  conflictSideArgsSchema,
  commitArgsSchema,
  commitDetailArgsSchema,
  commitFileDiffArgsSchema,
  createTagArgsSchema,
  rebaseArgsSchema,
  rebaseInteractiveArgsSchema,
  resetArgsSchema,
  createBranchArgsSchema,
  deleteBranchArgsSchema,
  diffArgsSchema,
  hunkArgsSchema,
  logArgsSchema,
  mergeArgsSchema,
  mergeIntoArgsSchema,
  rebaseBranchArgsSchema,
  pullArgsSchema,
  pathsArgsSchema,
  rootSchema,
  stashIndexArgsSchema,
  stashPushArgsSchema,
} from "./ipc-schemas";
import {
  cherryPick,
  commitDetail,
  commitFileDiff,
  createTag,
  deleteTag,
  forcePush,
  operationAbort,
  operationContinue,
  operationSkip,
  pushTag,
  rebase,
  rebaseInteractive,
  rebaseBranches,
  rebasePlan,
  reset,
  revertCommit,
} from "./git/Operations";
import { commit, getDiff, stageFiles, stageHunk, unstageFiles, unstageHunk } from "./git/WorkTree";

/**
 * Repositórios que o usuário abriu pelo diálogo nativo. O renderer nunca escolhe
 * um diretório arbitrário: só pode referenciar uma raiz que já está neste conjunto.
 */
const openedRoots = new Set<string>();

function assertOpened(root: unknown): string {
  const parsed = rootSchema.parse(root);
  if (!openedRoots.has(parsed)) throw new Error("Repositório não foi aberto pelo usuário.");
  return parsed;
}

/** Pergunta uma pasta por diálogo nativo; null se o usuário cancelar. */
async function pickDirectory(event: Electron.IpcMainInvokeEvent, title: string): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = { title, properties: ["openDirectory" as const, "createDirectory" as const] };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  const dir = result.filePaths[0];
  return result.canceled || !dir ? null : dir;
}

const sessionFile = () => join(app.getPath("userData"), "session.json");
const settingsFile = () => join(app.getPath("userData"), "settings.json");

let settings: AppSettings | null = null;

/** Feed alternativo de atualização (testes/homologação); inválido ou ausente = feed embutido no build. */
function updateFeedOverride(): string | null {
  try {
    return validateUpdateUrl(process.env["GITMONSTER_UPDATE_URL"] ?? "") || null;
  } catch {
    return null;
  }
}

/** Atualização do app: só roda empacotado; o feed são as releases públicas no GitHub (embutido no build). */
let updater: Updater | null = null;
function updaterService(): Updater {
  updater ??= createUpdater({
    isPackaged: app.isPackaged,
    feedUrl: updateFeedOverride(),
    onChange: (state) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(Channels.updaterChanged, state);
    },
    // O electron-updater é CommonJS e cria `autoUpdater` em tempo de execução: no import dinâmico ele aparece em `default`.
    loadAutoUpdater: async () => {
      const mod = (await import("electron-updater")) as unknown as { autoUpdater?: unknown; default?: { autoUpdater?: unknown } };
      const instance = mod.autoUpdater ?? mod.default?.autoUpdater;
      if (!instance) throw new Error("Não foi possível carregar o componente de atualização.");
      return instance as never;
    },
  });
  return updater;
}

/** Serviço do GitHub: o token fica só no main, criptografado pelo sistema (safeStorage). */
let github: GitHubService | null = null;
function githubService(): GitHubService {
  github ??= createGitHubService({
    tokenStore: createTokenStore(
      join(app.getPath("userData"), "github.json"),
      {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (s) => safeStorage.encryptString(s),
        decrypt: (b) => safeStorage.decryptString(b),
      },
      {
        ...fsSessionIo,
        remove: (f) => unlink(f).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : Promise.reject(e))),
      },
    ),
    // Servidor de mentira só vale fora do app empacotado (testes e2e).
    ...(!app.isPackaged && process.env["GITMONSTER_GITHUB_API"] ? { baseUrl: process.env["GITMONSTER_GITHUB_API"] } : {}),
    openExternal: (url) => shell.openExternal(url),
  });
  return github;
}

/** Serviço de IA: a chave de cada provedor fica só no main, criptografada pelo sistema (safeStorage). */
let ai: AiService | null = null;
function aiService(): AiService {
  ai ??= createAiService({
    settingsFile: join(app.getPath("userData"), "ai-settings.json"),
    io: fsSessionIo,
    keyStore: createAiKeyStore(
      app.getPath("userData"),
      {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (s) => safeStorage.encryptString(s),
        decrypt: (b) => safeStorage.decryptString(b),
      },
      {
        ...fsSessionIo,
        remove: (f) => unlink(f).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : Promise.reject(e))),
      },
      join,
    ),
  });
  return ai;
}

async function currentSettings(): Promise<AppSettings> {
  settings ??= await loadSettings(settingsFile(), fsSessionIo);
  return settings;
}

/** `themeSource` faz o `prefers-color-scheme` do renderer seguir a escolha do usuário. */
function applyTheme(theme: AppSettings["theme"]): void {
  nativeTheme.themeSource = theme;
}

const sessionDeps: SessionDeps = {
  ...fsSessionIo,
  isRepoRoot: async (root) => {
    if (!existsSync(root)) return false;
    try {
      return (await resolveRepoRoot(root)) === root;
    } catch {
      return false;
    }
  },
};

/** Grava uma sessão por vez, na ordem em que chegaram (evita arquivo temporário disputado). */
let sessionWrites: Promise<unknown> = Promise.resolve();

function registerIpc(): void {
  ipcMain.handle(Channels.repoPick, async (event): Promise<OpenedRepo | null> => {
    const dir = await pickDirectory(event, "Abrir repositório Git");
    if (!dir) return null;
    let root: string;
    try {
      root = await resolveRepoRoot(dir);
    } catch (e) {
      if (e instanceof GitError && /not a git repository/i.test(e.stderr)) {
        throw new Error(`"${dir}" não é um repositório Git.`);
      }
      throw e;
    }
    openedRoots.add(root);
    return { root };
  });

  ipcMain.handle(Channels.repoClone, async (event, args: unknown): Promise<OpenedRepo | null> => {
    const { url } = cloneArgsSchema.parse(args);
    const parent = await pickDirectory(event, "Escolha a pasta onde o repositório será clonado");
    if (!parent) return null;
    const root = await cloneRepo(url, parent);
    openedRoots.add(root);
    return { root };
  });

  ipcMain.handle(Channels.repoInit, async (event): Promise<OpenedRepo | null> => {
    const dir = await pickDirectory(event, "Escolha a pasta do novo repositório");
    if (!dir) return null;
    const root = await initRepo(dir);
    openedRoots.add(root);
    return { root };
  });

  ipcMain.handle(Channels.gitProfileGet, (_e, args: unknown): Promise<GitProfile> => {
    const { root } = gitProfileGetArgsSchema.parse(args);
    return getGitProfile(root === null ? null : assertOpened(root));
  });

  ipcMain.handle(Channels.gitProfileSet, (_e, args: unknown): Promise<void> => {
    const { root, scope, name, email } = gitProfileSetArgsSchema.parse(args);
    return setGitProfile(root === null ? null : assertOpened(root), scope, name, email);
  });

  ipcMain.handle(Channels.openInEditor, async (_e, args: unknown): Promise<void> => {
    const { root, path } = openInEditorArgsSchema.parse(args);
    await openInEditor(assertOpened(root), path, (await currentSettings()).editor, realEditorDeps((p) => shell.openPath(p)));
  });

  ipcMain.handle(Channels.openFolder, async (_e, args: unknown): Promise<void> => {
    const { root } = openFolderArgsSchema.parse(args);
    await openProjectFolder(assertOpened(root), { openPath: (p) => shell.openPath(p) });
  });

  ipcMain.handle(Channels.githubStatus, (_e, args: unknown): Promise<GitHubStatus> => {
    const { root } = githubStatusArgsSchema.parse(args);
    return githubService().status(root === null ? null : assertOpened(root));
  });

  ipcMain.handle(Channels.githubConnect, (_e, args: unknown): Promise<string> => {
    const { token } = githubConnectArgsSchema.parse(args);
    return githubService().connect(token);
  });

  ipcMain.handle(Channels.githubDisconnect, (): Promise<void> => githubService().disconnect());

  ipcMain.handle(Channels.githubPulls, (_e, args: unknown): Promise<PullSummary[]> => {
    const { root, state } = githubPullsArgsSchema.parse(args);
    return githubService().listPulls(assertOpened(root), state);
  });

  ipcMain.handle(Channels.githubPull, (_e, args: unknown): Promise<PullDetail> => {
    const { root, number } = githubPullArgsSchema.parse(args);
    return githubService().getPull(assertOpened(root), number);
  });

  ipcMain.handle(Channels.githubCreatePull, (_e, args: unknown): Promise<PullSummary> => {
    const { root, title, body, base, draft } = githubCreatePullArgsSchema.parse(args);
    return githubService().createPull(assertOpened(root), { title, body, base, draft });
  });

  ipcMain.handle(Channels.githubCheckoutPull, (_e, args: unknown): Promise<string> => {
    const { root, number } = githubPullArgsSchema.parse(args);
    return githubService().checkoutPull(assertOpened(root), number);
  });

  ipcMain.handle(Channels.githubOpenPull, (_e, args: unknown): Promise<void> => {
    const { root, number } = githubPullArgsSchema.parse(args);
    return githubService().openPull(assertOpened(root), number);
  });

  ipcMain.handle(Channels.updaterState, (): UpdaterState => updaterService().getState());
  ipcMain.handle(Channels.updaterCheck, (): Promise<UpdaterState> => updaterService().check());
  ipcMain.handle(Channels.updaterDownload, (): Promise<UpdaterState> => updaterService().download());
  ipcMain.handle(Channels.updaterInstall, (): void => updaterService().install());
  ipcMain.handle(Channels.appVersion, (): string => app.getVersion());

  ipcMain.handle(Channels.gitLogList, () => listGitLog());
  ipcMain.handle(Channels.gitLogClear, () => clearGitLog());
  // Cada comando git executado vai para as janelas abertas (monitor).
  onGitCommand((entry) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(Channels.gitLogEntry, entry);
  });

  ipcMain.handle(Channels.aiSettingsGet, (): Promise<AiSettingsView> => aiService().getSettings());

  ipcMain.handle(Channels.aiSettingsSet, (_e, args: unknown): Promise<AiSettingsView> => aiService().setSettings(aiSettingsSetArgsSchema.parse(args)));

  ipcMain.handle(Channels.aiKeySet, (_e, args: unknown): Promise<AiSettingsView> => {
    const { provider, key } = aiKeySetArgsSchema.parse(args);
    return aiService().setKey(provider, key);
  });

  ipcMain.handle(Channels.aiKeyClear, (_e, args: unknown): Promise<AiSettingsView> => aiService().clearKey(aiKeyClearArgsSchema.parse(args).provider));

  ipcMain.handle(Channels.aiTest, (_e, args: unknown): Promise<AiModelList> => {
    const { provider, baseUrl, key } = aiTestArgsSchema.parse(args);
    return aiService().test(provider, baseUrl, key);
  });

  ipcMain.handle(Channels.aiModels, (): Promise<AiModelList> => aiService().models());

  ipcMain.handle(Channels.aiCommitMessage, (_e, args: unknown): Promise<AiTextResult> => {
    const { root, amend, requestId } = aiCommitMessageArgsSchema.parse(args);
    return aiService().commitMessage(assertOpened(root), amend, requestId);
  });

  ipcMain.handle(Channels.aiExplain, (_e, args: unknown): Promise<AiTextResult> => {
    const { root, target, requestId } = aiExplainArgsSchema.parse(args);
    return aiService().explain(assertOpened(root), target, requestId);
  });

  ipcMain.handle(Channels.aiStashMessage, (_e, args: unknown): Promise<AiTextResult> => {
    const { root, includeUntracked, requestId } = aiStashMessageArgsSchema.parse(args);
    return aiService().stashMessage(assertOpened(root), includeUntracked, requestId);
  });

  ipcMain.handle(Channels.aiConflict, (_e, args: unknown): Promise<AiConflictResult> => {
    const { root, path, requestId } = aiConflictArgsSchema.parse(args);
    return aiService().conflict(assertOpened(root), path, requestId);
  });

  ipcMain.handle(Channels.aiPullRequest, (_e, args: unknown): Promise<AiTextResult> => {
    const { root, base, requestId } = aiPullRequestArgsSchema.parse(args);
    return aiService().pullRequest(assertOpened(root), base, requestId);
  });

  ipcMain.handle(Channels.aiCancel, (_e, args: unknown): void => aiService().cancel(aiCancelArgsSchema.parse(args).requestId));

  ipcMain.handle(Channels.menuInvoke, (e, id: unknown): void => {
    const item = findMenuItem(menuIdSchema.parse(id));
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!item || !win) throw new Error("Item de menu desconhecido");
    runMenuItem(win, item);
  });

  ipcMain.handle(Channels.settingsGet, (): Promise<AppSettings> => currentSettings());

  ipcMain.handle(Channels.settingsSet, async (_e, incoming: unknown): Promise<AppSettings> => {
    settings = await saveSettings(settingsFile(), incoming, fsSessionIo);
    applyTheme(settings.theme);
    return settings;
  });

  ipcMain.handle(Channels.sessionLoad, async (): Promise<LoadedSessionInfo> => {
    const loaded = await loadSession(sessionFile(), sessionDeps);
    for (const root of [...loaded.session.tabs, ...loaded.session.recents.map((r) => r.root)]) openedRoots.add(root);
    return loaded;
  });

  ipcMain.handle(Channels.sessionSave, (_e, session: unknown): Promise<void> => {
    const next = sessionWrites.then(() => saveSession(sessionFile(), session, openedRoots, sessionDeps));
    sessionWrites = next.catch(() => undefined);
    return next.then(() => undefined);
  });

  ipcMain.handle(Channels.repoAddRemote, (_e, args: unknown): Promise<void> => {
    const { root, name, url } = addRemoteArgsSchema.parse(args);
    return addRemote(assertOpened(root), name, url);
  });

  ipcMain.handle(Channels.repoRemoveRemote, (_e, args: unknown): Promise<void> => {
    const { root, name } = removeRemoteArgsSchema.parse(args);
    return removeRemote(assertOpened(root), name);
  });

  ipcMain.handle(Channels.repoRenameBranch, (_e, args: unknown): Promise<void> => {
    const { root, oldName, newName } = renameBranchArgsSchema.parse(args);
    return renameBranch(assertOpened(root), oldName, newName);
  });

  ipcMain.handle(Channels.repoDeleteRemoteBranch, (_e, args: unknown): Promise<void> => {
    const { root, remote, branch } = deleteRemoteBranchArgsSchema.parse(args);
    return deleteRemoteBranch(assertOpened(root), remote, branch);
  });

  ipcMain.handle(Channels.repoSearch, (_e, args: unknown): Promise<Commit[]> => {
    const { root, field, query } = searchArgsSchema.parse(args);
    return searchCommits(assertOpened(root), field, query);
  });

  ipcMain.handle(Channels.repoFileHistory, (_e, args: unknown): Promise<LogPage> => {
    const { root, path, skip, limit } = fileHistoryArgsSchema.parse(args);
    return fileHistory(assertOpened(root), path, skip, limit);
  });

  ipcMain.handle(Channels.repoBlame, (_e, args: unknown): Promise<BlameLine[]> => {
    const { root, path, rev } = blameArgsSchema.parse(args);
    return blame(assertOpened(root), path, rev);
  });

  ipcMain.handle(Channels.repoConflictGet, (_e, args: unknown): Promise<ConflictFile> => {
    const { root, path } = conflictPathArgsSchema.parse(args);
    return getConflict(assertOpened(root), path);
  });

  ipcMain.handle(Channels.repoConflictResolve, (_e, args: unknown): Promise<void> => {
    const { root, path, content } = conflictResolveArgsSchema.parse(args);
    return resolveConflict(assertOpened(root), path, content);
  });

  ipcMain.handle(Channels.repoConflictSide, (_e, args: unknown): Promise<void> => {
    const { root, path, side } = conflictSideArgsSchema.parse(args);
    return resolveConflictSide(assertOpened(root), path, side);
  });

  ipcMain.handle(Channels.repoUndoInfo, (_e, root: unknown): Promise<UndoInfo> => undoInfo(assertOpened(root)));
  ipcMain.handle(Channels.repoUndo, (_e, root: unknown): Promise<void> => undo(assertOpened(root)));
  ipcMain.handle(Channels.repoRedo, (_e, root: unknown): Promise<void> => redo(assertOpened(root)));

  ipcMain.handle(Channels.repoDiscard, (_e, args: unknown): Promise<void> => {
    const { root, paths } = pathsArgsSchema.parse(args);
    return discardPaths(assertOpened(root), paths);
  });

  ipcMain.handle(Channels.repoDiscardHunk, (_e, args: unknown): Promise<void> => {
    const { root, hunk } = hunkArgsSchema.parse(args);
    return discardHunk(assertOpened(root), hunk);
  });

  ipcMain.handle(
    Channels.repoStatus,
    (_e, root: unknown): Promise<RepoStatus> => getStatus(assertOpened(root)),
  );

  ipcMain.handle(Channels.repoLog, (_e, args: unknown): Promise<LogPage> => {
    const { root, skip, limit } = logArgsSchema.parse(args);
    return getLog(assertOpened(root), skip, limit);
  });

  ipcMain.handle(Channels.repoDiff, (_e, args: unknown): Promise<FileDiff> => {
    const { root, target } = diffArgsSchema.parse(args);
    return getDiff(assertOpened(root), target);
  });

  ipcMain.handle(Channels.repoStage, (_e, args: unknown): Promise<void> => {
    const { root, paths } = pathsArgsSchema.parse(args);
    return stageFiles(assertOpened(root), paths);
  });

  ipcMain.handle(Channels.repoUnstage, (_e, args: unknown): Promise<void> => {
    const { root, paths } = pathsArgsSchema.parse(args);
    return unstageFiles(assertOpened(root), paths);
  });

  ipcMain.handle(Channels.repoStageHunk, (_e, args: unknown): Promise<void> => {
    const { root, hunk } = hunkArgsSchema.parse(args);
    return stageHunk(assertOpened(root), hunk);
  });

  ipcMain.handle(Channels.repoUnstageHunk, (_e, args: unknown): Promise<void> => {
    const { root, hunk } = hunkArgsSchema.parse(args);
    return unstageHunk(assertOpened(root), hunk);
  });

  ipcMain.handle(Channels.repoCommit, (_e, args: unknown): Promise<CommitResult> => {
    const { root, message, amend } = commitArgsSchema.parse(args);
    return commit(assertOpened(root), message, amend);
  });

  ipcMain.handle(Channels.repoRefs, (_e, root: unknown): Promise<RefsSnapshot> => listRefs(assertOpened(root)));

  ipcMain.handle(Channels.repoRemoteCheckoutPlan, (_e, args: unknown): Promise<RemoteCheckoutPlan> => {
    const { root, name } = remoteCheckoutPlanArgsSchema.parse(args);
    return remoteCheckoutPlan(assertOpened(root), name);
  });

  ipcMain.handle(Channels.repoCheckout, (_e, args: unknown): Promise<void> => {
    const { root, target } = checkoutArgsSchema.parse(args);
    return checkout(assertOpened(root), target);
  });

  ipcMain.handle(Channels.repoCreateBranch, (_e, args: unknown): Promise<void> => {
    const { root, name, startPoint, checkout: switchTo } = createBranchArgsSchema.parse(args);
    return createBranch(assertOpened(root), name, startPoint, switchTo);
  });

  ipcMain.handle(Channels.repoDeleteBranch, (_e, args: unknown): Promise<void> => {
    const { root, name, force } = deleteBranchArgsSchema.parse(args);
    return deleteBranch(assertOpened(root), name, force);
  });

  ipcMain.handle(Channels.repoMergeInto, (_e, args: unknown): Promise<OperationResult> => {
    const { root, source, target } = mergeIntoArgsSchema.parse(args);
    return mergeBranches(assertOpened(root), source, target);
  });

  ipcMain.handle(Channels.repoRebaseBranch, (_e, args: unknown): Promise<OperationResult> => {
    const { root, branch, onto } = rebaseBranchArgsSchema.parse(args);
    return rebaseBranches(assertOpened(root), branch, onto);
  });

  ipcMain.handle(Channels.repoMerge, (_e, args: unknown): Promise<OperationResult> => {
    const { root, name } = mergeArgsSchema.parse(args);
    return merge(assertOpened(root), name);
  });

  ipcMain.handle(Channels.repoOperationContinue, (_e, root: unknown): Promise<OperationResult> =>
    operationContinue(assertOpened(root)),
  );
  ipcMain.handle(Channels.repoOperationAbort, (_e, root: unknown): Promise<void> => operationAbort(assertOpened(root)));
  ipcMain.handle(Channels.repoOperationSkip, (_e, root: unknown): Promise<OperationResult> =>
    operationSkip(assertOpened(root)),
  );

  ipcMain.handle(Channels.repoCommitDetail, (_e, args: unknown): Promise<CommitDetail> => {
    const { root, hash } = commitDetailArgsSchema.parse(args);
    return commitDetail(assertOpened(root), hash);
  });

  ipcMain.handle(Channels.repoCommitFileDiff, (_e, args: unknown): Promise<FileDiff> => {
    const { root, hash, path } = commitFileDiffArgsSchema.parse(args);
    return commitFileDiff(assertOpened(root), hash, path);
  });

  ipcMain.handle(Channels.repoCherryPick, (_e, args: unknown): Promise<OperationResult> => {
    const { root, hash } = commitDetailArgsSchema.parse(args);
    return cherryPick(assertOpened(root), hash);
  });

  ipcMain.handle(Channels.repoRevert, (_e, args: unknown): Promise<OperationResult> => {
    const { root, hash } = commitDetailArgsSchema.parse(args);
    return revertCommit(assertOpened(root), hash);
  });

  ipcMain.handle(Channels.repoReset, (_e, args: unknown): Promise<void> => {
    const { root, hash, mode } = resetArgsSchema.parse(args);
    return reset(assertOpened(root), hash, mode);
  });

  ipcMain.handle(Channels.repoCreateTag, (_e, args: unknown): Promise<void> => {
    const { root, name, hash, message } = createTagArgsSchema.parse(args);
    return createTag(assertOpened(root), name, hash, message);
  });

  ipcMain.handle(Channels.repoDeleteTag, (_e, args: unknown): Promise<void> => {
    const { root, name } = mergeArgsSchema.parse(args);
    return deleteTag(assertOpened(root), name);
  });

  ipcMain.handle(Channels.repoPushTag, (_e, args: unknown): Promise<void> => {
    const { root, name } = mergeArgsSchema.parse(args);
    return pushTag(assertOpened(root), name);
  });

  ipcMain.handle(Channels.repoForcePush, (_e, root: unknown): Promise<void> => forcePush(assertOpened(root)));

  ipcMain.handle(Channels.repoRebase, (_e, args: unknown): Promise<OperationResult> => {
    const { root, onto } = rebaseArgsSchema.parse(args);
    return rebase(assertOpened(root), onto);
  });

  ipcMain.handle(Channels.repoRebasePlan, (_e, args: unknown): Promise<RebasePlan> => {
    const { root, onto } = rebaseArgsSchema.parse(args);
    return rebasePlan(assertOpened(root), onto);
  });

  ipcMain.handle(Channels.repoRebaseInteractive, (_e, args: unknown): Promise<OperationResult> => {
    const { root, onto, steps } = rebaseInteractiveArgsSchema.parse(args);
    return rebaseInteractive(assertOpened(root), onto, steps);
  });
  ipcMain.handle(Channels.repoFetch, (_e, root: unknown): Promise<void> => fetchAll(assertOpened(root)));
  ipcMain.handle(Channels.repoPull, (_e, args: unknown): Promise<OperationResult> => {
    const { root, mode } = pullArgsSchema.parse(args);
    return pull(assertOpened(root), mode);
  });
  ipcMain.handle(Channels.repoPush, (_e, root: unknown): Promise<void> => push(assertOpened(root)));

  ipcMain.handle(Channels.repoStashPush, (_e, args: unknown): Promise<void> => {
    const { root, message, includeUntracked } = stashPushArgsSchema.parse(args);
    return stashPush(assertOpened(root), message, includeUntracked);
  });

  ipcMain.handle(Channels.repoStashPop, (_e, args: unknown): Promise<void> => {
    const { root, index } = stashIndexArgsSchema.parse(args);
    return stashPop(assertOpened(root), index);
  });

  ipcMain.handle(Channels.repoStashDrop, (_e, args: unknown): Promise<void> => {
    const { root, index } = stashIndexArgsSchema.parse(args);
    return stashDrop(assertOpened(root), index);
  });
}

/** Ícone da janela fora do app empacotado (no instalado, o ícone vem embutido no .exe). */
const devIcon = join(__dirname, "../../build/icon.png");

/**
 * Tela de abertura com o logo. Fica à vista por SPLASH_MS (5 s) contados de quando aparece, enquanto a janela
 * principal carrega escondida. `GITMONSTER_NO_SPLASH=1` (testes automatizados) pula a splash.
 */
interface Splash {
  window: BrowserWindow;
  shownAt: number;
}

function createSplash(): Splash | null {
  if (process.env["GITMONSTER_NO_SPLASH"]) return null;
  const window = new BrowserWindow({
    width: 560,
    height: 470,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    center: true,
    show: false,
    title: "GitMonster",
    backgroundColor: "#050505",
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  const shown = { window, shownAt: Date.now() };
  window.once("ready-to-show", () => {
    shown.shownAt = Date.now(); // a contagem dos 5 s começa quando o logo realmente aparece
    window.show();
  });
  if (process.env["ELECTRON_RENDERER_URL"]) void window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/splash.html`);
  else void window.loadFile(join(__dirname, "../renderer/splash.html"));
  return shown;
}

// Cores e altura da barra de título; devem bater com `--hd-title` em styles.css.
const TITLEBAR_COLOR = "#121417";
const TITLEBAR_SYMBOLS = "#d5dae0";
const TITLEBAR_HEIGHT = 32;

function createWindow(splash: Splash | null = null): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "GitMonster",
    // Barra de título desenhada pelo app; os botões minimizar/maximizar/fechar continuam do Windows (snap layouts).
    titleBarStyle: "hidden",
    titleBarOverlay: { color: TITLEBAR_COLOR, symbolColor: TITLEBAR_SYMBOLS, height: TITLEBAR_HEIGHT },
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false); // o menu é desenhado pelo renderer; os atalhos seguem no menu nativo

  // Com splash, a janela principal só aparece quando os 5 s dela terminam (ou se o usuário fechar a splash antes).
  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    win.show();
    if (splash && !splash.window.isDestroyed()) splash.window.close();
  };
  win.once("ready-to-show", () => {
    if (!splash) return reveal();
    const timer = setTimeout(reveal, remainingSplashMs(splash.shownAt, Date.now()));
    splash.window.once("closed", () => {
      clearTimeout(timer);
      reveal();
    });
  });

  // Em desenvolvimento, console/erros do renderer e do preload aparecem no terminal.
  if (!app.isPackaged) {
    win.webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") {
        console.error(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
      }
    });
    win.webContents.on("preload-error", (_e, preloadPath, error) => {
      console.error(`[preload-error] ${preloadPath}: ${error.stack ?? error.message}`);
    });
    win.webContents.on("render-process-gone", (_e, details) => {
      console.error(`[render-process-gone] ${details.reason} (exit ${details.exitCode})`);
    });
  }

  // Links externos abrem no navegador; a janela nunca navega para fora do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Permite isolar a sessão (testes e2e usam uma pasta de dados própria).
if (process.env["GITMONSTER_USER_DATA"]) app.setPath("userData", process.env["GITMONSTER_USER_DATA"]);

void app.whenReady().then(async () => {
  // A splash abre antes de tudo, para o logo aparecer o mais cedo possível.
  const splash = createSplash();
  applyTheme((await currentSettings()).theme);
  registerIpc();
  installAppMenu();
  createWindow(splash);
  // Só avisa de versão nova; nada é baixado sem o usuário pedir.
  if (app.isPackaged) scheduleChecks(updaterService());
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
