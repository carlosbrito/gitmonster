import { describe, expect, it } from "vitest";
import { buildResult, hasConflictMarkers, matchLineEndings, parseConflicts, resolveBlock, type ConflictBlock } from "../src/shared/conflict";

const FILE = [
  "inicio",
  "<<<<<<< HEAD",
  "nosso 1",
  "nosso 2",
  "=======",
  "deles",
  ">>>>>>> feature",
  "meio",
  "<<<<<<< HEAD",
  "outro nosso",
  "=======",
  "outro deles",
  ">>>>>>> feature",
  "fim",
  "",
].join("\n");

const blocks = (text: string) => parseConflicts(text).filter((s): s is ConflictBlock => s.kind === "conflict");

describe("parseConflicts", () => {
  it("separa texto comum e blocos, com rótulos e conteúdo de cada lado", () => {
    const segs = parseConflicts(FILE);

    expect(segs.map((s) => s.kind)).toEqual(["text", "conflict", "text", "conflict", "text"]);
    const [first, second] = blocks(FILE);
    expect(first).toMatchObject({ id: 0, ours: "nosso 1\nnosso 2\n", theirs: "deles\n", base: null, oursLabel: "HEAD", theirsLabel: "feature" });
    expect(second).toMatchObject({ id: 1, ours: "outro nosso\n", theirs: "outro deles\n" });
  });

  it("estilo diff3: guarda o ancestral comum", () => {
    const text = "<<<<<<< HEAD\nnosso\n||||||| base\nvelho\n=======\ndeles\n>>>>>>> outra\n";
    expect(blocks(text)[0]).toMatchObject({ ours: "nosso\n", base: "velho\n", theirs: "deles\n" });
  });

  it("preserva CRLF", () => {
    const text = "a\r\n<<<<<<< HEAD\r\nnosso\r\n=======\r\ndeles\r\n>>>>>>> x\r\nb\r\n";
    const [block] = blocks(text);
    expect(block).toMatchObject({ ours: "nosso\r\n", theirs: "deles\r\n" });
    expect(buildResult(parseConflicts(text), { 0: "ours" }).text).toBe("a\r\nnosso\r\nb\r\n");
  });

  it("lado vazio é válido (uma das versões apagou as linhas)", () => {
    const text = "<<<<<<< HEAD\n=======\nadicionado\n>>>>>>> x\n";
    expect(blocks(text)[0]).toMatchObject({ ours: "", theirs: "adicionado\n" });
  });

  it("marcadores incompletos ficam como texto", () => {
    const text = "a\n<<<<<<< HEAD\nsem fim\n";
    expect(parseConflicts(text)).toEqual([{ kind: "text", text }]);
  });

  it("arquivo sem conflito vira um único trecho de texto; vazio vira nada", () => {
    expect(parseConflicts("so texto\n")).toEqual([{ kind: "text", text: "so texto\n" }]);
    expect(parseConflicts("")).toEqual([]);
  });

  it("não confunde setas ou iguais com menos de 7 caracteres", () => {
    const text = "<<<<<< 6\n=====\n>>>>>> 6\n";
    expect(blocks(text)).toHaveLength(0);
  });

  it("raw reproduz o bloco original com marcadores", () => {
    expect(blocks(FILE)[0]!.raw).toBe("<<<<<<< HEAD\nnosso 1\nnosso 2\n=======\ndeles\n>>>>>>> feature\n");
  });
});

describe("buildResult", () => {
  const segs = parseConflicts(FILE);

  it("monta o arquivo com a escolha de cada bloco", () => {
    const { text, unresolved } = buildResult(segs, { 0: "ours", 1: "theirs" });
    expect(unresolved).toEqual([]);
    expect(text).toBe("inicio\nnosso 1\nnosso 2\nmeio\noutro deles\nfim\n");
  });

  it("ambos, em qualquer ordem", () => {
    expect(buildResult(segs, { 0: "both-ours-first", 1: "both-theirs-first" }).text).toBe(
      "inicio\nnosso 1\nnosso 2\ndeles\nmeio\noutro deles\noutro nosso\nfim\n",
    );
  });

  it("texto escrito à mão", () => {
    expect(buildResult(segs, { 0: { custom: "meu\n" }, 1: "ours" }).text).toBe("inicio\nmeu\nmeio\noutro nosso\nfim\n");
  });

  it("blocos sem escolha ficam pendentes e mantêm os marcadores no resultado", () => {
    const { text, unresolved } = buildResult(segs, { 0: "ours" });
    expect(unresolved).toEqual([1]);
    expect(hasConflictMarkers(text)).toBe(true);
  });

  it("sem escolha nenhuma, devolve o arquivo original", () => {
    expect(buildResult(segs, {}).text).toBe(FILE);
  });

  it("'ambos' acrescenta quebra de linha quando o lado não termina com uma", () => {
    const [block] = blocks("<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n");
    const loose: ConflictBlock = { ...block!, ours: "sem eol" };
    expect(resolveBlock(loose, "both-ours-first")).toBe("sem eol\ny\n");
  });
});

describe("hasConflictMarkers", () => {
  it("detecta bloco completo e ignora texto parecido", () => {
    expect(hasConflictMarkers(FILE)).toBe(true);
    expect(hasConflictMarkers("a\n=======\nb\n")).toBe(false);
    expect(hasConflictMarkers("<<<<<<< sem fim\n")).toBe(false);
  });
});

describe("matchLineEndings", () => {
  it("LF continua LF e herda o fim de linha final do trecho substituído", () => {
    expect(matchLineEndings("a\nb", "x\ny\n")).toBe("a\nb\n");
    expect(matchLineEndings("a\nb\n", "x\ny\n")).toBe("a\nb\n");
  });
  it("CRLF no arquivo: converte tudo para CRLF, sem duplicar", () => {
    expect(matchLineEndings("a\nb", "x\r\ny\r\n")).toBe("a\r\nb\r\n");
    expect(matchLineEndings("a\r\nb\n", "x\r\ny\r\n")).toBe("a\r\nb\r\n");
  });
  it("trecho sem quebra final (fim do arquivo) não ganha uma", () => {
    expect(matchLineEndings("a", "x")).toBe("a");
  });
  it("resolução vazia continua vazia", () => {
    expect(matchLineEndings("", "x\n")).toBe("");
  });
});
