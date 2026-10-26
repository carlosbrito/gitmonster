// Painéis redimensionáveis: sidebar, painel direito, colunas do grafo e divisão commit / alterações.
import { checker, commitFile, initWorkWithRemote, launchApp, openApp, sandbox, selectCommit, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E painéis redimensionáveis");
const sb = sandbox("panels");
initWorkWithRemote(sb);
const second = commitFile(sb.work, "b.txt", "b\n", "segundo");

let { app, win, errors, userData } = await openApp(sb.work);
const view = () => win.locator(".repo-view:visible");
const widthOf = (sel) => view().locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().width));
const heightOf = (sel) => view().locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().height));
const sep = (label) => view().getByRole("separator", { name: label });

/** Arrasta o centro da divisória `dx`/`dy` pixels com o mouse. */
async function dragBy(locator, dx, dy = 0) {
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await win.mouse.move(x, y);
  await win.mouse.down();
  await win.mouse.move(x + dx, y + dy, { steps: 8 });
  await win.mouse.up();
}

// ----- sidebar -----
await waitIdle(win);
const left0 = await widthOf("nav.left");
await dragBy(sep("Largura da barra lateral"), 80);
const left1 = await widthOf("nav.left");
check("arrastar alarga a sidebar", left1 >= left0 + 70, `${left0} → ${left1}`);
check("a largura da sidebar fica guardada", (await win.evaluate(() => localStorage.getItem("gitmonster.sidebarWidth"))) === String(left1));

// ----- painel direito -----
const side0 = await widthOf("aside.side");
await dragBy(sep("Largura do painel direito"), -120);
const side1 = await widthOf("aside.side");
check("arrastar para a esquerda alarga o painel direito", side1 >= side0 + 110, `${side0} → ${side1}`);

// ----- limite: o centro não fica menor que 360 px -----
await dragBy(sep("Largura do painel direito"), -2000);
check("o centro nunca fica menor que 360 px", (await widthOf(".center")) >= 355, String(await widthOf(".center")));
await sep("Largura do painel direito").dblclick();
check("duplo clique volta o painel direito ao padrão", await until(async () => (await widthOf("aside.side")) === 340), String(await widthOf("aside.side")));

// ----- coluna GRAPH -----
const header = view().locator(".graph-header");
const graphCol = async () => Number((await header.evaluate((el) => el.style.gridTemplateColumns)).split("px")[1]);
const g0 = await graphCol();
await dragBy(sep("Largura da coluna GRAPH"), 90);
const g1 = await graphCol();
check("arrastar alarga a coluna GRAPH", g1 >= g0 + 80, `${g0} → ${g1}`);
await sep("Largura da coluna GRAPH").dblclick();
check("duplo clique devolve a coluna GRAPH ao automático", await until(async () => (await graphCol()) === g0) && (await win.evaluate(() => localStorage.getItem("gitmonster.graphColWidth"))) === null);

// ----- divisão commit / alterações -----
check("sem commit selecionado não há divisão", (await sep("Divisão entre o commit e as alterações").count()) === 0);
await selectCommit(win, sb.work, second);
await sep("Divisão entre o commit e as alterações").waitFor();
const top0 = await heightOf(".side-top");
await dragBy(sep("Divisão entre o commit e as alterações"), 0, 120);
const top1 = await heightOf(".side-top");
check("arrastar para baixo dá mais altura ao commit (arquivos)", top1 >= top0 + 100, `${top0} → ${top1}`);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();

// ----- reabrir: os tamanhos voltam -----
({ app, win, errors } = await launchApp(userData));
await view().locator("nav.left").waitFor();
check("a largura da sidebar é lembrada ao reabrir", Math.abs((await widthOf("nav.left")) - left1) <= 1, `${left1} vs ${await widthOf("nav.left")}`);
await app.close();
finish(sb.remove);
