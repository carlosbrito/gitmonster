// IA: configurar o provedor (compatível com OpenAI, num servidor local de mentira), consentimento, cancelar,
// mensagem de commit, explicar, stash, Pull Request e resolução de conflito, pela interface de verdade.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checker, commitFile, git, identity, launchApp, openRepoTab, sandbox, until, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E IA");
const sb = sandbox("ai");
const KEY = "sk-local-e2eSegredo123";
const GH_TOKEN = "ghp_e2eAiToken123";

// ---------- repositório 1: commit, explicar, stash e PR ----------
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
commitFile(sb.work, "a.txt", "um\n", "feat: primeiro commit do repo");
git(sb.work, "remote", "add", "origin", "https://github.com/dono/repo.git");
git(sb.work, "switch", "-c", "feature");
commitFile(sb.work, "b.txt", "da feature\n", "feat: coisa da feature");
writeFileSync(`${sb.work}/a.txt`, "um\nSTAGED_NO_COMMIT\n");
git(sb.work, "add", "a.txt");
writeFileSync(`${sb.work}/b.txt`, "da feature\nSO_NA_ARVORE\n");

// ---------- repositório 2: conflito ----------
const conf = `${sb.base}/conf`;
execFileSync("git", ["init", "-b", "main", conf], { stdio: "ignore" });
identity(conf);
writeFileSync(`${conf}/c.txt`, "linha 1\nlinha 2\nlinha 3\n");
git(conf, "add", "-A");
git(conf, "commit", "-m", "base");
git(conf, "switch", "-c", "feature");
writeFileSync(`${conf}/c.txt`, "linha 1\ndeles\nlinha 3\n");
git(conf, "commit", "-am", "feature");
git(conf, "switch", "main");
writeFileSync(`${conf}/c.txt`, "linha 1\nnosso\nlinha 3\n");
git(conf, "commit", "-am", "main");

// ---------- provedor de IA de mentira ----------
const requests = [];
let hold = false;
const reply = (prompt) => {
  if (prompt.includes("writing Git commit messages")) return "<summary>feat: gerado pela IA</summary>\n<body>Corpo gerado pela IA</body>";
  if (prompt.includes("Explain uncommitted local changes")) return "<summary>Resumo das alterações</summary><body>Explicação detalhada</body>";
  if (prompt.includes("name Git stashes")) return "<summary>WIP: stash da IA</summary>";
  if (prompt.includes("Pull Request descriptions")) return "<summary>feat: PR gerado</summary><body>Descrição gerada do PR</body>";
  if (prompt.includes("resolving Git merge conflicts")) return "<resolved>\nresolvido pela IA\n</resolved><explanation>Junta os dois lados</explanation><confidence>0.8</confidence>";
  return "<summary>?</summary>";
};
const aiServer = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: "chave ruim" } });
    if (req.method === "GET" && req.url === "/v1/models") return send(200, { data: [{ id: "modelo-e2e" }, { id: "outro-modelo" }] });
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const body = JSON.parse(data);
      const prompt = body.messages[0].content;
      requests.push({ auth: req.headers.authorization, body, prompt });
      if (hold) return; // fica pendurado até o cliente cancelar
      return send(200, { choices: [{ message: { content: reply(prompt) } }] });
    }
    send(404, { error: { message: "não existe" } });
  });
});
await new Promise((r) => aiServer.listen(0, "127.0.0.1", r));
const aiUrl = `http://127.0.0.1:${aiServer.address().port}/v1`;

// ---------- GitHub de mentira (só para a tela de Pull Requests liberar o formulário) ----------
const ghServer = createServer((req, res) => {
  const send = (status, json) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(json));
  };
  if (req.headers.authorization !== `Bearer ${GH_TOKEN}`) return send(401, { message: "Bad credentials" });
  if (req.url === "/user") return send(200, { login: "ana" });
  if (req.url.startsWith("/repos/dono/repo/pulls?")) return send(200, []);
  send(404, { message: "Not Found" });
});
await new Promise((r) => ghServer.listen(0, "127.0.0.1", r));
process.env.GITMONSTER_GITHUB_API = `http://127.0.0.1:${ghServer.address().port}`;

const userData = `${sb.base}/userdata`;
const closeAll = () => {
  aiServer.closeAllConnections?.();
  aiServer.close();
  ghServer.close();
};

