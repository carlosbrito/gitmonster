// Erro de operação: modal com mensagem curta, detalhes sob demanda e reconhecimento de SSO expirado.
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter } from "node:path";
import { checker, git, initWorkWithRemote, openApp, sandbox, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E modal de erro");
const sb = sandbox("errdialog");
initWorkWithRemote(sb);

// Remote helper falso (como o git-remote-codecommit) que falha com o erro do botocore de SSO vencido.
const bin = `${sb.base}/bin`;
mkdirSync(bin);
writeFileSync(
  `${bin}/git-remote-fakesso`,
  [
    "#!/bin/sh",
    "echo 'Traceback (most recent call last):' >&2",
    "echo '  File \"botocore/tokens.py\", line 130, in _protected_refresh' >&2",
    "echo \"botocore.exceptions.TokenRetrievalError: Error when retrieving token from sso: Token has expired and refresh failed (profile 'blackarrow')\" >&2",
    "exit 1",
    "",
  ].join("\n"),
  { mode: 0o755 },
);
process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;

const { app, win, errors } = await openApp(sb.work);
const dialog = win.locator("dialog.error-dialog");
const pull = win.getByRole("button", { name: "Pull", exact: true });

// ----- erro genérico: remote apontando para uma pasta que não existe -----
git(sb.work, "remote", "set-url", "origin", `${sb.base}/nao-existe.git`);
await pull.click();
await dialog.waitFor();
check("erro abre a modal com o título genérico", (await dialog.getByRole("heading").innerText()) === "A operação falhou");
check("nenhuma faixa de erro acima do grafo", (await win.locator(".repo-view:visible > p.error").count()) === 0);
check("o texto do git fica escondido até pedir os detalhes", !(await dialog.innerText()).includes("nao-existe"));
await dialog.getByRole("button", { name: "Ver detalhes" }).click();
check("Ver detalhes mostra o erro completo", (await dialog.locator(".error-detail").innerText()).includes("nao-existe"));
check("o botão vira Ocultar detalhes e aparece o Copiar", (await dialog.getByRole("button", { name: "Ocultar detalhes" }).count()) === 1 && (await dialog.getByRole("button", { name: "Copiar", exact: true }).count()) === 1);
await win.keyboard.press("Escape");
await dialog.waitFor({ state: "detached" });
check("Esc fecha a modal e descarta o erro", (await dialog.count()) === 0);
await waitIdle(win);

// ----- SSO expirado -----
git(sb.work, "remote", "set-url", "origin", "fakesso::repo");
await pull.click();
await dialog.waitFor();
check("SSO vencido vira Sessão SSO expirada", (await dialog.getByRole("heading").innerText()) === "Sessão SSO expirada");
check("mensagem pede para renovar o login", /renove o login/i.test(await dialog.innerText()));
check("sugere o comando com o perfil citado no erro", (await dialog.locator(".error-command code").innerText()) === "aws sso login --profile blackarrow");
await dialog.getByRole("button", { name: "Ver detalhes" }).click();
check("o traceback continua nos detalhes", (await dialog.locator(".error-detail").innerText()).includes("TokenRetrievalError"));
await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
await dialog.waitFor({ state: "detached" });

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
