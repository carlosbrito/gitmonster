// Teste de fumaça do app EMPACOTADO (release/win-unpacked): abre, carrega o renderer e responde ao IPC.
// Requer `npm run dist:dir` (ou `npm run dist`) antes. Uso: node e2e/packaged.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checker, fwd, projectRoot } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const { check, finish } = checker("E2E app empacotado");

const exe = join(projectRoot, "release", "win-unpacked", "GitMonster.exe");
if (!existsSync(exe)) {
  console.log(`Não achei ${exe}. Rode "npm run dist:dir" primeiro.`);
  process.exit(2);
}

const base = fwd(mkdtempSync(join(tmpdir(), "gm-pkg-")));
const repo = `${base}/repo`;
execFileSync("git", ["init", "-b", "main", repo], { stdio: "ignore" });
execFileSync("git", ["-C", repo, "-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "--allow-empty", "-m", "primeiro commit"], { stdio: "ignore" });
writeFileSync(`${repo}/novo.txt`, "x\n");

// O feed embutido aponta para as releases públicas e não carrega credencial.
const feed = readFileSync(join(projectRoot, "release", "win-unpacked", "resources", "app-update.yml"), "utf8");
check("o feed embutido aponta para carlosbrito/gitmonster-releases", /provider: github/.test(feed) && /owner: carlosbrito/.test(feed) && /repo: gitmonster-releases/.test(feed), feed);
check("o feed embutido não tem token", !/token|gh[pousr]_|github_pat_/i.test(feed));

// Feed alternativo inalcançável: testa que o electron-updater carrega do pacote sem depender da internet.
const app = await _electron.launch({
  executablePath: exe,
  env: { ...process.env, GITMONSTER_USER_DATA: `${base}/userdata`, GITMONSTER_NO_SPLASH: "1", GITMONSTER_UPDATE_URL: "https://127.0.0.1:9/updates" },
});
const win = await app.firstWindow();
const errors = [];
win.on("pageerror", (e) => errors.push(e.message));
win.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await win.waitForLoadState("domcontentloaded");

check("o app está empacotado", await app.evaluate(({ app: a }) => a.isPackaged));
check("a janela abre com o título certo", (await win.title()) === "GitMonster");
await win.getByRole("button", { name: "Abrir repositório…" }).waitFor();

await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
}, repo);
await win.getByRole("button", { name: "Abrir repositório…" }).click();
await win.locator(".repo-view:visible").locator(".sb-local").waitFor();
check("abre um repositório (IPC, git e zod funcionando no pacote)", true);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
check("lê o status do Git", true);

// o electron-updater precisa carregar de dentro do pacote: com um servidor https inexistente, tenta consultar e falha por rede
await win.getByRole("button", { name: "Configurações" }).click();
const dialog = win.getByRole("dialog", { name: "Configurações" });
await dialog.getByRole("button", { name: "Verificar agora" }).click();
const state = dialog.getByLabel("Estado da atualização");
await state.filter({ hasText: /\S/ }).waitFor();
await new Promise((r) => setTimeout(r, 3000));
const text = (await state.innerText()).trim();
console.log("estado da atualização:", text);
check("a atualização consulta o servidor (não diz que está desligada)", text !== "" && !/instalado/.test(text) && text !== "Verificando…", text);
check("erro de verificação não aparece como faixa na janela", (await win.getByRole("status", { name: "Atualização do GitMonster" }).count()) === 0);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();

// splash do app empacotado (carregada com loadFile de dentro do pacote): aparece com o logo
const env = { ...process.env, GITMONSTER_USER_DATA: `${base}/userdata2` };
delete env.GITMONSTER_NO_SPLASH;
const withSplash = await _electron.launch({ executablePath: exe, env });
const splash = await withSplash.firstWindow();
await splash.waitForLoadState("domcontentloaded");
const logo = splash.locator("img");
check("a splash empacotada mostra o logo", await logo.evaluate((img) => img.complete && img.naturalWidth > 100));
check("a splash tem o título do app", (await splash.title()) === "GitMonster");
await withSplash.close();
finish();
