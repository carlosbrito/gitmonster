import type { Commit, CommitFile, DiffTarget, FileChange, RefsSnapshot } from "../shared/types";
import type { branchActions } from "./actions/branchActions";
import type { commitActions } from "./actions/commitActions";
import type { discardActions } from "./actions/discardActions";
import type { remoteActions } from "./actions/remoteActions";
import type { MenuEntry } from "./ContextMenu";
import type { Chip } from "./graphModel";
import type { SidebarTarget } from "./Sidebar";
import { short } from "./util";

/** Ações que os menus reaproveitam; os menus só escolhem quais mostrar, não têm lógica própria. */
export interface MenuActions {
  branches: ReturnType<typeof branchActions>;
  commits: ReturnType<typeof commitActions>;
  remotes: ReturnType<typeof remoteActions>;
  discard: ReturnType<typeof discardActions>;
  stage(paths: string[]): void;
  unstage(paths: string[]): void;
  openDiff(target: DiffTarget, file: FileChange): void;
  /** Abre o arquivo no editor externo configurado. */
  openInEditor(path: string): void;
  /** Abre a pasta raiz do repositório no Explorer. */
  openFolder(): void;
  /** Abre a lista de commits que mexeram no arquivo. */
  fileHistory(path: string): void;
  /** Abre o blame; `rev` null = árvore de trabalho. */
  blame(path: string, rev: string | null): void;
  copy(text: string): void;
}

const SEP: MenuEntry = { separator: true };

export function commitMenu(commit: Commit, a: MenuActions): MenuEntry[] {
  const h = commit.hash;
  return [
    { label: "Checkout (HEAD destacado)", onSelect: () => a.branches.checkout({ kind: "commit", hash: h }) },
    { label: "Criar branch aqui…", onSelect: () => a.commits.branchHere(h) },
    { label: "Criar tag aqui…", onSelect: () => a.commits.tagHere(h) },
    SEP,
    { label: "Cherry-pick na branch atual", onSelect: () => a.commits.cherryPick(h) },
    { label: "Revert (criar commit que desfaz)", onSelect: () => a.commits.revert(h) },
    SEP,
    { label: "Reset soft para aqui", onSelect: () => a.commits.reset(h, "soft") },
    { label: "Reset mixed para aqui", onSelect: () => a.commits.reset(h, "mixed") },
    { label: "Reset hard para aqui…", danger: true, onSelect: () => a.commits.reset(h, "hard") },
    SEP,
    { label: "Rebase interativo a partir daqui", onSelect: () => a.branches.interactiveRebase(h, short(h)) },
    SEP,
    { label: "Copiar hash", onSelect: () => a.copy(h) },
    { label: "Copiar assunto", onSelect: () => a.copy(commit.subject) },
  ];
}

/**
 * Merge e rebase com os nomes das duas branches, para o usuário ler a operação inteira antes de clicar.
 * Some na branch atual; sem branch atual (HEAD destacado), fica desabilitado com a explicação.
 */
function mergeEntries(name: string, current: string | null, a: MenuActions): MenuEntry[] {
  if (name === current) return [];
  if (current === null) {
    return [
      { label: `Fazer merge da branch ${name} (sem branch atual: HEAD destacado)`, disabled: true, onSelect: () => undefined },
      { label: `Fazer rebase em cima de ${name} (sem branch atual: HEAD destacado)`, disabled: true, onSelect: () => undefined },
    ];
  }
  return [
    { label: `Fazer merge da branch ${name} na branch ${current}`, onSelect: () => a.branches.merge(name) },
    { label: `Fazer rebase da branch ${current} em cima de ${name}`, onSelect: () => a.branches.rebase(name) },
  ];
}

/**
 * Etiqueta do grafo → o mesmo alvo do menu da sidebar, para o botão direito nela oferecer as mesmas ações.
 * `null` (etiqueta HEAD ou ref que não existe mais): vale o menu do commit.
 */
export function chipTarget(chip: Pick<Chip, "name" | "kind">, refs: RefsSnapshot | null): SidebarTarget | null {
  if (!refs) return null;
  switch (chip.kind) {
    case "local": {
      const branch = refs.branches.find((b) => b.name === chip.name);
      return branch ? { kind: "branch", branch } : null;
    }
    case "remote": {
      const branch = refs.remoteBranches.find((b) => b.name === chip.name);
      return branch ? { kind: "remote", branch } : null;
    }
    case "tag": {
      const tag = refs.tags.find((t) => t.name === chip.name);
      return tag ? { kind: "tag", tag } : null;
    }
    case "head":
      return null;
  }
}

