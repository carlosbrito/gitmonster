// Pull com modo: fast-forward recusa divergência; merge e rebase integram.
import { checker, cloneOther, commitFile, git, initWorkWithRemote, openApp, readErrorDialog, sandbox, until, waitIdle, fetchAll, setPullMode } from "./helpers.mjs";

const { check, finish } = checker("E2E pull com modo");
const sb = sandbox("pull");
initWorkWithRemote(sb);
cloneOther(sb);

const { app, win, errors } = await openApp(sb.work);
const pull = win.getByRole("button", { name: "Pull", exact: true });
const fetch = { click: () => fetchAll(win) };

// diverge: o colega publica, eu commito local
commitFile(sb.other, "r.txt", "r\n", "do colega");
git(sb.other, "push");
commitFile(sb.work, "l.txt", "l\n", "meu local");
await fetch.click();
await waitIdle(win);

await win.getByRole("button", { name: "Opções do Pull" }).click();
check("o modo padrão é somente fast-forward", (await win.getByRole("menuitemradio", { name: "Somente fast-forward" }).getAttribute("aria-checked")) === "true");
await win.keyboard.press("Escape");
await pull.click();
check("fast-forward recusa a divergência e sugere trocar o modo", (await readErrorDialog(win)).includes("modo do pull"));

await setPullMode(win, "Merge");
await pull.click();
check("pull merge cria um commit de merge", await until(() => git(sb.work, "log", "-1", "--format=%P").trim().split(" ").length === 2));
check("a tela avisa que o pull terminou", await until(async () => (await win.getByRole("status").filter({ hasText: "O pull concluído" }).count()) === 1));

// segunda rodada em rebase
commitFile(sb.other, "r2.txt", "r2\n", "do colega 2");
git(sb.other, "push");
commitFile(sb.work, "l2.txt", "l2\n", "meu local 2");
await fetch.click();
await waitIdle(win);
await setPullMode(win, "Rebase");
await pull.click();
check(
  "pull rebase deixa o meu commit por cima do dele, em histórico linear",
  await until(
    () =>
      git(sb.work, "log", "-1", "--format=%s").trim() === "meu local 2" &&
      git(sb.work, "log", "--format=%s").includes("do colega 2") &&
      git(sb.work, "log", "--merges", "--oneline", "origin/main..HEAD").trim() === "",
  ),
);

// conflito no modo merge: fica em andamento
commitFile(sb.other, "f.txt", "do colega\n", "edita f no colega");
git(sb.other, "push");
commitFile(sb.work, "f.txt", "meu\n", "edita f local");
await fetch.click();
await waitIdle(win);
await setPullMode(win, "Merge");
await pull.click();
await win.getByText(/Merge em andamento/).waitFor();
check("conflito no pull deixa o merge em andamento", git(sb.work, "status", "--porcelain").includes("UU f.txt"));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
