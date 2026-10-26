import type { CommitResult, DiffHunk, DiffLine, DiffLineKind, DiffTarget, FileDiff, HunkRef } from "../../shared/types";
import { getStatus, GitError, runGit } from "./GitService";

/** Diff já parseado, mantendo o cabeçalho de arquivo necessário para reconstruir patches. */
export interface ParsedDiff {
  /** Linhas antes do primeiro hunk: `diff --git`, `index`, `---`, `+++`... */
  headerLines: string[];
  binary: boolean;
  hunks: DiffHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parser de diff unificado de UM arquivo. Divide só por "\n": o \r de arquivos CRLF faz
 * parte do conteúdo e precisa voltar intacto no patch, senão `git apply` rejeita o hunk.
 */
export function parseDiff(raw: string): ParsedDiff {
  const parsed: ParsedDiff = { headerLines: [], binary: false, hunks: [] };
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();

  let current: DiffHunk | null = null;
  for (const line of lines) {
    const m = HUNK_HEADER.exec(line);
    if (m) {
      current = {
        header: line,
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        lines: [],
      };
      parsed.hunks.push(current);
      continue;
    }
    if (!current) {
      if (line.startsWith("Binary files ") || line === "GIT binary patch") parsed.binary = true;
      parsed.headerLines.push(line);
      continue;
    }
    const kind = line[0] as DiffLineKind | undefined;
    if (kind === " " || kind === "+" || kind === "-" || kind === "\\") {
      current.lines.push({ kind, text: line.slice(1) });
    } else if (line === "") {
      // linha de contexto vazia que perdeu o espaço inicial
      current.lines.push({ kind: " ", text: "" });
    }
  }
  return parsed;
}

/** Patch de um único hunk: cabeçalho do arquivo + o hunk, pronto para `git apply`. */
export function buildHunkPatch(parsed: ParsedDiff, hunkIndex: number): string {
  const hunk = parsed.hunks[hunkIndex];
  if (!hunk) throw new RangeError("Hunk inexistente.");
  const body = hunk.lines.map((l: DiffLine) => l.kind + l.text);
  return [...parsed.headerLines, hunk.header, ...body].join("\n") + "\n";
}

/**
 * Valida um caminho vindo do renderer (não confiável): relativo, sem `..` e sem NUL.
 * Os comandos ainda usam `--` antes dos caminhos, então um nome começando com `-` não vira opção.
 */
export function assertSafePath(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) throw new Error("Caminho inválido.");
  if (path.includes("\0")) throw new Error("Caminho inválido.");
  if (/^([a-zA-Z]:|[\\/])/.test(path)) throw new Error("Caminho deve ser relativo à raiz do repositório.");
  if (path.split(/[\\/]/).includes("..")) throw new Error("Caminho não pode sair do repositório.");
  return path;
}

const DIFF_FLAGS = ["-c", "core.quotepath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U3"];

export async function rawDiff(root: string, target: DiffTarget): Promise<string> {
  const path = assertSafePath(target.path);
  if (target.untracked) {
    // Arquivo novo: compara com /dev/null. `--no-index` sai com 1 quando há diferença.
    return runGit(root, [...DIFF_FLAGS, "--no-index", "--", "/dev/null", path], { okExitCodes: [1] });
  }
  const args = target.staged ? [...DIFF_FLAGS, "--cached", "--", path] : [...DIFF_FLAGS, "--", path];
  return runGit(root, args);
}

export async function getDiff(root: string, target: DiffTarget): Promise<FileDiff> {
  const { binary, hunks } = parseDiff(await rawDiff(root, target));
  return { path: target.path, binary, hunks };
}

export async function stageFiles(root: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  // -A inclui remoções: arquivo apagado no disco entra no stage como deleção.
  await runGit(root, ["add", "-A", "--", ...paths.map(assertSafePath)]);
}

export async function unstageFiles(root: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const safe = paths.map(assertSafePath);
  const { headOid } = await getStatus(root);
  if (headOid === null) {
    // Repositório sem commits não tem HEAD: `restore --staged` falharia.
    await runGit(root, ["rm", "--cached", "-r", "-q", "-f", "--", ...safe]);
    return;
  }
  await runGit(root, ["restore", "--staged", "--", ...safe]);
}

export const STALE = "O arquivo mudou desde que o diff foi carregado. Atualize e tente de novo.";

async function applyHunk(root: string, ref: HunkRef, staged: boolean): Promise<void> {
  const parsed = parseDiff(await rawDiff(root, { path: ref.path, staged, untracked: false }));
  if (parsed.binary) throw new Error("Arquivo binário não suporta stage por hunk.");
  // Confere índice E cabeçalho: se o arquivo mudou, o índice pode apontar para outro trecho.
  if (parsed.hunks[ref.hunkIndex]?.header !== ref.hunkHeader) throw new Error(STALE);

  const patch = buildHunkPatch(parsed, ref.hunkIndex);
  // Stage: aplica o hunk no índice. Unstage: aplica o hunk do diff --cached ao contrário.
  const args = ["apply", "--cached", "--whitespace=nowarn", ...(staged ? ["--reverse"] : []), "-"];
  await runGit(root, args, { input: patch });
}

export const stageHunk = (root: string, ref: HunkRef) => applyHunk(root, ref, false);
export const unstageHunk = (root: string, ref: HunkRef) => applyHunk(root, ref, true);

/**
 * Cria um commit com o que está no stage. A mensagem vai por stdin (sem problemas de aspas/tamanho).
 * `amend` com mensagem vazia reaproveita a mensagem anterior (`--no-edit`).
 */
export async function commit(root: string, message: string, amend: boolean): Promise<CommitResult> {
  const text = message.replace(/\r\n/g, "\n").trim();
  if (!amend && text === "") throw new Error("Escreva uma mensagem de commit.");

  if (!amend) {
    const { files } = await getStatus(root);
    if (!files.some((f) => !f.untracked && f.index !== " ")) throw new Error("Não há nada no stage para commitar.");
  }

  const args = ["commit", "--cleanup=whitespace", ...(amend ? ["--amend"] : [])];
  if (text === "") args.push("--no-edit");
  else args.push("-F", "-");

  try {
    await runGit(root, args, text === "" ? {} : { input: text + "\n" });
  } catch (e) {
    if (e instanceof GitError && /Please tell me who you are|unable to auto-detect email/i.test(e.stderr)) {
      throw new Error("Git não sabe quem é você. Configure user.name e user.email (git config --global).");
    }
    throw e;
  }
  return { hash: (await runGit(root, ["rev-parse", "HEAD"])).trim() };
}
