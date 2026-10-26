import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitHubService } from "../src/main/GitHub";
import { createTokenStore, type SecretCrypto, type TokenIo } from "../src/main/GitHubAuth";

describe("serviço do GitHub (API simulada + repositório real)", () => {
  let base: string;
  let work: string;
  let bare: string;
  let server: Server;
  let baseUrl: string;
  const calls: { method: string; url: string; auth: string | undefined; body: any }[] = [];
  let userStatus = 200;
  const opened: string[] = [];
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

  const files: Record<string, string> = {};
  const io: TokenIo = {
    read: async (f) => files[f] ?? null,
    write: async (f, c) => {
      files[f] = c;
    },
    remove: async (f) => {
      delete files[f];
    },
  };
  const crypto: SecretCrypto = { isAvailable: () => true, encrypt: (s) => Buffer.from(s.split("").reverse().join("")), decrypt: (b) => b.toString().split("").reverse().join("") };

  const service = () =>
    createGitHubService({
      tokenStore: createTokenStore("github.json", crypto, io),
      baseUrl,
      openExternal: async (u) => void opened.push(u),
      resolveRepo: async () => ({ remote: "origin", owner: "dono", repo: "repo" }),
    });

  beforeEach(async () => {
    calls.length = 0;
    opened.length = 0;
    userStatus = 200;
    for (const k of Object.keys(files)) delete files[k];

    base = mkdtempSync(join(tmpdir(), "gitmonster-gh-"));
    bare = join(base, "remote.git");
    work = join(base, "work");
    execFileSync("git", ["init", "--bare", "-b", "main", bare]);
    execFileSync("git", ["init", "-b", "main", work]);
    for (const [k, v] of [["user.name", "T"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"]]) git(work, "config", k!, v!);
    writeFileSync(join(work, "f.txt"), "um\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "inicial");
    git(work, "remote", "add", "origin", bare);
    git(work, "push", "-u", "origin", "main");

    server = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        calls.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body: data ? JSON.parse(data) : undefined });
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(json));
        };
        if (req.url === "/user") return send(userStatus, userStatus === 200 ? { login: "ana" } : { message: "Bad credentials" });
        if (req.url === "/repos/dono/repo") return send(200, { default_branch: "main" });
        if (req.url?.startsWith("/repos/dono/repo/pulls?")) {
          return send(200, [{ number: 5, title: "PR cinco", state: "open", draft: false, user: { login: "bruno" }, head: { ref: "feature" }, base: { ref: "main" }, updated_at: "2026-10-15T00:00:00Z", merged_at: null }]);
        }
        if (req.url === "/repos/dono/repo/pulls" && req.method === "POST") {
          return send(201, { number: 9, title: "Meu PR", state: "open", draft: false, user: { login: "ana" }, head: { ref: "x" }, base: { ref: "main" }, updated_at: "", merged_at: null });
        }
        send(404, { message: "Not Found" });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(base, { recursive: true, force: true });
  });

  it("sem token: desconectado, e as operações pedem para conectar", async () => {
    const gh = service();
    expect(await gh.status(work)).toMatchObject({ connected: false, login: null, secureStorage: true });
    await expect(gh.listPulls(work, "open")).rejects.toThrow(/Conecte-se/);
  });

  it("conectar valida o token na API e o guarda criptografado", async () => {
    const gh = service();

    expect(await gh.connect("ghp_tokenValido123")).toBe("ana");

    expect(calls[0]).toMatchObject({ url: "/user", auth: "Bearer ghp_tokenValido123" });
    expect(files["github.json"]).toBeDefined();
    expect(files["github.json"]).not.toContain("ghp_tokenValido123");
    expect(await gh.status(work)).toMatchObject({ connected: true, login: "ana", repo: { owner: "dono", repo: "repo" } });
  });

  it("token recusado pela API não é guardado", async () => {
    userStatus = 401;
    await expect(service().connect("ghp_tokenRuim12345")).rejects.toThrow(/Token inválido/);
    expect(files["github.json"]).toBeUndefined();
  });

  it("token revogado depois: o status desconecta e apaga o token guardado", async () => {
    await service().connect("ghp_tokenValido123");
    userStatus = 401;

    expect(await service().status(work)).toMatchObject({ connected: false });
    expect(files["github.json"]).toBeUndefined();
  });

  it("desconectar apaga o token", async () => {
    const gh = service();
    await gh.connect("ghp_tokenValido123");
    await gh.disconnect();
    expect(files["github.json"]).toBeUndefined();
    expect((await gh.status(work)).connected).toBe(false);
  });

  it("lista Pull Requests do repositório certo", async () => {
    const gh = service();
    await gh.connect("ghp_tokenValido123");

    const pulls = await gh.listPulls(work, "open");

    expect(pulls.map((p) => [p.number, p.title, p.author])).toEqual([[5, "PR cinco", "bruno"]]);
    await expect(gh.listPulls(work, "tudo" as never)).rejects.toThrow(/Filtro/);
  });

  it("cria PR a partir da branch atual publicada, usando a branch padrão como destino", async () => {
    const gh = service();
    await gh.connect("ghp_tokenValido123");
    git(work, "switch", "-c", "minha-feature");
    writeFileSync(join(work, "g.txt"), "g\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "feature");
    git(work, "push", "-u", "origin", "minha-feature");

    const pr = await gh.createPull(work, { title: "  Meu PR  ", body: "texto", base: "", draft: false });

    expect(pr.number).toBe(9);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ title: "Meu PR", head: "minha-feature", base: "main", draft: false });
  });

  it("recusa criar PR sem título, sem publicar a branch ou com destino igual", async () => {
    const gh = service();
    await gh.connect("ghp_tokenValido123");
    await expect(gh.createPull(work, { title: "  ", body: "", base: "main", draft: false })).rejects.toThrow(/título/);

    git(work, "switch", "-c", "local-apenas");
    await expect(gh.createPull(work, { title: "T", body: "", base: "main", draft: false })).rejects.toThrow(/Publique/);

    git(work, "switch", "main");
    await expect(gh.createPull(work, { title: "T", body: "", base: "main", draft: false })).rejects.toThrow(/mesma/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("checkout de PR traz refs/pull/N/head para pr-N e muda para ela", async () => {
    const gh = service();
    git(work, "switch", "-c", "origem-do-pr");
    writeFileSync(join(work, "pr.txt"), "do pr\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "commit do PR");
    const prHead = git(work, "rev-parse", "HEAD");
    git(work, "push", "origin", "origem-do-pr");
    git(bare, "update-ref", "refs/pull/5/head", prHead); // o que o GitHub faz para cada PR
    git(work, "switch", "main");
    git(work, "branch", "-D", "origem-do-pr");

    expect(await gh.checkoutPull(work, 5)).toBe("pr-5");

    expect(git(work, "branch", "--show-current")).toBe("pr-5");
    expect(git(work, "rev-parse", "HEAD")).toBe(prHead);
  });

  it("abrir no navegador usa uma URL montada no main", async () => {
    await service().openPull(work, 5);
    expect(opened).toEqual(["https://github.com/dono/repo/pull/5"]);
    await expect(service().openPull(work, 0)).rejects.toThrow(/inválido/);
    expect(opened).toHaveLength(1);
  });

  it("repositório sem remote do GitHub", async () => {
    const gh = createGitHubService({ tokenStore: createTokenStore("x.json", crypto, io), baseUrl, openExternal: async () => undefined });
    const status = await gh.status(work); // origin aponta para um caminho local
    expect(status.repo).toBeNull();
    expect(status.repoReason).toMatch(/remote do GitHub/);
    await expect(gh.openPull(work, 5)).rejects.toThrow(/remote do GitHub/);
  });
});
