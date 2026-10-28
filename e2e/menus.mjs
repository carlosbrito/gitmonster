// Menus de botão direito: arquivo, branch e commit.
import { writeFileSync } from "node:fs";
import { checker, commitFile, dialogButton, git, graphPoint, initWorkWithRemote, openApp, refRow, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E menus de contexto");
const sb = sandbox("menus");
initWorkWithRemote(sb);
git(sb.work, "switch", "-c", "feature");
commitFile(sb.work, "feat.txt", "f\n", "na feature");
git(sb.work, "switch", "main");
const c2 = commitFile(sb.work, "m.txt", "m\n", "segundo na main");
writeFileSync(`${sb.work}/f.txt`, "mudou\n");

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
const menu = win.getByRole("menu");
const item = (name) => menu.getByRole("menuitem", { name });

// ----- branch -----
await refRow(win, "main").click({ button: "right" });
check("na branch atual, checkout fica desabilitado e não há merge nem rebase", (await item("Checkout").isDisabled()) && (await item(/Fazer (merge|rebase)/).count()) === 0);
await win.keyboard.press("Escape");

// abrir a pasta do projeto: o Explorer é trocado por um stub que anota o caminho
await app.evaluate(({ shell }) => {
  globalThis.__opened = [];
  shell.openPath = async (p) => (globalThis.__opened.push(p), "");
});
await refRow(win, "main").click({ button: "right" });
check("na branch atual o item Abrir pasta do projeto fica habilitado", await item("Abrir pasta do projeto").isEnabled());
await item("Abrir pasta do projeto").click();
const norm = (p) => p.split("\\").join("/").toLowerCase();
check("Abrir pasta do projeto abre a raiz do repositório", await until(async () => (await app.evaluate(() => globalThis.__opened)).map(norm).includes(norm(sb.work))));
await waitIdle(win);

await win.locator(".remote-group li.ref").first().click({ button: "right" });
await menu.waitFor();
check("no menu de branch remota o item não aparece", (await item("Abrir pasta do projeto").count()) === 0);
await win.keyboard.press("Escape");

// etiqueta da branch no grafo: o mesmo menu da sidebar (a etiqueta começa no canto esquerdo da linha)
const featureTip = git(sb.work, "rev-parse", "feature").trim();
const tip = await graphPoint(win, sb.work, featureTip);
const box = await win.locator(".graph-scroll").boundingBox();
await win.mouse.click(box.x + 20, tip.y, { button: "right" });
await menu.waitFor();
check("botão direito na etiqueta do grafo oferece o merge na branch atual", (await item("Fazer merge da branch feature na branch main").count()) === 1 && (await item("Fazer rebase da branch main em cima de feature").count()) === 1);
check("o menu da etiqueta não é o menu do commit", (await item(/Cherry-pick/).count()) === 0);
await win.keyboard.press("Escape");
await win.mouse.click(tip.x, tip.y, { button: "right" });
await menu.waitFor();
check("fora da etiqueta, a mesma linha abre o menu do commit", (await item(/Cherry-pick/).count()) === 1 && (await item(/Fazer merge/).count()) === 0);
await win.keyboard.press("Escape");

await refRow(win, "feature").click({ button: "right" });
check("o menu diz qual branch entra em qual", (await item("Fazer merge da branch feature na branch main").count()) === 1 && (await item("Fazer rebase da branch main em cima de feature").count()) === 1);
await item("Fazer merge da branch feature na branch main").click();
const merged = await until(() => git(sb.work, "log", "--format=%s").includes("na feature"));
check("menu: merge da feature na main", merged, merged ? "" : await win.locator("dialog.error-dialog").allInnerTexts().then(String));
await waitIdle(win);

// ----- arquivo -----
await win.locator("li.file").filter({ hasText: "f.txt" }).click({ button: "right" });
await menu.waitFor();
check("menu do arquivo tem as ações esperadas", (await item("Adicionar ao stage").count()) === 1 && (await item(/Descartar/).count()) === 1);
await win.keyboard.press("Escape");
check("Esc fecha o menu", await until(async () => (await menu.count()) === 0));

await win.locator("li.file").filter({ hasText: "f.txt" }).click({ button: "right" });
await item("Adicionar ao stage").click();
check("menu: adicionar ao stage funciona", await until(() => git(sb.work, "diff", "--cached", "--name-only").trim() === "f.txt"));
check("o menu fecha ao escolher", (await menu.count()) === 0);

// ----- commit -----
const point = await graphPoint(win, sb.work, c2);
await win.mouse.click(point.x, point.y, { button: "right" });
await menu.waitFor();
check("botão direito no grafo seleciona o commit", (await win.locator(".commit-panel code").first().innerText()).trim() === c2);
await item(/Criar tag aqui/).click();
await win.getByLabel("Nome da tag").fill("marco");
await dialogButton(win, "Criar tag").click();
check("menu: tag criada no commit certo", await until(() => git(sb.work, "rev-parse", "marco^{commit}").trim() === c2));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
