// GitHub: conectar com token, listar e criar Pull Requests contra um servidor simulado.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checker, commitFile, git, identity, launchApp, openRepoTab, sandbox, until } from "./helpers.mjs";

const { check, finish } = checker("E2E GitHub");
const sb = sandbox("github");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
commitFile(sb.work, "a.txt", "x\n", "base");
// Remote do GitHub (só para o app reconhecer o repositório) e uma branch "publicada" sem rede
git(sb.work, "remote", "add", "origin", "https://github.com/dono/repo.git");
git(sb.work, "switch", "-c", "feature");
commitFile(sb.work, "b.txt", "b\n", "na feature");
git(sb.work, "update-ref", "refs/remotes/origin/feature", "HEAD");
git(sb.work, "config", "branch.feature.remote", "origin");
git(sb.work, "config", "branch.feature.merge", "refs/heads/feature");

const TOKEN = "ghp_e2eTokenSecreto123";
const pulls = [
  { number: 5, title: "PR cinco", state: "open", draft: false, user: { login: "bruno" }, head: { ref: "outra" }, base: { ref: "main" }, updated_at: "2026-10-15T10:00:00Z", merged_at: null },
];
const posts = [];
const server = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { message: "Bad credentials" });
    if (req.url === "/user") return send(200, { login: "ana" });
    if (req.url === "/repos/dono/repo") return send(200, { default_branch: "main" });
    if (req.url.startsWith("/repos/dono/repo/pulls?")) return send(200, pulls);
    if (req.url === "/repos/dono/repo/pulls/5") {
      return send(200, { ...pulls[0], body: "Descrição do cinco", mergeable: true, additions: 12, deletions: 3, changed_files: 2, commits: 4, comments: 1, review_comments: 0 });
    }
    if (req.url === "/repos/dono/repo/pulls" && req.method === "POST") {
      const body = JSON.parse(data);
      posts.push(body);
      pulls.unshift({ number: 6, title: body.title, state: "open", draft: body.draft, user: { login: "ana" }, head: { ref: body.head }, base: { ref: body.base }, updated_at: "2026-10-15T11:00:00Z", merged_at: null });
      return send(201, pulls[0]);
    }
    send(404, { message: "Not Found" });
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.GITMONSTER_GITHUB_API = `http://127.0.0.1:${server.address().port}`;

const userData = `${sb.base}/userdata`;
const { app, win, errors } = await launchApp(userData);
await openRepoTab(app, win, sb.work);
const view = win.getByRole("region", { name: "Pull Requests" });
const dialog = win.getByRole("dialog", { name: "Configurações" });

// ----- sem conexão -----
await win.getByRole("button", { name: "Pull Requests" }).click();
await view.getByText(/Conecte-se ao GitHub/).waitFor();
check("sem token, a tela explica como conectar", true);

// ----- conectar pelas Configurações -----
await view.getByRole("button", { name: "Abrir Configurações" }).click();
await dialog.getByLabel("Token do GitHub").waitFor();
check("o campo do token esconde o que é digitado", (await dialog.getByLabel("Token do GitHub").getAttribute("type")) === "password");

await dialog.getByLabel("Token do GitHub").fill("ghp_tokenErrado12345");
await dialog.getByRole("button", { name: "Conectar" }).click();
await dialog.getByRole("alert").filter({ hasText: "Token inválido" }).waitFor();
check("token recusado pela API mostra o erro e não conecta", !existsSync(`${userData}/github.json`));

await dialog.getByLabel("Token do GitHub").fill(TOKEN);
await dialog.getByRole("button", { name: "Conectar" }).click();
const connected = await dialog.getByRole("status").filter({ hasText: "Conectado ao GitHub" }).waitFor({ timeout: 8000 }).then(() => true, () => false);
if (!connected) {
  const why = await dialog.getByRole("alert").allInnerTexts();
  console.log("SEM armazenamento seguro neste ambiente:", why.join(" | "));
  check("conectar (precisa de safeStorage)", false, why.join(" | "));
  await app.close();
  server.close();
  finish(sb.remove);
}
check("conectado como ana", (await dialog.innerText()).includes("Conectado como ana"));
check("o token é guardado criptografado, nunca em texto puro", existsSync(`${userData}/github.json`) && !readFileSync(`${userData}/github.json`, "utf8").includes(TOKEN));
await dialog.getByRole("button", { name: "Fechar" }).click();

// ----- listar e ver detalhe -----
await view.getByText("PR cinco").waitFor();
check("a lista mostra o PR aberto", (await view.locator(".pulls-list li").count()) === 1);
await view.getByText("PR cinco").click();
const detail = view.getByLabel("Detalhe do Pull Request");
await detail.getByText("Descrição do cinco").waitFor();
const text = await detail.innerText();
check("o detalhe mostra autor, branches e números", text.includes("bruno") && text.includes("outra → main") && text.includes("+12") && text.includes("4 commit(s)"));

// ----- criar PR da branch atual -----
await view.getByRole("button", { name: "Novo Pull Request" }).click();
await view.getByLabel("Título do Pull Request").fill("Minha feature");
await view.getByLabel("Descrição do Pull Request").fill("Faz coisas");
await view.getByRole("button", { name: "Criar Pull Request" }).click();
await view.getByText("Minha feature").first().waitFor();
check("o PR é criado a partir da branch atual, com a padrão como destino", posts.length === 1 && posts[0].head === "feature" && posts[0].base === "main" && posts[0].title === "Minha feature");
check("a lista é recarregada com o novo PR", (await view.locator(".pulls-list li").count()) === 2);

// ----- desconectar -----
await win.getByRole("button", { name: "Configurações" }).click();
await dialog.getByRole("button", { name: "Desconectar" }).click();
await dialog.getByRole("status").filter({ hasText: "Desconectado" }).waitFor();
check("desconectar apaga o token guardado", await until(() => !existsSync(`${userData}/github.json`)));
await dialog.getByRole("button", { name: "Fechar" }).click();
await view.getByText(/Conecte-se ao GitHub/).waitFor();
check("a tela volta a pedir a conexão", true);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
server.close();
finish(sb.remove);
