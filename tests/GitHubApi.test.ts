import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPullNumber, createGitHubClient, describeError, GitHubError } from "../src/main/GitHubApi";

interface Recorded {
  method: string;
  url: string;
  auth: string | undefined;
  body: unknown;
}

describe("cliente da API do GitHub (servidor local)", () => {
  let server: Server;
  let baseUrl: string;
  let requests: Recorded[];
  let handler: (req: Recorded) => { status?: number; headers?: Record<string, string>; json?: unknown; raw?: string };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });

  beforeEach(async () => {
    requests = [];
    handler = () => ({ json: {} });
    server = createServer(async (req, res) => {
      const raw = await readBody(req);
      const recorded: Recorded = { method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined };
      requests.push(recorded);
      const out = handler(recorded);
      res.writeHead(out.status ?? 200, { "Content-Type": "application/json", ...out.headers });
      res.end(out.raw ?? JSON.stringify(out.json ?? {}));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const client = () => createGitHubClient({ token: "ghp_token123456", baseUrl });
  const rawPull = (over: object = {}) => ({
    number: 7,
    title: "Corrige bug",
    state: "open",
    draft: false,
    user: { login: "ana" },
    head: { ref: "fix/bug" },
    base: { ref: "main" },
    updated_at: "2026-10-15T10:00:00Z",
    merged_at: null,
    ...over,
  });

  it("getUser envia o token no cabeçalho e devolve o login", async () => {
    handler = () => ({ json: { login: "ana" } });
    expect(await client().getUser()).toEqual({ login: "ana" });
    expect(requests[0]).toMatchObject({ method: "GET", url: "/user", auth: "Bearer ghp_token123456" });
  });

  it("listPulls converte a resposta e identifica PR mesclado", async () => {
    handler = () => ({ json: [rawPull(), rawPull({ number: 8, state: "closed", merged_at: "2026-10-14T00:00:00Z" }), rawPull({ number: 9, state: "closed" }), rawPull({ number: 10, draft: true })] });

    const pulls = await client().listPulls("dono", "repo", "all");

    expect(pulls.map((p) => [p.number, p.state, p.draft])).toEqual([
      [7, "open", false],
      [8, "merged", false],
      [9, "closed", false],
      [10, "open", true],
    ]);
    expect(pulls[0]).toMatchObject({ title: "Corrige bug", author: "ana", headRef: "fix/bug", baseRef: "main" });
    expect(requests[0]!.url).toMatch(/^\/repos\/dono\/repo\/pulls\?state=all&per_page=50/);
  });

  it("getPull traz o detalhe", async () => {
    handler = () => ({ json: rawPull({ body: "descrição", mergeable: true, additions: 10, deletions: 2, changed_files: 3, commits: 4, comments: 1, review_comments: 2 }) });

    expect(await client().getPull("dono", "repo", 7)).toMatchObject({
      number: 7,
      body: "descrição",
      mergeable: true,
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      commits: 4,
      comments: 3,
    });
    expect(requests[0]!.url).toBe("/repos/dono/repo/pulls/7");
  });

  it("createPull envia os dados e devolve o PR criado", async () => {
    handler = () => ({ status: 201, json: rawPull({ number: 12, title: "Novo" }) });

    const pr = await client().createPull("dono", "repo", "minha-branch", { title: "Novo", body: "texto", base: "main", draft: true });

    expect(pr.number).toBe(12);
    expect(requests[0]).toMatchObject({ method: "POST", url: "/repos/dono/repo/pulls", body: { title: "Novo", body: "texto", head: "minha-branch", base: "main", draft: true } });
  });

  it("codifica dono e repositório no caminho (nada de ../ ou ?)", async () => {
    handler = () => ({ json: [] });
    await client().listPulls("a/b", "c?d", "open");
    expect(requests[0]!.url.startsWith("/repos/a%2Fb/c%3Fd/pulls")).toBe(true);
  });

  it.each([
    [401, {}, /Token inválido/],
    [404, {}, /não encontrado/],
    [422, { message: "Validation Failed", errors: [{ message: "A pull request already exists" }] }, /already exists/],
    [500, { message: "boom" }, /Erro do GitHub \(500\)/],
  ])("status %i vira mensagem clara", async (status, json, expected) => {
    handler = () => ({ status, json });
    const err = await client().getUser().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.message).toMatch(expected);
    expect(err.status).toBe(status);
  });

  it("403 por limite de requisições informa o horário; 403 comum fala de permissão", async () => {
    handler = () => ({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" }, json: { message: "rate limit" } });
    expect((await client().getUser().catch((e) => e)).message).toMatch(/Limite de requisições/);

    handler = () => ({ status: 403, json: { message: "Resource not accessible" } });
    expect((await client().getUser().catch((e) => e)).message).toMatch(/sem permissão/);
  });

  it("resposta que não é JSON não derruba o cliente", async () => {
    handler = () => ({ status: 502, raw: "<html>Bad gateway</html>" });
    expect((await client().getUser().catch((e) => e)).message).toMatch(/Erro do GitHub \(502\)/);
  });

  it("servidor fora do ar: mensagem de conexão, sem vazar detalhes", async () => {
    await new Promise<void>((r) => server.close(() => r()));
    const err = await client().getUser().catch((e) => e);
    expect(err.message).toMatch(/Não foi possível falar com o GitHub/);
    server = createServer(); // para o afterEach fechar algo válido
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  });

  it("não segue redirecionamentos (o token não vai parar em outro host)", async () => {
    handler = () => ({ status: 302, headers: { Location: "http://127.0.0.1:1/roubo" }, json: {} });
    await expect(client().getUser()).rejects.toThrow(/Não foi possível falar/);
  });

  it("número de PR inválido é recusado antes da requisição", async () => {
    for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 40]) expect(() => assertPullNumber(bad)).toThrow(/inválido/);
    await expect(client().getPull("a", "b", 0)).rejects.toThrow(/inválido/);
    expect(requests).toHaveLength(0);
  });

  it("describeError é puro e cobre 429", () => {
    expect(describeError(429, {}, new Headers({ "x-ratelimit-remaining": "0" }))).toMatch(/Limite/);
  });
});
