// Splash com o logo: aparece ao iniciar, a janela principal só surge depois de 5 s.
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checker, fwd, projectRoot } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const electronPath = require("electron");

const { check, finish } = checker("E2E splash de abertura");
const userData = fwd(mkdtempSync(join(tmpdir(), "gm-splash-")));

const t0 = Date.now();
// sem GITMONSTER_NO_SPLASH: é o comportamento real do app
const env = { ...process.env, GITMONSTER_USER_DATA: userData };
delete env.GITMONSTER_NO_SPLASH;
const app = await _electron.launch({ executablePath: electronPath, args: [projectRoot], cwd: projectRoot, env });

const windows = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), visible: w.isVisible(), width: w.getBounds().width, frameless: !w.isResizable() })),
  );

// firstWindow pode devolver a principal (escondida) se ela já tiver aparecido: escolhe pela URL.
await app.firstWindow();
const splashPage = app.windows().find((p) => p.url().includes("splash"));
await splashPage.waitForLoadState("domcontentloaded");
const tSplash = Date.now() - t0;

const logo = splashPage.locator("img");
check("a splash mostra o logo do GitMonster", (await logo.getAttribute("alt")) === "GitMonster — Unleash your commits");
check("o logo carregou de verdade", await logo.evaluate((img) => img.complete && img.naturalWidth > 100));
await splashPage.screenshot({ path: join(tmpdir(), "gitmonster-splash.png") });

let state = await windows();
check("no começo só a splash está visível", state.filter((w) => w.visible).length === 1 && state.length === 2);

// janela principal: espera aparecer e mede quanto tempo a splash durou
let mainShownAt = null;
while (Date.now() - t0 < 20_000) {
  state = await windows().catch(() => []);
  if (state.some((w) => w.visible && w.width >= 1000)) {
    mainShownAt = Date.now();
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}
check("a janela principal aparece", mainShownAt !== null);
const splashMs = mainShownAt - t0 - tSplash * 0; // desde o início do processo
console.log(`splash visível por ~${((mainShownAt - t0) / 1000).toFixed(1)} s desde o launch`);
check("a splash dura cerca de 5 s (4,5 a 9 s contando a partida do processo)", splashMs >= 4500 && splashMs <= 9000, `${(splashMs / 1000).toFixed(1)} s`);

state = await windows();
check("a splash fecha quando a principal aparece", state.length === 1 && state[0].visible);

// o app principal funciona normalmente depois da splash
const main = app.windows().find((p) => !p.url().includes("splash"));
await main.waitForLoadState("domcontentloaded");
await main.getByRole("button", { name: "Abrir repositório…" }).waitFor();
check("a tela inicial do app aparece depois da splash", true);

await app.close();
finish();
