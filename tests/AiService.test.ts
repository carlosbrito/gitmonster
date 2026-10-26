import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAiKeyStore } from "../src/main/ai/AiKeyStore";
import { createAiService } from "../src/main/ai/AiService";
import { defaultAiSettings } from "../src/main/ai/AiSettings";
import type { AiSettings } from "../src/shared/types";

interface Call {
  url: string;
  body: { model: string; max_tokens?: number; messages: { content: string }[] };
  headers: Record<string, string>;
}

describe("AiService com git real e provedor falso", () => {
  let dir: string;
  let data: string;
  let calls: Call[];
  let reply: (call: Call) => unknown | Promise<unknown>;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const tryGit = (...args: string[]) => {
    try {
      git(...args);
    } catch {
      /* conflito esperado */
    }
  };
  const write = (name: string, content: string) => {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  };
  const commitAll = (msg: string) => {
    git("add", ".");
    git("commit", "-m", msg);
  };

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = { url, body: init.body ? JSON.parse(String(init.body)) : {}, headers: init.headers as Record<string, string> };
    calls.push(call);
    const out = await reply(call);
    return { ok: true, status: 200, text: async () => JSON.stringify(out), headers: new Headers() } as Response;
  }) as unknown as typeof fetch;

  const anthropicText = (text: string) => ({ content: [{ type: "text", text }] });

  /** Serviço com preferências e chave já prontas (IA ligada, consentimento dado), como depois da configuração. */
  async function setup(patch: (s: AiSettings) => void = () => {}, withKey = true) {
    const files = new Map<string, string>();
    const keyFiles = new Map<string, string>();
    const settings = defaultAiSettings();
    settings.enabled = true;
    settings.sendCodeApproved.anthropic = true;
    patch(settings);
    files.set("settings", JSON.stringify(settings));
    const service = createAiService({
      settingsFile: "settings",
      io: { read: async (f) => files.get(f) ?? null, write: async (f, c) => void files.set(f, c) },
      keyStore: createAiKeyStore(
        "dir",
        { isAvailable: () => true, encrypt: (p) => Buffer.from(p), decrypt: (b) => b.toString() },
        { read: async (f) => keyFiles.get(f) ?? null, write: async (f, c) => void keyFiles.set(f, c), remove: async (f) => void keyFiles.delete(f) },
        (...p) => p.join("/"),
      ),
      fetchImpl,
    });
    if (withKey) await service.setKey("anthropic", "sk-ant-segredo");
    return service;
  }

  beforeEach(() => {
    calls = [];
    reply = () => anthropicText("<summary>feat: algo</summary><body>detalhe</body>");
    dir = mkdtempSync(join(tmpdir(), "gitmonster-ai-"));
    data = mkdtempSync(join(tmpdir(), "gitmonster-ai-data-"));
    git("init", "-b", "main");
    git("config", "user.name", "Teste");
    git("config", "user.email", "t@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });

  describe("bloqueios antes de enviar código", () => {
    it("IA desligada bloqueia, sem nenhuma chamada", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      const s = await setup((x) => void (x.enabled = false));
      await expect(s.commitMessage(dir, false, "r1")).rejects.toThrow(/IA está desligada/);
      expect(calls).toHaveLength(0);
    });

    it("sem consentimento bloqueia", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      const s = await setup((x) => void (x.sendCodeApproved.anthropic = false));
      await expect(s.commitMessage(dir, false, "r1")).rejects.toThrow(/Confirme o envio de código para Anthropic/);
      expect(calls).toHaveLength(0);
    });

    it("sem chave bloqueia, e modelo local dispensa a chave", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      await expect((await setup(() => {}, false)).commitMessage(dir, false, "r1")).rejects.toThrow(/Falta a chave da API de Anthropic/);
      const local = await setup((x) => {
        x.provider = "openai-compatible";
        x.baseUrls["openai-compatible"] = "http://localhost:11434/v1";
        x.sendCodeApproved["openai-compatible"] = true;
        x.features.commitMessage.model = "llama3";
      }, false);
      reply = () => ({ choices: [{ message: { content: "<summary>ok</summary>" } }] });
      await expect(local.commitMessage(dir, false, "r2")).resolves.toMatchObject({ summary: "ok" });
      expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
      expect(calls[0]!.headers).not.toHaveProperty("Authorization");
    });

    it("provedor sem modelo recomendado exige escolher um", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      const s = await setup((x) => {
        x.provider = "openai-compatible";
        x.sendCodeApproved["openai-compatible"] = true;
      }, false);
      await expect(s.commitMessage(dir, false, "r1")).rejects.toThrow(/Escolha um modelo/);
    });
  });

  describe("mensagem de commit", () => {
    it("o prompt leva o diff em stage, a branch e o histórico; o resultado preenche resumo e corpo", async () => {
      write("a.txt", "antigo\n");
      commitAll("feat: primeiro commit do repo");
      write("a.txt", "novo conteudo especial\n");
      write("fora.txt", "NAO_ESTA_NO_STAGE\n");
      git("add", "a.txt");
      const s = await setup((x) => {
        x.globalInstructions = "escreva em português do Brasil";
        x.features.commitMessage.instructions = "use conventional commits";
      });
      const result = await s.commitMessage(dir, false, "r1");

      expect(result).toEqual({ summary: "feat: algo", body: "detalhe", truncated: false });
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toBe("https://api.anthropic.com/v1/messages");
      expect(call.headers["x-api-key"]).toBe("sk-ant-segredo");
      expect(call.body.model).toBe("claude-sonnet-5-5");
      expect(call.body.max_tokens).toBe(1024);
      const prompt = call.body.messages[0]!.content;
      expect(prompt).toContain("+novo conteudo especial");
      expect(prompt).not.toContain("NAO_ESTA_NO_STAGE");
      expect(prompt).toContain("<branch_name>\nmain\n</branch_name>");
      expect(prompt).toContain("feat: primeiro commit do repo");
      expect(prompt).toContain("escreva em português do Brasil\n\nuse conventional commits");
    });

    it("modelo do recurso vence o recomendado", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      const s = await setup((x) => void (x.features.commitMessage.model = "claude-haiku-5-5"));
      await s.commitMessage(dir, false, "r1");
      expect(calls[0]!.body.model).toBe("claude-haiku-5-5");
    });

    it("nada em stage: erro claro, sem chamada", async () => {
      write("a.txt", "1\n");
      const s = await setup();
      await expect(s.commitMessage(dir, false, "r1")).rejects.toThrow(/Coloque alterações no stage/);
      expect(calls).toHaveLength(0);
    });

    it("assunto de várias linhas: a primeira fica no resumo, o resto vai para o corpo", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      reply = () => anthropicText("<summary>linha um\nlinha dois</summary><body>corpo</body>");
      const r = await (await setup()).commitMessage(dir, false, "r1");
      expect(r).toMatchObject({ summary: "linha um", body: "linha dois\n\ncorpo" });
    });

    it("amend sem stage usa o diff do último commit", async () => {
      write("a.txt", "base\n");
      commitAll("base");
      write("a.txt", "mudou no ultimo commit\n");
      commitAll("ultimo");
      const s = await setup();
      await expect(s.commitMessage(dir, true, "r1")).resolves.toBeTruthy();
      expect(calls[0]!.body.messages[0]!.content).toContain("+mudou no ultimo commit");
    });

    it("amend em commit raiz (sem pai) usa o índice inteiro", async () => {
      write("a.txt", "so existe aqui\n");
      commitAll("raiz");
      await (await setup()).commitMessage(dir, true, "r1");
      expect(calls[0]!.body.messages[0]!.content).toContain("+so existe aqui");
    });

    it("diff grande é cortado, fica dentro do limite e avisa", async () => {
      write("grande.txt", Array.from({ length: 40_000 }, (_, i) => `linha numero ${i} com texto de enchimento`).join("\n") + "\n");
      write("package-lock.json", "{}\n");
      git("add", ".");
      const r = await (await setup()).commitMessage(dir, false, "r1");
      expect(r.truncated).toBe(true);
      expect(calls[0]!.body.messages[0]!.content.length).toBeLessThanOrEqual(300_000);
      expect(calls[0]!.body.messages[0]!.content).toContain("diff cortado");
    });
  });

  describe("explicar", () => {
    it("alterações locais: stage, não stage e arquivos novos", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      write("a.txt", "v2 nao staged\n");
      write("b.txt", "novo arquivo\n");
      const s = await setup();
      await s.explain(dir, { kind: "worktree" }, "r1");
      const prompt = calls[0]!.body.messages[0]!.content;
      expect(prompt).toContain("+v2 nao staged");
      expect(prompt).toContain("+novo arquivo");
      expect(calls[0]!.body.max_tokens).toBe(4096);
    });

    it("commit: leva a mensagem e o diff; merge usa o primeiro pai", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      write("a.txt", "v2 do commit explicado\n");
      commitAll("fix: o que mudou");
      const hash = git("rev-parse", "HEAD");
      await (await setup()).explain(dir, { kind: "commit", hash }, "r1");
      const prompt = calls[0]!.body.messages[0]!.content;
      expect(prompt).toContain("<message>\nfix: o que mudou\n</message>");
      expect(prompt).toContain("+v2 do commit explicado");

      git("switch", "-c", "outra", "HEAD~1");
      write("c.txt", "so na outra\n");
      commitAll("outra");
      git("switch", "main");
      git("merge", "--no-ff", "-m", "merge outra", "outra");
      calls.length = 0;
      await (await setup()).explain(dir, { kind: "commit", hash: git("rev-parse", "HEAD") }, "r2");
      expect(calls[0]!.body.messages[0]!.content).toContain("+so na outra");
    });

    it("working tree limpo: erro, sem chamada", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      await expect((await setup()).explain(dir, { kind: "worktree" }, "r1")).rejects.toThrow(/Não há alterações/);
      expect(calls).toHaveLength(0);
    });

    it("hash inválido é recusado", async () => {
      await expect((await setup()).explain(dir, { kind: "commit", hash: "--oops" }, "r1")).rejects.toThrow(/Hash de commit inválido/);
    });
  });

  describe("mensagem de stash", () => {
    it("usa só a primeira linha e só inclui os não rastreados quando pedido", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      write("a.txt", "v2 em andamento\n");
      write("novo.ts", "console.log(1)\n");
      reply = () => anthropicText("<summary>WIP: ajustes no a.txt\nsegunda linha</summary>");
      const s = await setup();

      const r = await s.stashMessage(dir, false, "r1");
      expect(r).toEqual({ summary: "WIP: ajustes no a.txt", body: "", truncated: false });
      expect(calls[0]!.body.messages[0]!.content).not.toContain("novo.ts");
      expect(calls[0]!.body.max_tokens).toBe(256);

      await s.stashMessage(dir, true, "r2");
      expect(calls[1]!.body.messages[0]!.content).toContain("<untracked_files>\nnovo.ts\n</untracked_files>");
    });

    it("sem alterações: erro", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      await expect((await setup()).stashMessage(dir, true, "r1")).rejects.toThrow(/Não há alterações para guardar/);
      expect(calls).toHaveLength(0);
    });

    it("só arquivo novo e sem 'incluir não rastreados': erro", async () => {
      write("a.txt", "v1\n");
      commitAll("base");
      write("novo.ts", "x\n");
      await expect((await setup()).stashMessage(dir, false, "r1")).rejects.toThrow(/Não há alterações para guardar/);
    });
  });

  describe("Pull Request", () => {
    function featureBranch() {
      write("a.txt", "base\n");
      commitAll("base");
      git("switch", "-c", "feat/algo");
      write("b.txt", "do pr\n");
      commitAll("feat: coisa do pr");
    }

    it("gera título e descrição; título só com a primeira linha", async () => {
      featureBranch();
      reply = () => anthropicText("<summary>Adiciona coisa\nlinha extra</summary><body>## Resumo\nfeito</body>");
      const r = await (await setup()).pullRequest(dir, "main", "r1");
      expect(r).toEqual({ summary: "Adiciona coisa", body: "## Resumo\nfeito", truncated: false });
      const prompt = calls[0]!.body.messages[0]!.content;
      expect(prompt).toContain('"feat/algo" into "main"');
      expect(prompt).toContain("feat: coisa do pr");
      expect(prompt).toContain("+do pr");
    });

    it("base vazia usa main (ou master) quando não há origin", async () => {
      featureBranch();
      await (await setup()).pullRequest(dir, "", "r1");
      expect(calls[0]!.body.messages[0]!.content).toContain('into "main"');
    });

    it("usa o template de PR do repositório", async () => {
      write("a.txt", "base\n");
      write(".github/pull_request_template.md", "## Contexto\n## Como testar\n");
      commitAll("base");
      git("switch", "-c", "feat/t");
      write("b.txt", "x\n");
      commitAll("feat: t");
      await (await setup()).pullRequest(dir, "main", "r1");
      expect(calls[0]!.body.messages[0]!.content).toContain("<template>\n## Contexto\n## Como testar\n</template>");
    });

    it("sem commits à frente da base: erro, sem chamada", async () => {
      write("a.txt", "base\n");
      commitAll("base");
      git("switch", "-c", "vazia");
      await expect((await setup()).pullRequest(dir, "main", "r1")).rejects.toThrow("Não há commits para descrever em relação a main.");
      expect(calls).toHaveLength(0);
    });

    it("base inexistente e base inválida", async () => {
      featureBranch();
      const s = await setup();
      await expect(s.pullRequest(dir, "nao-existe", "r1")).rejects.toThrow(/não existe/);
      await expect(s.pullRequest(dir, "--upload-pack=x", "r2")).rejects.toThrow(/Nome de branch inválido/);
    });
  });

  describe("conflitos", () => {
    function conflict(extraBlock = false) {
      write("a.txt", "linha 1\nlinha 2\nlinha 3\nlinha 4\nlinha 5\nlinha 6\nlinha 7\n");
      commitAll("base");
      git("switch", "-c", "feature");
      write("a.txt", `linha 1\ndeles\nlinha 3\nlinha 4\nlinha 5\nlinha 6\n${extraBlock ? "deles 7" : "linha 7"}\n`);
      commitAll("feature");
      git("switch", "main");
      write("a.txt", `linha 1\nnosso\nlinha 3\nlinha 4\nlinha 5\nlinha 6\n${extraBlock ? "nosso 7" : "linha 7"}\n`);
      commitAll("main");
      tryGit("merge", "feature");
    }

    const group = (code: string, why = "mantém os dois", conf = "0.8") => `<resolved>${code}</resolved><explanation>${why}</explanation><confidence>${conf}</confidence>`;

    it("envia nosso/deles/base (mesmo sem diff3) e devolve uma resolução por bloco", async () => {
      conflict();
      reply = () => anthropicText(group("\nnosso e deles\n"));
      const r = await (await setup()).conflict(dir, "a.txt", "r1");
      expect(r).toEqual({ resolutions: [{ resolved: "nosso e deles", explanation: "mantém os dois", confidence: 0.8 }], truncated: false });
      const prompt = calls[0]!.body.messages[0]!.content;
      expect(prompt).toContain("<ours");
      expect(prompt).toContain("nosso");
      expect(prompt).toContain("<theirs");
      expect(prompt).toContain("deles");
      expect(prompt).toContain("<base>\nlinha 2\n</base>");
      expect(prompt).toContain("<context_before>\nlinha 1\n</context_before>");
      expect(prompt).toContain("linha 3");
      expect(calls[0]!.body.max_tokens).toBe(8192);
    });

    it("dois blocos: dois grupos esperados", async () => {
      conflict(true);
      reply = () => anthropicText(group("um") + group("dois"));
      const r = await (await setup()).conflict(dir, "a.txt", "r1");
      expect(r.resolutions.map((x) => x.resolved)).toEqual(["um", "dois"]);
      expect(calls[0]!.body.messages[0]!.content).toContain("exactly 2 repeated groups");
    });

    it("contagem divergente: erro e nada aplicado", async () => {
      conflict(true);
      reply = () => anthropicText(group("só um"));
      await expect((await setup()).conflict(dir, "a.txt", "r1")).rejects.toThrow("A IA não devolveu uma resolução para cada conflito. Tente de novo.");
    });

    it("arquivo sem conflito é recusado", async () => {
      write("a.txt", "x\n");
      commitAll("base");
      await expect((await setup()).conflict(dir, "a.txt", "r1")).rejects.toThrow(/não está em conflito/);
      expect(calls).toHaveLength(0);
    });

    it("não toca no arquivo do disco", async () => {
      conflict();
      reply = () => anthropicText(group("x"));
      const before = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
      await (await setup()).conflict(dir, "a.txt", "r1");
      expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).toBe(before);
    });
  });

  describe("cancelamento e conexão", () => {
    it("cancelar aborta a requisição e não devolve texto", async () => {
      write("a.txt", "1\n");
      git("add", ".");
      let started: () => void = () => {};
      const startedP = new Promise<void>((r) => (started = r));
      const impl = ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          started();
          init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" })));
        })) as unknown as typeof fetch;
      const files = new Map<string, string>();
      const settings = defaultAiSettings();
      settings.enabled = true;
      settings.sendCodeApproved.anthropic = true;
      files.set("settings", JSON.stringify(settings));
      const keys = new Map<string, string>([]);
      const s = createAiService({
        settingsFile: "settings",
        io: { read: async (f) => files.get(f) ?? null, write: async (f, c) => void files.set(f, c) },
        keyStore: createAiKeyStore(
          "d",
          { isAvailable: () => true, encrypt: (p) => Buffer.from(p), decrypt: (b) => b.toString() },
          { read: async (f) => keys.get(f) ?? null, write: async (f, c) => void keys.set(f, c), remove: async (f) => void keys.delete(f) },
          (...p) => p.join("/"),
        ),
        fetchImpl: impl,
      });
      await s.setKey("anthropic", "sk-ant-x");
      const pending = s.commitMessage(dir, false, "cancela-me").then(
        () => new Error("deveria ter sido cancelado"),
        (e: Error) => e,
      );
      await startedP;
      s.cancel("cancela-me");
      expect((await pending).message).toBe("Requisição cancelada.");
    });

    it("testar conexão lista modelos com a chave digitada, sem salvá-la", async () => {
      reply = () => ({ data: [{ id: "claude-sonnet-5-5", display_name: "Sonnet" }] });
      const s = await setup(() => {}, false);
      const out = await s.test("anthropic", "", "sk-ant-digitada");
      expect(out).toEqual({ models: [{ id: "claude-sonnet-5-5", name: "Sonnet" }], recommended: "claude-sonnet-5-5" });
      expect(calls[0]!.headers["x-api-key"]).toBe("sk-ant-digitada");
      expect((await s.getSettings()).hasKey.anthropic).toBe(false);
    });

    it("testar sem chave em provedor que exige: erro; URL insegura: erro", async () => {
      const s = await setup(() => {}, false);
      await expect(s.test("anthropic", "", null)).rejects.toThrow(/Informe a chave/);
      await expect(s.test("openai", "http://exemplo.com/v1", "sk-x")).rejects.toThrow(/https/);
    });

    it("o renderer só vê hasKey, nunca a chave", async () => {
      const s = await setup();
      const view = await s.getSettings();
      expect(view.hasKey.anthropic).toBe(true);
      expect(JSON.stringify(view)).not.toContain("sk-ant-segredo");
      await s.clearKey("anthropic");
      expect((await s.getSettings()).hasKey.anthropic).toBe(false);
    });

    it("salvar preferências persiste e recusa URL insegura", async () => {
      const s = await setup();
      const next = defaultAiSettings();
      next.enabled = true;
      next.baseUrls.openai = "http://exemplo.com/v1";
      await expect(s.setSettings(next)).rejects.toThrow(/https/);
      next.baseUrls.openai = "https://openrouter.ai/api/v1/";
      const view = await s.setSettings(next);
      expect(view.settings.baseUrls.openai).toBe("https://openrouter.ai/api/v1");
    });
  });
});
