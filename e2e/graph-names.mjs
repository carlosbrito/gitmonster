// Grafo: nome completo das etiquetas, coluna automática e screenshot do visual.
import { checker, commitFile, git, initWorkWithRemote, openApp, sandbox } from "./helpers.mjs";

const { check, finish } = checker("E2E nomes completos no grafo");
const sb = sandbox("graphnames");
initWorkWithRemote(sb);
const longName = "feature/ABC-1234-um-nome-de-branch-bem-comprido-para-testar";
git(sb.work, "switch", "-c", longName);
commitFile(sb.work, "a.txt", "a\n", "na longa");

const { app, win, errors } = await openApp(sb.work);
await win.locator(".graph-scroll").waitFor();
const header = win.locator(".graph-header");
const widthOf = async () => Number((await header.evaluate((el) => el.style.gridTemplateColumns)).split("px")[0]);
check("a coluna BRANCH / TAG cresceu além do padrão para caber o nome", await (async () => {
  for (let i = 0; i < 20; i++) {
    if ((await widthOf()) > 270) return true;
    await win.waitForTimeout(200);
  }
  return false;
})(), String(await widthOf()));
await win.screenshot({ path: process.env.GRAPH_SHOT ?? `${sb.work}/../graph-names.png` });
check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
