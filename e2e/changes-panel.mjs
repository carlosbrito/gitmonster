// Painel direito: cabeçalho, ordenação, Path/Tree, seções recolhíveis, Stage All / Unstage All e formulário de commit.
import { mkdirSync, writeFileSync } from "node:fs";
import { checker, dialogButton, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E painel de alterações");
const sb = sandbox("changes-panel");
initWorkWithRemote(sb);
mkdirSync(`${sb.work}/a`);
writeFileSync(`${sb.work}/a/x.txt`, "x\n");
writeFileSync(`${sb.work}/a/y.txt`, "y\n");
writeFileSync(`${sb.work}/b.txt`, "b\n");
writeFileSync(`${sb.work}/f.txt`, "mudou\n");

const { app, win, errors } = await openApp(sb.work);
const unstagedTitle = (n) => win.getByText(`Arquivos não staged (${n})`, { exact: true });
const stagedTitle = (n) => win.getByText(`Arquivos staged (${n})`, { exact: true });
const summary = win.getByLabel("Resumo do commit");
const description = win.getByLabel("Descrição do commit");
const commitButton = (name) => win.getByRole("button", { name, exact: true });
const staged = () => git(sb.work, "diff", "--cached", "--name-only").trim().split("\n").filter(Boolean);
const firstUnstaged = () => win.locator(".fsec").first().locator("li.file").first().innerText();

// ----- cabeçalho e estado inicial -----
await unstagedTitle(4).waitFor();
check("o cabeçalho resume as alterações e a branch", (await win.locator(".ch-summary").innerText()) === "4 alterações em main");
check("Stage All Changes aparece na seção não staged", (await win.getByRole("button", { name: "Stage All Changes", exact: true }).count()) === 1);
check("Unstage All Changes só aparece quando há arquivos staged", (await win.getByRole("button", { name: "Unstage All Changes", exact: true }).count()) === 0);
check("sem nada no stage o botão é Stage Changes to Commit (desabilitado)", await commitButton("Stage Changes to Commit").isDisabled());
check("o contador do resumo começa em 72", (await win.locator(".cf-count").innerText()) === "72");

// ----- ordenação -----
check("a ordem começa crescente por caminho", (await firstUnstaged()).includes("x.txt"));
await win.getByRole("button", { name: "Ordenar por nome" }).click();
check("o botão de ordenação inverte a lista", await until(async () => (await firstUnstaged()).includes("f.txt")));
await win.getByRole("button", { name: "Ordenar por nome" }).click();
check("clicar de novo volta à ordem crescente", await until(async () => (await firstUnstaged()).includes("x.txt")));

// ----- Path / Tree -----
await win.getByRole("button", { name: "Tree", exact: true }).click();
const dirRow = win.locator(".dir-row").filter({ hasText: "a" }).first();
check("no modo Tree os arquivos ficam sob a pasta", await until(async () => (await dirRow.count()) === 1 && (await win.locator("li.file").filter({ hasText: "x.txt" }).count()) === 1));
await dirRow.locator(".dir-toggle").click();
check("recolher a pasta esconde os arquivos dela", await until(async () => (await win.locator("li.file").filter({ hasText: "x.txt" }).count()) === 0));
await dirRow.locator(".dir-toggle").click();
await win.getByRole("button", { name: "Adicionar a pasta a ao stage" }).click();
check("stage da pasta leva só os arquivos dela", await until(() => staged().join(",") === "a/x.txt,a/y.txt"));
await waitIdle(win);
await win.getByRole("button", { name: "Path", exact: true }).click();
await unstagedTitle(2).waitFor();

// ----- seções recolhíveis -----
const section = win.locator(".fsec").first();
await unstagedTitle(2).click();
check("recolher a seção esconde a lista e mantém o contador", await until(async () => (await section.locator("li.file").count()) === 0) && (await unstagedTitle(2).count()) === 1);
check("o título indica que está recolhida", (await unstagedTitle(2).getAttribute("aria-expanded")) === "false");
await unstagedTitle(2).click();
check("expandir mostra de novo", await until(async () => (await section.locator("li.file").count()) === 2));

// ----- Stage All / Unstage All -----
await win.getByRole("button", { name: "Stage All Changes", exact: true }).click();
check("Stage All Changes leva tudo para o stage", await until(() => staged().length === 4));
await stagedTitle(4).waitFor();
await win.getByRole("button", { name: "Unstage All Changes", exact: true }).click();
check("Unstage All Changes tira tudo do stage", await until(() => staged().length === 0));
await unstagedTitle(4).waitFor();
await win.getByRole("button", { name: "Stage All Changes", exact: true }).click();
await stagedTitle(4).waitFor();

// ----- formulário de commit -----
check("com arquivos no stage e sem resumo o botão Commit Changes está desabilitado", await commitButton("Commit Changes").isDisabled());
await summary.fill("feat: painel");
check("o contador mostra os caracteres restantes", (await win.locator(".cf-count").innerText()) === String(72 - "feat: painel".length));
await summary.fill("x".repeat(80));
check("passar de 72 deixa o contador vermelho e não bloqueia o commit", (await win.locator(".cf-count.over").innerText()) === "-8" && (await commitButton("Commit Changes").isEnabled()));
await summary.fill("feat: painel");
await description.fill("detalhes do painel");
await commitButton("Commit Changes").click();
check("a mensagem junta resumo, linha em branco e descrição", await until(() => git(sb.work, "log", "-1", "--format=%B").trim() === "feat: painel\n\ndetalhes do painel"));
check("os campos são limpos depois do commit", await until(async () => (await summary.inputValue()) === "" && (await description.inputValue()) === ""));
await unstagedTitle(0).waitFor();

// ----- amend -----
await win.getByLabel("Corrigir último commit (amend)").check();
check("com amend o botão vira Amend Commit e fica habilitado sem mensagem", await commitButton("Amend Commit").isEnabled());
await win.getByLabel("Corrigir último commit (amend)").uncheck();

// ----- lixeira do cabeçalho -----
writeFileSync(`${sb.work}/f.txt`, "de novo\n");
await win.evaluate(() => window.dispatchEvent(new Event("focus"))); // o app atualiza ao voltar à janela
await unstagedTitle(1).waitFor();
await win.getByRole("button", { name: "Descartar todas as alterações" }).click();
await dialogButton(win, "Descartar").click();
check("a lixeira descarta as alterações não staged", await until(() => git(sb.work, "status", "--porcelain").trim() === ""));
await waitIdle(win);
check("sem alterações a lixeira fica desabilitada", await win.getByRole("button", { name: "Descartar todas as alterações" }).isDisabled());
check("o cabeçalho diz que não há alterações", (await win.locator(".ch-summary").innerText()) === "Nenhuma alteração");

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
