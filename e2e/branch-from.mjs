// Criar branch a partir da branch clicada: pela sidebar (local) e pela etiqueta remota no grafo.
import { checker, commitFile, dialogButton, git, graphPoint, initWorkWithRemote, openApp, refRow, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E criar branch a partir de outra");
const sb = sandbox("branchfrom");
initWorkWithRemote(sb);
git(sb.work, "switch", "-c", "feature");
const featureTip = commitFile(sb.work, "feat.txt", "f\n", "na feature");
git(sb.work, "switch", "-c", "rel", "main");
const relTip = commitFile(sb.work, "rel.txt", "r\n", "na release");
git(sb.work, "push", "-u", "origin", "rel");
git(sb.work, "switch", "main");
git(sb.work, "branch", "-D", "rel");

const { app, win, errors } = await openApp(sb.work);
const menu = win.getByRole("menu");
const item = (name) => menu.getByRole("menuitem", { name });
const current = () => git(sb.work, "branch", "--show-current").trim();

// ----- sidebar: branch local -----
await refRow(win, "feature").click({ button: "right" });
await item("Criar branch a partir de feature…").click();
await win.getByLabel("Nome da branch").fill("feature-copia");
await dialogButton(win, "Criar e mudar").click();
check("cria a branch no commit da base e muda para ela", await until(() => current() === "feature-copia" && git(sb.work, "rev-parse", "feature-copia").trim() === featureTip));
await waitIdle(win);

// cancelar não cria nada
await refRow(win, "main").click({ button: "right" });
await item("Criar branch a partir de main…").click();
await win.getByLabel("Nome da branch").fill("nao-cria");
await dialogButton(win, "Cancelar").click();
await waitIdle(win);
check("cancelar não cria branch nem muda a atual", git(sb.work, "branch", "--list", "nao-cria").trim() === "" && current() === "feature-copia");

// ----- grafo: etiqueta de branch remota -----
const tip = await graphPoint(win, sb.work, relTip);
const box = await win.locator(".graph-scroll").boundingBox();
await win.mouse.click(box.x + 20, tip.y, { button: "right" });
await item("Criar branch a partir de origin/rel…").click();
await win.getByLabel("Nome da branch").fill("fix/rel");
await dialogButton(win, "Criar e mudar").click();
check("pela etiqueta remota do grafo, cria a branch na ponta da remota", await until(() => current() === "fix/rel" && git(sb.work, "rev-parse", "fix/rel").trim() === relTip));
check("a nova branch rastreia a remota", git(sb.work, "rev-parse", "--abbrev-ref", "fix/rel@{upstream}").trim() === "origin/rel");

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
