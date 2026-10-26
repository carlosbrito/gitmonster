// Remotas agrupadas na sidebar: adicionar, recolher, remover, renomear branch e apagar branch no remote.
import { execFileSync } from "node:child_process";
import { checker, dialogButton, git, initWorkWithRemote, openApp, refRow, sandbox, until, waitIdle, fetchAll } from "./helpers.mjs";

const { check, finish } = checker("E2E remotas");
const sb = sandbox("remotes");
initWorkWithRemote(sb);
git(sb.work, "branch", "feature");
git(sb.work, "push", "origin", "feature");
const fork = `${sb.base}/fork.git`;
execFileSync("git", ["init", "--bare", "-b", "main", fork], { stdio: "ignore" });

const { app, win, errors } = await openApp(sb.work);
const menu = win.getByRole("menu");
const item = (name) => menu.getByRole("menuitem", { name });
const head = (name) => win.locator(".remote-head").filter({ hasText: name });
const fetch = () => fetchAll(win).then(() => waitIdle(win));

await fetch();
await head("origin").waitFor();
check("as branches do remote ficam agrupadas sob o nome dele", (await head("origin").locator(".sb-name").textContent()) === "origin" && (await head("origin").locator(".sb-count").textContent()) === "2");
check("o nome do remote não se repete em cada branch", (await refRow(win, "feature").count()) >= 1 && !(await win.locator(".remote-group li.ref").first().innerText()).startsWith("origin/"));

// recolher
await head("origin").locator(".ref-name").click();
check("recolher esconde as branches do grupo", await until(async () => (await win.locator(".remote-group li.ref").count()) === 0));
await head("origin").locator(".ref-name").click();
check("expandir mostra de novo", await until(async () => (await win.locator(".remote-group li.ref").count()) === 2));

// adicionar remote: pelo "+" do cabeçalho REMOTE, num diálogo (a seção não tem mais formulário)
check("a seção REMOTE não tem formulário de remote", (await win.getByLabel("Nome do novo remote").count()) === 0);
const addRemote = async (name, url) => {
  await win.locator(".sb-remote").getByRole("button", { name: "Adicionar remote" }).click();
  const form = win.locator("dialog[open]");
  await form.getByLabel("Nome").fill(name);
  await form.getByLabel("URL").fill(url);
  await dialogButton(win, "Adicionar").click();
};
await addRemote("fork", `file:///${fork}`);
check("remote adicionado no repositório", await until(() => git(sb.work, "remote").split("\n").includes("fork")));
await head("fork").waitFor();
check("o novo remote aparece como grupo vazio", (await head("fork").locator(".sb-count").textContent()) === "0");

// URL perigosa
await addRemote("ruim", "--upload-pack=calc");
await win.getByRole("alert").waitFor();
check("URL perigosa é recusada", !git(sb.work, "remote").split("\n").includes("ruim"));

// renomear branch local pelo menu
await refRow(win, "feature").first().click({ button: "right" });
await item("Renomear…").click();
await win.getByLabel("Novo nome").fill("funcionalidade");
await dialogButton(win, "Renomear").click();
check("renomear a branch local", await until(() => git(sb.work, "branch", "--list", "funcionalidade").trim() !== "" && git(sb.work, "branch", "--list", "feature").trim() === ""));
await waitIdle(win);

// apagar branch no remote
await win.locator(".remote-group li.ref").filter({ hasText: "feature" }).click({ button: "right" });
await item("Apagar no remote…").click();
await dialogButton(win, "Apagar no remote").click();
check("a branch some do servidor", await until(() => !git(sb.work, "ls-remote", "--heads", "origin").includes("refs/heads/feature")));
await waitIdle(win);

// remover remote
await head("fork").getByTitle("Remover este remote").click();
await dialogButton(win, "Remover remote").click();
check("remover o remote", await until(() => !git(sb.work, "remote").split("\n").includes("fork")));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
