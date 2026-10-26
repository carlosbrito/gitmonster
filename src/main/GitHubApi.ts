import type { CreatePullInput, PullDetail, PullState, PullSummary } from "../shared/types";

export const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 20_000;
const PER_PAGE = 50;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubClientOptions {
  token: string;
  /** Só muda em testes; em produção é sempre https://api.github.com. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type Json = Record<string, unknown>;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

function toSummary(raw: Json): PullSummary {
  const merged = raw["merged_at"] !== null && raw["merged_at"] !== undefined;
  const state: PullState = merged ? "merged" : raw["state"] === "closed" ? "closed" : "open";
  return {
    number: num(raw["number"]),
    title: str(raw["title"]),
    state,
    draft: raw["draft"] === true,
    author: str(obj(raw["user"])["login"]),
    headRef: str(obj(raw["head"])["ref"]),
    baseRef: str(obj(raw["base"])["ref"]),
    updatedAt: str(raw["updated_at"]),
  };
}

function toDetail(raw: Json): PullDetail {
  return {
    ...toSummary(raw),
    body: str(raw["body"]),
    mergeable: typeof raw["mergeable"] === "boolean" ? raw["mergeable"] : null,
    additions: num(raw["additions"]),
    deletions: num(raw["deletions"]),
    changedFiles: num(raw["changed_files"]),
    commits: num(raw["commits"]),
    comments: num(raw["comments"]) + num(raw["review_comments"]),
  };
}

/** Mensagem em português para o erro de uma resposta da API. */
export function describeError(status: number, body: Json, headers: Headers): string {
  const apiMessage = str(body["message"]);
  const details = Array.isArray(body["errors"])
    ? (body["errors"] as unknown[])
        .map((e) => (typeof e === "string" ? e : str(obj(e)["message"])))
        .filter(Boolean)
        .join("; ")
    : "";
  switch (status) {
    case 401:
      return "Token inválido ou expirado. Conecte-se de novo nas Configurações.";
    case 403:
    case 429: {
      if (headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(headers.get("x-ratelimit-reset"));
        const when = reset > 0 ? new Date(reset * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "mais tarde";
        return `Limite de requisições do GitHub atingido. Tente de novo às ${when}.`;
      }
      return `O GitHub recusou a operação (sem permissão para este token). ${apiMessage}`.trim();
    }
    case 404:
      return "Repositório ou Pull Request não encontrado. Confira se o token tem acesso a ele.";
    case 422:
      return `O GitHub não aceitou os dados: ${details || apiMessage || "validação falhou"}.`;
    default:
      return `Erro do GitHub (${status}): ${apiMessage || "resposta inesperada"}.`;
  }
}

const seg = (s: string) => encodeURIComponent(s);

/** Cliente mínimo da API REST do GitHub. O token só viaja no cabeçalho para a `baseUrl`. */
export function createGitHubClient({ token, baseUrl = GITHUB_API, fetchImpl = fetch }: GitHubClientOptions) {
  async function call(method: string, path: string, body?: unknown): Promise<Json | Json[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "GitMonster",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
      });
      const text = await res.text();
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        /* resposta que não é JSON: segue com objeto vazio */
      }
      if (!res.ok) throw new GitHubError(describeError(res.status, obj(parsed), res.headers), res.status);
      return parsed as Json | Json[];
    } catch (e) {
      if (e instanceof GitHubError) throw e;
      if (e instanceof Error && e.name === "AbortError") throw new Error("O GitHub não respondeu a tempo.");
      throw new Error("Não foi possível falar com o GitHub. Verifique a conexão.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getUser(): Promise<{ login: string }> {
      const user = (await call("GET", "/user")) as Json;
      return { login: str(user["login"]) };
    },

    async getDefaultBranch(owner: string, repo: string): Promise<string> {
      const info = (await call("GET", `/repos/${seg(owner)}/${seg(repo)}`)) as Json;
      return str(info["default_branch"], "main");
    },

    async listPulls(owner: string, repo: string, state: "open" | "closed" | "all"): Promise<PullSummary[]> {
      const list = (await call("GET", `/repos/${seg(owner)}/${seg(repo)}/pulls?state=${state}&per_page=${PER_PAGE}&sort=updated&direction=desc`)) as Json[];
      return Array.isArray(list) ? list.map(toSummary) : [];
    },

    async getPull(owner: string, repo: string, number: number): Promise<PullDetail> {
      assertPullNumber(number);
      return toDetail((await call("GET", `/repos/${seg(owner)}/${seg(repo)}/pulls/${number}`)) as Json);
    },

    async createPull(owner: string, repo: string, head: string, input: CreatePullInput): Promise<PullSummary> {
      const created = (await call("POST", `/repos/${seg(owner)}/${seg(repo)}/pulls`, {
        title: input.title,
        body: input.body,
        head,
        base: input.base,
        draft: input.draft,
      })) as Json;
      return toSummary(created);
    },
  };
}

export function assertPullNumber(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000_000) throw new Error("Número de Pull Request inválido.");
  return n;
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
