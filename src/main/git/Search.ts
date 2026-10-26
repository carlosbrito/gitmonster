import type { Commit, SearchField } from "../../shared/types";
import { assertCommitHash } from "./Branches";
import { GitError, LOG_FORMAT, parseLog, runGit } from "./GitService";
import { assertSafePath } from "./WorkTree";

export const MAX_QUERY = 200;
export const DEFAULT_RESULTS = 200;

/** O Git não encontrou nenhum commit/revisão: busca vazia, não erro. */
const EMPTY_REPO = /does not have any commits|bad default revision|unknown revision|bad revision|ambiguous argument/i;

/**
 * Procura commits. A consulta vem do usuário e só entra nos argumentos colada à opção (`--grep=...`, `-S...`),
 * então nunca vira uma opção do Git; hash e arquivo passam por validação própria.
 */
export async function searchCommits(
  root: string,
  field: SearchField,
  query: string,
  limit: number = DEFAULT_RESULTS,
): Promise<Commit[]> {
  const q = typeof query === "string" ? query.trim() : "";
  if (q === "") throw new Error("Informe o que buscar.");
  if (q.length > MAX_QUERY || /[\0\r\n]/.test(q)) throw new Error("Consulta inválida.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError("limit inválido");

  const common = ["log", "--decorate=short", `--max-count=${limit}`, `--format=${LOG_FORMAT}`];
  let args: string[];
  switch (field) {
    case "message":
      args = [...common, "--all", "--regexp-ignore-case", "--fixed-strings", `--grep=${q}`];
      break;
    case "author":
      args = [...common, "--all", "--regexp-ignore-case", "--fixed-strings", `--author=${q}`];
      break;
    case "content":
      args = [...common, "--all", `-S${q}`];
      break;
    case "file":
      args = [...common, "--all", "--", assertSafePath(q)];
      break;
    case "hash":
      args = [...common, "--no-walk", "--end-of-options", assertCommitHash(q)];
      break;
    default:
      throw new Error("Campo de busca inválido.");
  }

  try {
    return parseLog(await runGit(root, args));
  } catch (e) {
    if (e instanceof GitError && EMPTY_REPO.test(e.stderr)) return [];
    throw e;
  }
}
