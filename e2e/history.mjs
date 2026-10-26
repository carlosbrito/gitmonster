// Detalhe do commit, tags, cherry-pick, revert, reset, rebase interativo e force push pela interface.
import { checker, commitFile, dialogButton, git, initWorkWithRemote, openApp, refRow, sandbox, selectCommit, until, forcePushMenu } from "./helpers.mjs";

const { check, finish } = checker("E2E histórico");
const sb = sandbox("hist");
initWorkWithRemote(sb);
const w = (...a) => git(sb.work, ...a);

w("switch", "-c", "feat");
const c1 = commitFile(sb.work, "a.txt", "a\n", "c1");
const c2 = commitFile(sb.work, "b.txt", "b\n", "c2");
const c3 = commitFile(sb.work, "c.txt", "c\n", "c3");
w("switch", "main");
w("switch", "-c", "confl");
const conflHash = commitFile(sb.work, "f.txt", "um\nCONFL\ntres\n", "confl muda dois");
w("switch", "main");
const mainTip = commitFile(sb.work, "f.txt", "um\nMAIN\ntres\n", "main muda dois");
w("push");
w("switch", "feat");

const { app, win, errors } = await openApp(sb.work);
const pick = (hash) => selectCommit(win, sb.work, hash);

// detalhe do commit + diff somente leitura
await pick(c2);
check("painel lista os arquivos do commit", await until(async () => (await win.locator(".commit-files").innerText()).includes("b.txt")));
await win.locator(".commit-files .file-open").first().click();
await win.locator(".hunk").first().waitFor();
check(
  "diff do commit é somente leitura (sem Stage hunk)",
  (await win.getByText("Stage hunk").count()) === 0 && (await win.getByText(`commit ${c2.slice(0, 7)}`).count()) === 1,
);
await win.getByRole("button", { name: "← Grafo" }).click();

// tag anotada no commit + publicar
await win.getByRole("button", { name: "Tag aqui" }).click();
await win.getByLabel("Nome da tag").fill("v1");
await win.locator("dialog").getByLabel(/Mensagem/).fill("release 1");
await dialogButton(win, "Criar tag").click();
check("tag anotada criada no commit certo", await until(() => w("cat-file", "-t", "v1").trim() === "tag" && w("rev-parse", "v1^{commit}").trim() === c2));
await refRow(win, "v1").getByTitle("Publicar esta tag no remoto").click();
check("tag publicada no remoto", await until(() => git(sb.remote, "tag", "-l").includes("v1")));

// branch no commit
await pick(c1);
await win.getByRole("button", { name: "Branch aqui" }).click();
await win.getByLabel("Nome da branch").fill("from-c1");
await dialogButton(win, "Criar e mudar").click();
check("branch criada no commit e ativa", await until(() => w("branch", "--show-current").trim() === "from-c1" && w("rev-parse", "HEAD").trim() === c1));

// cherry-pick limpo e com conflito
await refRow(win, "main").locator(".ref-name").click();
await until(() => w("branch", "--show-current").trim() === "main");
await pick(c2);
await win.getByRole("button", { name: "Cherry-pick" }).click();
check("cherry-pick aplica o commit na main", await until(() => w("log", "-1", "--format=%s").trim() === "c2"));

await pick(conflHash);
await win.getByRole("button", { name: "Cherry-pick" }).click();
await win.getByText("Cherry-pick em andamento.").waitFor();
check("conflito deixa cherry-pick em andamento", w("status", "--porcelain").includes("UU f.txt"));
await win.getByRole("button", { name: "aborte" }).click();
await dialogButton(win, "Abortar").click();
check("abortar limpa o estado", await until(() => w("status", "--porcelain").trim() === ""));

// revert e reset hard com confirmação
await pick(w("rev-parse", "HEAD").trim());
await win.getByRole("button", { name: "Revert" }).click();
check("revert cria o commit inverso", await until(() => w("log", "-1", "--format=%s").trim() === 'Revert "c2"'));

await pick(mainTip);
await win.getByRole("button", { name: "hard", exact: true }).click();
await dialogButton(win, "Reset hard").click();
check("reset hard move a branch para o commit escolhido", await until(() => w("rev-parse", "HEAD").trim() === mainTip));

// rebase interativo na feat (reordenar + fixup) e force push
await refRow(win, "feat").locator(".ref-name").click();
await until(() => w("branch", "--show-current").trim() === "feat");
await win.getByRole("button", { name: "Push", exact: true }).click();
await until(() => git(sb.remote, "rev-parse", "feat").trim() === c3);
const baseHash = w("rev-list", "--max-parents=0", "main").trim();
await pick(baseHash);
await win.getByRole("button", { name: "Rebase interativo" }).click();
await win.getByText("Rebase interativo sobre").waitFor();
await win.getByLabel("Subir c3").click();
await win.getByLabel("Ação de c2").selectOption("fixup");
await dialogButton(win, "Executar rebase").click();
check(
  "rebase interativo reordena e funde (c3, c1)",
  await until(() => w("log", "--format=%s", `${baseHash}..HEAD`).trim().split("\n").join(",") === "c3,c1"),
);
check("fixup manteve o conteúdo de c2", w("ls-files").includes("b.txt"));

check("push normal seria recusado após reescrever", (() => { try { w("push", "--dry-run"); return false; } catch { return true; } })());
await forcePushMenu(win);
await dialogButton(win, "Force push").click();
check("force push atualiza o remoto", await until(() => git(sb.remote, "rev-parse", "feat").trim() === w("rev-parse", "HEAD").trim()));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
