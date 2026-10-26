// Header: menu Arquivo/Editar/Exibir/Ajuda, seletores de repositório e branch, Pull/Push com menu, Branch/Stash/Pop e Ctrl+F.
import { writeFileSync } from "node:fs";
import { checker, commitFile, dialogButton, fetchAll, git, initWorkWithRemote, openApp, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E header");
const sb = sandbox("header");
initWorkWithRemote(sb);
git(sb.work, "branch", "feature/a");
commitFile(sb.work, "g.txt", "g\n", "local");
writeFileSync(`${sb.work}/f.txt`, "um\ndois\ntres\nquatro\n"); // árvore suja: habilita o Stash

const { app, win, errors } = await openApp(sb.work);
const visible = (sel) => win.locator(sel).first().isVisible();

// ----- barra de título e menu -----
check("a barra de título própria mostra o nome do app", (await win.locator(".titlebar").innerText()).includes("GitMonster"));
const file = win.getByRole("menuitem", { name: "Arquivo", exact: true });
await file.click();
check("clicar em Arquivo abre a lista com os atalhos", (await win.getByRole("menu", { name: "Arquivo" }).innerText()).includes("Ctrl+T"));
await win.keyboard.press("Escape");
check("Esc fecha o menu sem executar nada", await until(async () => (await win.getByRole("menu", { name: "Arquivo" }).count()) === 0));
check("os quatro grupos do menu existem", (await win.locator(".menubar-title").allInnerTexts()).join(",") === "Arquivo,Editar,Exibir,Ajuda");

await file.click();
await win.getByRole("menuitem", { name: /^Nova aba/ }).click();
check("Arquivo › Nova aba leva à tela inicial", await until(() => visible(".start")));
await win.getByRole("button", { name: "work", exact: true }).click();
await win.locator(".repo-view:visible").waitFor();

check("Push mostra quantos commits há a enviar", (await win.locator(".tb-split").nth(1).locator(".tb-badge").innerText()) === "1");

// ----- seletor de branch -----
const branchPicker = win.locator(".current-branch");
check("o seletor mostra a branch atual", (await branchPicker.innerText()).includes("main"));
await branchPicker.click();
await win.getByLabel("Filtrar branches locais").fill("feat");
check("o seletor filtra enquanto digita", await until(async () => (await win.getByRole("menu", { name: "Branches locais" }).getByRole("menuitemradio").count()) === 1));
await win.getByRole("menuitemradio", { name: "feature/a" }).click();
check("escolher uma branch faz checkout", await until(() => git(sb.work, "branch", "--show-current").trim() === "feature/a"));
await waitIdle(win);
check("o seletor passa a mostrar a nova branch", (await branchPicker.innerText()).includes("feature/a"));

// ----- seletor de repositório -----
await win.locator(".repo-path").click();
check("o seletor de repositório lista as abas abertas", (await win.getByRole("menu", { name: "Repositórios" }).innerText()).includes("work"));
await win.keyboard.press("Escape");

// ----- Pull / Push -----
await win.getByRole("button", { name: "Opções do Pull" }).click();
const pullMenu = win.getByRole("menu", { name: "Opções do Pull" });
check("o menu do Pull tem Fetch e os três modos", (await pullMenu.getByRole("menuitemradio").count()) === 3 && (await pullMenu.getByRole("menuitem", { name: "Fetch" }).count()) === 1);
await win.keyboard.press("Escape");
await fetchAll(win);
await waitIdle(win);
await win.getByRole("button", { name: "Opções do Push" }).click();
check("o menu do Push tem Force push", (await win.getByRole("menuitem", { name: "Force push" }).count()) === 1);
await win.keyboard.press("Escape");

// ----- Stash / Pop -----
const stash = win.getByRole("button", { name: "Stash", exact: true });
const pop = win.getByRole("button", { name: "Pop", exact: true });
check("Pop fica desabilitado sem stash", await pop.isDisabled());
await stash.click();
check("Stash guarda as alterações", await until(() => git(sb.work, "stash", "list").trim() !== "" && git(sb.work, "status", "--porcelain").trim() === ""));
await waitIdle(win);
await until(async () => !(await pop.isDisabled()));
await pop.click();
check("Pop restaura as alterações", await until(() => git(sb.work, "stash", "list").trim() === "" && git(sb.work, "status", "--porcelain").includes("f.txt")));
await waitIdle(win);

// ----- Branch -----
await win.getByRole("button", { name: "Branch", exact: true }).click();
await win.getByLabel("Nome da branch").fill("nova");
await dialogButton(win, "Criar").click();
check("o botão Branch cria e muda para a branch", await until(() => git(sb.work, "branch", "--show-current").trim() === "nova"));
await waitIdle(win);

// ----- Pesquisar / Ctrl+F -----
check("a busca começa escondida", (await win.getByLabel("Buscar commits").count()) === 0);
await win.keyboard.press("Control+f");
check("Ctrl+F abre a busca e foca o campo", await until(() => win.getByLabel("Buscar commits").evaluate((el) => el === document.activeElement).catch(() => false)));
await win.getByRole("button", { name: "Pesquisar" }).click();
check("o botão Pesquisar esconde a busca", await until(async () => (await win.getByLabel("Buscar commits").count()) === 0));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
