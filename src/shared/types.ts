/** Contrato de dados entre main e renderer. Somente tipos. */

import type { MenuRendererCommand } from "./appMenu";

export interface FileChange {
  path: string;
  /** Caminho original quando o arquivo foi renomeado/copiado. */
  origPath?: string;
  /** Status na área de stage (coluna X do porcelain): ' ', M, A, D, R, C, T. */
  index: string;
  /** Status na árvore de trabalho (coluna Y do porcelain): ' ', M, D, T. */
  worktree: string;
  /** Verdadeiro para arquivo não rastreado. */
  untracked: boolean;
  /** Verdadeiro para conflito de merge. */
  conflicted: boolean;
}

export interface RepoStatus {
  /** Nome da branch, ou null quando HEAD está destacado. */
  branch: string | null;
  /** SHA de HEAD, ou null em repositório sem commits. */
  headOid: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** Operação que parou e aguarda o usuário (conflitos a resolver, commit pendente...). */
  operation: Operation | null;
  files: FileChange[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** O upstream configurado não existe mais no remoto. */
  gone: boolean;
  hash: string;
}

export interface RemoteBranchInfo {
  /** Nome completo, ex.: origin/feature/x. */
  name: string;
  remote: string;
  hash: string;
}

export interface TagInfo {
  name: string;
  /** Commit apontado (resolve tags anotadas). */
  hash: string;
}

export interface StashInfo {
  index: number;
  message: string;
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface RefsSnapshot {
  remotes: RemoteInfo[];
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  tags: TagInfo[];
  stashes: StashInfo[];
}

export type CheckoutTarget =
  | { kind: "local"; name: string }
  /** `matchRemote`: a branch local de mesmo nome já existe e é diferente; iguala-a à remota (reset --hard). */
  | { kind: "remote"; name: string; matchRemote?: boolean }
  | { kind: "commit"; hash: string };

/** O que acontece ao dar checkout numa branch remota: se já existe uma local de mesmo nome e como ela difere. */
export interface RemoteCheckoutPlan {
  localName: string | null;
  /** Existe uma branch local com esse nome e ela aponta para outro commit que a remota. */
  differs: boolean;
  /** Commits só da local (seriam descartados ao igualar). */
  ahead: number;
  /** Commits só da remota. */
  behind: number;
}

export type PullMode = "ff-only" | "merge" | "rebase";

export type Operation = "merge" | "cherry-pick" | "revert" | "rebase";

export interface OperationResult {
  /** A operação parou (conflitos ou passo pendente) e continua em andamento. */
  conflicted: boolean;
  /** Saída do git quando parou, para explicar ao usuário. */
  message?: string;
}

export interface CommitFile {
  /** Letra do status: A, M, D, R, C, T. */
  status: string;
  path: string;
  origPath?: string;
}

export interface CommitDetail {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  /** Mensagem completa (assunto + corpo). */
  message: string;
  /** Arquivos alterados em relação ao primeiro pai. */
  files: CommitFile[];
}

export type ResetMode = "soft" | "mixed" | "hard";

export type RebaseAction = "pick" | "squash" | "fixup" | "drop";

export interface RebaseStep {
  action: RebaseAction;
  hash: string;
}

export interface RebaseCandidate {
  hash: string;
  subject: string;
}

export interface RebasePlan {
  /** Commits de `onto..HEAD`, do mais antigo para o mais novo. */
  commits: RebaseCandidate[];
  /** O intervalo contém merges: o rebase interativo os achataria, então é recusado. */
  hasMerges: boolean;
}

export interface Commit {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** ISO-8601 estrito. */
  authorDate: string;
  /** Decorações de refs (HEAD -> main, origin/main, tag: v1...). */
  refs: string[];
  subject: string;
}

export interface LogPage {
  commits: Commit[];
  /** Há mais commits depois deste bloco. */
  hasMore: boolean;
}

export interface OpenedRepo {
  /** Raiz canônica do repositório (git rev-parse --show-toplevel). */
  root: string;
}

/** Tipo da linha de diff: contexto, adição, remoção, ou aviso ("\ No newline at end of file"). */
export type DiffLineKind = " " | "+" | "-" | "\\";

export interface DiffLine {
  kind: DiffLineKind;
  /** Texto sem o prefixo de uma coluna; preserva \r de arquivos CRLF. */
  text: string;
}

export interface DiffHunk {
  /** Linha completa "@@ -a,b +c,d @@ contexto". Identifica o hunk e detecta diff desatualizado. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  binary: boolean;
  hunks: DiffHunk[];
}

/** Qual diff mostrar: stage (HEAD→index), worktree (index→disco) ou arquivo novo (vazio→disco). */
export interface DiffTarget {
  path: string;
  staged: boolean;
  untracked: boolean;
}

/** Referência a um hunk. O renderer nunca envia o patch: o main o reconstrói e confere o cabeçalho. */
export interface HunkRef {
  path: string;
  hunkIndex: number;
  hunkHeader: string;
}

/** O que dá para desfazer/refazer agora. `blocked` explica por que o desfazer não está disponível. */
export interface UndoInfo {
  undo: { label: string } | null;
  redo: { label: string } | null;
  blocked: string | null;
}

export type ConflictKind =
  | "both-modified"
  | "added-by-both"
  | "deleted-by-us"
  | "deleted-by-them"
  | "added-by-us"
  | "added-by-them"
  | "deleted-by-both";

export type ConflictSide = "ours" | "theirs";

/** Arquivo em conflito como o Git o deixou. `editable` diz se o editor de blocos serve; senão, `reason` explica. */
/** Um lado do conflito: o nome vai em destaque (branch ou SHA curto), o detalhe é texto secundário. */
export interface ConflictSideInfo {
  name: string;
  detail: string | null;
}

export interface ConflictSides {
  ours: ConflictSideInfo;
  theirs: ConflictSideInfo;
}

export interface ConflictFile {
  path: string;
  kind: ConflictKind;
  content: string;
  editable: boolean;
  reason: string | null;
  /** Operação que deixou o conflito (null em conflito sem operação, ex.: stash pop). */
  operation: Operation | null;
  /** Quem é cada lado; null quando não dá para saber (o editor usa os rótulos dos marcadores). */
  sides: ConflictSides | null;
}

/** Uma linha do arquivo com o commit que a escreveu por último. */
export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  /** ISO-8601; vazio se desconhecido. */
  authorTime: string;
  summary: string;
  /** Linha ainda não commitada (alteração na árvore de trabalho). */
  uncommitted: boolean;
  text: string;
}

export type SearchField = "message" | "author" | "hash" | "file" | "content";

export type ThemeChoice = "system" | "light" | "dark";

/** Preferências do app (arquivo `settings.json` em userData). */
/** Provedores de IA: o usuário traz a própria chave. */
export type AiProvider = "anthropic" | "openai" | "gemini" | "openai-compatible";
export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai", "gemini", "openai-compatible"];

/** Recursos de IA; cada um tem modelo e instruções próprias. */
export type AiFeature = "commitMessage" | "explain" | "stashMessage" | "conflict" | "pullRequest";
export const AI_FEATURES: readonly AiFeature[] = ["commitMessage", "explain", "stashMessage", "conflict", "pullRequest"];

export interface AiFeatureSettings {
  /** Id do modelo; vazio = o recomendado do provedor. */
  model: string;
  instructions: string;
}

/** Preferências da IA (sem a chave, que fica só no main, criptografada). */
export interface AiSettings {
  version: 1;
  enabled: boolean;
  provider: AiProvider;
  /** URL do endpoint por provedor; vazio = padrão do provedor. */
  baseUrls: Record<AiProvider, string>;
  /** Provedores para os quais o usuário aceitou enviar código. */
  sendCodeApproved: Record<AiProvider, boolean>;
  globalInstructions: string;
  features: Record<AiFeature, AiFeatureSettings>;
}

/** O que o renderer vê: as preferências mais quais provedores já têm chave guardada. */
export interface AiSettingsView {
  settings: AiSettings;
  hasKey: Record<AiProvider, boolean>;
  secureStorage: boolean;
}

export interface AiModel {
  id: string;
  name: string;
}

export interface AiModelList {
  models: AiModel[];
  /** Id recomendado do provedor atual. */
  recommended: string;
}

/** Resultado de recursos de texto (commit, explicar, stash, PR). */
export interface AiTextResult {
  summary: string;
  body: string;
  /** O diff era grande e parte dele não foi enviada. */
  truncated: boolean;
}

export interface AiConflictResolution {
  resolved: string;
  explanation: string;
  /** 0 a 1. */
  confidence: number;
}

export interface AiConflictResult {
  resolutions: AiConflictResolution[];
  truncated: boolean;
}

export type AiExplainTarget = { kind: "worktree" } | { kind: "commit"; hash: string };

export interface AppSettings {
  version: 1;
  theme: ThemeChoice;
  /** Comando do editor externo (ex.: code); vazio = programa padrão do sistema. */
  editor: string;
}

export interface GitIdentity {
  name: string;
  email: string;
}

/** Perfil do Git: global (do usuário), local (do repositório) e o efetivo (o que um commit usaria). */
export interface GitProfile {
  global: GitIdentity;
  local: GitIdentity;
  effective: GitIdentity;
}

/** Repositório do GitHub deduzido de um remote. */
export interface GitHubRepoRef {
  remote: string;
  owner: string;
  repo: string;
}

export interface GitHubStatus {
  connected: boolean;
  login: string | null;
  /** O sistema oferece criptografia para guardar o token. */
  secureStorage: boolean;
  repo: GitHubRepoRef | null;
  /** Por que não há repositório do GitHub (sem remote do GitHub, sem repositório aberto...). */
  repoReason: string | null;
}

export type PullState = "open" | "closed" | "merged";

export interface PullSummary {
  number: number;
  title: string;
  state: PullState;
  draft: boolean;
  author: string;
  headRef: string;
  baseRef: string;
  updatedAt: string;
}

export interface PullDetail extends PullSummary {
  body: string;
  /** null = o GitHub ainda não calculou. */
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
}

export interface CreatePullInput {
  title: string;
  body: string;
  base: string;
  draft: boolean;
}

/** Estado da atualização do app (ver `Updater`). */
export type UpdaterState =
  | { status: "idle" }
  | { status: "disabled"; message: string }
  | { status: "checking" }
  | { status: "none" }
  /** `notes`: notas da versão em texto puro (corpo da Release). */
  | { status: "available"; version: string; notes: string }
  | { status: "downloading"; percent: number }
  | { status: "ready"; version: string }
  /** `version` presente = o erro foi no download dessa versão (dá para tentar de novo). */
  | { status: "error"; message: string; version?: string };

export interface CommitResult {
  hash: string;
}

export interface GitMonsterApi {
  gitLogList(): Promise<GitLogEntry[]>;
  gitLogClear(): Promise<void>;
  /** Recebe cada comando git assim que termina. Devolve a função que cancela a assinatura. */
  onGitLog(listener: (entry: GitLogEntry) => void): () => void;
  pickRepo(): Promise<OpenedRepo | null>;
  status(root: string): Promise<RepoStatus>;
  log(root: string, skip: number, limit: number): Promise<LogPage>;
  diff(root: string, target: DiffTarget): Promise<FileDiff>;
  stage(root: string, paths: string[]): Promise<void>;
  unstage(root: string, paths: string[]): Promise<void>;
  stageHunk(root: string, hunk: HunkRef): Promise<void>;
  unstageHunk(root: string, hunk: HunkRef): Promise<void>;
  commit(root: string, message: string, amend: boolean): Promise<CommitResult>;
  refs(root: string): Promise<RefsSnapshot>;
  checkout(root: string, target: CheckoutTarget): Promise<void>;
  remoteCheckoutPlan(root: string, name: string): Promise<RemoteCheckoutPlan>;
  createBranch(root: string, name: string, startPoint: string | null, checkout: boolean): Promise<void>;
  deleteBranch(root: string, name: string, force: boolean): Promise<void>;
  merge(root: string, name: string): Promise<OperationResult>;
  /** Arrastar `source` sobre `target`: muda para `target` (se preciso) e mescla `source` nela. */
  mergeInto(root: string, source: string, target: string): Promise<OperationResult>;
  rebaseBranch(root: string, branch: string, onto: string): Promise<OperationResult>;
  operationContinue(root: string): Promise<OperationResult>;
  operationAbort(root: string): Promise<void>;
  operationSkip(root: string): Promise<OperationResult>;
  commitDetail(root: string, hash: string): Promise<CommitDetail>;
  commitFileDiff(root: string, hash: string, path: string): Promise<FileDiff>;
  cherryPick(root: string, hash: string): Promise<OperationResult>;
  revert(root: string, hash: string): Promise<OperationResult>;
  reset(root: string, hash: string, mode: ResetMode): Promise<void>;
  createTag(root: string, name: string, hash: string | null, message: string): Promise<void>;
  deleteTag(root: string, name: string): Promise<void>;
  pushTag(root: string, name: string): Promise<void>;
  forcePush(root: string): Promise<void>;
  rebase(root: string, onto: string): Promise<OperationResult>;
  rebasePlan(root: string, onto: string): Promise<RebasePlan>;
  rebaseInteractive(root: string, onto: string, steps: RebaseStep[]): Promise<OperationResult>;
  fetch(root: string): Promise<void>;
  pull(root: string, mode: PullMode): Promise<OperationResult>;
  push(root: string): Promise<void>;
  stashPush(root: string, message: string, includeUntracked: boolean): Promise<void>;
  stashPop(root: string, index: number): Promise<void>;
  stashDrop(root: string, index: number): Promise<void>;
  discard(root: string, paths: string[]): Promise<void>;
  discardHunk(root: string, hunk: HunkRef): Promise<void>;
  /** Pede a URL já informada e escolhe a pasta de destino por diálogo nativo. null se o usuário cancelar. */
  cloneRepo(url: string): Promise<OpenedRepo | null>;
  /** Escolhe uma pasta por diálogo nativo e roda `git init` nela. null se o usuário cancelar. */
  initRepo(): Promise<OpenedRepo | null>;
  searchCommits(root: string, field: SearchField, query: string): Promise<Commit[]>;
  fileHistory(root: string, path: string, skip: number, limit: number): Promise<LogPage>;
  blame(root: string, path: string, rev: string | null): Promise<BlameLine[]>;
  addRemote(root: string, name: string, url: string): Promise<void>;
  removeRemote(root: string, name: string): Promise<void>;
  renameBranch(root: string, oldName: string, newName: string): Promise<void>;
  deleteRemoteBranch(root: string, remote: string, branch: string): Promise<void>;
  getConflict(root: string, path: string): Promise<ConflictFile>;
  resolveConflict(root: string, path: string, content: string): Promise<void>;
  resolveConflictSide(root: string, path: string, side: ConflictSide): Promise<void>;
  undoInfo(root: string): Promise<UndoInfo>;
  undo(root: string): Promise<void>;
  redo(root: string): Promise<void>;
  getGitProfile(root: string | null): Promise<GitProfile>;
  setGitProfile(root: string | null, scope: "global" | "local", name: string, email: string): Promise<void>;
  openInEditor(root: string, path: string): Promise<void>;
  /** Abre a pasta raiz do repositório no Explorer. */
  openFolder(root: string): Promise<void>;
  githubStatus(root: string | null): Promise<GitHubStatus>;
  /** Valida o token na API e o guarda criptografado. Devolve o login. */
  githubConnect(token: string): Promise<string>;
  githubDisconnect(): Promise<void>;
  githubPulls(root: string, state: "open" | "closed" | "all"): Promise<PullSummary[]>;
  githubPull(root: string, number: number): Promise<PullDetail>;
  githubCreatePull(root: string, input: CreatePullInput): Promise<PullSummary>;
  /** Traz o PR para a branch local pr-N e muda para ela. Devolve o nome da branch. */
  githubCheckoutPull(root: string, number: number): Promise<string>;
  githubOpenPull(root: string, number: number): Promise<void>;
  aiGetSettings(): Promise<AiSettingsView>;
  aiSetSettings(settings: AiSettings): Promise<AiSettingsView>;
  /** Guarda a chave do provedor (criptografada no main). */
  aiSetKey(provider: AiProvider, key: string): Promise<AiSettingsView>;
  aiClearKey(provider: AiProvider): Promise<AiSettingsView>;
  /** Confere endpoint e chave listando os modelos. */
  aiTest(provider: AiProvider, baseUrl: string, key: string | null): Promise<AiModelList>;
  aiModels(): Promise<AiModelList>;
  aiCommitMessage(root: string, amend: boolean, requestId: string): Promise<AiTextResult>;
  aiExplain(root: string, target: AiExplainTarget, requestId: string): Promise<AiTextResult>;
  aiStashMessage(root: string, includeUntracked: boolean, requestId: string): Promise<AiTextResult>;
  aiConflict(root: string, path: string, requestId: string): Promise<AiConflictResult>;
  aiPullRequest(root: string, base: string, requestId: string): Promise<AiTextResult>;
  aiCancel(requestId: string): Promise<void>;
  updaterState(): Promise<UpdaterState>;
  updaterCheck(): Promise<UpdaterState>;
  updaterDownload(): Promise<UpdaterState>;
  updaterInstall(): Promise<void>;
  /** Estado da atualização mudou (verificação automática, progresso, erro); devolve a função para parar de ouvir. */
  onUpdaterChanged(listener: (state: UpdaterState) => void): () => void;
  /** Versão do app instalado. */
  appVersion(): Promise<string>;
  getSettings(): Promise<AppSettings>;
  setSettings(settings: AppSettings): Promise<AppSettings>;
  loadSession(): Promise<LoadedSessionInfo>;
  saveSession(session: SessionState): Promise<void>;
  /** Executa um item do menu da aplicação (`shared/appMenu`). */
  menuInvoke(id: string): Promise<void>;
  /** Comandos de menu/atalho que dependem do renderer (abas, diálogos). Devolve a função de cancelar. */
  onMenuCommand(listener: (command: MenuRendererCommand) => void): () => void;
}

/** Sessão persistida: abas abertas, aba ativa (pela raiz) e repositórios recentes (mais novo primeiro). */
/** Um comando git executado pelo app (para o monitor). Credenciais em URLs já vêm ocultas. */
export interface GitLogEntry {
  id: number;
  /** Início, em ms desde a época. */
  at: number;
  /** Pasta em que rodou (a raiz do repositório). */
  cwd: string;
  /** Linha pronta para colar num terminal. */
  command: string;
  durationMs: number;
  exitCode: number | null;
  ok: boolean;
  /** Só lê (status, log...): o app dispara muitos para atualizar a tela. */
  readOnly: boolean;
  error?: string;
}

export interface SessionState {
  version: 1;
  tabs: string[];
  active: string | null;
  recents: { root: string; openedAt: string }[];
}

export interface LoadedSessionInfo {
  session: SessionState;
  /** Raízes salvas que não existem mais. */
  removed: string[];
}
