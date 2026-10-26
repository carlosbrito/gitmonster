import { getStatus, runGit } from "./GitService";
import { assertSafePath, buildHunkPatch, parseDiff, rawDiff, STALE } from "./WorkTree";
import type { HunkRef } from "../../shared/types";

/**
 * Descarta alterações NÃO staged. O renderer só diz quais caminhos; quem decide o que fazer com cada um
 * (restaurar do índice ou apagar o arquivo novo) é o main, olhando o status atual.
 * Conflitados e caminhos sem alteração na árvore de trabalho são ignorados.
 */
export async function discardPaths(root: string, paths: readonly string[]): Promise<void> {
  const wanted = new Set(paths.map(assertSafePath));
  if (wanted.size === 0) return;

  const { files } = await getStatus(root);
  const restore: string[] = [];
  const clean: string[] = [];
  for (const f of files) {
    if (!wanted.has(f.path) || f.conflicted) continue;
    if (f.untracked) clean.push(f.path);
    else if (f.worktree !== " ") restore.push(f.path);
  }

  // `restore` sem --staged traz a versão do índice para o disco: o que já está no stage permanece.
  if (restore.length > 0) await runGit(root, ["restore", "--", ...restore]);
  if (clean.length > 0) await runGit(root, ["clean", "-f", "-d", "--", ...clean]);
}

/** Desfaz um hunk da árvore de trabalho aplicando-o ao contrário no disco (não mexe no índice). */
export async function discardHunk(root: string, ref: HunkRef): Promise<void> {
  const parsed = parseDiff(await rawDiff(root, { path: ref.path, staged: false, untracked: false }));
  if (parsed.binary) throw new Error("Arquivo binário não suporta descartar por hunk.");
  if (parsed.hunks[ref.hunkIndex]?.header !== ref.hunkHeader) throw new Error(STALE);
  const patch = buildHunkPatch(parsed, ref.hunkIndex);
  await runGit(root, ["apply", "--reverse", "--whitespace=nowarn", "-"], { input: patch });
}
