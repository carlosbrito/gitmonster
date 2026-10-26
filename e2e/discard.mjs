// Descartar alterações pela interface: arquivo, arquivo novo, hunk e "descartar todos".
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checker, commitFile, dialogButton, git, identity, openApp, sandbox, until } from "./helpers.mjs";

const { check, finish } = checker("E2E descartar");
const sb = sandbox("discard");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
const base = Array.from({ length: 30 }, (_, i) => `linha ${i + 1}`);
commitFile(sb.work, "f.txt", base.join("\n") + "\n", "base f");
commitFile(sb.work, "b.txt", "original\n", "base b");
const read = (name) => readFileSync(`${sb.work}/${name}`, "utf8");

const edited = [...base];
edited[1] = "linha 2 EDITADA";
edited[27] = "linha 28 EDITADA";
writeFileSync(`${sb.work}/f.txt`, edited.join("\n") + "\n");
writeFileSync(`${sb.work}/b.txt`, "mudou\n");
writeFileSync(`${sb.work}/novo.txt`, "arquivo novo\n");

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (3)", { exact: true }).waitFor();

// cancelar não mexe em nada
await win.getByLabel("Descartar alterações de b.txt").click();
await dialogButton(win, "Cancelar").click();
check("cancelar mantém a alteração", read("b.txt") === "mudou\n");

// arquivo rastreado
await win.getByLabel("Descartar alterações de b.txt").click();
check("a confirmação cita o arquivo", (await win.locator("dialog p").innerText()).includes("b.txt"));
await dialogButton(win, "Descartar").click();
check("arquivo rastreado volta ao original", await until(async () => read("b.txt") === "original\n"));

// arquivo novo: a mensagem avisa que será apagado
await win.getByLabel("Descartar alterações de novo.txt").click();
const msg = await win.locator("dialog p").innerText();
check("a confirmação avisa que o arquivo novo será apagado", /novo\.txt \(novo\)/.test(msg) && /apagado/.test(msg), msg);
await dialogButton(win, "Descartar").click();
check("arquivo novo é apagado do disco", await until(async () => !existsSync(`${sb.work}/novo.txt`)));

// hunk
await win.locator('button.file-open[title="f.txt"]').click();
await win.locator(".hunk").nth(1).waitFor();
await win.locator(".hunk").first().getByText("Descartar hunk").click();
await dialogButton(win, "Descartar trecho").click();
check("descartar hunk desfaz só o primeiro trecho", await until(async () => !read("f.txt").includes("linha 2 EDITADA")));
check("o outro hunk segue modificado", read("f.txt").includes("linha 28 EDITADA"));

// descartar todos
await win.getByRole("button", { name: "← Grafo" }).click();
writeFileSync(`${sb.work}/b.txt`, "outra vez\n");
writeFileSync(`${sb.work}/novo2.txt`, "x\n");
await win.evaluate(() => window.dispatchEvent(new Event("focus"))); // o app atualiza ao voltar à janela
await win.getByText("Arquivos não staged (3)", { exact: true }).waitFor();
await win.getByRole("button", { name: "Descartar todas as alterações" }).click();
await dialogButton(win, "Descartar").click();
check("descartar todos deixa a árvore limpa", await until(async () => git(sb.work, "status", "--porcelain").trim() === ""));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
