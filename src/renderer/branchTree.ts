import { compareNames } from "./changesTree";

export interface BranchFolder<T> {
  kind: "folder";
  name: string;
  /** Prefixo completo da pasta ("Bug/55042"), único dentro da lista. */
  path: string;
  children: BranchNode<T>[];
}

export interface BranchLeaf<T> {
  kind: "leaf";
  /** Último segmento do nome exibido. */
  name: string;
  item: T;
}

export type BranchNode<T> = BranchFolder<T> | BranchLeaf<T>;

/**
 * Agrupa branches em pastas pelo `/` do nome exibido: pastas antes das branches, tudo em ordem sem diferenciar
 * maiúsculas. Ao contrário da árvore de arquivos, cadeias de pasta única não são compactadas.
 */
export function buildBranchTree<T>(items: readonly T[], displayName: (item: T) => string): BranchNode<T>[] {
  const root: BranchFolder<T> = { kind: "folder", name: "", path: "", children: [] };
  for (const item of items) {
    const parts = displayName(item).split("/");
    const name = parts.pop() as string;
    let at = root;
    for (const part of parts) {
      const path = at.path === "" ? part : `${at.path}/${part}`;
      let next = at.children.find((c): c is BranchFolder<T> => c.kind === "folder" && c.path === path);
      if (!next) {
        next = { kind: "folder", name: part, path, children: [] };
        at.children.push(next);
      }
      at = next;
    }
    at.children.push({ kind: "leaf", name, item });
  }
  return sortNodes(root.children);
}

function sortNodes<T>(nodes: BranchNode<T>[]): BranchNode<T>[] {
  const folders = nodes.filter((n): n is BranchFolder<T> => n.kind === "folder").sort((a, b) => compareNames(a.name, b.name));
  const leaves = nodes.filter((n): n is BranchLeaf<T> => n.kind === "leaf").sort((a, b) => compareNames(a.name, b.name));
  for (const f of folders) f.children = sortNodes(f.children);
  return [...folders, ...leaves];
}
