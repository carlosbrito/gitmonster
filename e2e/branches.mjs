// Branches, remotos e stash pela interface, contra um remote bare local.
import { writeFileSync } from "node:fs";
import { checker, cloneOther, commitFile, dialogButton, git, initWorkWithRemote, openApp, createBranchViaToolbar, refRow, sandbox, until, fetchAll, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E branches e remotos");
const sb = sandbox("br");
initWorkWithRemote(sb);
cloneOther(sb);
const w = (...a) => git(sb.work, ...a);
const o = (...a) => git(sb.other, ...a);

// branch com commit não mesclado (fluxo de apagar) e branch que vai conflitar
w("switch", "-c", "wip");
commitFile(sb.work, "w.txt", "w\n", "trabalho nao mesclado");
w("switch", "main");
w("switch", "-c", "conflita");
commitFile(sb.work, "f.txt", "versao A\n", "A");
w("switch", "main");
commitFile(sb.work, "f.txt", "versao B\n", "B");

const { app, win, errors } = await openApp(sb.work);
await win.locator(".sb-local .sb-count").filter({ hasText: /^3$/ }).waitFor();

await createBranchViaToolbar(win, "feature/nova");
check("criar branch muda para ela", await until(() => w("branch", "--show-current").trim() === "feature/nova"));

await refRow(win, "main").locator(".ref-name").click();
check("checkout pela barra lateral", await until(() => w("branch", "--show-current").trim() === "main"));

commitFile(sb.work, "p.txt", "p\n", "para publicar");
await fetchAll(win);
await win.getByRole("button", { name: "Push", exact: true }).click();
check("push publica o commit", await until(() => git(sb.remote, "log", "-1", "--format=%s", "main").trim() === "para publicar"));

o("pull", "--ff-only");
commitFile(sb.other, "o.txt", "o\n", "do colega");
o("push");
await fetchAll(win);
check("fetch mostra commits a receber (↓1)", await until(async () => (await refRow(win, "main").innerText()).includes("↓1")));
await win.getByRole("button", { name: "Pull", exact: true }).click();
check("pull traz o commit do colega", await until(() => w("log", "-1", "--format=%s").trim() === "do colega"));

w("switch", "-c", "ff");
commitFile(sb.work, "ff.txt", "ff\n", "avanco ff");
w("switch", "main");
await fetchAll(win);
await refRow(win, "ff").getByTitle("Fazer merge desta branch na atual").click();
check("merge sem conflito conclui", await until(() => w("ls-files").includes("ff.txt")));
check("aviso de merge concluído na tela", await until(async () => await win.getByText(/Merge de "ff" em "main" concluído/).isVisible(), 5000));

await refRow(win, "conflita").getByTitle("Fazer merge desta branch na atual").click();
await win.getByText("Merge em andamento.").waitFor();
check("merge com conflito deixa merge em andamento", w("status", "--porcelain").includes("UU f.txt"));
await win.getByRole("button", { name: "aborte" }).click();
await dialogButton(win, "Abortar").click();
check("abortar merge limpa o estado", await until(() => w("status", "--porcelain").trim() === ""));
check("faixa de merge some", await until(async () => (await win.getByText("Merge em andamento.").count()) === 0));

await refRow(win, "wip").getByTitle("Apagar branch").click();
await dialogButton(win, "Apagar").click();
await dialogButton(win, "Apagar e perder commits").waitFor();
await dialogButton(win, "Cancelar").click();
check("cancelar na 2ª confirmação mantém a branch", await until(() => w("branch", "--list", "wip").includes("wip")));
await refRow(win, "wip").getByTitle("Apagar branch").click();
await dialogButton(win, "Apagar").click();
await dialogButton(win, "Apagar e perder commits").click();
check("confirmar as duas apaga a branch", await until(() => w("branch", "--list", "wip").trim() === ""));

writeFileSync(`${sb.work}/f.txt`, "sujo\n");
writeFileSync(`${sb.work}/novo.txt`, "novo\n");
await fetchAll(win);
await win.getByLabel("Mensagem do stash").fill("meu stash");
await win.getByRole("button", { name: "Guardar alterações" }).click();
check("stash guarda alterações e limpa a árvore", await until(() => w("status", "--porcelain").trim() === "" && w("stash", "list").includes("meu stash")));
await win.getByTitle("Aplicar e remover (pop)").click();
check("pop restaura os arquivos", await until(() => w("status", "--porcelain").includes("f.txt") && w("stash", "list").trim() === ""));

// ----- apagar em lote -----
await waitIdle(win);
w("switch", "main");
for (const n of ["lote-a", "lote-b", "lote-c"]) w("branch", n);
await fetchAll(win);
check("a sidebar não tem mais o campo de nova branch", (await win.getByLabel("Nome da nova branch").count()) === 0);
await win.getByLabel("Selecionar lote-a").check();
await win.getByLabel("Selecionar lote-b").check();
await win.getByRole("button", { name: "Apagar selecionadas (2)" }).click();
await dialogButton(win, "Cancelar").click();
check("cancelar mantém as branches e a seleção", w("branch", "--list", "lote-a").includes("lote-a") && (await win.getByRole("button", { name: "Apagar selecionadas (2)" }).count()) === 1);
await win.getByLabel("Selecionar todas as branches locais").check();
check("selecionar todos não marca a branch atual", (await win.getByLabel("Selecionar main").isDisabled()));
await win.getByRole("button", { name: /Apagar selecionadas/ }).click();
await dialogButton(win, "Apagar").click();
check("apaga todas as selecionadas de uma vez", await until(() => ["lote-a", "lote-b", "lote-c"].every((n) => w("branch", "--list", n).trim() === "") && w("branch", "--list", "main").includes("main")));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
