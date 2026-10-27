// Sidebar: "Expandir tudo" / "Recolher tudo" nos cabeçalhos LOCAL e REMOTE.
import { checker, fetchAll, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E sidebar expandir/recolher tudo");
const sb = sandbox("sidebar-expand-all");
initWorkWithRemote(sb);
for (const name of ["Bug/55042/fix-a", "Bug/55043/fix-b", "Feature/login"]) git(sb.work, "branch", name);
git(sb.work, "push", "origin", "Bug/55042/fix-a", "Feature/login");

const { app, win, errors } = await openApp(sb.work);
await fetchAll(win);
await waitIdle(win);

const local = win.locator(".sb-local");
const remote = win.locator(".sb-remote");
const localHead = local.locator(".sb-head");
const remoteHead = remote.locator(".sb-head");
const btn = (head, name) => head.getByRole("button", { name, exact: true });
const leaves = (section) => section.locator("li.ref");
const remoteHeads = () => remote.locator(".remote-head");
await local.locator("li.ref[data-branch='Feature/login']").waitFor();
await remote.locator(".remote-group li.ref").first().waitFor();
const remoteTotal = await leaves(remote).count();

await localHead.hover();
await btn(localHead, "Recolher tudo").click();
check("Recolher tudo (LOCAL) deixa só as branches da raiz", await until(async () => (await leaves(local).count()) === 1 && (await local.locator("li.ref[data-branch='main']").count()) === 1));
check("todas as pastas locais ficam recolhidas", (await local.locator(".sb-folder-row[aria-expanded='true']").count()) === 0);
check("REMOTE não é afetado", (await leaves(remote).count()) === remoteTotal);

await btn(localHead, "Expandir tudo").click();
check("Expandir tudo (LOCAL) mostra todas as branches", await until(async () => (await leaves(local).count()) === 4));

await btn(localHead, "Recolher tudo").click();
await local.getByRole("button", { name: "LOCAL" }).click();
check("seção LOCAL recolhida", await until(async () => (await local.locator(".sb-body").count()) === 0));
await localHead.hover();
await btn(localHead, "Expandir tudo").click();
check("Expandir tudo abre a seção recolhida com tudo aberto", await until(async () => (await leaves(local).count()) === 4));

await remoteHead.hover();
await btn(remoteHead, "Recolher tudo").click();
check("Recolher tudo (REMOTE) fecha os grupos de remote", await until(async () => (await leaves(remote).count()) === 0 && (await remoteHeads().filter({ hasText: "origin" }).locator("[aria-expanded='false']").count()) === 1));
check("LOCAL não é afetado", (await leaves(local).count()) === 4);
await btn(remoteHead, "Expandir tudo").click();
check("Expandir tudo (REMOTE) reabre grupos e pastas", await until(async () => (await leaves(remote).count()) === remoteTotal));

await btn(localHead, "Recolher tudo").click();
const search = win.getByLabel("Pesquisar branches");
await search.fill("fix");
check("com pesquisa os botões ficam desabilitados", await until(async () => (await btn(localHead, "Expandir tudo").isDisabled()) && (await btn(localHead, "Recolher tudo").isDisabled()) && (await btn(remoteHead, "Expandir tudo").isDisabled())));
await search.press("Escape");
check("limpar a pesquisa preserva o recolher tudo", await until(async () => (await leaves(local).count()) === 1));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
