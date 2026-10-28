import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hasConflictMarkers } from "../../shared/conflict";
import type { ConflictFile, ConflictKind, ConflictSide, FileChange, RepoStatus } from "../../shared/types";
import { conflictSides } from "./ConflictSides";
import { getStatus, GitError, runGit } from "./GitService";
import { assertSafePath } from "./WorkTree";

const MAX_BYTES = 5 * 1024 * 1024;

/** XY do porcelain (coluna do índice e da árvore) → tipo de conflito. */
function kindOf(f: FileChange): ConflictKind {
  const xy = `${f.index}${f.worktree}`;
  switch (xy) {
    case "UU":
      return "both-modified";
    case "AA":
      return "added-by-both";
    case "DU":
      return "deleted-by-us";
    case "UD":
      return "deleted-by-them";
    case "AU":
      return "added-by-us";
    case "UA":
      return "added-by-them";
    case "DD":
      return "deleted-by-both";
    default:
      return "both-modified";
  }
}

/** Só caminhos que o Git marca como conflitados passam: o renderer não consegue gravar em arquivo qualquer. */
async function findConflicted(root: string, path: string): Promise<{ file: FileChange; status: RepoStatus }> {
  const safe = assertSafePath(path);
  const status = await getStatus(root);
  const file = status.files.find((f) => f.conflicted && f.path === safe);
  if (!file) throw new Error("Este arquivo não está em conflito.");
  return { file, status };
}

async function requireConflicted(root: string, path: string): Promise<FileChange> {
  return (await findConflicted(root, path)).file;
}

/** Lê o arquivo em conflito como o Git o deixou (com marcadores). Binário, grande ou não-UTF-8 não são editáveis. */
export async function getConflict(root: string, path: string): Promise<ConflictFile> {
  const { file, status } = await findConflicted(root, path);
  const kind = kindOf(file);
  const base = { path: file.path, kind, operation: status.operation, sides: await conflictSides(root, status) };
  let buffer: Buffer;
  try {
    buffer = await readFile(join(root, file.path));
  } catch {
    return { ...base, content: "", editable: false, reason: "O arquivo não existe no disco (foi removido por um dos lados)." };
  }
  if (buffer.length > MAX_BYTES) {
    return { ...base, content: "", editable: false, reason: "Arquivo grande demais para o editor de conflitos." };
  }
  const content = buffer.toString("utf8");
  if (buffer.includes(0) || !Buffer.from(content, "utf8").equals(buffer)) {
    return { ...base, content: "", editable: false, reason: "Arquivo binário ou fora de UTF-8: escolha uma das versões inteiras." };
  }
  if (!hasConflictMarkers(content)) {
    return { ...base, content, editable: false, reason: "Não há marcadores de conflito no arquivo: escolha uma das versões inteiras." };
  }
  return { ...base, content, editable: true, reason: null };
}

/** Grava o resultado montado no editor e coloca o arquivo no stage (marca como resolvido). */
export async function resolveConflict(root: string, path: string, content: string): Promise<void> {
  const file = await requireConflicted(root, path);
  if (hasConflictMarkers(content)) throw new Error("O resultado ainda tem marcadores de conflito (<<<<<<<, =======, >>>>>>>).");
  await writeFile(join(root, file.path), content, "utf8");
  await runGit(root, ["add", "--", file.path]);
}

/** Resolve o arquivo inteiro com a versão de um dos lados (ou removendo-o, se aquele lado o removeu). */
export async function resolveConflictSide(root: string, path: string, side: ConflictSide): Promise<void> {
  const file = await requireConflicted(root, path);
  if (side !== "ours" && side !== "theirs") throw new Error("Lado inválido.");
  try {
    await runGit(root, ["checkout", `--${side}`, "--", file.path]);
    await runGit(root, ["add", "--", file.path]);
  } catch (e) {
    if (e instanceof GitError && /does not have (our|their) version/i.test(e.stderr)) {
      await runGit(root, ["rm", "-f", "--", file.path]);
      return;
    }
    throw e;
  }
}
