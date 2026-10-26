import { describe, expect, it } from "vitest";
import { clearGitLog, formatCommand, isReadOnly, listGitLog, onGitCommand, quoteArg, redact, recordGitCommand } from "../src/main/git/GitLog";
import { runGit } from "../src/main/git/GitService";

describe("formatCommand", () => {
  it("deixa argumentos simples como estão", () => {
    expect(formatCommand(["switch", "--end-of-options", "feature/x"])).toBe("git switch --end-of-options feature/x");
  });

  it("coloca aspas em argumentos com espaços e escapa aspas e cifrão", () => {
    expect(quoteArg("minha mensagem")).toBe('"minha mensagem"');
    expect(quoteArg('diz "oi" $HOME')).toBe('"diz \\"oi\\" \\$HOME"');
    expect(quoteArg("")).toBe('""');
  });

  it("caracteres de controle viram %xNN (válido em --format)", () => {
    expect(quoteArg("--format=%H\x1f%s\x1e")).toBe('--format=%H%x1f%s%x1e');
  });
});

describe("redact", () => {
  it("esconde usuário e senha na URL", () => {
    expect(redact("https://user:tok3n@github.com/a/b.git")).toBe("https://REDACTED@github.com/a/b.git");
    expect(formatCommand(["clone", "https://x:y@h.com/r.git"])).toBe("git clone https://REDACTED@h.com/r.git");
  });

  it("esconde cabeçalho de autorização", () => {
    expect(redact("Authorization: Bearer abc123")).toBe("Authorization: Bearer REDACTED");
  });
});

describe("isReadOnly", () => {
  it.each([["status"], ["log", "-1"], ["rev-parse", "HEAD"], ["config", "--get", "user.name"], ["branch", "--show-current"], ["stash", "list"]])(
    "%j só lê",
    (...args) => expect(isReadOnly(args)).toBe(true),
  );
  it.each([["commit", "-m", "x"], ["push"], ["switch", "main"], ["branch", "nova"], ["stash", "push"], ["config", "user.name", "x"]])(
    "%j altera",
    (...args) => expect(isReadOnly(args)).toBe(false),
  );
  it("ignora opções -c antes do subcomando", () => {
    expect(isReadOnly(["-c", "core.quotepath=off", "status"])).toBe(true);
  });
});

describe("registro", () => {
  it("runGit registra comandos que dão certo e que falham, e avisa os ouvintes", async () => {
    clearGitLog();
    const seen: string[] = [];
    const off = onGitCommand((e) => seen.push(e.command));
    await runGit(process.cwd(), ["rev-parse", "--is-inside-work-tree"]);
    await expect(runGit(process.cwd(), ["rev-parse", "--verify", "--end-of-options", "refs/nao-existe"])).rejects.toThrow();
    off();

    const log = listGitLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ command: "git rev-parse --is-inside-work-tree", ok: true, exitCode: 0, readOnly: true });
    expect(log[1]).toMatchObject({ ok: false, exitCode: 128 });
    expect(log[1]!.error).toBeTruthy();
    expect(seen).toHaveLength(2);
    expect(log[1]!.id).toBeGreaterThan(log[0]!.id);
  });

  it("guarda no máximo 1000 entradas", () => {
    clearGitLog();
    for (let i = 0; i < 1005; i++) recordGitCommand({ cwd: ".", args: ["status"], startedAt: Date.now(), exitCode: 0, ok: true });
    const log = listGitLog();
    expect(log).toHaveLength(1000);
    expect(log[0]!.id).toBeLessThan(log[999]!.id);
  });
});
