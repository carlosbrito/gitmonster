// Grafo em três colunas: cabeçalho, linha WIP, seleção, arrastar etiqueta de branch para mesclar e redimensionar.
import { writeFileSync } from "node:fs";
import { checker, commitFile, dialogButton, git, graphPoint, identity, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E grafo em três colunas");
const sb = sandbox("graph");
initWorkWithRemote(sb);
git(sb.work, "switch", "-c", "feature");
const featureCommit = commitFile(sb.work, "feat.txt", "f\n", "na feature");
git(sb.work, "switch", "main");
const mainCommit = commitFile(sb.work, "main.txt", "m\n", "na main");
writeFileSync(`${sb.work}/f.txt`, "alterado\n"); // alteração não commitada: aparece a linha WIP

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
const scroller = win.locator(".graph-scroll");
const header = win.locator(".graph-header");

// ----- cabeçalho -----
const headerText = await header.innerText();
check("cabeçalho com as três colunas", headerText.includes("BRANCH / TAG") && headerText.includes("GRAPH") && headerText.includes("COMMIT MESSAGE"));

// ----- seleção: linha WIP e commits -----
const mainRow = await graphPoint(win, sb.work, mainCommit);
const box = await scroller.boundingBox();
await win.mouse.click(mainRow.x, mainRow.y - 28); // a linha WIP fica logo acima do commit de HEAD
check("clicar na linha WIP não seleciona commit (mostra só as alterações)", (await win.locator(".commit-panel").count()) === 0);

await win.mouse.click(mainRow.x, mainRow.y);
await win.locator(".commit-panel code").first().waitFor();
check("clicar numa linha seleciona o commit", (await win.locator(".commit-panel code").first().innerText()).trim() === mainCommit);

const featRow = await graphPoint(win, sb.work, featureCommit);
await win.mouse.click(featRow.x, featRow.y);
check("o outro commit também", await until(async () => (await win.locator(".commit-panel code").first().innerText()).trim() === featureCommit));

// ----- arrastar a etiqueta da feature sobre a etiqueta da main (merge) -----
// as etiquetas ficam no começo da coluna BRANCH / TAG da linha do commit
const chipX = box.x + 24;
const drag = async (fromY, toY, toX = chipX) => {
  await win.mouse.move(chipX, fromY);
  await win.mouse.down();
  await win.mouse.move(chipX + 12, fromY + 6, { steps: 3 });
  await win.mouse.move(toX, toY, { steps: 8 });
  await win.mouse.up();
};

await drag(featRow.y, mainRow.y);
await dialogButton(win, "Fazer merge").waitFor();
check("arrastar a etiqueta sobre outra pergunta merge ou rebase", (await win.locator("dialog").innerText()).includes('"feature" em "main"'));
await dialogButton(win, "Cancelar").click();
await waitIdle(win);
check("cancelar não mescla", !git(sb.work, "log", "--format=%s").includes("na feature"));

// soltar em qualquer ponto da linha do commit (aqui, na área da mensagem) vale para a branch dele
await drag(featRow.y, mainRow.y, box.x + box.width - 80);
await dialogButton(win, "Fazer merge").waitFor();
check("soltar na linha do commit de uma branch também pergunta", (await win.locator("dialog").innerText()).includes('"feature" em "main"'));
await dialogButton(win, "Cancelar").click();
await waitIdle(win);

// soltar a etiqueta sobre uma branch local da sidebar também pergunta merge ou rebase
const sideMain = await win.locator(".sb-local li.ref[data-branch='main']").boundingBox();
await win.mouse.move(chipX, featRow.y);
await win.mouse.down();
await win.mouse.move(chipX + 12, featRow.y + 6, { steps: 3 });
await win.mouse.move(sideMain.x + sideMain.width / 2, sideMain.y + sideMain.height / 2, { steps: 10 });
check("a branch da sidebar fica destacada durante o arraste", (await win.locator(".left li.ref[data-branch='main']").getAttribute("class")).includes("drop-target"));
await win.mouse.up();
await dialogButton(win, "Fazer merge").waitFor();
check("soltar na branch da sidebar pergunta merge ou rebase", (await win.locator("dialog").innerText()).includes('"feature" em "main"'));
await dialogButton(win, "Cancelar").click();
await waitIdle(win);
check("o destaque da sidebar some ao soltar", (await win.locator(".left li.drop-target").count()) === 0);

// com o ponteiro na sidebar, a linha de commit na mesma altura não vira alvo (só vale o item da sidebar)
{
  const sideX = sideMain.x + sideMain.width / 2;
  const underPointer = await win.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-branch]")?.getAttribute("data-branch") ?? null, [sideX, mainRow.y]);
  await win.mouse.move(chipX, featRow.y);
  await win.mouse.down();
  await win.mouse.move(chipX + 12, featRow.y + 6, { steps: 3 });
  await win.mouse.move(sideX, mainRow.y, { steps: 10 });
  const highlighted = await win.locator(".left li.drop-target").evaluateAll((els) => els.map((e) => e.getAttribute("data-branch")));
  check("o alvo é o item da sidebar sob o ponteiro, não a linha do grafo", JSON.stringify(highlighted) === JSON.stringify(underPointer && underPointer !== "feature" ? [underPointer] : []), JSON.stringify({ underPointer, highlighted }));
  await win.mouse.up();
  await win.waitForTimeout(300);
  if ((await win.locator("dialog[open]").count()) > 0) await dialogButton(win, "Cancelar").click();
  await waitIdle(win);
}

// um clique simples na etiqueta (sem arrastar) só seleciona o commit
await win.mouse.click(chipX, featRow.y);
check("clique simples na etiqueta não abre confirmação", (await win.locator("dialog[open]").count()) === 0);

await drag(featRow.y, mainRow.y);
await dialogButton(win, "Fazer merge").click();
check("confirmar mescla a feature na main", await until(() => git(sb.work, "log", "--format=%s").includes("na feature") && git(sb.work, "branch", "--show-current").trim() === "main"));
await waitIdle(win);

// ----- redimensionar a coluna BRANCH / TAG -----
const widthOf = async () => Number((await header.evaluate((el) => el.style.gridTemplateColumns)).split("px")[0]);
const before = await widthOf();
const handle = await win.getByRole("separator", { name: "Largura da coluna BRANCH / TAG" }).boundingBox();
await win.mouse.move(handle.x + 3, handle.y + 10);
await win.mouse.down();
await win.mouse.move(handle.x + 3 + 70, handle.y + 10, { steps: 5 });
await win.mouse.up();
const after = await widthOf();
check("arrastar a divisória do cabeçalho muda a largura da coluna", after > before + 40, `${before} → ${after}`);
check("a largura fica guardada", (await win.evaluate(() => localStorage.getItem("gitmonster.graphRefWidth"))) === String(after));

// ----- duplo clique na etiqueta faz checkout -----
const current = () => git(sb.work, "branch", "--show-current").trim();
const mainHead = git(sb.work, "rev-parse", "main").trim();
const featNow = await graphPoint(win, sb.work, featureCommit);
await win.mouse.click(chipX, featNow.y);
check("clique simples na etiqueta não faz checkout", current() === "main");
await win.mouse.dblclick(chipX, featNow.y);
check("duplo clique na etiqueta da branch faz checkout", await until(() => current() === "feature"));
await waitIdle(win);
const mainNow = await graphPoint(win, sb.work, mainHead);
await win.mouse.dblclick(chipX, mainNow.y);
check("duplo clique de volta na main", await until(() => current() === "main"));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
