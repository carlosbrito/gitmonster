// Executa os cenários e2e em sequência (cada um em processo próprio) e agrega o resultado.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const scenarios = ["working-tree.mjs", "branches.mjs", "history.mjs", "tabs.mjs", "discard.mjs", "start.mjs", "pull.mjs", "menus.mjs", "undo.mjs", "conflicts.mjs", "diff.mjs", "search.mjs", "fileview.mjs", "remotes.mjs", "branch-search.mjs", "sidebar.mjs", "header.mjs", "graph-reveal.mjs", "changes-panel.mjs", "settings.mjs", "github.mjs", "ai.mjs", "dragmerge.mjs", "monitor.mjs", "graph.mjs", "graph-names.mjs", "graph-order.mjs","panels.mjs", "update-banner.mjs", "post-merge.mjs", "sidebar-layout.mjs", "splash.mjs"];
let failed = 0;

for (const file of scenarios) {
  console.log(`\n=== ${file}`);
  const result = spawnSync(process.execPath, [join(dir, file)], { stdio: "inherit" });
  if (result.status !== 0) failed++;
}

console.log(failed === 0 ? "\nE2E: todos os cenários passaram" : `\nE2E: ${failed} cenário(s) falharam`);
process.exit(failed === 0 ? 0 : 1);
