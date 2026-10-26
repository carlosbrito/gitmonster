import type { FileChange } from "../shared/types";

export type SortDir = "asc" | "desc";

/** Em rename, o caminho antigo também precisa sair do stage. */
export const pathsOf = (f: FileChange): string[] => (f.origPath ? [f.path, f.origPath] : [f.path]);

/** Comparação por nome sem diferenciar maiúsculas; o texto original desempata para a ordem ser estável. */
export function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ordena por caminho, crescente ou decrescente. Não altera a lista recebida. */
export function sortFiles<T extends { path: string }>(files: readonly T[], dir: SortDir): T[] {
  const sorted = [...files].sort((a, b) => compareNames(a.path, b.path));
  return dir === "asc" ? sorted : sorted.reverse();
}

export interface DirNode {
  kind: "dir";
  /** Nome exibido; pastas de filho único viram "a/b/c". */
  name: string;
  /** Caminho completo da pasta (identifica a pasta ao recolher). */
  path: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: "file";
  name: string;
  file: FileChange;
}

export type TreeNode = DirNode | FileNode;

/** Agrupa os arquivos por pasta: pastas primeiro, cadeias de pasta única compactadas, tudo ordenado por nome. */
export function buildTree(files: readonly FileChange[], dir: SortDir): TreeNode[] {
  const root: DirNode = { kind: "dir", name: "", path: "", children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop() as string;
    let at = root;
    for (const part of parts) {
      const path = at.path === "" ? part : `${at.path}/${part}`;
      let next = at.children.find((c): c is DirNode => c.kind === "dir" && c.path === path);
      if (!next) {
        next = { kind: "dir", name: part, path, children: [] };
        at.children.push(next);
      }
      at = next;
    }
    at.children.push({ kind: "file", name, file });
  }
  return finish(root.children, dir);
}

function finish(nodes: TreeNode[], dir: SortDir): TreeNode[] {
  const sign = dir === "asc" ? 1 : -1;
  const dirs = nodes.filter((n): n is DirNode => n.kind === "dir").sort((a, b) => sign * compareNames(a.name, b.name));
  const leaves = nodes.filter((n): n is FileNode => n.kind === "file").sort((a, b) => sign * compareNames(a.name, b.name));
  for (const d of dirs) {
    d.children = finish(d.children, dir);
    while (d.children.length === 1 && d.children[0]!.kind === "dir") {
      const only = d.children[0] as DirNode;
      d.name = `${d.name}/${only.name}`;
      d.path = only.path;
      d.children = only.children;
    }
  }
  return [...dirs, ...leaves];
}

/** Todos os caminhos (inclusive os antigos de renomeações) dos arquivos sob um nó. */
export function collectPaths(node: TreeNode): string[] {
  return node.kind === "file" ? pathsOf(node.file) : node.children.flatMap(collectPaths);
}

export function countFiles(node: TreeNode): number {
  return node.kind === "file" ? 1 : node.children.reduce((n, c) => n + countFiles(c), 0);
}

/** Pasta e nome de um caminho ("src/a/b.ts" → { dir: "src/a/", name: "b.ts" }). */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

/** Mensagem do commit: resumo e, se houver, linha em branco e descrição. */
export function composeMessage(summary: string, description: string): string {
  const s = summary.trim();
  const d = description.trim();
  if (d === "") return s;
  return s === "" ? d : `${s}\n\n${d}`;
}

/** Inverso de `composeMessage`: a primeira linha é o resumo; o resto, sem linhas em branco iniciais, é a descrição. */
export function splitMessage(text: string): { summary: string; description: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const summary = (lines.shift() ?? "").trim();
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  return { summary, description: lines.join("\n").trimEnd() };
}

/** Tamanho recomendado para o resumo de um commit. */
export const SUMMARY_LIMIT = 72;

export type ChangeKind = "modified" | "added" | "deleted" | "renamed" | "conflict" | "other";

/** Descrição por extenso de cada letra de status (`?` = arquivo novo, `!` = conflito). */
export const KIND_TITLE: Record<string, string> = {
  M: "Modificado",
  A: "Adicionado",
  "?": "Novo (não rastreado)",
  D: "Removido",
  R: "Renomeado",
  C: "Copiado",
  T: "Tipo alterado",
  "!": "Conflito",
};

export function changeKind(letter: string): ChangeKind {
  switch (letter) {
    case "M":
      return "modified";
    case "A":
    case "?":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "!":
      return "conflict";
    default:
      return "other";
  }
}
