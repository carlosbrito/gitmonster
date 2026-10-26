// Monitor de comandos git: mostra o que o app executa, esconde leituras por padrão, copia comandos.
import { checker, commitFile, git, initWorkWithRemote, openApp, sandbox, until, waitIdle, fetchAll, createBranchViaToolbar } from "./helpers.mjs";

const { check, finish } = checker("E2E monitor de comandos git");
const sb = sandbox("monitor");
initWorkWithRemote(sb);
commitFile(sb.work, "a.txt", "a\n", "primeiro");

const { app, win, errors } = await openApp(sb.work);
const rows = win.locator(".gm-row");

check("o monitor começa fechado", (await win.locator(".git-monitor").count()) === 0);
await win.getByRole("button", { name: "Monitor" }).click();
await win.locator(".git-monitor").waitFor();

await fetchAll(win);
await waitIdle(win);
check("a ação aparece como comando pronto para o terminal", await until(async () => (await rows.filter({ hasText: "git fetch --all --prune" }).count()) === 1));
check("leituras (status, log...) ficam escondidas por padrão", (await rows.filter({ hasText: "git status" }).count()) === 0);

await win.getByLabel("mostrar leituras").check();
check("com 'mostrar leituras' elas aparecem", await until(async () => (await rows.filter({ hasText: "git status" }).count()) > 0));
await win.getByLabel("mostrar leituras").uncheck();

// uma ação que falha mostra o erro
await createBranchViaToolbar(win, "nova-ok");
await waitIdle(win);
check("criar branch aparece como git switch --create", await until(async () => (await rows.filter({ hasText: "git switch --create nova-ok" }).count()) === 1));
check("o comando está marcado como concluído", (await rows.filter({ hasText: "switch --create nova-ok" }).locator(".gm-state").innerText()) === "✓");

await createBranchViaToolbar(win, "nova-ok");
await waitIdle(win);
check("comando que falha aparece com ✗ e a mensagem do git", await until(async () => (await win.locator(".gm-row.fail .gm-error").filter({ hasText: /already exists/ }).count()) >= 1));

// credenciais não vazam
check("nada no monitor mostra senha ou token", !(await win.locator(".gm-list").innerText()).match(/:\/\/[^/@\s]+:[^/@\s]+@/));

await win.getByRole("button", { name: "Limpar" }).click();
check("limpar esvazia a lista", await until(async () => (await rows.count()) === 0));

await win.getByRole("button", { name: "Fechar monitor" }).click();
check("fechar esconde o painel", (await win.locator(".git-monitor").count()) === 0);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