// =====================================================================================================
// Primeira execução
// =====================================================================================================
let { app, win, errors } = await launchApp(userData);
await openRepoTab(app, win, sb.work);
const view = () => win.locator(".repo-view:visible");
const generate = view().getByRole("button", { name: /Gerar mensagem/ });
const box = view().getByLabel("Resumo do commit");
const description = view().getByLabel("Descrição do commit");

// ----- desligada por padrão -----
check("com a IA desligada, 'Gerar mensagem' fica desabilitado", await generate.isDisabled());
check("a dica explica como ativar", ((await generate.getAttribute("title")) ?? "").includes("A IA está desligada"));
check("'Explicar alterações' também fica desabilitado", await view().getByRole("button", { name: "Explicar alterações" }).isDisabled());

// ----- configurar -----
await win.getByRole("button", { name: "Configurações" }).click();
const dialog = win.getByRole("dialog", { name: "Configurações" });
await dialog.getByLabel("Provedor de IA").waitFor();
check("a IA vem desligada", !(await dialog.getByLabel("Habilitar IA").isChecked()));
await dialog.getByLabel("Habilitar IA").check();
await dialog.getByLabel("Provedor de IA").selectOption({ label: "Compatível com OpenAI" });
check("o campo da chave esconde o que é digitado", (await dialog.getByLabel("Chave da API").getAttribute("type")) === "password");

await dialog.getByLabel("URL do endpoint").fill("http://exemplo.com/v1");
await dialog.getByRole("button", { name: "Salvar IA" }).click();
await dialog.getByRole("alert").filter({ hasText: "https://" }).waitFor();
check("URL http fora de localhost é recusada", true);

await dialog.getByLabel("URL do endpoint").fill(aiUrl);
await dialog.getByLabel("Chave da API").fill(KEY);
await dialog.getByRole("button", { name: "Salvar chave" }).click();
const keySaved = await dialog.getByRole("status").filter({ hasText: "Chave guardada" }).waitFor({ timeout: 8000 }).then(() => true, () => false);
if (!keySaved) {
  const why = await dialog.getByRole("alert").allInnerTexts();
  check("guardar a chave (precisa de safeStorage)", false, why.join(" | "));
  await app.close();
  closeAll();
  finish(sb.remove);
}
check("a chave sai do campo depois de salva", (await dialog.getByLabel("Chave da API").inputValue()) === "");
await dialog.getByRole("button", { name: "Testar conexão" }).click();
await dialog.getByRole("status").filter({ hasText: "Conexão funcionando: 2 modelos" }).waitFor();
check("testar conexão lista os modelos do provedor", true);

await dialog.getByLabel("Modelo para todos os recursos").selectOption("outro-modelo");
await dialog.getByText("Geração de mensagem de commit", { exact: true }).click();
await dialog.getByLabel("Modelo: Geração de mensagem de commit").selectOption("modelo-e2e");
await dialog.getByRole("button", { name: "Conventional Commits" }).click();
check("o atalho acrescenta o texto às instruções do recurso", (await dialog.getByLabel("Instruções: Geração de mensagem de commit").inputValue()).includes("Conventional Commits"));
await dialog.getByRole("button", { name: "Responder em <idioma>" }).click();
await dialog.getByRole("button", { name: "Salvar IA" }).click();
await dialog.getByRole("status").filter({ hasText: "Configurações da IA salvas" }).waitFor();

const aiFiles = [`${userData}/ai-settings.json`, `${userData}/ai-key-openai-compatible.json`];
check("preferências e chave foram gravadas", aiFiles.every((f) => existsSync(f)));
check("a chave nunca fica em texto puro em disco", aiFiles.every((f) => !readFileSync(f, "utf8").includes(KEY)));
check("as preferências guardam o consentimento como pendente", JSON.parse(readFileSync(aiFiles[0], "utf8")).sendCodeApproved["openai-compatible"] === false);
await dialog.getByRole("button", { name: "Fechar" }).click();

// ----- consentimento e cancelamento -----
check("com a IA ligada e a chave guardada, 'Gerar mensagem' habilita", await until(async () => !(await generate.isDisabled())));
hold = true;
await generate.click();
await win.getByText(/será enviado para Compatível com OpenAI/).waitFor();
check("o primeiro uso pede consentimento, citando o provedor", true);
await win.getByRole("button", { name: "Cancelar" }).click();
check("recusar o consentimento não envia nada", requests.length === 0);
check("recusar não mostra erro", (await view().getByRole("alert").count()) === 0);

