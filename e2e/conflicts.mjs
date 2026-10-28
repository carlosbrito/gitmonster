// Editor de conflitos: escolha por bloco, edição à mão, arquivo inteiro (modify/delete) e concluir o merge.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checker, git, identity, openApp, refRow, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E editor de conflitos");
const sb = sandbox("conf");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
const lines = (edits = {}) => Array.from({ length: 10 }, (_, i) => edits[i + 1] ?? `linha ${i + 1}`).join("\n") + "\n";
const write = (name, content) => writeFileSync(`${sb.work}/${name}`, content);
const commitAll = (msg) => {
  git(sb.work, "add", "-A");
  git(sb.work, "commit", "-m", msg);
};

write("a.txt", lines());
write("b.txt", "b original\n");
commitAll("base");
git(sb.work, "switch", "-c", "feature");
write("a.txt", lines({ 2: "deles2", 9: "deles9" }));
write("b.txt", "b da feature\n");
commitAll("feature");
git(sb.work, "switch", "main");
write("a.txt", lines({ 2: "nosso2", 9: "nosso9" }));
git(sb.work, "rm", "-q", "b.txt");
commitAll("main");

const { app, win, errors } = await openApp(sb.work);
await refRow(win, "feature").getByTitle("Fazer merge desta branch na atual").click();
await win.getByText(/Merge em andamento/).waitFor();
await waitIdle(win);

// ----- a.txt: dois blocos -----
await win.locator('button.file-open[title="a.txt"]').click();
const blocks = win.locator(".conflict-block");
await blocks.nth(1).waitFor();
check("dois blocos de conflito", (await blocks.count()) === 2);
const firstTitles = blocks.nth(0).locator(".conflict-side-name");
check("o painel nosso mostra a branch atual", (await firstTitles.nth(0).innerText()) === "main");
check("o painel deles mostra a branch mesclada", (await firstTitles.nth(1).innerText()) === "feature");
check("a barra mostra a operação com os dois lados", (await win.locator(".conflict-context").innerText()).includes("Merge de feature em main"));
check("o botão do bloco diz qual branch usa", (await blocks.nth(0).getByRole("button", { name: "Usar nosso" }).getAttribute("title")) === "Usar main");
check("salvar começa desabilitado", await win.getByRole("button", { name: "Salvar resolução" }).isDisabled());

await blocks.nth(0).getByRole("button", { name: "Usar nosso" }).click();
check("com um bloco pendente, salvar segue desabilitado", await win.getByRole("button", { name: "Salvar resolução" }).isDisabled());
await blocks.nth(1).getByRole("button", { name: "Editar à mão" }).click();
await win.getByLabel("Texto final do conflito 2").fill("final9\n");
const preview = await win.getByLabel("Resultado final").innerText();
check("o resultado mostra as escolhas", preview.includes("nosso2") && preview.includes("final9") && !preview.includes("<<<<<<<"), preview);

await win.getByRole("button", { name: "Salvar resolução" }).click();
const expected = lines({ 2: "nosso2", 9: "final9" });
check("o arquivo é gravado com a resolução", await until(() => readFileSync(`${sb.work}/a.txt`, "utf8") === expected));
check("a.txt sai da lista de conflitos e vai para o stage", await until(() => !git(sb.work, "status", "--porcelain").includes("UU a.txt") && git(sb.work, "diff", "--cached", "--name-only").includes("a.txt")));
await waitIdle(win);

// ----- b.txt: removido por nós, modificado por eles -----
await win.locator('button.file-open[title="b.txt"]').click();
await win.getByText(/removido por nós/).waitFor();
const removing = win.getByRole("button", { name: /Arquivo inteiro: nosso \(main\) \(remove o arquivo\)/ });
check("o editor avisa que o lado escolhido remove o arquivo", (await removing.count()) === 1);
await removing.click();
check("b.txt é removido e deixa de ser conflito", await until(() => !existsSync(`${sb.work}/b.txt`) && !git(sb.work, "status", "--porcelain").includes("UD")));
await waitIdle(win);

// ----- concluir o merge -----
await win.getByRole("button", { name: "continue" }).click();
check("o merge conclui com 2 pais", await until(() => git(sb.work, "log", "-1", "--format=%P").trim().split(" ").length === 2));
check("o conteúdo final do merge é o resolvido", git(sb.work, "show", "HEAD:a.txt").replace(/\r/g, "") === expected);
check("não sobrou operação em andamento", await until(async () => (await win.getByText(/Merge em andamento/).count()) === 0));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
