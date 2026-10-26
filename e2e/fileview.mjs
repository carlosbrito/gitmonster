// Blame e histórico de arquivo pelos menus de contexto.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { checker, git, identity, openApp, sandbox, selectCommit } from "./helpers.mjs";

const { check, finish } = checker("E2E blame e histórico de arquivo");
const sb = sandbox("fileview");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
const commit = (file, content, msg, author) => {
  writeFileSync(`${sb.work}/${file}`, content);
  git(sb.work, "add", ".");
  git(sb.work, "commit", "-m", msg, `--author=${author}`);
  return git(sb.work, "rev-parse", "HEAD").trim();
};
const h1 = commit("a.js", "const um = 1;\nconst dois = 2;\n", "cria a", "Ana <ana@example.com>");
const h2 = commit("a.js", "const um = 1;\nconst dois = 22;\n", "muda dois", "Bruno <bruno@example.com>");
commit("outro.txt", "x\n", "outro arquivo", "Ana <ana@example.com>");
writeFileSync(`${sb.work}/a.js`, "const um = 1;\nconst dois = 22;\nconst tres = 3;\n");

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
const menu = win.getByRole("menu");

// ----- blame da árvore de trabalho -----
await win.locator("li.file").filter({ hasText: "a.js" }).click({ button: "right" });
await menu.getByRole("menuitem", { name: "Blame" }).click();
await win.locator(".blame-row").nth(2).waitFor();
check("uma linha de blame por linha do arquivo", (await win.locator(".blame-row").count()) === 3);
check("a autoria da primeira linha é da Ana", (await win.locator(".blame-row").nth(0).innerText()).includes("Ana"));
check("a linha alterada é do Bruno", (await win.locator(".blame-row").nth(1).innerText()).includes("Bruno"));
check("a linha nova aparece como não commitada", (await win.locator(".blame-row").nth(2).innerText()).includes("não commitado"));
check("o código tem sintaxe destacada", (await win.locator(".blame-row .hljs-keyword").count()) >= 3);

await win.locator(".blame-row").nth(1).locator(".blame-meta").click();
await win.locator(".commit-panel code").first().waitFor();
check("clicar na autoria seleciona o commit", (await win.locator(".commit-panel code").first().innerText()).trim() === h2);

// ----- histórico do arquivo, a partir do detalhe do commit -----
await win.getByRole("button", { name: "← Grafo" }).click();
await selectCommit(win, sb.work, h2);
await win.locator(".commit-files li").filter({ hasText: "a.js" }).click({ button: "right" });
await menu.getByRole("menuitem", { name: "Histórico do arquivo" }).click();
await win.locator(".file-history .result").nth(1).waitFor();
check("o histórico lista só os commits do arquivo", (await win.locator(".file-history .result").count()) === 2);
check("do mais novo para o mais antigo", (await win.locator(".file-history .result").first().innerText()).includes("muda dois"));

// ----- blame numa revisão antiga -----
await win.getByRole("button", { name: "← Grafo" }).click();
await selectCommit(win, sb.work, h1);
await win.locator(".commit-files li").filter({ hasText: "a.js" }).click({ button: "right" });
await menu.getByRole("menuitem", { name: "Blame neste commit" }).click();
await win.locator(".blame-row").nth(1).waitFor();
check("blame no commit antigo tem só as 2 linhas daquela época", (await win.locator(".blame-row").count()) === 2);
check("e tudo é da Ana", !(await win.locator(".blame").innerText()).includes("Bruno"));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