await generate.click();
await win.getByRole("button", { name: "Permitir envio" }).click();
await view().getByText("IA trabalhando…").waitFor();
check("enquanto a IA trabalha, a faixa de andamento aparece", true);
await until(() => requests.length === 1);
await view().getByRole("button", { name: "Cancelar" }).click();
await view().getByText("IA trabalhando…").waitFor({ state: "detached" });
check("cancelar para o trabalho, sem erro e sem tocar na mensagem", (await view().getByRole("alert").count()) === 0 && (await box.inputValue()) === "");
check("o consentimento aceito fica guardado", JSON.parse(readFileSync(aiFiles[0], "utf8")).sendCodeApproved["openai-compatible"] === true);

// ----- mensagem de commit -----
hold = false;
await box.fill("mensagem antiga");
await generate.click();
await until(async () => (await box.inputValue()).startsWith("feat: gerado pela IA"));
check("a mensagem gerada preenche o resumo e a descrição", (await box.inputValue()) === "feat: gerado pela IA" && (await description.inputValue()) === "Corpo gerado pela IA", JSON.stringify([await box.inputValue(), await description.inputValue()]));
const lastSubject = git(sb.work, "log", "--format=%s", "-1").trim();
check("gerar não commita", lastSubject === "feat: coisa da feature", JSON.stringify(lastSubject));
const commitReq = requests.at(-1);
check("o pedido usa a chave, o modelo escolhido e max_tokens do recurso", commitReq.auth === `Bearer ${KEY}` && commitReq.body.model === "modelo-e2e" && commitReq.body.max_tokens === 1024);
check("o prompt leva o diff em stage e não o que está só na árvore", commitReq.prompt.includes("STAGED_NO_COMMIT") && !commitReq.prompt.includes("SO_NA_ARVORE"));
check("o prompt leva a branch e o histórico do repositório", commitReq.prompt.includes("feature") && commitReq.prompt.includes("feat: primeiro commit do repo"));
check("o prompt leva as instruções globais e do recurso", commitReq.prompt.includes("Responda em português do Brasil.") && commitReq.prompt.includes("Conventional Commits"));
await box.focus();
await win.keyboard.press("Control+z");
check("Ctrl+Z no campo recupera a mensagem anterior", await until(async () => (await box.inputValue()) === "mensagem antiga"), JSON.stringify(await box.inputValue()));

// ----- explicar alterações -----
await view().getByRole("button", { name: "Explicar alterações" }).click();
const explain = win.getByRole("dialog", { name: "Alterações locais" });
await explain.getByText("Resumo das alterações").waitFor({ timeout: 8000 }).catch(async () => {
  console.log("DIAG alertas:", JSON.stringify(await view().getByRole("alert").allInnerTexts()), "pedidos:", requests.length, "último:", requests.at(-1)?.prompt.slice(0, 120));
  throw new Error("a explicação não apareceu");
});
check("a explicação aparece com o resumo e os detalhes", (await explain.innerText()).includes("Explicação detalhada"));
check("o modelo geral vale para os recursos sem escolha própria", requests.at(-1).body.model === "outro-modelo");
check("o diff enviado inclui o stage e a árvore", requests.at(-1).prompt.includes("STAGED_NO_COMMIT") && requests.at(-1).prompt.includes("SO_NA_ARVORE"));
await explain.getByRole("button", { name: "Fechar" }).click();

// ----- mensagem de stash -----
const stashBox = view().getByLabel("Mensagem do stash");
await view().getByLabel("Gerar com IA", { exact: true }).click();
await until(async () => (await stashBox.inputValue()) === "WIP: stash da IA");
check("a mensagem do stash preenche o campo, sem criar o stash", (await stashBox.inputValue()) === "WIP: stash da IA" && git(sb.work, "stash", "list") === "");

