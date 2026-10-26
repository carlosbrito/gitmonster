import type { AiConflictResolution } from "../../shared/types";

/** Tira a cerca ``` que envolve a resposta inteira (alguns modelos embrulham tudo em ```xml). */
function unfence(text: string): string {
  const m = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(text);
  return m ? (m[1] ?? "") : text;
}

export interface SummaryBody {
  summary: string;
  body: string;
}

/**
 * Lê `<summary>` e `<body>`. Sem as tags, a primeira linha não vazia é o resumo e o resto é o corpo.
 * Aceita tag de fechamento ausente (resposta cortada pelo limite de tokens).
 */
export function parseSummaryBody(raw: string): SummaryBody {
  const text = unfence(raw).trim();
  const summaryTag = /<summary>([\s\S]*?)(?:<\/summary>|<body>|$)/.exec(text);
  if (summaryTag) {
    const bodyTag = /<body>([\s\S]*?)(?:<\/body>|$)/.exec(text);
    const summary = (summaryTag[1] ?? "").trim();
    if (summary !== "") return { summary, body: (bodyTag?.[1] ?? "").trim() };
  }
  const lines = text.replace(/<\/?(summary|body)>/g, "").trim().split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first === -1) throw new Error("A IA devolveu uma resposta vazia.");
  return { summary: (lines[first] ?? "").trim(), body: lines.slice(first + 1).join("\n").trim() };
}

/** Primeira linha não vazia (o stash só usa o resumo). */
export const firstLine = (text: string) => text.split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? "";

/** Código dentro de `<resolved>`: tira a quebra de linha de abertura/fechamento e uma cerca ``` que o modelo tenha posto. */
function cleanResolved(text: string): string {
  let code = text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  const fenced = /^```[\w+-]*\r?\n([\s\S]*?)\r?\n```$/.exec(code);
  if (fenced) code = fenced[1] ?? "";
  return code;
}

function confidenceOf(text: string): number {
  const v = Number.parseFloat(text.replace(",", ".").replace("%", ""));
  if (!Number.isFinite(v)) return 0;
  // Alguns modelos respondem 85 em vez de 0.85.
  const fraction = v > 1 && v <= 100 ? v / 100 : v;
  return Math.min(1, Math.max(0, fraction));
}

const all = (text: string, tag: string) => [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] ?? "");

/** Uma resolução para cada conflito, na ordem; quantidade diferente da esperada é erro (nada é aplicado pela metade). */
export function parseConflictResolutions(raw: string, expected: number): AiConflictResolution[] {
  const text = unfence(raw);
  const resolved = all(text, "resolved");
  const explanations = all(text, "explanation");
  const confidences = all(text, "confidence");
  if (resolved.length !== expected || explanations.length !== expected || confidences.length !== expected) {
    throw new Error("A IA não devolveu uma resolução para cada conflito. Tente de novo.");
  }
  return resolved.map((code, i) => ({
    resolved: cleanResolved(code),
    explanation: (explanations[i] ?? "").trim(),
    confidence: confidenceOf(confidences[i] ?? ""),
  }));
}
