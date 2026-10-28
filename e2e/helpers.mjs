// Utilitários dos testes ponta a ponta: sobem o app Electron de verdade (playwright-core),
// trocam o diálogo nativo de pasta e montam repositórios Git de fixture em pastas temporárias.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const electronPath = require("electron");

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** O git e o app preferem barras normais, mesmo no Windows. */
export const fwd = (p) => p.split("\\").join("/");

export const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export function identity(cwd) {
  for (const [k, v] of [
    ["user.name", "E2E"],
    ["user.email", "e2e@example.com"],
    ["core.autocrlf", "false"],
    ["commit.gpgsign", "false"],
  ]) {
    git(cwd, "config", k, v);
  }
}

export function commitFile(cwd, name, content, message) {
  writeFileSync(join(cwd, name), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", message);
  return git(cwd, "rev-parse", "HEAD").trim();
}

/** Pasta temporária com `remote.git` (bare), `work` (repositório aberto no app) e `other` (outra pessoa). */
export function sandbox(prefix) {
  const base = fwd(mkdtempSync(join(tmpdir(), `gm-${prefix}-`)));
  return {
    base,
    remote: `${base}/remote.git`,
    work: `${base}/work`,
    other: `${base}/other`,
    remove: () => rmSync(base, { recursive: true, force: true }),
  };
}

export function initWorkWithRemote(sb, firstCommit = ["f.txt", "um\ndois\ntres\n", "inicial"]) {
  execFileSync("git", ["init", "--bare", "-b", "main", sb.remote], { stdio: "ignore" });
  execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
  identity(sb.work);
  commitFile(sb.work, ...firstCommit);
  git(sb.work, "remote", "add", "origin", sb.remote);
  git(sb.work, "push", "-u", "origin", "main");
}

export function cloneOther(sb) {
  // clonar com autocrlf=false: o global do Windows (true) faria o clone parecer modificado
  execFileSync("git", ["clone", "-c", "core.autocrlf=false", sb.remote, sb.other], { stdio: "ignore" });
  identity(sb.other);
}

export const until = async (fn, ms = 10000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if (await fn()) return true;
    } catch {
      /* ainda não */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
};

/** Registra checks e termina o processo com o código certo. */
export function checker(title) {
  let ok = true;
  return {
    check(name, cond, extra = "") {
      console.log(cond ? "OK  " : "FALHA", name, extra);
      if (!cond) ok = false;
    },
    finish(cleanup) {
      cleanup?.();
      console.log(ok ? `\n${title}: TUDO OK` : `\n${title}: HOUVE FALHAS`);
      process.exit(ok ? 0 : 1);
    },
  };
}

/** Sobe o app, troca o diálogo de pasta para devolver `repoPath` e abre o repositório. */
/** Sobe o app com uma pasta de dados própria (a sessão não vaza entre testes nem toca a do usuário). */
export async function launchApp(userData = fwd(mkdtempSync(join(tmpdir(), "gm-userdata-"))), { splash = false } = {}) {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [projectRoot],
    cwd: projectRoot,
    // Sem a splash de 5 s, senão cada cenário esperaria 5 s e a primeira janela seria a splash.
    env: { ...process.env, GITMONSTER_USER_DATA: userData, ...(splash ? {} : { GITMONSTER_NO_SPLASH: "1" }) },
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await win.waitForLoadState("domcontentloaded");
  return { app, win, errors, userData };
}

/** Troca o diálogo nativo de pasta para devolver `paths` (um por chamada, repetindo o último). */
export const stubFolderDialog = (app, ...paths) =>
  app.evaluate(({ dialog }, list) => {
    let i = 0;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [list[Math.min(i++, list.length - 1)]] });
  }, paths);

/** Abre um repositório pela tela inicial e espera a sidebar carregar. */
export async function openRepoTab(app, win, repoPath) {
  await stubFolderDialog(app, repoPath);
  await win.getByText("Abrir repositório…").click();
  await win.locator(".repo-view:visible .sb-local").waitFor();
}

/** Sobe o app, troca o diálogo de pasta para devolver `repoPath` e abre o repositório. */
export async function openApp(repoPath, userData) {
  const { app, win, errors, userData: dataDir } = await launchApp(userData);
  await openRepoTab(app, win, repoPath);
  return { app, win, errors, userData: dataDir };
}

export const waitIdle = async (win) => {
  await new Promise((r) => setTimeout(r, 300));
  await until(async () => (await win.getByText("trabalhando…").count()) === 0);
};

/**
 * Seleciona um commit clicando na linha dele no canvas. O grafo só reflete o repositório depois que
 * o app termina de recarregar; sem esperar, o clique cairia em outra linha. Falha se a seleção divergir.
 */
/**
 * Posição (em coordenadas da janela) da linha de um commit no grafo. Com alterações não commitadas o grafo ganha a
 * linha "// WIP" logo acima do commit de HEAD, o que desloca os commits dali para baixo uma linha.
 */
