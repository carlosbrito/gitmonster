// Checkout revela e destaca o commit de HEAD no grafo, mesmo além da primeira página (1000 commits).
import { execFileSync } from "node:child_process";
import { checker, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E reveal no grafo");
const sb = sandbox("graph-reveal");
initWorkWithRemote(sb);

// 1100 commits na main, criados de uma vez com fast-import (um laço de `git commit` levaria minutos)
const COUNT = 1100;
let stream = "";
for (let i = 1; i <= COUNT; i++) {
  const msg = `c${i}`;
  stream += `commit refs/heads/main\ncommitter E2E <e2e@example.com> ${1_700_000_000 + i} +0000\ndata ${msg.length}\n${msg}\n${i === 1 ? "from refs/heads/main^0\n" : ""}M 100644 inline n.txt\ndata ${String(i).length}\n${i}\n`;
}
execFileSync("git", ["fast-import", "--quiet"], { cwd: sb.work, input: stream });
git(sb.work, "reset", "--hard", "main");
git(sb.work, "branch", "antiga", `main~${COUNT - 50}`); // commit antigo: fica depois da primeira página no grafo
git(sb.work, "branch", "recente", "main~2");

const { app, win, errors } = await openApp(sb.work);
const scroller = win.locator(".graph-scroll");
const filter = win.getByLabel("Pesquisar branches");
const branchButton = (name) => win.locator(".left li.ref .ref-name").filter({ hasText: name }).first();
const geometry = () => scroller.evaluate((el) => ({ top: el.scrollTop, view: el.clientHeight }));

// a linha do commit de HEAD (índice no `git log --all --date-order`, sem linha WIP porque a árvore está limpa)
const rowOfHead = () => {
  const head = git(sb.work, "rev-parse", "HEAD").trim();
  return git(sb.work, "log", "--all", "--date-order", "--format=%H").split("\n").indexOf(head);
};

check("o grafo começa no topo", (await geometry()).top === 0);

// pesquisa a branch pelo nome e faz checkout com um clique
await filter.fill("antiga");
await branchButton("antiga").click();
check("o checkout aconteceu", await until(() => git(sb.work, "branch", "--show-current").trim() === "antiga"));
await waitIdle(win);

const row = rowOfHead();
check("a branch antiga está além da primeira página", row > 1000, `linha ${row}`);
check(
  "o grafo rolou até a linha do commit de HEAD",
  await until(async () => {
    const { top, view } = await geometry();
    return top > 0 && row * 28 >= top && (row + 1) * 28 <= top + view;
  }),
  JSON.stringify(await geometry()),
);

// o pulso tinge a linha de azul por ~2,4 s; depois some
const tint = (rowIndex) =>
  win.locator("canvas.graph-canvas").evaluate((canvas, r) => {
    const dpr = window.devicePixelRatio || 1;
    const top = canvas.parentElement.scrollTop;
    const y = Math.round((r * 28 - top + 14) * dpr);
    const x = Math.round((canvas.clientWidth - 6) * dpr);
    const [red, , blue] = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
    return blue - red;
  }, rowIndex);
const after = await tint(row);
check("a linha de HEAD é destacada logo depois do checkout", await until(async () => (await tint(row)) > 25, 2000), `tom ${after}`);
check("o destaque some depois de alguns segundos", await until(async () => (await tint(row)) <= 25, 6000));

// com a busca de commits aberta, o checkout fecha a busca e mostra o grafo
await win.getByRole("button", { name: "Pesquisar" }).click();
await win.getByLabel("Buscar commits").fill("c100");
await win.getByLabel("Buscar commits").press("Enter");
await win.locator(".search-results").waitFor();
await filter.fill("recente");
await branchButton("recente").click();
check("o checkout fecha a busca e volta ao grafo", await until(async () => (await win.locator(".search-results").count()) === 0 && (await scroller.isVisible())));
check("o segundo checkout também foi feito", await until(() => git(sb.work, "branch", "--show-current").trim() === "recente"));
await waitIdle(win);
check("o grafo voltou para perto do topo", await until(async () => (await geometry()).top < 28 * 10));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
