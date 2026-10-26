// Sidebar: pesquisa e cabeçalhos de seção fixos; cada seção aberta rola só o próprio conteúdo.
import { checker, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E layout da sidebar");
const sb = sandbox("sblayout");
initWorkWithRemote(sb);
for (let i = 0; i < 40; i++) git(sb.work, "branch", `feature-${String(i).padStart(2, "0")}`);
for (let i = 0; i < 40; i++) git(sb.work, "push", "-q", "origin", `feature-${String(i).padStart(2, "0")}`);

const { app, win, errors } = await openApp(sb.work);
await waitIdle(win);
await win.evaluate(() => window.dispatchEvent(new Event("focus")));
await until(async () => (await win.locator(".sb-remote li.ref").count()) >= 40);

const top = (sel) => win.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
const body = (section) => win.locator(`${section} > .sb-body`);
const heads = async () => [await top(".sb-search"), await top(".sb-local .sb-head"), await top(".sb-remote .sb-head"), await top(".sb-tags .sb-head")];

const before = await heads();
check("LOCAL e REMOTE têm rolagem própria", (await body(".sb-local").evaluate((el) => el.scrollHeight > el.clientHeight)) && (await body(".sb-remote").evaluate((el) => el.scrollHeight > el.clientHeight)));
check("a sidebar inteira não rola", await win.locator("nav.left").evaluate((el) => el.scrollHeight <= el.clientHeight + 1));
const localH = await body(".sb-local").evaluate((el) => el.clientHeight);
const tagsH = await win.locator(".sb-tags").evaluate((el) => el.getBoundingClientRect().height);
check("LOCAL e REMOTE dividem a altura e TAGS vazia fica pequena", localH > 100 && tagsH < 80, `local ${localH}px, tags ${tagsH}px`);

await body(".sb-local").evaluate((el) => (el.scrollTop = el.scrollHeight));
await win.waitForTimeout(150);
check("rolar LOCAL não move pesquisa nem cabeçalhos", JSON.stringify(await heads()) === JSON.stringify(before), `${before} → ${await heads()}`);
check("rolar LOCAL não mexe na lista REMOTE", (await body(".sb-remote").evaluate((el) => el.scrollTop)) === 0);
check("o fim da lista LOCAL fica visível", await win.locator(".sb-local li.ref[data-branch='main']").isVisible());

await body(".sb-remote").evaluate((el) => (el.scrollTop = el.scrollHeight));
await win.waitForTimeout(150);
check("rolar REMOTE também não move os cabeçalhos", JSON.stringify(await heads()) === JSON.stringify(before));

if (process.env.SHOT) await win.screenshot({ path: process.env.SHOT });

// recolher LOCAL: só o cabeçalho fica, e REMOTE cresce
const remoteBefore = await body(".sb-remote").evaluate((el) => el.clientHeight);
await win.locator(".sb-local .sb-toggle").click();
check("LOCAL recolhida fica só com o cabeçalho", await until(async () => (await win.locator(".sb-local > .sb-body").count()) === 0));
check("REMOTE cresce com o espaço liberado", await until(async () => (await body(".sb-remote").evaluate((el) => el.clientHeight)) > remoteBefore + 50));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
