import type { CreatePullInput, GitHubRepoRef, GitHubStatus, PullDetail, PullSummary } from "../shared/types";
import { assertPullNumber, createGitHubClient, GitHubError, type GitHubClient } from "./GitHubApi";
import { pickGitHubRemote, validateToken, type createTokenStore } from "./GitHubAuth";
import { NETWORK_TIMEOUT_MS } from "./git/Branches";
import { getStatus, runGit } from "./git/GitService";
import { listRemotes } from "./git/Remotes";

type TokenStore = ReturnType<typeof createTokenStore>;

export interface GitHubServiceDeps {
  tokenStore: TokenStore;
  /** Só testes: servidor de mentira no lugar de https://api.github.com. */
  baseUrl?: string;
  /** Abre uma URL no navegador (já validada aqui). */
  openExternal(url: string): Promise<void>;
  /** Só testes: forma de achar o repositório do GitHub sem depender da URL do remote. */
  resolveRepo?(root: string): Promise<GitHubRepoRef | null>;
}

const NOT_GITHUB = "Este repositório não tem um remote do GitHub (https://github.com/... ou git@github.com:...).";

export function createGitHubService(deps: GitHubServiceDeps) {
  /** Login confirmado nesta execução; evita uma chamada de rede a cada abertura da tela. */
  let knownLogin: string | null = null;

  const clientFor = (token: string): GitHubClient =>
    createGitHubClient({ token, ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }) });

  async function requireClient(): Promise<GitHubClient> {
    const token = await deps.tokenStore.load();
    if (!token) throw new Error("Conecte-se ao GitHub nas Configurações (token pessoal).");
    return clientFor(token);
  }

  async function repoOf(root: string): Promise<GitHubRepoRef | null> {
    if (deps.resolveRepo) return deps.resolveRepo(root);
    return pickGitHubRemote(await listRemotes(root));
  }

  async function requireRepo(root: string): Promise<GitHubRepoRef> {
    const repo = await repoOf(root);
    if (!repo) throw new Error(NOT_GITHUB);
    return repo;
  }

  return {
    async status(root: string | null): Promise<GitHubStatus> {
      const secureStorage = deps.tokenStore.secureStorageAvailable();
      const repo = root ? await repoOf(root).catch(() => null) : null;
      const repoReason = repo ? null : root ? NOT_GITHUB : "Abra um repositório para usar Pull Requests.";

      const token = await deps.tokenStore.load();
      if (!token) return { connected: false, login: null, secureStorage, repo, repoReason };

      if (knownLogin === null) {
        try {
          knownLogin = (await clientFor(token).getUser()).login;
        } catch (e) {
          // Token revogado: desconecta de verdade. Falha de rede não apaga nada.
          if (e instanceof GitHubError && e.status === 401) {
            await deps.tokenStore.clear();
            return { connected: false, login: null, secureStorage, repo, repoReason };
          }
        }
      }
      return { connected: true, login: knownLogin, secureStorage, repo, repoReason };
    },

    /** Confere o token na API antes de guardar. */
    async connect(token: string): Promise<string> {
      const clean = validateToken(token);
      const user = await clientFor(clean).getUser();
      await deps.tokenStore.save(clean);
      knownLogin = user.login;
      return user.login;
    },

    async disconnect(): Promise<void> {
      await deps.tokenStore.clear();
      knownLogin = null;
    },

    async listPulls(root: string, state: "open" | "closed" | "all"): Promise<PullSummary[]> {
      if (!["open", "closed", "all"].includes(state)) throw new Error("Filtro inválido.");
      const [client, repo] = await Promise.all([requireClient(), requireRepo(root)]);
      return client.listPulls(repo.owner, repo.repo, state);
    },

    async getPull(root: string, number: number): Promise<PullDetail> {
      assertPullNumber(number);
      const [client, repo] = await Promise.all([requireClient(), requireRepo(root)]);
      return client.getPull(repo.owner, repo.repo, number);
    },

    /** O PR sai da branch atual, que precisa já estar publicada. */
    async createPull(root: string, input: CreatePullInput): Promise<PullSummary> {
      const title = input.title.trim();
      if (title === "") throw new Error("Escreva um título para o Pull Request.");
      if (title.length > 256 || input.body.length > 60_000) throw new Error("Título ou descrição grandes demais.");
      const [client, repo, status] = await Promise.all([requireClient(), requireRepo(root), getStatus(root)]);
      if (!status.branch) throw new Error("HEAD destacado: faça checkout de uma branch para abrir o PR.");
      if (!status.upstream) throw new Error(`Publique "${status.branch}" (Push) antes de abrir o Pull Request.`);
      const base = input.base.trim() || (await client.getDefaultBranch(repo.owner, repo.repo));
      if (base === status.branch) throw new Error("A branch de destino é a mesma da atual.");
      return client.createPull(repo.owner, repo.repo, status.branch, { ...input, title, base });
    },

    /** Traz `pull/N/head` do remote para a branch local `pr-N` e muda para ela. */
    async checkoutPull(root: string, number: number): Promise<string> {
      assertPullNumber(number);
      const repo = await requireRepo(root);
      const branch = `pr-${number}`;
      await runGit(root, ["fetch", "--update-head-ok", "--", repo.remote, `+refs/pull/${number}/head:refs/heads/${branch}`], {
        timeoutMs: NETWORK_TIMEOUT_MS,
      });
      await runGit(root, ["checkout", "--end-of-options", branch]);
      return branch;
    },

    /** A URL é montada aqui a partir de dono, repositório e número já validados; nunca vem do renderer. */
    async openPull(root: string, number: number): Promise<void> {
      assertPullNumber(number);
      const repo = await requireRepo(root);
      await deps.openExternal(`https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pull/${number}`);
    },
  };
}

export type GitHubService = ReturnType<typeof createGitHubService>;
