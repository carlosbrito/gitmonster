// Pesquisa de branches na sidebar: filtra locais e remotas enquanto digita, oculta remotes sem casamento, abre grupos recolhidos e restaura ao limpar.
import { checker, git, initWorkWithRemote, openApp, sandbox, until, waitIdle, fetchAll } from "./helpers.mjs";

const { check, finish } = checker("E2E pesquisa de branches");
const sb = sandbox("branch-search");
initWorkWithRemote(sb);
git(sb.work, "branch", "Feature-x");
git(sb.work, "branch", "outra");
git(sb.work, "push", "origin", "Feature-x");

const { app, win, errors } = await openApp(sb.work);
await fetchAll(win);
await waitIdle(win);

const search = win.getByLabel("Pesquisar branches");
const locals = () => win.locator(".sb-local li.ref");
const remotes = () => win.locator(".remote-group li.ref");
const head = win.locator(".remote-head").filter({ hasText: "origin" });
await head.waitFor();

check("o campo fica acima da seção LOCAL", await win.locator(".left").evaluate((nav) => nav.querySelector("input.branch-search")?.compareDocumentPosition(nav.querySelector(".sb-local")) === Node.DOCUMENT_POSITION_FOLLOWING));
check("placeholder com o atalho", (await search.getAttribute("placeholder")) === "Filtrar (Ctrl + Alt + F)");
const totalLocal = await locals().count();

// recolhe o grupo para provar que o filtro o abre
await head.locator(".ref-name").click();
check("grupo recolhido", await until(async () => (await remotes().count()) === 0));

await search.fill("feat");
check("filtra locais enquanto digita", await until(async () => (await locals().count()) === 1 && (await locals().first().innerText()).includes("Feature-x")));
check("filtra remotas e abre o grupo recolhido", await until(async () => (await remotes().count()) === 1 && (await remotes().first().innerText()).includes("Feature-x")));
check("contador mostra filtradas/total", (await win.locator(".sb-local .sb-count").textContent()) === `1/${totalLocal}`);

await search.fill("zzz");
check("sem resultado mostra a mensagem", await until(async () => (await win.getByRole("status").filter({ hasText: "Nenhuma branch encontrada" }).count()) === 1));
check("remote sem casamento fica oculto", await until(async () => (await win.locator(".remote-head").count()) === 0));

await search.fill("origin");
check("o nome do remote não casa", await until(async () => (await locals().count()) === 0 && (await remotes().count()) === 0));

await search.fill("outra");
await search.press("Escape");
check("Esc limpa o campo e restaura as locais", await until(async () => (await search.inputValue()) === "" && (await locals().count()) === totalLocal));
check("o grupo volta recolhido como estava", await until(async () => (await remotes().count()) === 0 && (await win.locator(".remote-head").count()) === 1));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
