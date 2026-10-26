import { describe, expect, it } from "vitest";
import { createTokenStore, parseGitHubUrl, pickGitHubRemote, validateToken, type SecretCrypto, type TokenIo } from "../src/main/GitHubAuth";

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/dono/repo.git", "dono", "repo"],
    ["https://github.com/dono/repo", "dono", "repo"],
    ["https://github.com/dono/repo/", "dono", "repo"],
    ["https://user@github.com/dono/repo.git", "dono", "repo"],
    ["git@github.com:dono/repo.git", "dono", "repo"],
    ["ssh://git@github.com/dono/meu-repo.js.git", "dono", "meu-repo.js"],
    ["HTTPS://GitHub.com/Dono/Repo", "Dono", "Repo"],
  ])("%s", (url, owner, repo) => expect(parseGitHubUrl(url)).toEqual({ owner, repo }));

  it.each([
    "https://gitlab.com/dono/repo.git",
    "https://github.com.evil.com/dono/repo",
    "https://evil.com/github.com/dono/repo",
    "git@gitlab.com:dono/repo.git",
    "https://github.com/dono",
    "https://github.com/dono/repo/extra",
    "https://github.com/../repo",
    "file:///C:/repos/x.git",
    "",
  ])("recusa %j", (url) => expect(parseGitHubUrl(url)).toBeNull());
});

describe("pickGitHubRemote", () => {
  const r = (name: string, fetchUrl: string) => ({ name, fetchUrl });

  it("prefere origin, senão o primeiro do GitHub", () => {
    expect(pickGitHubRemote([r("fork", "https://github.com/eu/x.git"), r("origin", "https://github.com/dono/x.git")])).toEqual({
      remote: "origin",
      owner: "dono",
      repo: "x",
    });
    expect(pickGitHubRemote([r("origin", "https://gitlab.com/a/b.git"), r("fork", "git@github.com:eu/x.git")])?.remote).toBe("fork");
  });

  it("nenhum remote do GitHub: null", () => {
    expect(pickGitHubRemote([r("origin", "https://gitlab.com/a/b.git")])).toBeNull();
    expect(pickGitHubRemote([])).toBeNull();
  });
});

describe("validateToken", () => {
  it("aceita formatos reais e apara espaços", () => {
    expect(validateToken("  ghp_abcdEFGH1234  ")).toBe("ghp_abcdEFGH1234");
    expect(validateToken("github_pat_11ABC_defGHI")).toBe("github_pat_11ABC_defGHI");
  });
  it.each(["", "curto", "tem espaço no meio", "token;rm -rf", "a\nb12345678", "x".repeat(300)])("recusa %j", (t) =>
    expect(() => validateToken(t)).toThrow(/inválid/),
  );
});

describe("createTokenStore", () => {
  const xor = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a));
  const fakeCrypto = (available = true): SecretCrypto => ({
    isAvailable: () => available,
    encrypt: (s) => xor(Buffer.from(s, "utf8")),
    decrypt: (b) => xor(b).toString("utf8"),
  });
  const memoryIo = (): TokenIo & { files: Record<string, string> } => {
    const files: Record<string, string> = {};
    return {
      files,
      read: async (f) => files[f] ?? null,
      write: async (f, c) => {
        files[f] = c;
      },
      remove: async (f) => {
        delete files[f];
      },
    };
  };
  const F = "github.json";
  const TOKEN = "ghp_segredoSegredo123";

  it("guarda criptografado (o texto puro nunca aparece no arquivo) e lê de volta", async () => {
    const io = memoryIo();
    const store = createTokenStore(F, fakeCrypto(), io);

    await store.save(TOKEN);

    expect(io.files[F]).toBeDefined();
    expect(io.files[F]).not.toContain(TOKEN);
    expect(Buffer.from(JSON.parse(io.files[F]!).token, "base64").toString()).not.toContain("ghp_");
    expect(await store.load()).toBe(TOKEN);
  });

  it("sem criptografia disponível, recusa guardar e não grava nada", async () => {
    const io = memoryIo();
    const store = createTokenStore(F, fakeCrypto(false), io);

    await expect(store.save(TOKEN)).rejects.toThrow(/armazenamento seguro/);
    expect(io.files[F]).toBeUndefined();
    expect(store.secureStorageAvailable()).toBe(false);
  });

  it("recusa token inválido antes de qualquer gravação", async () => {
    const io = memoryIo();
    await expect(createTokenStore(F, fakeCrypto(), io).save("com espaço")).rejects.toThrow(/inválid/);
    expect(io.files[F]).toBeUndefined();
  });

  it("arquivo ausente, corrompido ou ilegível: load devolve null", async () => {
    const io = memoryIo();
    const store = createTokenStore(F, fakeCrypto(), io);
    expect(await store.load()).toBeNull();
    io.files[F] = "{ lixo";
    expect(await store.load()).toBeNull();
    io.files[F] = JSON.stringify({ version: 2, token: "x" });
    expect(await store.load()).toBeNull();
  });

  it("clear apaga o token", async () => {
    const io = memoryIo();
    const store = createTokenStore(F, fakeCrypto(), io);
    await store.save(TOKEN);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