export async function graphPoint(win, repo, hash) {
  const order = git(repo, "log", "--all", "--date-order", "--format=%H").trim().split("\n");
  let index = order.indexOf(hash);
  if (index < 0) throw new Error(`commit fora do grafo: ${hash}`);
  if (git(repo, "status", "--porcelain").trim() !== "") {
    const head = Math.max(0, order.indexOf(git(repo, "rev-parse", "HEAD").trim()));
    if (index >= head) index++;
  }
  const box = await win.locator(".graph-scroll").boundingBox();
  return { x: box.x + Math.min(600, box.width - 60), y: box.y + index * 28 + 14 };
}

export async function selectCommit(win, repo, hash) {
  await waitIdle(win);
  const { x, y } = await graphPoint(win, repo, hash);
  await win.mouse.click(x, y);
  await win.locator(".commit-panel code").first().waitFor();
  const matched = await until(async () => (await win.locator(".commit-panel code").first().innerText()).trim() === hash);
  if (!matched) throw new Error(`a seleção no grafo não corresponde ao commit esperado ${hash.slice(0, 7)}`);
}

/**
 * Espera a modal de erro, expande os detalhes, fecha e devolve o texto visto (título, mensagem e erro completo).
 * A modal é bloqueante: sem fechar, os próximos cliques do cenário não chegariam à tela.
 */
export async function readErrorDialog(win) {
  const dialog = win.locator("dialog.error-dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Ver detalhes" }).click();
  const text = await dialog.innerText();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  return text;
}

export const dialogButton = (win, label) => win.locator("dialog").getByRole("button", { name: label, exact: true });
export const refRow = (win, name) => win.locator("li.ref").filter({ hasText: name }).first();

const cdpSessions = new WeakMap();

/**
 * Arrasta de verdade: mouse real (via CDP) com o arraste interceptado, como o Playwright faz no Chromium.
 * (O `mouse` do Playwright sozinho prende o Electron no laço nativo de arrastar do sistema.)
 * Parte do centro de `source`, passa por um deslocamento para o navegador iniciar o drag e solta em `targetPoint`
 * (ou no centro de `target`). Devolve `{ started, overClass }`: se o navegador iniciou o arraste e a classe do alvo
 * no momento do dragover (para conferir o destaque).
 */
export async function realDrag(win, source, target, { targetPoint } = {}) {
  let cdp = cdpSessions.get(win);
  if (!cdp) {
    cdp = await win.context().newCDPSession(win);
    await cdp.send("Input.setInterceptDrags", { enabled: true });
    cdpSessions.set(win, cdp);
  }
  let data = null;
  const onIntercept = (e) => {
    data = e.data;
  };
  cdp.on("Input.dragIntercepted", onIntercept);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  const sx = sb.x + sb.width / 2;
  const sy = sb.y + sb.height / 2;
  const tx = targetPoint ? targetPoint.x : tb.x + tb.width / 2;
  const ty = targetPoint ? targetPoint.y : tb.y + tb.height / 2;

  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sx, y: sy });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: sx, y: sy, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sx + i * 3, y: sy + i * 4, button: "left", buttons: 1 });
    await sleep(40);
  }
  await sleep(250);

  let overClass = "";
  if (data) {
    await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", x: tx, y: ty, data });
    await cdp.send("Input.dispatchDragEvent", { type: "dragOver", x: tx, y: ty, data });
    await sleep(150);
    overClass = await target.evaluate((el) => el.className).catch(() => "");
    await cdp.send("Input.dispatchDragEvent", { type: "drop", x: tx, y: ty, data });
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tx, y: ty, button: "left", buttons: 0, clickCount: 1 });
  cdp.off("Input.dragIntercepted", onIntercept);
  await sleep(300);
  return { started: data !== null, overClass: String(overClass) };
}

/** Fetch fica no menu da seta do botão Pull. */
export const fetchAll = async (win) => {
  await win.getByRole("button", { name: "Opções do Pull" }).click();
  await win.getByRole("menuitem", { name: "Fetch" }).click();
};

/** Escolhe o modo do pull no menu da seta do botão Pull ("Somente fast-forward", "Merge" ou "Rebase"). */
export const setPullMode = async (win, label) => {
  await win.getByRole("button", { name: "Opções do Pull" }).click();
  await win.getByRole("menuitemradio", { name: label }).click();
};

/** Force push fica no menu da seta do botão Push. */
export const forcePushMenu = async (win) => {
  await win.getByRole("button", { name: "Opções do Push" }).click();
  await win.getByRole("menuitem", { name: "Force push" }).click();
};

/** A busca de commits fica escondida até o botão Pesquisar (ou Ctrl+F). */
export const openSearchBar = async (win) => {
  await win.getByRole("button", { name: "Pesquisar" }).click();
};

/** Cria uma branch pelo botão Branch da barra de ferramentas (a sidebar não tem mais o campo). */
export const createBranchViaToolbar = async (win, name) => {
  await win.getByRole("button", { name: "Branch", exact: true }).click();
  await win.getByLabel("Nome da branch").fill(name);
  await dialogButton(win, "Criar").click();
};
