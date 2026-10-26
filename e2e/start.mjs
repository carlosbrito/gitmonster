// Tela inicial: criar repositório (git init) e clonar por URL.
import { existsSync, mkdirSync } from "node:fs";
import { checker, initWorkWithRemote, launchApp, sandbox, stubFolderDialog, until } from "./helpers.mjs";

const { check, finish } = checker("E2E tela inicial");
const sb = sandbox("start");
initWorkWithRemote(sb);

const { app, win, errors } = await launchApp();

// git init
const novo = `${sb.base}/novo-projeto`;
mkdirSync(novo);
await stubFolderDialog(app, novo);
await win.getByRole("button", { name: "Novo repositório (git init)…" }).click();
await win.locator(".repo-view:visible").locator(".sb-local").waitFor();
check("init cria o repositório", existsSync(`${novo}/.git`));
check("init abre uma aba", (await win.locator(".tab").count()) === 1);

// clonar
const destino = `${sb.base}/destino`;
mkdirSync(destino);
await win.getByRole("button", { name: "Nova aba" }).click();
await stubFolderDialog(app, destino);
await win.getByLabel("URL do repositório").fill(`file:///${sb.remote}`);
await win.getByRole("button", { name: "Clonar…" }).click();
check("clone cria a pasta com o conteúdo", await until(async () => existsSync(`${destino}/remote/f.txt`), 20000));
await win.locator(".tab").nth(1).waitFor();
check("clone abre uma aba", (await win.locator(".tab").count()) === 2);

// URL inválida
await win.getByRole("button", { name: "Nova aba" }).click();
await win.getByLabel("URL do repositório").fill("--upload-pack=calc");
await win.getByRole("button", { name: "Clonar…" }).click();
await win.getByRole("alert").waitFor();
check("URL perigosa é recusada com mensagem clara", (await win.getByRole("alert").innerText()).includes("URL inválida"));
check("recusar não abre aba", (await win.locator(".tab").count()) === 2);

// destino já existente
await win.getByLabel("URL do repositório").fill(`file:///${sb.remote}`);
await win.getByRole("button", { name: "Clonar…" }).click();
await win.getByRole("alert").filter({ hasText: "já existe" }).waitFor();
check("não sobrescreve pasta existente", true);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
