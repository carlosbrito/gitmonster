// Diff com destaque de sintaxe e modo lado a lado.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { checker, commitFile, git, identity, openApp, sandbox } from "./helpers.mjs";

const { check, finish } = checker("E2E diff");
const sb = sandbox("diff");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
commitFile(sb.work, "app.js", "function soma(a, b) {\n  return a + b;\n}\n\nconst x = 1;\nconst nome = 'velho';\n", "base");
writeFileSync(`${sb.work}/app.js`, "function soma(a, b) {\n  return a + b + 1;\n}\n\nconst x = 1;\nconst nome = 'novo';\nlet extra = true;\n");

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
await win.locator('button.file-open[title="app.js"]').click();
await win.locator(".hunk").first().waitFor();

check("o modo padrão é unificado", await win.getByRole("button", { name: "Unificado" }).getAttribute("aria-pressed") === "true");
check("sintaxe destacada (palavras-chave)", (await win.locator(".dl .hljs-keyword").count()) > 0);
check("sintaxe destacada (strings)", (await win.locator(".dl .hljs-string").count()) > 0);
check("o texto do código aparece inteiro", (await win.locator(".hunk-lines").innerText()).includes("return a + b + 1;"));

await win.getByRole("button", { name: "Lado a lado" }).click();
await win.locator(".sbs-row").first().waitFor();
check("lado a lado: há linhas pareadas", (await win.locator(".sbs-row").count()) >= 3);
check("remoções à esquerda e adições à direita", (await win.locator(".sbs-cell.dl-del").count()) >= 2 && (await win.locator(".sbs-cell.dl-add").count()) >= 3);
check("a adição sem par deixa o lado esquerdo vazio", (await win.locator(".sbs-empty").count()) >= 1);
check("sintaxe também no lado a lado", (await win.locator(".sbs-cell .hljs-keyword").count()) > 0);

// o stage por hunk continua funcionando nesse modo
await win.locator(".hunk").first().getByText("Stage hunk").click();
await win.getByText("Arquivos staged (1)", { exact: true }).waitFor();
check("stage hunk funciona no modo lado a lado", git(sb.work, "diff", "--cached", "--name-only").trim() === "app.js");

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
