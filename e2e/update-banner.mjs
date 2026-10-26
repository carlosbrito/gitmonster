// Faixa de atualização: o main empurra o estado (simulado aqui) e a janela só avisa; baixar e reiniciar são pedidos do usuário.
import { checker, launchApp, until } from "./helpers.mjs";

const { check, finish } = checker("E2E aviso de atualização");
// A faixa fica acima das abas: vale também na tela inicial, sem repositório aberto.
const { app, win, errors } = await launchApp();
await win.getByText("Abrir repositório…").waitFor();

const banner = win.getByRole("status", { name: "Atualização do GitMonster" });
/** Simula o main avisando uma mudança de estado do atualizador. */
const push = (state) => app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("updater:changed", s)), state);
// Troca os handlers de baixar/instalar por versões que só registram o pedido (em desenvolvimento não há app instalado).
await app.evaluate(({ ipcMain }) => {
  globalThis.__calls = [];
  ipcMain.removeHandler("updater:download");
  ipcMain.removeHandler("updater:install");
  ipcMain.handle("updater:download", () => (globalThis.__calls.push("download"), { status: "downloading", percent: 0 }));
  ipcMain.handle("updater:install", () => void globalThis.__calls.push("install"));
});
const calls = () => app.evaluate(() => globalThis.__calls);

check("sem versão nova, nada aparece", (await banner.count()) === 0);
await push({ status: "error", message: "net::ERR_INTERNET_DISCONNECTED" });
await win.waitForTimeout(300);
check("erro da verificação automática fica quieto", (await banner.count()) === 0);

await push({ status: "available", version: "9.9.0", notes: "Novidade A\n• item B" });
await banner.waitFor();
check("avisa a versão nova", (await banner.innerText()).includes("GitMonster 9.9.0 disponível"));
check("não baixa sozinho", (await calls()).length === 0);

await banner.getByRole("button", { name: "Ver novidades" }).click();
const notes = win.getByRole("dialog", { name: "Novidades do GitMonster 9.9.0" });
await notes.waitFor();
check("mostra as notas como texto", (await notes.innerText()).includes("• item B"));
await notes.getByRole("button", { name: "Fechar" }).click();

await banner.getByRole("button", { name: "Depois" }).click();
check("Depois esconde a faixa", await until(async () => (await banner.count()) === 0));
await push({ status: "available", version: "9.9.0", notes: "" });
await win.waitForTimeout(300);
check("a mesma versão não volta a aparecer", (await banner.count()) === 0);
await push({ status: "available", version: "9.10.0", notes: "" });
await banner.waitFor();
check("uma versão maior aparece de novo", (await banner.innerText()).includes("9.10.0"));

await banner.getByRole("button", { name: "Atualizar" }).click();
check("Atualizar pede o download", await until(async () => (await calls()).includes("download")));
await push({ status: "downloading", percent: 37 });
check("mostra o progresso", await until(async () => (await banner.innerText()).includes("37%")));
await push({ status: "error", message: "conexão caiu", version: "9.10.0" });
check("falha no download oferece tentar de novo", await until(async () => (await banner.getByRole("button", { name: "Tentar de novo" }).count()) === 1));
await push({ status: "ready", version: "9.10.0" });
await banner.getByRole("button", { name: "Reiniciar agora" }).waitFor();
check("pronta: avisa que instala ao fechar", (await banner.innerText()).includes("instalado ao fechar"));
await banner.getByRole("button", { name: "Reiniciar agora" }).click();
check("Reiniciar agora pede a instalação", await until(async () => (await calls()).includes("install")));

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish();
