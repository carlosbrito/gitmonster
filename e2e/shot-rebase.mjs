// Tira um screenshot do diálogo de rebase interativo (verificação visual; não faz parte do run.mjs).
// Uso: node e2e/shot-rebase.mjs <caminho.png>
import { commitFile, git, initWorkWithRemote, openApp, sandbox, selectCommit } from "./helpers.mjs";
import { checker } from "./helpers.mjs";

const { finish } = checker("shot rebase");
const out = process.argv[2];
if (!out) throw new Error("informe o caminho do .png");

const sb = sandbox("shot");
initWorkWithRemote(sb);
git(sb.work, "switch", "-c", "feat");
commitFile(sb.work, "a.txt", "a\n", "c1: cria a");
commitFile(sb.work, "b.txt", "b\n", "c2: cria b com um assunto bem comprido para testar o corte do texto");
commitFile(sb.work, "c.txt", "c\n", "c3: cria c");

const { app, win } = await openApp(sb.work);
await selectCommit(win, sb.work, git(sb.work, "rev-list", "--max-parents=0", "main").trim());
await win.getByRole("button", { name: "Rebase interativo" }).click();
await win.getByText("Rebase interativo sobre").waitFor();
await win.getByLabel("Ação de c2: cria b com um assunto bem comprido para testar o corte do texto").selectOption("fixup");
await win.screenshot({ path: out });
await app.close();
finish(sb.remove);
