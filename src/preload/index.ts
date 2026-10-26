import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { Channels } from "../shared/channels";
import type { MenuRendererCommand } from "../shared/appMenu";
import type { GitLogEntry, GitMonsterApi, UpdaterState } from "../shared/types";

/** Superfície mínima e tipada exposta ao renderer. Nada de ipcRenderer cru. */
const api: GitMonsterApi = {
  gitLogList: () => ipcRenderer.invoke(Channels.gitLogList),
  gitLogClear: () => ipcRenderer.invoke(Channels.gitLogClear),
  onGitLog: (listener) => {
    const handler = (_e: IpcRendererEvent, entry: GitLogEntry) => listener(entry);
    ipcRenderer.on(Channels.gitLogEntry, handler);
    return () => ipcRenderer.removeListener(Channels.gitLogEntry, handler);
  },
  pickRepo: () => ipcRenderer.invoke(Channels.repoPick),
  status: (root) => ipcRenderer.invoke(Channels.repoStatus, root),
  log: (root, skip, limit) => ipcRenderer.invoke(Channels.repoLog, { root, skip, limit }),
  diff: (root, target) => ipcRenderer.invoke(Channels.repoDiff, { root, target }),
  stage: (root, paths) => ipcRenderer.invoke(Channels.repoStage, { root, paths }),
  unstage: (root, paths) => ipcRenderer.invoke(Channels.repoUnstage, { root, paths }),
  stageHunk: (root, hunk) => ipcRenderer.invoke(Channels.repoStageHunk, { root, hunk }),
  unstageHunk: (root, hunk) => ipcRenderer.invoke(Channels.repoUnstageHunk, { root, hunk }),
  commit: (root, message, amend) => ipcRenderer.invoke(Channels.repoCommit, { root, message, amend }),
  refs: (root) => ipcRenderer.invoke(Channels.repoRefs, root),
  checkout: (root, target) => ipcRenderer.invoke(Channels.repoCheckout, { root, target }),
  remoteCheckoutPlan: (root, name) => ipcRenderer.invoke(Channels.repoRemoteCheckoutPlan, { root, name }),
  createBranch: (root, name, startPoint, checkout) =>
    ipcRenderer.invoke(Channels.repoCreateBranch, { root, name, startPoint, checkout }),
  deleteBranch: (root, name, force) => ipcRenderer.invoke(Channels.repoDeleteBranch, { root, name, force }),
  mergeInto: (root, source, target) => ipcRenderer.invoke(Channels.repoMergeInto, { root, source, target }),
  rebaseBranch: (root, branch, onto) => ipcRenderer.invoke(Channels.repoRebaseBranch, { root, branch, onto }),
  merge: (root, name) => ipcRenderer.invoke(Channels.repoMerge, { root, name }),
  operationContinue: (root) => ipcRenderer.invoke(Channels.repoOperationContinue, root),
  operationAbort: (root) => ipcRenderer.invoke(Channels.repoOperationAbort, root),
  operationSkip: (root) => ipcRenderer.invoke(Channels.repoOperationSkip, root),
  commitDetail: (root, hash) => ipcRenderer.invoke(Channels.repoCommitDetail, { root, hash }),
  commitFileDiff: (root, hash, path) => ipcRenderer.invoke(Channels.repoCommitFileDiff, { root, hash, path }),
  cherryPick: (root, hash) => ipcRenderer.invoke(Channels.repoCherryPick, { root, hash }),
  revert: (root, hash) => ipcRenderer.invoke(Channels.repoRevert, { root, hash }),
  reset: (root, hash, mode) => ipcRenderer.invoke(Channels.repoReset, { root, hash, mode }),
  createTag: (root, name, hash, message) => ipcRenderer.invoke(Channels.repoCreateTag, { root, name, hash, message }),
  deleteTag: (root, name) => ipcRenderer.invoke(Channels.repoDeleteTag, { root, name }),
  pushTag: (root, name) => ipcRenderer.invoke(Channels.repoPushTag, { root, name }),
  forcePush: (root) => ipcRenderer.invoke(Channels.repoForcePush, root),
  rebase: (root, onto) => ipcRenderer.invoke(Channels.repoRebase, { root, onto }),
  rebasePlan: (root, onto) => ipcRenderer.invoke(Channels.repoRebasePlan, { root, onto }),
  rebaseInteractive: (root, onto, steps) => ipcRenderer.invoke(Channels.repoRebaseInteractive, { root, onto, steps }),
  fetch: (root) => ipcRenderer.invoke(Channels.repoFetch, root),
  pull: (root, mode) => ipcRenderer.invoke(Channels.repoPull, { root, mode }),
  push: (root) => ipcRenderer.invoke(Channels.repoPush, root),
  stashPush: (root, message, includeUntracked) =>
    ipcRenderer.invoke(Channels.repoStashPush, { root, message, includeUntracked }),
  stashPop: (root, index) => ipcRenderer.invoke(Channels.repoStashPop, { root, index }),
  stashDrop: (root, index) => ipcRenderer.invoke(Channels.repoStashDrop, { root, index }),
  discard: (root, paths) => ipcRenderer.invoke(Channels.repoDiscard, { root, paths }),
  discardHunk: (root, hunk) => ipcRenderer.invoke(Channels.repoDiscardHunk, { root, hunk }),
  cloneRepo: (url) => ipcRenderer.invoke(Channels.repoClone, { url }),
  initRepo: () => ipcRenderer.invoke(Channels.repoInit),
  addRemote: (root, name, url) => ipcRenderer.invoke(Channels.repoAddRemote, { root, name, url }),
  removeRemote: (root, name) => ipcRenderer.invoke(Channels.repoRemoveRemote, { root, name }),
  renameBranch: (root, oldName, newName) => ipcRenderer.invoke(Channels.repoRenameBranch, { root, oldName, newName }),
  deleteRemoteBranch: (root, remote, branch) => ipcRenderer.invoke(Channels.repoDeleteRemoteBranch, { root, remote, branch }),
  searchCommits: (root, field, query) => ipcRenderer.invoke(Channels.repoSearch, { root, field, query }),
  fileHistory: (root, path, skip, limit) => ipcRenderer.invoke(Channels.repoFileHistory, { root, path, skip, limit }),
  blame: (root, path, rev) => ipcRenderer.invoke(Channels.repoBlame, { root, path, rev }),
  getConflict: (root, path) => ipcRenderer.invoke(Channels.repoConflictGet, { root, path }),
  resolveConflict: (root, path, content) => ipcRenderer.invoke(Channels.repoConflictResolve, { root, path, content }),
  resolveConflictSide: (root, path, side) => ipcRenderer.invoke(Channels.repoConflictSide, { root, path, side }),
  undoInfo: (root) => ipcRenderer.invoke(Channels.repoUndoInfo, root),
  undo: (root) => ipcRenderer.invoke(Channels.repoUndo, root),
  redo: (root) => ipcRenderer.invoke(Channels.repoRedo, root),
  getGitProfile: (root) => ipcRenderer.invoke(Channels.gitProfileGet, { root }),
  setGitProfile: (root, scope, name, email) => ipcRenderer.invoke(Channels.gitProfileSet, { root, scope, name, email }),
  openInEditor: (root, path) => ipcRenderer.invoke(Channels.openInEditor, { root, path }),
  openFolder: (root) => ipcRenderer.invoke(Channels.openFolder, { root }),
  githubStatus: (root) => ipcRenderer.invoke(Channels.githubStatus, { root }),
  githubConnect: (token) => ipcRenderer.invoke(Channels.githubConnect, { token }),
  githubDisconnect: () => ipcRenderer.invoke(Channels.githubDisconnect),
  githubPulls: (root, state) => ipcRenderer.invoke(Channels.githubPulls, { root, state }),
  githubPull: (root, number) => ipcRenderer.invoke(Channels.githubPull, { root, number }),
  githubCreatePull: (root, input) => ipcRenderer.invoke(Channels.githubCreatePull, { root, ...input }),
  githubCheckoutPull: (root, number) => ipcRenderer.invoke(Channels.githubCheckoutPull, { root, number }),
  githubOpenPull: (root, number) => ipcRenderer.invoke(Channels.githubOpenPull, { root, number }),
  aiGetSettings: () => ipcRenderer.invoke(Channels.aiSettingsGet),
  aiSetSettings: (settings) => ipcRenderer.invoke(Channels.aiSettingsSet, settings),
  aiSetKey: (provider, key) => ipcRenderer.invoke(Channels.aiKeySet, { provider, key }),
  aiClearKey: (provider) => ipcRenderer.invoke(Channels.aiKeyClear, { provider }),
  aiTest: (provider, baseUrl, key) => ipcRenderer.invoke(Channels.aiTest, { provider, baseUrl, key }),
  aiModels: () => ipcRenderer.invoke(Channels.aiModels),
  aiCommitMessage: (root, amend, requestId) => ipcRenderer.invoke(Channels.aiCommitMessage, { root, amend, requestId }),
  aiExplain: (root, target, requestId) => ipcRenderer.invoke(Channels.aiExplain, { root, target, requestId }),
  aiStashMessage: (root, includeUntracked, requestId) => ipcRenderer.invoke(Channels.aiStashMessage, { root, includeUntracked, requestId }),
  aiConflict: (root, path, requestId) => ipcRenderer.invoke(Channels.aiConflict, { root, path, requestId }),
  aiPullRequest: (root, base, requestId) => ipcRenderer.invoke(Channels.aiPullRequest, { root, base, requestId }),
  aiCancel: (requestId) => ipcRenderer.invoke(Channels.aiCancel, { requestId }),
  updaterState: () => ipcRenderer.invoke(Channels.updaterState),
  updaterCheck: () => ipcRenderer.invoke(Channels.updaterCheck),
  updaterDownload: () => ipcRenderer.invoke(Channels.updaterDownload),
  updaterInstall: () => ipcRenderer.invoke(Channels.updaterInstall),
  onUpdaterChanged: (listener) => {
    const handler = (_e: IpcRendererEvent, state: UpdaterState) => listener(state);
    ipcRenderer.on(Channels.updaterChanged, handler);
    return () => ipcRenderer.removeListener(Channels.updaterChanged, handler);
  },
  appVersion: () => ipcRenderer.invoke(Channels.appVersion),
  getSettings: () => ipcRenderer.invoke(Channels.settingsGet),
  setSettings: (settings) => ipcRenderer.invoke(Channels.settingsSet, settings),
  loadSession: () => ipcRenderer.invoke(Channels.sessionLoad),
  saveSession: (session) => ipcRenderer.invoke(Channels.sessionSave, session),
  menuInvoke: (id) => ipcRenderer.invoke(Channels.menuInvoke, id),
  onMenuCommand: (listener) => {
    const handler = (_e: IpcRendererEvent, command: MenuRendererCommand) => listener(command);
    ipcRenderer.on(Channels.menuCommand, handler);
    return () => ipcRenderer.removeListener(Channels.menuCommand, handler);
  },
};

contextBridge.exposeInMainWorld("gitmonster", api);
