import { describe, expect, it } from "vitest";
import { describeError } from "../src/renderer/errorInfo";

/** Trecho real do `git pull` com git-remote-codecommit e AWS SSO vencido. */
const CODECOMMIT_SSO = `git pull --ff-only falhou: Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "C:\\Users\\x\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\git_remote_codecommit\\__init__.py", line 207, in git_url
    token = '%' + credentials.token if credentials.token else ''
  File "C:\\Users\\x\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\botocore\\tokens.py", line 130, in _protected_refresh
    raise TokenRetrievalError(
botocore.exceptions.TokenRetrievalError: Error when retrieving token from sso: Token has expired and refresh failed
fatal: remote helper 'codecommit' aborted session`;

describe("describeError", () => {
  it("traceback do CodeCommit com SSO vencido", () => {
    const info = describeError(CODECOMMIT_SSO);
    expect(info.kind).toBe("sso-expired");
    expect(info.title).toBe("Sessão SSO expirada");
    expect(info.message).toMatch(/renov/i);
    expect(info.command).toBe("aws sso login");
    expect(info.detail).toBe(CODECOMMIT_SSO);
  });

  it.each([
    ["The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws sso login with the corresponding profile.", "aws sso login"],
    ["UnauthorizedSSOTokenError: The SSO session associated with this profile has expired (profile 'blackarrow')", "aws sso login --profile blackarrow"],
    ["Token has expired and refresh failed. Run aws sso login --profile dev-01", "aws sso login --profile dev-01"],
    ["TokenRetrievalError (AWS_PROFILE=prod.x)", "aws sso login --profile prod.x"],
  ])("SSO: %s", (raw, command) => {
    const info = describeError(raw);
    expect(info.kind).toBe("sso-expired");
    expect(info.command).toBe(command);
  });

  it("SSO vence 403", () => {
    expect(describeError("TokenRetrievalError ... The requested URL returned error: 403").kind).toBe("sso-expired");
  });

  it.each([
    "fatal: Authentication failed for 'https://github.com/x/y.git/'",
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "git@github.com: Permission denied (publickey).",
    "fatal: unable to access 'https://x/': The requested URL returned error: 403",
  ])("credenciais recusadas: %s", (raw) => {
    const info = describeError(raw);
    expect(info.kind).toBe("auth");
    expect(info.title).toBe("Credenciais recusadas");
    expect(info.command).toBeUndefined();
  });

  it("tempo limite", () => {
    const info = describeError("git fetch excedeu o tempo limite de 60s.");
    expect(info.kind).toBe("timeout");
    expect(info.title).toBe("Tempo limite excedido");
  });

  it("erro desconhecido cai no genérico, com o texto bruto em detail", () => {
    const raw = "git merge falhou: CONFLICT (content): Merge conflict in a.txt";
    const info = describeError(raw);
    expect(info.kind).toBe("generic");
    expect(info.title).toBe("A operação falhou");
    expect(info.message).not.toContain("CONFLICT");
    expect(info.detail).toBe(raw);
  });
});
