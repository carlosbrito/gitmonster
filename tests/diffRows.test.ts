import { describe, expect, it } from "vitest";
import type { DiffHunk } from "../src/shared/types";
import { annotateHunk, pairLines } from "../src/renderer/diffRows";
import { escapeHtml, highlightLines, languageFor, splitHtmlLines } from "../src/renderer/syntax";

const hunk = (lines: DiffHunk["lines"], oldStart = 10, newStart = 10): DiffHunk => ({
  header: "@@",
  oldStart,
  oldLines: lines.filter((l) => l.kind !== "+").length,
  newStart,
  newLines: lines.filter((l) => l.kind !== "-").length,
  lines,
});

describe("languageFor", () => {
  it.each([
    ["src/App.tsx", "typescript"],
    ["a/b/c.JS", "javascript"],
    ["Program.cs", "csharp"],
    ["app.csproj", "xml"],
    ["x.yml", "yaml"],
  ])("%s → %s", (path, lang) => expect(languageFor(path)).toBe(lang));

  it("desconhecida ou sem extensão: null", () => {
    expect(languageFor("Makefile")).toBeNull();
    expect(languageFor("arquivo.xyz")).toBeNull();
  });
});

describe("splitHtmlLines", () => {
  it("fecha e reabre spans que atravessam quebras de linha", () => {
    const lines = splitHtmlLines('<span class="c">/* a\nb\nc */</span>\nx');
    expect(lines).toEqual(['<span class="c">/* a</span>', '<span class="c">b</span>', '<span class="c">c */</span>', "x"]);
  });

  it("aninhados também", () => {
    const lines = splitHtmlLines('<span class="a"><span class="b">x\ny</span> z</span>');
    expect(lines).toEqual(['<span class="a"><span class="b">x</span></span>', '<span class="a"><span class="b">y</span> z</span>']);
  });

  it("texto sem spans vira uma linha por \\n", () => {
    expect(splitHtmlLines("a\nb\n")).toEqual(["a", "b", ""]);
  });
});

describe("highlightLines", () => {
  it("destaca código conhecido, uma entrada por linha, com texto escapado", () => {
    const out = highlightLines(["const a = '<b>';", "return 1;"], "javascript");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("hljs-keyword");
    expect(out[0]).not.toContain("<b>");
    expect(out[0]).toContain("&lt;b&gt;");
  });

  it("strings de várias linhas continuam destacadas na segunda linha", () => {
    const out = highlightLines(["const s = `a", "b`;"], "javascript");
    expect(out[1]).toContain("hljs-string");
  });

  it("sem linguagem: só escapa", () => {
    expect(highlightLines(["<script>&"], null)).toEqual(["&lt;script&gt;&amp;"]);
    expect(escapeHtml('"')).toBe("&quot;");
  });

  it("bloco enorme: não destaca (só escapa)", () => {
    const big = Array.from({ length: 2500 }, () => "var a = 1;");
    expect(highlightLines(big, "javascript")[0]).toBe("var a = 1;");
  });
});

describe("annotateHunk", () => {
  it("numera linhas antigas e novas e remove \\r", () => {
    const view = annotateHunk(
      hunk([
        { kind: " ", text: "ctx" },
        { kind: "-", text: "velho\r" },
        { kind: "+", text: "novo\r" },
        { kind: "\\", text: " No newline at end of file" },
      ]),
      null,
    );
    expect(view.map((v) => [v.kind, v.oldN, v.newN, v.text])).toEqual([
      [" ", 10, 10, "ctx"],
      ["-", 11, null, "velho"],
      ["+", null, 11, "novo"],
      ["\\", null, null, "No newline at end of file"],
    ]);
  });

  it("destaca cada lado como bloco contínuo", () => {
    const view = annotateHunk(
      hunk([
        { kind: "-", text: "const a = `x" },
        { kind: "+", text: "const a = `y" },
        { kind: " ", text: "z`;" },
      ]),
      "javascript",
    );
    expect(view[2]!.html).toContain("hljs-string"); // a crase aberta nas linhas anteriores continua no contexto
  });
});

describe("pairLines", () => {
  const view = (lines: DiffHunk["lines"]) => pairLines(annotateHunk(hunk(lines), null));

  it("pareia remoções e adições consecutivas", () => {
    const rows = view([
      { kind: " ", text: "a" },
      { kind: "-", text: "b" },
      { kind: "-", text: "c" },
      { kind: "+", text: "B" },
      { kind: "+", text: "C" },
      { kind: " ", text: "d" },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ left: { kind: "del", n: 11 }, right: { kind: "add", n: 11 } });
    expect(rows[2]).toMatchObject({ left: { kind: "del", n: 12 }, right: { kind: "add", n: 12 } });
    expect(rows[3]).toMatchObject({ left: { kind: "ctx", n: 13 }, right: { kind: "ctx", n: 13 } });
  });

  it("sobras ficam com o outro lado vazio", () => {
    const rows = view([
      { kind: "-", text: "só remoção 1" },
      { kind: "-", text: "só remoção 2" },
      { kind: "+", text: "uma adição" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.right).not.toBeNull();
    expect(rows[1]).toMatchObject({ left: { kind: "del" }, right: null });
  });

  it("só adições: lado esquerdo vazio", () => {
    const rows = view([{ kind: "+", text: "novo" }]);
    expect(rows).toEqual([{ left: null, right: { n: 10, html: "novo", kind: "add" } }]);
  });

  it("aviso de fim de linha ocupa a linha inteira", () => {
    const rows = view([
      { kind: "-", text: "x" },
      { kind: "\\", text: " No newline at end of file" },
    ]);
    expect(rows.at(-1)).toEqual({ left: null, right: null, meta: "No newline at end of file" });
  });
});
