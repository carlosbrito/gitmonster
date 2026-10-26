// Merge ou rebase arrastando uma branch sobre outra na sidebar.
import { writeFileSync } from "node:fs";
import { checker, commitFile, dialogButton, git, initWorkWithRemote, openApp, realDrag, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E merge por arrastar e soltar");
const sb = sandbox("dragmerge");
initWorkWithRemote(sb);
git(sb.work, "switch", "-c", "feature");
commitFile(sb.work, "feat.txt", "f\n", "na feature");
git(sb.work, "switch", "-c", "outra", "main");
commitFile(sb.work, "outra.txt", "o\n", "na outra");
git(sb.work, "switch", "main");
commitFile(sb.work, "main.txt", "m\n", "na main");

const { app, win, errors } = await openApp(sb.work);

/** Arraste de verdade (mouse real via CDP). `accepted`: o alvo ficou destacado, ou seja, aceita o drop. */
async function drag(source, target) {
  const r = await realDrag(win, source, target);
  return { started: r.started, accepted: r.overClass.includes("drop-target"), highlighted: r.overClass.includes("drop-target") };
}

const subjects = () => git(sb.work, "log", "--format=%s").split("\n");
// O grupo de remotas também tem linhas "nome": só as locais (com data-branch) são alvo do drop.
const row = (name) => win.locator(`.sb-local li.ref[data-branch="${name}"]`);

check("as branches são arrastáveis", (await row("feature").getAttribute("draggable")) === "true");

// ----- soltar sobre a branch atual -----
const first = await drag(row("feature"), row("main"));
check("o navegador inicia o arraste de verdade", first.started === true);
check("o destino aceita o drop e fica destacado", first.accepted === true && first.highlighted === true);
await dialogButton(win, "Fazer merge").waitFor();
check("pede confirmação citando origem e destino", (await win.locator("dialog").innerText()).includes('"feature" em "main"'));

await dialogButton(win, "Cancelar").click();
await waitIdle(win);
check("cancelar não mescla nada", !subjects().includes("na feature"));

await drag(row("feature"), row("main"));
await dialogButton(win, "Fazer merge").click();
check("confirmar faz o merge na branch atual", await until(() => subjects().includes("na feature") && git(sb.work, "log", "-1", "--format=%P").trim().split(" ").length === 2));
check("a tela avisa que concluiu", await until(async () => (await win.getByRole("status").filter({ hasText: /Merge de "feature" em "main" concluído/ }).count()) === 1));
await waitIdle(win);

// ----- soltar sobre uma branch que não é a atual -----
const outraBefore = git(sb.work, "rev-parse", "outra").trim();
const mainBefore = git(sb.work, "rev-parse", "main").trim();
await drag(row("main"), row("outra"));
await dialogButton(win, "Fazer merge").waitFor();
check("avisa que vai trocar para a branch de destino", (await win.locator("dialog").innerText()).includes('muda para "outra"'));
await dialogButton(win, "Fazer merge").click();
check("muda para o destino e mescla lá", await until(() => git(sb.work, "branch", "--show-current").trim() === "outra" && subjects().includes("na main")));
check("a branch de origem não é alterada e o destino avançou", git(sb.work, "rev-parse", "main").trim() === mainBefore && git(sb.work, "rev-parse", "outra").trim() !== outraBefore);
await waitIdle(win);

// ----- soltar sobre si mesma não faz nada -----
const self = await drag(row("feature"), row("feature"));
check("soltar na própria branch não é aceito e não abre confirmação", self.accepted === false && (await win.locator("dialog[open]").count()) === 0);

// ----- rebase: o mesmo gesto, outra escolha -----
git(sb.work, "switch", "main");
git(sb.work, "switch", "-c", "reb");
commitFile(sb.work, "reb.txt", "r\n", "na reb");
git(sb.work, "switch", "main");
commitFile(sb.work, "main2.txt", "m2\n", "main avancou");
await win.evaluate(() => window.dispatchEvent(new Event("focus")));
await row("reb").waitFor();
await drag(row("reb"), row("main"));
await dialogButton(win, "Fazer rebase").waitFor();
check("o diálogo oferece merge e rebase", (await dialogButton(win, "Fazer merge").count()) === 1);
check("explica que o rebase reescreve a origem e troca para ela", (await win.locator("dialog").innerText()).includes('muda para "reb"'));
await dialogButton(win, "Fazer rebase").click();
check("rebase: a branch arrastada fica em cima do destino", await until(() => git(sb.work, "branch", "--show-current").trim() === "reb" && git(sb.work, "log", "-2", "--format=%s").split("\n")[1] === "main avancou"));
check("o destino do rebase não muda", git(sb.work, "log", "main", "-1", "--format=%s").trim() === "main avancou");
check("a tela avisa que o rebase concluiu", await until(async () => (await win.getByRole("status").filter({ hasText: /Rebase de "reb" em cima de "main" concluído/ }).count()) === 1));
await waitIdle(win);
git(sb.work, "switch", "main");
await win.evaluate(() => window.dispatchEvent(new Event("focus")));

// ----- checkout de remota cuja local existe e é diferente: avisa e espera confirmação -----
git(sb.work, "switch", "-c", "rem");
commitFile(sb.work, "rem.txt", "r", "so na remota");
git(sb.work, "push", "origin", "rem");
git(sb.work, "switch", "main");
git(sb.work, "branch", "-f", "rem", "main"); // a local volta um commit atrás da remota
await win.evaluate(() => window.dispatchEvent(new Event("focus")));
const remoteRem = win.locator(".remote-group li.ref").getByRole("button", { name: "rem", exact: true });
await remoteRem.waitFor();
await remoteRem.click();
await dialogButton(win, "Igualar à remota").waitFor();
check("avisa que a local vai ser igualada à remota", (await win.locator("dialog").innerText()).includes("vai ser igualada à remota"));
await dialogButton(win, "Cancelar").click();
await waitIdle(win);
check("cancelar não muda nada", git(sb.work, "branch", "--show-current").trim() === "main" && git(sb.work, "rev-parse", "rem").trim() === git(sb.work, "rev-parse", "main").trim());
await remoteRem.click();
await dialogButton(win, "Igualar à remota").click();
check("confirmar muda para a local e a iguala à remota", await until(() => git(sb.work, "branch", "--show-current").trim() === "rem" && git(sb.work, "rev-parse", "rem").trim() === git(sb.work, "rev-parse", "origin/rem").trim()));
await waitIdle(win);
git(sb.work, "switch", "main");
await win.evaluate(() => window.dispatchEvent(new Event("focus")));

// ----- conflito deixa o merge em andamento no destino -----
git(sb.work, "switch", "main");
writeFileSync(`${sb.work}/c.txt`, "base\n");
git(sb.work, "add", ".");
git(sb.work, "commit", "-m", "base c");
git(sb.work, "switch", "-c", "conf-a");
writeFileSync(`${sb.work}/c.txt`, "lado A\n");
git(sb.work, "commit", "-am", "A");
git(sb.work, "switch", "main");
git(sb.work, "switch", "-c", "conf-b");
writeFileSync(`${sb.work}/c.txt`, "lado B\n");
git(sb.work, "commit", "-am", "B");
git(sb.work, "switch", "main");
await win.evaluate(() => window.dispatchEvent(new Event("focus")));
await row("conf-a").waitFor();
await drag(row("conf-a"), row("conf-b"));
await dialogButton(win, "Fazer merge").click();
await win.getByText(/Merge em andamento/).waitFor();
check("conflito: o merge fica em andamento em conf-b", git(sb.work, "branch", "--show-current").trim() === "conf-b" && git(sb.work, "status", "--porcelain").includes("UU c.txt"));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
