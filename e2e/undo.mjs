// Desfazer / Refazer pela toolbar: commit, checkout e bloqueio com alterações não commitadas.
import { writeFileSync } from "node:fs";
import { checker, commitFile, git, initWorkWithRemote, openApp, refRow, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E desfazer e refazer");
const sb = sandbox("undo");
initWorkWithRemote(sb);
commitFile(sb.work, "b.txt", "b\n", "segundo");
git(sb.work, "branch", "outra");

const { app, win, errors } = await openApp(sb.work);
const undo = win.getByRole("button", { name: /Desfazer/ });
const redo = win.getByRole("button", { name: /Refazer/ });
const refresh = () => win.evaluate(() => window.dispatchEvent(new Event("focus")));

// commit feito por fora; o app atualiza ao voltar à janela
commitFile(sb.work, "c.txt", "c\n", "terceiro");
const commitOid = git(sb.work, "rev-parse", "HEAD").trim();
await refresh();
check("desfazer fica disponível depois de um commit", await until(async () => await undo.isEnabled()));
check("o título diz o que será desfeito", (await undo.getAttribute("title")) === "Desfazer commit");
check("refazer começa desabilitado", await redo.isDisabled());

await undo.click();
check("desfazer commit volta ao anterior e mantém as alterações no stage", await until(() => git(sb.work, "log", "-1", "--format=%s").trim() === "segundo" && git(sb.work, "status", "--porcelain").trim() === "A  c.txt"));
await waitIdle(win);
check("depois de desfazer, refazer habilita e desfazer desabilita", (await redo.isEnabled()) && (await undo.isDisabled()));

await redo.click();
check("refazer restaura o mesmo commit", await until(() => git(sb.work, "rev-parse", "HEAD").trim() === commitOid));
await waitIdle(win);

// checkout pela sidebar e desfazer
await refRow(win, "outra").getByRole("button", { name: "outra" }).click();
check("checkout pela sidebar", await until(() => git(sb.work, "branch", "--show-current").trim() === "outra"));
await waitIdle(win);
check("o título oferece voltar para a branch anterior", await until(async () => (await undo.getAttribute("title")) === "Voltar para main"));
await undo.click();
check("desfazer o checkout volta para a main", await until(() => git(sb.work, "branch", "--show-current").trim() === "main"));
await waitIdle(win);

// alterações não commitadas bloqueiam o desfazer destrutivo
git(sb.work, "switch", "-c", "feature");
commitFile(sb.work, "f.txt", "f\n", "na feature");
git(sb.work, "switch", "main");
commitFile(sb.work, "m.txt", "m\n", "na main");
git(sb.work, "merge", "--no-edit", "feature");
writeFileSync(`${sb.work}/b.txt`, "sujo\n");
await refresh();
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
check("com alterações não commitadas, desfazer o merge fica bloqueado", await until(async () => await undo.isDisabled()));
check("o título explica o motivo", /não commitadas/.test((await undo.getAttribute("title")) ?? ""));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
