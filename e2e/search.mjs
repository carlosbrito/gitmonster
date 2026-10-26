// Busca de commits: por mensagem, conteúdo, hash; selecionar resultado; Ctrl+F e Esc.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { checker, git, identity, openApp, sandbox, openSearchBar } from "./helpers.mjs";

const { check, finish } = checker("E2E busca");
const sb = sandbox("search");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
const commit = (file, content, msg) => {
  writeFileSync(`${sb.work}/${file}`, content);
  git(sb.work, "add", ".");
  git(sb.work, "commit", "-m", msg);
  return git(sb.work, "rev-parse", "HEAD").trim();
};
const h1 = commit("a.txt", "alfa\n", "feat: cria alfa");
const h2 = commit("b.txt", "beta SEGREDO\n", "fix: corrige beta");
commit("a.txt", "alfa 2\n", "chore: ajusta alfa");

const { app, win, errors } = await openApp(sb.work);
await openSearchBar(win);
const input = win.getByLabel("Buscar commits");
const field = win.getByLabel("Campo da busca");
const results = win.locator(".search-results .result");
const search = async (f, q) => {
  await field.selectOption(f);
  await input.fill(q);
  await input.press("Enter");
};

await search("message", "alfa");
await results.nth(1).waitFor();
check("busca por mensagem acha os dois commits", (await results.count()) === 2);
check("o resumo informa a quantidade", (await win.getByText("2 resultado(s)").count()) === 1);
check("o grafo some enquanto há resultados", await win.locator(".graph-scroll").isHidden());

await results.nth(1).locator("button").click();
await win.locator(".commit-panel code").first().waitFor();
check("clicar num resultado seleciona o commit", (await win.locator(".commit-panel code").first().innerText()).trim() === h1);

await search("content", "SEGREDO");
await win.getByText("1 resultado(s)").waitFor();
check("busca por conteúdo", (await results.count()) === 1 && (await results.first().innerText()).includes("corrige beta"));

await search("hash", h2.slice(0, 8));
await win.getByText("1 resultado(s)").waitFor();
check("busca por hash abreviado", (await results.first().locator("button").getAttribute("title")) === h2);

await search("message", "--oneline");
await win.getByText("Nenhum commit encontrado.").waitFor();
check("texto que parece opção do Git é tratado como texto", (await results.count()) === 0);

// Ctrl+F foca o campo; Esc fecha a busca
await win.locator(".tb-arrow").click();
await win.keyboard.press("Control+f");
check("Ctrl+F foca o campo de busca", await input.evaluate((el) => el === document.activeElement));
await input.press("Escape");
await win.locator(".graph-scroll").waitFor({ state: "visible" });
check("Esc fecha a busca e volta ao grafo", (await win.locator(".search-results").count()) === 0);

await win.getByRole("button", { name: "← Grafo" }).count();
check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
