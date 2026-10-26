// Stage por hunk, diff e commit pela interface.
import { writeFileSync } from "node:fs";
import { checker, commitFile, git, identity, openApp, sandbox, until } from "./helpers.mjs";
import { execFileSync } from "node:child_process";

const { check, finish } = checker("E2E working tree");
const sb = sandbox("wt");
execFileSync("git", ["init", "-b", "main", sb.work], { stdio: "ignore" });
identity(sb.work);
const base = Array.from({ length: 30 }, (_, i) => `linha ${i + 1}`);
commitFile(sb.work, "f.txt", base.join("\n") + "\n", "base");
const edited = [...base];
edited[1] = "linha 2 EDITADA";
edited[27] = "linha 28 EDITADA";
writeFileSync(`${sb.work}/f.txt`, edited.join("\n") + "\n");
writeFileSync(`${sb.work}/novo.txt`, "arquivo novo\n");

const { app, win, errors } = await openApp(sb.work);
await win.getByText("Arquivos não staged (2)", { exact: true }).waitFor();

await win.locator('button.file-open[title="f.txt"]').click();
await win.locator(".hunk").nth(1).waitFor();
check("diff mostra 2 hunks", (await win.locator(".hunk").count()) === 2);

await win.locator(".hunk").nth(1).getByText("Stage hunk").click();
await win.getByText("Arquivos staged (1)", { exact: true }).waitFor();
const cached = git(sb.work, "diff", "--cached", "-U0");
const worktree = git(sb.work, "diff", "-U0");
check("stage hunk: só a linha 28 no stage", cached.includes("+linha 28 EDITADA") && !cached.includes("linha 2 EDITADA"));
check("stage hunk: linha 2 continua só no worktree", worktree.includes("+linha 2 EDITADA") && !worktree.includes("linha 28 EDITADA"));

await win.getByRole("button", { name: "← Grafo" }).click();
await win.getByLabel("Resumo do commit").fill("fix: ajusta linha 28");
await win.getByRole("button", { name: "Commit Changes" }).click();
await win.getByText("Arquivos staged (0)", { exact: true }).waitFor();
check("commit criado com a mensagem", git(sb.work, "log", "-1", "--format=%s").trim() === "fix: ajusta linha 28");
check("commit contém só a linha 28", !git(sb.work, "show", "HEAD", "-U0").includes("linha 2 EDITADA"));
const status = git(sb.work, "status", "--porcelain");
check("linha 2 e arquivo novo seguem pendentes", status.includes(" M f.txt") && status.includes("?? novo.txt"));

await win.locator('button.file-open[title="novo.txt"]').click();
await win.locator(".hunk").first().waitFor();
check(
  "arquivo novo: diff só de adição, sem botão de hunk",
  (await win.locator(".dl-add").count()) === 1 && (await win.getByText("Stage hunk").count()) === 0,
);

check("sem erros de console/página", errors.length === 0, JSON.stringify(errors));
await until(async () => true);
await app.close();
finish(sb.remove);
