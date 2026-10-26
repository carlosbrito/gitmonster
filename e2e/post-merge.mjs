// Depois de um merge local (menu, botão da sidebar ou arrastar), o grafo mostra o commit de merge e que falta o push.
import { checker, commitFile, dialogButton, git, initWorkWithRemote, openApp, realDrag, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E grafo depois do merge");
const sb = sandbox("postmerge");
initWorkWithRemote(sb);
const w = (...a) => git(sb.work, ...a);
// histórico comprido para o grafo ter o que rolar
for (let i = 0; i < 60; i++) commitFile(sb.work, `h${i}.txt`, `${i}\n`, `historia ${i}`);
w("push", "origin", "main");
w("switch", "-c", "Release/Master/26-10-2026");
commitFile(sb.work, "r.txt", "r\n", "na release");
w("switch", "main");
commitFile(sb.work, "m.txt", "m\n", "na main"); // garante merge de verdade (não fast-forward)
w("push", "origin", "main");

const { app, win, errors } = await openApp(sb.work);
await waitIdle(win);
const scroller = win.locator(".graph-scroll");
const scrollTop = () => scroller.evaluate((el) => el.scrollTop);
const menu = win.getByRole("menu");
const localRow = (name) => win.locator(`.sb-local li.ref[data-branch='${name}']`);
const notice = () => win.getByRole("status").filter({ hasText: /Merge/ }).first().innerText();

/** Commit da primeira linha do grafo, clicando nela e lendo o painel do commit. */
async function firstRowHash() {
  const box = await scroller.boundingBox();
  await win.mouse.click(box.x + Math.min(600, box.width - 60), box.y + 14);
  await win.locator(".commit-panel code").first().waitFor();
  return (await win.locator(".commit-panel code").first().innerText()).trim();
}

// ----- merge pelo menu de contexto, com o grafo rolado para baixo -----
await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
await win.waitForTimeout(200);
const before = await scrollTop();
await localRow("Release/Master/26-10-2026").click({ button: "right" });
await menu.getByRole("menuitem", { name: /merge/i }).first().click();
check("o merge foi feito localmente", await until(() => w("log", "-1", "--format=%P").trim().split(" ").length === 2));
await waitIdle(win);
const merge = w("rev-parse", "HEAD").trim();
check("o grafo volta para o topo (revela o HEAD)", before > 500 && (await until(async () => (await scrollTop()) < 200)), `${before} → ${await scrollTop()}`);
await scroller.evaluate((el) => (el.scrollTop = 0));
await win.waitForTimeout(200);
check("o grafo recarregou: a primeira linha é o commit de merge", (await firstRowHash()) === merge);
check("main local está à frente de origin/main", w("rev-list", "--count", "origin/main..main").trim() === "2");
check("o aviso diz que falta o push", await until(async () => /falta o push \(↑2\)/.test(await notice())), await notice().catch(() => ""));
check("a sidebar mostra ↑2 em main", (await localRow("main").innerText()).includes("2"));
if (process.env.SHOT) await win.screenshot({ path: process.env.SHOT });

// ----- merge pelo arrastar, na sidebar -----
w("switch", "-c", "outra", "main~3");
commitFile(sb.work, "o.txt", "o\n", "na outra");
w("switch", "main");
await win.evaluate(() => window.dispatchEvent(new Event("focus")));
await localRow("outra").waitFor();
await waitIdle(win);
await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
await realDrag(win, localRow("outra"), localRow("main"));
await dialogButton(win, "Fazer merge").click();
check("merge por arrastar concluído", await until(() => w("log", "-1", "--format=%s").includes("outra")));
await waitIdle(win);
check("depois do arrastar o grafo também revela o HEAD", await until(async () => (await scrollTop()) < 200));
check("a primeira linha é o novo merge", (await firstRowHash()) === w("rev-parse", "HEAD").trim());

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
