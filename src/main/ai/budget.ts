/** Estimativa grosseira e conservadora: código tem ~3 caracteres por token. */
export const CHARS_PER_TOKEN = 3;
export const DEFAULT_INPUT_TOKENS = 100_000;
/** Sobra mínima para o diff, mesmo que o resto do prompt já seja grande. */
const MIN_DIFF_CHARS = 2000;

export const maxPromptChars = (tokens = DEFAULT_INPUT_TOKENS) => tokens * CHARS_PER_TOKEN;

/** Quanto do orçamento resta para o diff depois de descontar o resto do prompt. */
export const diffBudget = (otherChars: number, tokens = DEFAULT_INPUT_TOKENS) => Math.max(MIN_DIFF_CHARS, maxPromptChars(tokens) - otherChars);

export interface FileDiffPart {
  path: string;
  text: string;
}

export interface FittedDiff {
  text: string;
  /** Algo não foi enviado (arquivos omitidos ou trechos cortados). */
  truncated: boolean;
  /** Arquivos que ficaram de fora por inteiro. */
  omitted: string[];
}

const GENERATED = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|composer\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|go\.sum|packages\.lock\.json|pubspec\.lock|Podfile\.lock)$/i,
  /\.min\.(js|css|mjs)$/i,
  /\.(map|snap)$/i,
  /(^|\/)(dist|build|out|node_modules|vendor|coverage|\.next|\.nuxt)\//i,
];

/** Lockfiles, minificados e saídas de build não ajudam a entender a mudança e gastam o orçamento. */
export const isGeneratedPath = (path: string) => GENERATED.some((re) => re.test(path));

const isBinary = (text: string) => /^Binary files .* differ$/m.test(text) || /^GIT binary patch$/m.test(text);

/** Caminho do arquivo a partir da linha `diff --git a/x b/x` (usa o lado "b", o destino). */
function pathOfHeader(header: string): string {
  const quoted = /^diff --git "?a\/.*?"? "?b\/(.*?)"?$/.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /^diff --git a\/(.*) b\/(.*)$/.exec(header);
  return plain?.[2] ?? header.replace(/^diff --git /, "");
}

/** Quebra um diff do git em partes por arquivo; texto antes do primeiro `diff --git` vira uma parte sem caminho. */
export function splitDiffByFile(diff: string): FileDiffPart[] {
  const parts: FileDiffPart[] = [];
  const starts = [...diff.matchAll(/^diff --git .*$/gm)].map((m) => m.index ?? 0);
  if (starts.length === 0) return diff.trim() === "" ? [] : [{ path: "", text: diff }];
  if (starts[0]! > 0) parts.push({ path: "", text: diff.slice(0, starts[0]) });
  starts.forEach((start, i) => {
    const text = diff.slice(start, starts[i + 1] ?? diff.length);
    parts.push({ path: pathOfHeader(text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"))), text });
  });
  return parts;
}

const marker = (omittedChars: number) => `\n[... diff cortado: cerca de ${omittedChars} caracteres omitidos ...]\n`;

/** Corta a parte em `limit` caracteres, no fim de uma linha, e avisa do corte. */
function cutPart(text: string, limit: number): string {
  // O aviso final sai com no máximo os dígitos de `text.length`, então esta reserva basta.
  const cut = text.slice(0, Math.max(0, limit - marker(text.length).length));
  const lastBreak = cut.lastIndexOf("\n");
  const kept = lastBreak > 0 ? cut.slice(0, lastBreak + 1) : cut;
  return kept + marker(text.length - kept.length);
}

/** Tamanho do cabeçalho do arquivo (até o primeiro hunk). */
const headerLength = (text: string) => {
  const at = text.indexOf("\n@@");
  return at === -1 ? text.length : at + 1;
};

/**
 * Faz o diff caber em `maxChars`:
 * 1. Cabendo, vai inteiro.
 * 2. Senão, tira binários e arquivos gerados.
 * 3. Se ainda não couber, divide o espaço entre os arquivos (os pequenos ficam inteiros) e corta cada um
 *    mantendo o cabeçalho; quem não couber nem o cabeçalho fica de fora e é listado em `omitted`.
 */
export function fitDiff(diff: string, maxChars: number): FittedDiff {
  if (diff.length <= maxChars) return { text: diff, truncated: false, omitted: [] };

  const omitted: string[] = [];
  const kept: FileDiffPart[] = [];
  for (const part of splitDiffByFile(diff)) {
    if (part.path !== "" && (isGeneratedPath(part.path) || isBinary(part.text))) omitted.push(part.path);
    else kept.push(part);
  }

  const total = kept.reduce((n, p) => n + p.text.length, 0);
  if (total <= maxChars) return { text: kept.map((p) => p.text).join(""), truncated: true, omitted };

  // Do menor para o maior: cada um leva no máximo uma fatia igual do que sobra.
  const order = kept.map((p, i) => ({ p, i })).sort((a, b) => a.p.text.length - b.p.text.length);
  const out = new Map<number, string>();
  let remaining = maxChars;
  order.forEach(({ p, i }, n) => {
    const share = Math.floor(remaining / (order.length - n));
    if (p.text.length <= share) {
      out.set(i, p.text);
      remaining -= p.text.length;
    } else if (share >= headerLength(p.text) + marker(p.text.length).length + 80) {
      const cut = cutPart(p.text, share);
      out.set(i, cut);
      remaining -= cut.length;
    } else if (p.path !== "") {
      omitted.push(p.path);
    }
  });
  const text = kept.map((_, i) => out.get(i) ?? "").join("");
  return { text, truncated: true, omitted };
}

/** Trecho para o prompt dizendo o que ficou de fora. Vazio quando nada foi omitido. */
export function omittedNote(omitted: readonly string[]): string {
  if (omitted.length === 0) return "";
  const shown = omitted.slice(0, 50).map((p) => `- ${p}`);
  if (omitted.length > 50) shown.push(`- ... e mais ${omitted.length - 50} arquivos`);
  return `Files omitted from the diff because it was too large (lockfiles, generated or binary files, or no room left):\n${shown.join("\n")}`;
}
