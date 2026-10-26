import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = { bash, cpp, csharp, css, go, java, javascript, json, markdown, powershell, python, rust, sql, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

const BY_EXTENSION: Record<string, keyof typeof LANGUAGES> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript",
  json: "json", css: "css", scss: "css",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", xaml: "xml", csproj: "xml", config: "xml",
  py: "python", cs: "csharp", java: "java", go: "go", rs: "rust",
  sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml", md: "markdown", sql: "sql", ps1: "powershell",
  c: "cpp", h: "cpp", cpp: "cpp", cc: "cpp", hpp: "cpp",
};

/** Linguagem do highlight.js para o arquivo, ou null quando não há suporte. */
export function languageFor(path: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || null;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Divide o HTML do highlight.js em uma string por linha. Spans que atravessam quebras de linha (comentários e
 * strings de várias linhas) são fechados no fim de cada linha e reabertos na seguinte.
 */
export function splitHtmlLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  for (const token of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (token === "\n") {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
    } else if (token.startsWith("<span")) {
      open.push(token);
      current += token;
    } else if (token === "</span>") {
      open.pop();
      current += token;
    } else {
      current += token;
    }
  }
  lines.push(current + "</span>".repeat(open.length));
  return lines;
}

const MAX_HIGHLIGHT_LINES = 2000;

/** HTML (já escapado) de cada linha. Sem linguagem, ou bloco grande demais, devolve só o texto escapado. */
export function highlightLines(lines: readonly string[], language: string | null): string[] {
  if (!language || lines.length > MAX_HIGHLIGHT_LINES) return lines.map(escapeHtml);
  try {
    const html = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value;
    const split = splitHtmlLines(html);
    if (split.length === lines.length) return split;
  } catch {
    /* linguagem recusou o trecho: cai no texto puro */
  }
  return lines.map(escapeHtml);
}
