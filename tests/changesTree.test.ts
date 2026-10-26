import { describe, expect, it } from "vitest";
import type { FileChange } from "../src/shared/types";
import {
  buildTree,
  changeKind,
  collectPaths,
  composeMessage,
  countFiles,
  pathsOf,
  sortFiles,
  splitMessage,
  splitPath,
  type DirNode,
  type TreeNode,
} from "../src/renderer/changesTree";

const file = (path: string, over: Partial<FileChange> = {}): FileChange =>
  ({ path, index: " ", worktree: "M", untracked: false, conflicted: false, ...over }) as FileChange;

const names = (nodes: TreeNode[]) => nodes.map((n) => (n.kind === "dir" ? `${n.name}/` : n.name));

describe("sortFiles", () => {
  const files = [file("b.txt"), file("A.txt"), file("a/z.txt"), file("c.txt")];

  it("ordena crescente sem diferenciar maiúsculas", () => {
    expect(sortFiles(files, "asc").map((f) => f.path)).toEqual(["A.txt", "a/z.txt", "b.txt", "c.txt"]);
  });

  it("decrescente é o inverso exato", () => {
    expect(sortFiles(files, "desc").map((f) => f.path)).toEqual(sortFiles(files, "asc").map((f) => f.path).reverse());
  });

  it("não altera a lista original", () => {
    const copy = [...files];
    sortFiles(files, "desc");
    expect(files).toEqual(copy);
  });
});

describe("buildTree", () => {
  it("agrupa por pasta, com pastas antes dos arquivos", () => {
    const tree = buildTree([file("z.txt"), file("src/b.ts"), file("src/a.ts"), file("docs/x.md"), file("docs/y.md")], "asc");
    expect(names(tree)).toEqual(["docs/", "src/", "z.txt"]);
    expect(names((tree[1] as DirNode).children)).toEqual(["a.ts", "b.ts"]);
  });

  it("compacta cadeias de pasta única", () => {
    const tree = buildTree([file("a/b/c/x.txt"), file("a/b/c/y.txt")], "asc");
    expect(names(tree)).toEqual(["a/b/c/"]);
    expect((tree[0] as DirNode).path).toBe("a/b/c");
  });

  it("não compacta pasta que também tem arquivo", () => {
    const tree = buildTree([file("a/x.txt"), file("a/b/y.txt")], "asc");
    expect(names(tree)).toEqual(["a/"]);
    expect(names((tree[0] as DirNode).children)).toEqual(["b/", "x.txt"]);
  });

  it("respeita a ordem decrescente", () => {
    const tree = buildTree([file("a/1.txt"), file("a/2.txt"), file("b/1.txt"), file("b/2.txt")], "desc");
    expect(names(tree)).toEqual(["b/", "a/"]);
    expect(names((tree[0] as DirNode).children)).toEqual(["2.txt", "1.txt"]);
  });

  it("lista vazia dá árvore vazia", () => {
    expect(buildTree([], "asc")).toEqual([]);
  });
});

describe("collectPaths e countFiles", () => {
  const renamed = file("novo/nome.ts", { origPath: "velho/nome.ts", index: "R" });
  const tree = buildTree([file("src/a.ts"), file("src/lib/b.ts"), renamed], "asc");

  it("junta os caminhos de todos os arquivos sob a pasta, inclusive o antigo de renomeações", () => {
    const novo = tree.find((n) => n.kind === "dir" && n.name === "novo") as DirNode;
    expect(collectPaths(novo).sort()).toEqual(["novo/nome.ts", "velho/nome.ts"]);
    const src = tree.find((n) => n.kind === "dir" && n.name === "src") as DirNode;
    expect(collectPaths(src).sort()).toEqual(["src/a.ts", "src/lib/b.ts"]);
  });

  it("conta os arquivos da pasta", () => {
    const src = tree.find((n) => n.kind === "dir" && n.name === "src") as DirNode;
    expect(countFiles(src)).toBe(2);
  });

  it("pathsOf inclui o caminho antigo", () => {
    expect(pathsOf(renamed)).toEqual(["novo/nome.ts", "velho/nome.ts"]);
    expect(pathsOf(file("x.txt"))).toEqual(["x.txt"]);
  });
});

describe("splitPath", () => {
  it("separa pasta e nome", () => {
    expect(splitPath("src/a/b.ts")).toEqual({ dir: "src/a/", name: "b.ts" });
    expect(splitPath("b.ts")).toEqual({ dir: "", name: "b.ts" });
  });
});

describe("composeMessage / splitMessage", () => {
  it("resumo e descrição viram duas partes separadas por linha em branco", () => {
    expect(composeMessage("feat: x", "detalhes")).toBe("feat: x\n\ndetalhes");
  });

  it("sem descrição, só o resumo (sem espaços nas pontas)", () => {
    expect(composeMessage("  feat: x  ", "   ")).toBe("feat: x");
  });

  it("tudo vazio dá mensagem vazia", () => {
    expect(composeMessage("", "")).toBe("");
  });

  it("splitMessage devolve o que composeMessage juntou", () => {
    expect(splitMessage("feat: x\n\ndetalhes\nmais")).toEqual({ summary: "feat: x", description: "detalhes\nmais" });
  });

  it("splitMessage aceita CRLF e linhas em branco extras", () => {
    expect(splitMessage("a\r\n\r\n\r\nb\r\n")).toEqual({ summary: "a", description: "b" });
  });

  it("texto de uma linha só vai para o resumo", () => {
    expect(splitMessage("só isso")).toEqual({ summary: "só isso", description: "" });
  });
});

describe("changeKind", () => {
  it("classifica as letras de status", () => {
    expect(changeKind("M")).toBe("modified");
    expect(changeKind("A")).toBe("added");
    expect(changeKind("?")).toBe("added");
    expect(changeKind("D")).toBe("deleted");
    expect(changeKind("R")).toBe("renamed");
    expect(changeKind("!")).toBe("conflict");
    expect(changeKind("T")).toBe("other");
  });
});
