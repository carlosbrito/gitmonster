// Abas, estado por aba, recentes e restauração da sessão ao reabrir o app.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { checker, commitFile, fwd, identity, launchApp, openRepoTab, sandbox, stubFolderDialog, until } from "./helpers.mjs";

const { check, finish } = checker("E2E abas e sessão");
const sb = sandbox("tabs");
const userData = `${sb.base}/userdata`;
const repos = {};
for (const name of ["alpha", "beta"]) {
  const dir = `${sb.base}/${name}`;
  mkdirSync(dir);
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  identity(dir);
  commitFile(dir, "f.txt", "um\n", `inicial ${name}`);
  repos[name] = dir;
}
writeFileSync(`${repos.alpha}/f.txt`, "um\nmodificado\n");

const sessionActive = () => {
  try {
    return JSON.parse(readFileSync(`${userData}/session.json`, "utf8")).active ?? "";
  } catch {
    return "";
  }
};

const tab = (win, name) => win.locator(".tab").filter({ hasText: name });
const sessionTabs = () => {
  try {
    return JSON.parse(readFileSync(`${userData}/session.json`, "utf8")).tabs.length;
  } catch {
    return -1;
  }
};

// ---------- 1ª execução ----------
let { app, win, errors } = await launchApp(userData);
await openRepoTab(app, win, repos.alpha);
await win.getByText("Arquivos não staged (1)", { exact: true }).waitFor();
check("abre o primeiro repositório numa aba", (await win.locator(".tab").count()) === 1);

await win.getByRole("button", { name: "Nova aba" }).click();
await win.getByRole("heading", { name: "Recentes" }).waitFor();
check("nova aba mostra a tela inicial com o recente", (await win.locator(".recent").count()) === 1);

await openRepoTab(app, win, repos.beta);
check("segundo repositório abre em outra aba", (await win.locator(".tab").count()) === 2);
check("aba nova fica ativa", (await tab(win, "beta").getAttribute("class")).includes("active"));

// estado por aba: abrir um diff em alpha, ir para beta e voltar
await tab(win, "alpha").locator(".tab-name").click();
await win.locator('.repo-view:visible button.file-open[title="f.txt"]').click();
await win.locator(".repo-view:visible .hunk").first().waitFor();
await tab(win, "beta").locator(".tab-name").click();
check("beta mostra o grafo, não o diff de alpha", (await win.locator(".repo-view:visible .hunk").count()) === 0);
await tab(win, "alpha").locator(".tab-name").click();
check("alpha lembra o diff aberto ao voltar", (await win.locator(".repo-view:visible .hunk").count()) === 1);

// abrir de novo o mesmo repositório não duplica a aba
await win.getByRole("button", { name: "Nova aba" }).click();
await openRepoTab(app, win, repos.alpha);
check("abrir o mesmo repositório reaproveita a aba", (await win.locator(".tab").count()) === 2);
check("a aba existente fica ativa", (await tab(win, "alpha").getAttribute("class")).includes("active"));

// espera a aba ativa também: o salvamento tem debounce, e fechar o app antes dele perderia a troca
check("sessão grava as 2 abas e a ativa", await until(async () => sessionTabs() === 2 && sessionActive().endsWith("/alpha")));
check("sem erros de console/página (1ª execução)", errors.length === 0, JSON.stringify(errors));
await app.close();

// ---------- 2ª execução: restaura ----------
({ app, win, errors } = await launchApp(userData));
await win.locator(".tab").nth(1).waitFor();
check("reabrir restaura as 2 abas", (await win.locator(".tab").count()) === 2);
check("reabrir restaura a aba ativa", (await tab(win, "alpha").getAttribute("class")).includes("active"));
check("a aba restaurada carrega o repositório", await until(async () => (await win.locator(".repo-view:visible").locator(".sb-local").count()) === 1));

// fechar uma aba
await tab(win, "beta").hover(); // o × de aba inativa só aparece sob o cursor
await tab(win, "beta").getByRole("button", { name: "Fechar beta" }).click();
check("fechar aba remove só ela", (await win.locator(".tab").count()) === 1);
check("sessão reflete o fechamento", await until(async () => sessionTabs() === 1));
check("sem erros de console/página (2ª execução)", errors.length === 0, JSON.stringify(errors));
await app.close();

// ---------- 3ª execução: um repositório sumiu ----------
rmSync(repos.alpha, { recursive: true, force: true });
({ app, win, errors } = await launchApp(userData));
await win.getByText(/não existe mais/).waitFor();
check("repositório apagado vira aviso, não erro", true);
check("sem abas e com a tela inicial", (await win.locator(".tab").count()) === 0 && (await win.getByRole("heading", { name: "Recentes" }).count()) === 1);
check("o repositório que ainda existe segue nos recentes", (await win.locator(".recent").count()) === 1);
await stubFolderDialog(app, repos.beta);
await win.locator(".recent").click();
await win.locator(".repo-view:visible").locator(".sb-local").waitFor();
check("abrir um recente cria a aba", (await win.locator(".tab").count()) === 1);
check("sem erros de console/página (3ª execução)", errors.length === 0, JSON.stringify(errors));
await app.close();

finish(() => {
  if (existsSync(sb.base)) sb.remove();
});
