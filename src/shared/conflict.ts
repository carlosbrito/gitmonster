/**
 * Núcleo puro do editor de conflitos: lê os marcadores que o Git deixa no arquivo e monta o resultado
 * a partir da escolha feita em cada bloco. Sem dependências, usado no renderer e nos testes.
 */

export type ConflictSegment =
  | { kind: "text"; text: string }
  | {
      kind: "conflict";
      /** Posição do bloco entre os conflitos do arquivo (0, 1, 2...). */
      id: number;
      ours: string;
      theirs: string;
      /** Versão do ancestral comum; só existe com `merge.conflictStyle=diff3`. */
      base: string | null;
      oursLabel: string;
      theirsLabel: string;
      /** Trecho original, marcadores incluídos (usado enquanto o bloco não foi resolvido). */
      raw: string;
    };

export type ConflictBlock = Extract<ConflictSegment, { kind: "conflict" }>;

export type Choice =
  | "ours"
  | "theirs"
  | "both-ours-first"
  | "both-theirs-first"
  /** Texto escrito à mão pelo usuário. */
  | { custom: string };

const START = /^<{7}(?: (.*))?$/;
const BASE = /^\|{7}(?: .*)?$/;
const MID = /^={7}$/;
const END = /^>{7}(?: (.*))?$/;

/** Linha sem o fim de linha (aceita CRLF). */
const bare = (line: string) => line.replace(/\r?\n$/, "");

/** Quebra em linhas mantendo o terminador de cada uma, para a montagem devolver o arquivo byte a byte. */
const splitLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Divide o arquivo em trechos de texto comum e blocos de conflito. Marcadores incompletos viram texto. */
export function parseConflicts(text: string): ConflictSegment[] {
  const lines = splitLines(text);
  const segments: ConflictSegment[] = [];
  let plain: string[] = [];
  let id = 0;

  const flush = () => {
    if (plain.length > 0) segments.push({ kind: "text", text: plain.join("") });
    plain = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const start = START.exec(bare(line));
    if (!start) {
      plain.push(line);
      continue;
    }

    // Procura o fim do bloco; se o arquivo acabar antes, o trecho inteiro continua sendo texto.
    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let section: string[] = ours;
    let hasBase = false;
    let closed: RegExpExecArray | null = null;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const current = bare(lines[j]!);
      if (section === ours && BASE.test(current)) {
        section = base;
        hasBase = true;
      } else if (section !== theirs && MID.test(current)) {
        section = theirs;
      } else if (section === theirs && (closed = END.exec(current))) {
        break;
      } else {
        section.push(lines[j]!);
      }
    }
    if (!closed) {
      plain.push(line);
      continue;
    }

    flush();
    segments.push({
      kind: "conflict",
      id: id++,
      ours: ours.join(""),
      theirs: theirs.join(""),
      base: hasBase ? base.join("") : null,
      oursLabel: start[1] ?? "",
      theirsLabel: closed[1] ?? "",
      raw: lines.slice(i, j + 1).join(""),
    });
    i = j;
  }
  flush();
  return segments;
}

const withEol = (s: string) => (s === "" || s.endsWith("\n") ? s : s + "\n");

/** O texto que cada escolha produz para um bloco. */
export function resolveBlock(block: ConflictBlock, choice: Choice): string {
  if (typeof choice === "object") return choice.custom;
  switch (choice) {
    case "ours":
      return block.ours;
    case "theirs":
      return block.theirs;
    case "both-ours-first":
      return withEol(block.ours) + block.theirs;
    case "both-theirs-first":
      return withEol(block.theirs) + block.ours;
  }
}

export interface BuiltResult {
  /** Arquivo montado; blocos sem escolha entram com os marcadores originais. */
  text: string;
  /** `id` dos blocos que ainda não têm escolha. */
  unresolved: number[];
}

export function buildResult(segments: readonly ConflictSegment[], choices: Readonly<Record<number, Choice | undefined>>): BuiltResult {
  const unresolved: number[] = [];
  let text = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      text += seg.text;
      continue;
    }
    const choice = choices[seg.id];
    if (choice === undefined) {
      unresolved.push(seg.id);
      text += seg.raw;
    } else {
      text += resolveBlock(seg, choice);
    }
  }
  return { text, unresolved };
}

/** Sobrou algum marcador de conflito completo no texto? */
export function hasConflictMarkers(text: string): boolean {
  return parseConflicts(text).some((s) => s.kind === "conflict");
}

/**
 * Ajusta o texto escrito por outra fonte (a IA devolve sempre LF) ao arquivo: usa CRLF se a amostra usa e
 * termina com quebra de linha quando o trecho que ele substitui também terminava.
 */
export function matchLineEndings(text: string, sample: string): string {
  if (text === "") return "";
  const crlf = sample.includes("\r\n");
  const lf = text.replace(/\r\n/g, "\n");
  const body = crlf ? lf.replace(/\n/g, "\r\n") : lf;
  return sample.endsWith("\n") && !body.endsWith("\n") ? body + (crlf ? "\r\n" : "\n") : body;
}