// ----- Pull Request -----
await win.getByRole("button", { name: "Configurações" }).click();
await dialog.getByLabel("Token do GitHub").fill(GH_TOKEN);
await dialog.getByRole("button", { name: "Conectar" }).click();
await dialog.getByRole("status").filter({ hasText: "Conectado ao GitHub" }).waitFor({ timeout: 8000 });
await dialog.getByRole("button", { name: "Fechar" }).click();
await win.getByRole("button", { name: "Pull Requests" }).click();
const pulls = win.getByRole("region", { name: "Pull Requests" });
await pulls.getByRole("button", { name: "Novo Pull Request" }).click();
await pulls.getByLabel("Branch de destino").fill("main");
await pulls.getByRole("button", { name: "✨ Gerar com IA" }).click();
await until(async () => (await pulls.getByLabel("Título do Pull Request").inputValue()) === "feat: PR gerado");
check("título e descrição do PR são preenchidos", (await pulls.getByLabel("Título do Pull Request").inputValue()) === "feat: PR gerado" && (await pulls.getByLabel("Descrição do Pull Request").inputValue()) === "Descrição gerada do PR");
const prReq = requests.at(-1);
check("o prompt do PR leva as branches, os commits e o diff", prReq.prompt.includes('"feature" into "main"') && prReq.prompt.includes("feat: coisa da feature") && prReq.prompt.includes("da feature"));

check("sem erros de console/página (parte 1)", errors.length === 0, JSON.stringify(errors));
await app.close();

// =====================================================================================================
// Segunda execução: as preferências e a chave sobrevivem; conflito
// =====================================================================================================
({ app, win, errors } = await launchApp(userData));
// A sessão reabre a aba do primeiro repositório; o do conflito vai numa aba nova.
await win.locator(".tab").first().waitFor();
await win.getByRole("button", { name: "Nova aba" }).click();
await win.getByRole("heading", { name: "Recentes" }).waitFor();
await openRepoTab(app, win, conf);
await view().locator("li.ref").filter({ hasText: "feature" }).first().getByTitle("Fazer merge desta branch na atual").click();
await win.getByText(/Merge em andamento/).waitFor();
await waitIdle(win);
await win.locator('button.file-open[title="c.txt"]').click();
await win.locator(".conflict-block").first().waitFor();

const solve = win.getByRole("button", { name: "✨ Resolver com IA" });
check("depois de reiniciar, a IA segue configurada", await until(async () => !(await solve.isDisabled())));
const before = requests.length;
await solve.click();
await win.locator(".ai-note").waitFor();
check("o consentimento guardado não pergunta de novo", (await win.getByRole("button", { name: "Permitir envio" }).count()) === 0);
const text = win.getByLabel("Texto final do conflito 1");
check("a proposta entra como texto editável do bloco", (await text.inputValue()) === "resolvido pela IA\n", JSON.stringify(await text.inputValue()));
const note = await win.locator(".ai-note").innerText();
check("a nota mostra confiança e explicação", note.includes("confiança 80%") && note.includes("Junta os dois lados"), note);
const cReq = requests.at(-1);
check("o prompt do conflito leva nosso, deles e o ancestral", requests.length === before + 1 && cReq.prompt.includes("nosso") && cReq.prompt.includes("deles") && cReq.prompt.includes("<base>\nlinha 2\n</base>"));
check("nada foi gravado em disco antes de salvar", readFileSync(`${conf}/c.txt`, "utf8").includes("<<<<<<<"));

await win.getByRole("button", { name: "Desfazer IA" }).click();
check("Desfazer IA volta o bloco a pendente", (await win.locator(".conflict-custom").count()) === 0 && (await win.locator(".ai-note").count()) === 0);

await solve.click();
await win.locator(".ai-note").waitFor();
await text.fill("resolvido pela IA e ajustado\n");
await win.getByRole("button", { name: "Salvar resolução" }).click();
check("o arquivo é gravado com o texto revisado pelo usuário", await until(() => readFileSync(`${conf}/c.txt`, "utf8") === "linha 1\nresolvido pela IA e ajustado\nlinha 3\n"), readFileSync(`${conf}/c.txt`, "utf8"));
check("o arquivo resolvido vai para o stage", await until(() => git(conf, "diff", "--cached", "--name-only").includes("c.txt") && !git(conf, "status", "--porcelain").includes("UU")));

check("sem erros de console/página (parte 2)", errors.length === 0, JSON.stringify(errors));
await app.close();
closeAll();
finish(sb.remove);
