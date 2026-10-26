// Sidebar: branches com "/" viram pastas recolhíveis, o filtro abre as pastas, Ctrl+Alt+F foca o filtro.
import { checker, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E sidebar");
const sb = sandbox("sidebar");
initWorkWithRemote(sb);
git(sb.work, "branch", "Bug/55042/RemoverSecao");
git(sb.work, "branch", "Bug/outra");

const { app, win, errors } = await openApp(sb.work);
await waitIdle(win);

const local = win.locator(".sb-local");
const folder = (name) => local.locator(".sb-folder-row").filter({ hasText: new RegExp(`^${name}$`) });
const leaf = () => local.locator("li.ref[data-branch='Bug/55042/RemoverSecao']");
await leaf().waitFor();

check("cabeçalho LOCAL com o total à direita", (await local.locator(".sb-title").textContent()) === "LOCAL" && (await local.locator(".sb-count").textContent()) === "3");
check("a branch aparece em pastas, só com o último segmento", (await folder("Bug").count()) === 1 && (await folder("55042").count()) === 1 && (await leaf().locator(".sb-name").textContent()) === "RemoverSecao");
check("o nome acessível é o nome completo", (await local.getByRole("button", { name: "Bug/55042/RemoverSecao" }).count()) === 1);
check("a branch atual fica marcada sem o ●", (await local.locator("li.ref.current [aria-current='true']").count()) === 1 && !(await local.locator("li.ref.current").innerText()).includes("●"));
check("Viewing mostra as refs visíveis", /Viewing\s*\d+/.test(await win.locator(".sb-viewing").innerText()));

await folder("Bug").click();
check("recolher a pasta esconde o que está dentro", await until(async () => (await leaf().count()) === 0 && (await local.locator("li.ref[data-branch='Bug/outra']").count()) === 0));

const search = win.getByLabel("Pesquisar branches");
await win.keyboard.press("Control+Alt+F");
check("Ctrl+Alt+F foca o filtro", await until(() => search.evaluate((el) => el === document.activeElement)));
check("Ctrl+Alt+F não abre a busca de commits", (await win.locator(".search-bar").count()) === 0);
await search.fill("Remover");
check("o filtro abre a pasta recolhida", await until(async () => (await leaf().count()) === 1));
await search.press("Escape");
check("limpar o filtro restaura a pasta recolhida", await until(async () => (await leaf().count()) === 0));

await folder("Bug").click();
await local.getByRole("button", { name: "Bug/55042/RemoverSecao" }).click();
check("checkout pela linha dentro da pasta", await until(() => git(sb.work, "branch", "--show-current").trim() === "Bug/55042/RemoverSecao"));

await local.getByRole("button", { name: "LOCAL" }).click();
check("recolher a seção esconde as branches", await until(async () => (await local.locator("li.ref").count()) === 0));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