/** `current`: branch atual (null com HEAD destacado), usada nos textos de merge e rebase. */
export function sidebarMenu(target: SidebarTarget, a: MenuActions, current: string | null): MenuEntry[] {
  switch (target.kind) {
    case "branch": {
      const { name, isCurrent } = target.branch;
      return [
        { label: "Checkout", disabled: isCurrent, onSelect: () => a.branches.checkout({ kind: "local", name }) },
        { label: `Criar branch a partir de ${name}…`, onSelect: () => a.branches.createFrom(name) },
        ...mergeEntries(name, isCurrent ? name : current, a),
        SEP,
        { label: "Renomear…", onSelect: () => a.branches.rename(name) },
        { label: "Apagar branch…", danger: true, disabled: isCurrent, onSelect: () => a.branches.deleteBranch(name) },
        SEP,
        { label: "Copiar nome", onSelect: () => a.copy(name) },
        { label: "Abrir pasta do projeto", onSelect: () => a.openFolder() },
      ];
    }
    case "remote": {
      const { name } = target.branch;
      return [
        { label: "Checkout (cria branch local)", onSelect: () => a.branches.checkout({ kind: "remote", name }) },
        { label: `Criar branch a partir de ${name}…`, onSelect: () => a.branches.createFrom(name) },
        ...mergeEntries(name, current, a),
        SEP,
        { label: "Apagar no remote…", danger: true, onSelect: () => a.remotes.deleteRemoteBranch(target.branch.remote, name) },
        SEP,
        { label: "Copiar nome", onSelect: () => a.copy(name) },
      ];
    }
    case "remote-group": {
      const { name, fetchUrl } = target.remote;
      return [
        { label: "Adicionar remote…", onSelect: () => a.remotes.addRemote() },
        SEP,
        { label: "Remover remote…", danger: true, onSelect: () => a.remotes.removeRemote(name) },
        SEP,
        { label: "Copiar URL", onSelect: () => a.copy(fetchUrl) },
        { label: "Copiar nome", onSelect: () => a.copy(name) },
      ];
    }
    case "tag": {
      const { name, hash } = target.tag;
      return [
        { label: "Checkout (HEAD destacado)", onSelect: () => a.branches.checkout({ kind: "commit", hash }) },
        { label: "Publicar no remoto", onSelect: () => a.remotes.pushTag(name) },
        { label: "Apagar tag local…", danger: true, onSelect: () => a.commits.deleteTag(name) },
        SEP,
        { label: "Copiar nome", onSelect: () => a.copy(name) },
      ];
    }
  }
}

export function fileMenu(file: FileChange, staged: boolean, a: MenuActions): MenuEntry[] {
  const target: DiffTarget = { path: file.path, staged, untracked: file.untracked };
  const open: MenuEntry = {
    label: file.conflicted ? "Abrir para resolver o conflito" : "Abrir diff",
    onSelect: () => a.openDiff(target, file),
  };
  const copy: MenuEntry = { label: "Copiar caminho", onSelect: () => a.copy(file.path) };
  // Arquivo apagado não tem o que abrir no editor.
  const editor: MenuEntry[] = file.worktree === "D" || file.index === "D" ? [] : [{ label: "Abrir no editor", onSelect: () => a.openInEditor(file.path) }];
  // Arquivo novo ainda não tem histórico nem autoria.
  const history: MenuEntry[] = file.untracked
    ? []
    : [
        { label: "Histórico do arquivo", onSelect: () => a.fileHistory(file.path) },
        { label: "Blame", onSelect: () => a.blame(file.path, null) },
      ];

  if (staged) {
    const paths = file.origPath ? [file.path, file.origPath] : [file.path];
    return [open, { label: "Tirar do stage", onSelect: () => a.unstage(paths) }, SEP, ...editor, ...history, copy];
  }
  return [
    open,
    {
      label: file.conflicted ? "Marcar como resolvido (adicionar ao stage)" : "Adicionar ao stage",
      onSelect: () => a.stage([file.path]),
    },
    ...(file.conflicted ? [] : [SEP, { label: "Descartar alterações…", danger: true, onSelect: () => a.discard.files([file]) } satisfies MenuEntry]),
    SEP,
    ...editor,
    ...history,
    copy,
  ];
}

/** Arquivo listado no detalhe de um commit: histórico e blame naquele commit. */
export function commitFileMenu(file: CommitFile, commitHash: string, a: MenuActions): MenuEntry[] {
  return [
    { label: "Histórico do arquivo", onSelect: () => a.fileHistory(file.path) },
    ...(file.status === "D" ? [] : [{ label: "Blame neste commit", onSelect: () => a.blame(file.path, commitHash) } satisfies MenuEntry]),
    SEP,
    { label: "Copiar caminho", onSelect: () => a.copy(file.path) },
  ];
}
