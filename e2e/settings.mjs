// Configurações: tema, perfil do Git (global e do repositório) e editor externo.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checker, commitFile, fwd, git, identity, launchApp, openRepoTab, sandbox, until } from "./helpers.mjs";

const { check, finish } = checker("E2E configurações");
const sb = sandbox("settings");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
commitFile(sb.work, "a.txt", "x\n", "base");
writeFileSync(`${sb.work}/a.txt`, "mudou\n");

// o app e o git enxergam um "global" descartável: o ~/.gitconfig do usuário nunca é tocado
const globalConfig = fwd(join(mkdtempSync(join(tmpdir(), "gm-gcfg-")), "global.gitconfig"));
writeFileSync(globalConfig, "");
process.env.GIT_CONFIG_GLOBAL = globalConfig;

const userData = `${sb.base}/userdata`;
const { app, win, errors } = await launchApp(userData);
await openRepoTab(app, win, sb.work);
// o Playwright emula prefers-color-scheme: light por padrão; sem isso a página não reflete o tema do app
await win.emulateMedia({ colorScheme: null });
const settingsFile = () => JSON.parse(readFileSync(`${userData}/settings.json`, "utf8"));
const dialog = win.getByRole("dialog", { name: "Configurações" });
const status = dialog.getByRole("status");
const prefersDark = () => win.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);

await win.getByRole("button", { name: "Configurações" }).click();
await dialog.getByLabel("Tema").waitFor();

// ----- tema -----
await dialog.getByLabel("Tema").selectOption("dark");
await dialog.getByRole("button", { name: "Salvar configurações" }).click();
await status.filter({ hasText: "Configurações salvas" }).waitFor();
check("o tema escuro é gravado no arquivo", settingsFile().theme === "dark");
check("a página passa a usar o esquema escuro", await until(prefersDark));

await dialog.getByLabel("Tema").selectOption("light");
await dialog.getByRole("button", { name: "Salvar configurações" }).click();
check("o tema claro é aplicado", await until(async () => !(await prefersDark())));

// ----- atualizações (em desenvolvimento não há app instalado) -----
check("mostra a versão instalada", await until(async () => /Versão instalada: \d+\.\d+\.\d+/.test(await dialog.innerText())));
check("não há mais campo de servidor de atualizações", (await dialog.getByLabel("Servidor de atualizações").count()) === 0);
await dialog.getByRole("button", { name: "Verificar agora" }).click();
await dialog.getByLabel("Estado da atualização").filter({ hasText: "só funciona no app instalado" }).waitFor();
check("fora do app instalado, a atualização explica que está desligada", true);
check("o arquivo de configurações não guarda URL de atualização", !("updateUrl" in settingsFile()));

// ----- perfil do Git -----
await dialog.getByLabel("Escopo do perfil").selectOption("global");
await dialog.getByLabel("Nome do autor").fill("Ana Global");
await dialog.getByLabel("E-mail do autor").fill("ana@global.test");
await dialog.getByRole("button", { name: "Salvar perfil" }).click();
await status.filter({ hasText: "Perfil global salvo" }).waitFor();
check("perfil global gravado só no arquivo isolado", readFileSync(globalConfig, "utf8").includes("ana@global.test"));

await dialog.getByLabel("Escopo do perfil").selectOption("local");
await dialog.getByLabel("Nome do autor").fill("Ana Repo");
await dialog.getByLabel("E-mail do autor").fill("ana@repo.test");
await dialog.getByRole("button", { name: "Salvar perfil" }).click();
await status.filter({ hasText: "Perfil do repositório salvo" }).waitFor();
check("perfil do repositório gravado no .git/config", git(sb.work, "config", "--local", "user.email").trim() === "ana@repo.test");
check("o texto mostra o perfil efetivo (o local vence)", (await dialog.innerText()).includes("Ana Repo"));

await dialog.getByLabel("E-mail do autor").fill("sem-arroba");
await dialog.getByRole("button", { name: "Salvar perfil" }).click();
await dialog.getByRole("alert").filter({ hasText: "E-mail inválido" }).waitFor();
check("e-mail inválido é recusado", git(sb.work, "config", "--local", "user.email").trim() === "ana@repo.test");

// ----- editor externo -----
await dialog.getByLabel("Tema").selectOption("dark"); // fica escuro para provar a persistência depois
await dialog.getByLabel("Editor externo").fill("C:\\nao\\existe\\editor.exe");
await dialog.getByRole("button", { name: "Salvar configurações" }).click();
await status.filter({ hasText: "Configurações salvas" }).waitFor();
check("o editor é gravado", settingsFile().editor === "C:\\nao\\existe\\editor.exe");
await dialog.getByRole("button", { name: "Fechar" }).click();

await win.locator("li.file").filter({ hasText: "a.txt" }).click({ button: "right" });
await win.getByRole("menu").getByRole("menuitem", { name: "Abrir no editor" }).click();
await win.locator('[role="alert"]').filter({ hasText: "não encontrado" }).waitFor();
check("editor inexistente dá um erro claro", true);

// o tema escolhido sobrevive ao reiniciar
await app.close();
const second = await launchApp(userData);
await second.win.emulateMedia({ colorScheme: null });
check("o tema escuro é reaplicado ao reabrir o app", await until(() => second.win.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)));
check("sem erros de console/página", errors.length === 0 && second.errors.length === 0, JSON.stringify([...errors, ...second.errors]));
await second.app.close();
finish(sb.remove);
