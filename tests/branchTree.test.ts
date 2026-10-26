import { describe, expect, it } from "vitest";
import { buildBranchTree, type BranchFolder, type BranchNode } from "../src/renderer/branchTree";
import { shortRemoteName } from "../src/renderer/branchFilter";
import type { RemoteBranchInfo } from "../src/shared/types";

const tree = (names: string[]) => buildBranchTree(names, (n) => n);
/** Forma legível: pastas como "nome/", com os filhos aninhados. */
const shape = (nodes: BranchNode<string>[]): unknown[] => nodes.map((n) => (n.kind === "leaf" ? n.name : { [`${n.name}/`]: shape(n.children) }));

describe("buildBranchTree", () => {
  it("nomes sem barra viram folhas na raiz", () => {
    expect(shape(tree(["main", "dev"]))).toEqual(["dev", "main"]);
  });

  it("cria um nível de pasta por segmento, sem compactar", () => {
    const nodes = tree(["Blocker/55215/BotaoVoltar"]);
    expect(shape(nodes)).toEqual([{ "Blocker/": [{ "55215/": ["BotaoVoltar"] }] }]);
    const inner = (nodes[0] as BranchFolder<string>).children[0] as BranchFolder<string>;
    expect(inner.path).toBe("Blocker/55215");
    expect(inner.children[0]).toEqual({ kind: "leaf", name: "BotaoVoltar", item: "Blocker/55215/BotaoVoltar" });
  });

  it("pastas antes das folhas e ordem sem diferenciar maiúsculas", () => {
    expect(shape(tree(["zeta", "bug/b", "Alpha", "Bug2/x", "beta"]))).toEqual([{ "bug/": ["b"] }, { "Bug2/": ["x"] }, "Alpha", "beta", "zeta"]);
  });

  it("pasta e branch com o mesmo nome convivem no mesmo nível", () => {
    expect(shape(tree(["feature", "feature/a"]))).toEqual([{ "feature/": ["a"] }, "feature"]);
  });

  it("remotas usam o nome sem o prefixo do remote", () => {
    const r: RemoteBranchInfo = { name: "origin/51758/Feature/RiscoSacado", remote: "origin", hash: "h" };
    const nodes = buildBranchTree([r], shortRemoteName);
    expect(nodes[0]).toMatchObject({ kind: "folder", name: "51758", path: "51758" });
    const leaf = ((nodes[0] as BranchFolder<RemoteBranchInfo>).children[0] as BranchFolder<RemoteBranchInfo>).children[0];
    expect(leaf).toEqual({ kind: "leaf", name: "RiscoSacado", item: r });
  });
});
