import type { DiffHunk, DiffLineKind } from "../shared/types";
import { highlightLines } from "./syntax";

export interface DiffLineView {
  kind: DiffLineKind;
  oldN: number | null;
  newN: number | null;
  /** Texto sem o \r de arquivos CRLF. */
  text: string;
  /** HTML escapado e destacado (ou só escapado). */
  html: string;
}

/**
 * Numera as linhas do hunk e destaca a sintaxe. O lado antigo (contexto + remoções) e o novo
 * (contexto + adições) são destacados como dois blocos contínuos, para strings e comentários de várias linhas.
 */
export function annotateHunk(hunk: DiffHunk, language: string | null): DiffLineView[] {
  const clean = (t: string) => t.replace(/\r$/, "");
  const oldTexts = hunk.lines.filter((l) => l.kind === " " || l.kind === "-").map((l) => clean(l.text));
  const newTexts = hunk.lines.filter((l) => l.kind === " " || l.kind === "+").map((l) => clean(l.text));
  const oldHtml = highlightLines(oldTexts, language);
  const newHtml = highlightLines(newTexts, language);

  let oldN = hunk.oldStart;
  let newN = hunk.newStart;
  let oi = 0;
  let ni = 0;
  return hunk.lines.map((line) => {
    const text = clean(line.text);
    if (line.kind === "\\") return { kind: "\\", oldN: null, newN: null, text: text.trim(), html: text.trim() };
    if (line.kind === " ") {
      oi++; // o contexto existe nos dois blocos; usa o destaque do lado novo
      return { kind: " ", oldN: oldN++, newN: newN++, text, html: newHtml[ni++] ?? "" };
    }
    if (line.kind === "-") return { kind: "-", oldN: oldN++, newN: null, text, html: oldHtml[oi++] ?? "" };
    return { kind: "+", oldN: null, newN: newN++, text, html: newHtml[ni++] ?? "" };
  });
}

export interface SideCell {
  n: number;
  html: string;
  kind: "ctx" | "add" | "del";
}

/** Uma linha da visão lado a lado; `meta` é o aviso "sem quebra de linha no fim", que ocupa a linha toda. */
export interface SideRow {
  left: SideCell | null;
  right: SideCell | null;
  meta?: string;
}

/** Pareia remoções e adições consecutivas (a 1ª remoção com a 1ª adição...); o que sobra fica com o outro lado vazio. */
export function pairLines(lines: readonly DiffLineView[]): SideRow[] {
  const rows: SideRow[] = [];
  let dels: DiffLineView[] = [];
  let adds: DiffLineView[] = [];

  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const d = dels[i];
      const a = adds[i];
      rows.push({
        left: d ? { n: d.oldN ?? 0, html: d.html, kind: "del" } : null,
        right: a ? { n: a.newN ?? 0, html: a.html, kind: "add" } : null,
      });
    }
    dels = [];
    adds = [];
  };

  for (const line of lines) {
    if (line.kind === "-") dels.push(line);
    else if (line.kind === "+") adds.push(line);
    else {
      flush();
      if (line.kind === "\\") rows.push({ left: null, right: null, meta: line.text });
      else rows.push({ left: { n: line.oldN ?? 0, html: line.html, kind: "ctx" }, right: { n: line.newN ?? 0, html: line.html, kind: "ctx" } });
    }
  }
  flush();
  return rows;
}
