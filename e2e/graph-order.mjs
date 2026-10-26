// Grafo em ordem de data: branches paralelas aparecem intercaladas e o grafo continua estreito; screenshot do visual.
import { execFileSync } from "node:child_process";
import { checker, git, initWorkWithRemote, openApp, sandbox, selectCommit, waitIdle } from "./helpers.mjs";

const { check, finish } = checker("E2E ordem do grafo");
const sb = sandbox("graphorder");
initWorkWithRemote(sb);

// datas fixas e crescentes, para que a ordem por data seja diferente da ordem topológica
let minute = 0;
const dated = (...args) => {
  const date = `@${1767225600 + ++minute * 60} +0000`;
  execFileSync("git", args, { cwd: sb.work, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  return git(sb.work, "rev-parse", "HEAD").trim();
};
// três releases andando em paralelo, com commits intercalados no tempo, todas mescladas em main no fim
const releases = ["r1", "r2", "r3"];
for (const r of releases) git(sb.work, "branch", r);
const tips = {};
for (let round = 1; round <= 3; round++) {
  for (const r of releases) {
    git(sb.work, "checkout", "-q", r);
    tips[`${r}.${round}`] = dated("commit", "-q", "--allow-empty", "-m", `${r} rodada ${round}`);
  }
}
git(sb.work, "checkout", "-q", "main");
for (const r of releases) dated("merge", "-q", "--no-ff", r, "-m", `merge ${r}`);

const order = (flag) => git(sb.work, "log", "--all", flag, "--format=%H").trim().split("\n");
const picks = ["r1.3", "r3.2", "r2.1"];
check(
  "no cenário, a ordem por data difere da topológica nos commits conferidos",
  picks.some((k) => order("--date-order").indexOf(tips[k]) !== order("--topo-order").indexOf(tips[k])),
);

const { app, win, errors } = await openApp(sb.work);
await waitIdle(win);

// `selectCommit` calcula a linha pela ordem de `git log --date-order`: se o app usasse outra ordem, o clique cairia em outro commit
for (const key of picks) {
  let ok = true;
  try {
    await selectCommit(win, sb.work, tips[key]);
  } catch {
    ok = false;
  }
  check(`o commit ${key} está na linha da ordem por data`, ok);
}

// 4 pistas = main + 3 releases; largura = 2 × 12 de margem + 22 por pista
const graphW = Number((await win.locator(".graph-header").evaluate((el) => el.style.gridTemplateColumns)).split("px")[1]?.trim() || 0);
check("o grafo fica estreito (no máximo 4 pistas)", graphW > 0 && graphW <= 12 * 2 + 4 * 22, String(graphW));

await win.screenshot({ path: process.env.GRAPH_SHOT ?? `${sb.base}/graph-order.png` });
check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await app.close();
finish(sb.remove);
