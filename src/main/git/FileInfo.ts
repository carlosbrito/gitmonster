import type { BlameLine, LogPage } from "../../shared/types";
import { assertStartPoint } from "./Branches";
import { GitError, LOG_FORMAT, parseLog, runGit } from "./GitService";
import { assertSafePath } from "./WorkTree";

/** Histórico do arquivo na branch atual, seguindo renomeações. Pede `limit + 1` para saber se há mais páginas. */
export async function fileHistory(root: string, path: string, skip: number, limit: number): Promise<LogPage> {
  if (!Number.isInteger(skip) || skip < 0) throw new RangeError("skip inválido");
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new RangeError("limit inválido");
  const safe = assertSafePath(path);

  let raw: string;
  try {
    raw = await runGit(root, [
      "log",
      "--follow",
      "--decorate=short",
      `--skip=${skip}`,
      `--max-count=${limit + 1}`,
      `--format=${LOG_FORMAT}`,
      "--",
      safe,
    ]);
  } catch (e) {
    if (e instanceof GitError && /does not have any commits|bad default revision|unknown revision/i.test(e.stderr)) {
      return { commits: [], hasMore: false };
    }
    throw e;
  }
  const commits = parseLog(raw);
  const hasMore = commits.length > limit;
  return { commits: hasMore ? commits.slice(0, limit) : commits, hasMore };
}

const ZERO_HASH = /^0{40}$/;

interface Meta {
  author: string;
  time: number;
  summary: string;
}

/**
 * Lê a saída de `git blame --porcelain`: cada linha do arquivo vem como um cabeçalho
 * `<hash> <linha original> <linha final> [<tamanho do grupo>]`, os metadados do commit (só na primeira
 * vez em que o commit aparece) e a linha de texto prefixada por tab.
 */
export function parseBlame(raw: string): BlameLine[] {
  const metaByHash = new Map<string, Meta>();
  const lines: BlameLine[] = [];
  let current: { hash: string; line: number } | null = null;

  for (const row of raw.split("\n")) {
    if (row.startsWith("\t")) {
      if (current) {
        const meta = metaByHash.get(current.hash);
        lines.push({
          line: current.line,
          hash: current.hash,
          author: meta?.author ?? "",
          authorTime: meta ? new Date(meta.time * 1000).toISOString() : "",
          summary: meta?.summary ?? "",
          uncommitted: ZERO_HASH.test(current.hash),
          text: row.slice(1).replace(/\r$/, ""),
        });
        current = null;
      }
      continue;
    }

    const header = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(row);
    if (header) {
      current = { hash: header[1]!, line: Number(header[2]) };
      if (!metaByHash.has(current.hash)) metaByHash.set(current.hash, { author: "", time: 0, summary: "" });
      continue;
    }

    const meta = current ? metaByHash.get(current.hash) : undefined;
    if (!meta) continue;
    if (row.startsWith("author ")) meta.author = row.slice("author ".length);
    else if (row.startsWith("author-time ")) meta.time = Number(row.slice("author-time ".length));
    else if (row.startsWith("summary ")) meta.summary = row.slice("summary ".length);
  }
  return lines;
}

/** Blame do arquivo na revisão `rev` (hash ou ref), ou na árvore de trabalho quando `rev` é null. */
export async function blame(root: string, path: string, rev: string | null): Promise<BlameLine[]> {
  const safe = assertSafePath(path);
  const args = ["blame", "--porcelain", ...(rev === null ? [] : [assertStartPoint(rev)]), "--", safe];
  try {
    return parseBlame(await runGit(root, args));
  } catch (e) {
    if (e instanceof GitError && /no such path|does not exist|fatal: no such ref/i.test(e.stderr)) {
      throw new Error("O arquivo não existe nesta revisão.");
    }
    throw e;
  }
}
