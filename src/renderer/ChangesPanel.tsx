import { useMemo } from "react";
import type { AiTextResult, DiffTarget, FileChange } from "../shared/types";
import { buildTree, pathsOf, sortFiles } from "./changesTree";
import { ChangesHeader } from "./changes/ChangesHeader";
import { CommitForm } from "./changes/CommitForm";
import { FileRow } from "./changes/FileRow";
import { FileSection } from "./changes/FileSection";
import { FileTree } from "./changes/FileTree";
import { useChangesUi } from "./changes/useChangesUi";

export interface ChangesPanelProps {
  files: FileChange[];
  /** Branch atual (null = HEAD destacado), para o resumo do cabeçalho. */
  branch: string | null;
  selected: DiffTarget | null;
  busy: boolean;
  onOpen(target: DiffTarget, file: FileChange): void;
  onStage(paths: string[]): void;
  onUnstage(paths: string[]): void;
  /** Descartar alterações não staged (a confirmação é de quem recebe). */
  onDiscard(files: FileChange[]): void;
  /** Botão direito num arquivo; `staged` diz de qual lista ele veio. */
  onFileMenu(point: { x: number; y: number }, file: FileChange, staged: boolean): void;
  onCommit(message: string, amend: boolean): Promise<boolean>;
  /** Por que a IA não pode ser usada agora (desligada, sem chave, ocupada), ou null. */
  aiReason: string | null;
  /** Gera a mensagem do commit; null se foi bloqueado, cancelado ou falhou (o erro aparece na faixa da IA). */
  onAiCommitMessage(amend: boolean): Promise<AiTextResult | null>;
  onAiExplain(): void;
}

const isStaged = (f: FileChange) => !f.untracked && !f.conflicted && f.index !== " ";
const isUnstaged = (f: FileChange) => f.untracked || f.conflicted || f.worktree !== " ";

/** Painel direito: cabeçalho, listas de arquivos (Path ou Tree) e formulário de commit. */
export function ChangesPanel({ files, branch, selected, busy, onOpen, onStage, onUnstage, onDiscard, onFileMenu, onCommit, aiReason, onAiCommitMessage, onAiExplain }: ChangesPanelProps) {
  const ui = useChangesUi();

  const staged = useMemo(() => sortFiles(files.filter(isStaged), ui.order), [files, ui.order]);
  const unstaged = useMemo(() => sortFiles(files.filter(isUnstaged), ui.order), [files, ui.order]);
  const stagedTree = useMemo(() => (ui.mode === "tree" ? buildTree(staged, ui.order) : []), [ui.mode, ui.order, staged]);
  const unstagedTree = useMemo(() => (ui.mode === "tree" ? buildTree(unstaged, ui.order) : []), [ui.mode, ui.order, unstaged]);
  const discardable = unstaged.filter((f) => !f.conflicted);

  const generateReason = aiReason ?? (staged.length === 0 ? "Coloque alterações no stage para gerar a mensagem" : null);
  const explainReason = aiReason ?? (files.length === 0 ? "Não há alterações para explicar" : null);

  const stagedRow = (f: FileChange, depth = 0) => (
    <FileRow
      key={`s:${f.path}`}
      file={f}
      letter={f.index}
      active={selected?.staged === true && selected.path === f.path}
      actionLabel="−"
      actionTitle="Tirar do stage"
      busy={busy}
      depth={depth}
      nameOnly={ui.mode === "tree"}
      onOpen={() => onOpen({ path: f.path, staged: true, untracked: false }, f)}
      onAction={() => onUnstage(pathsOf(f))}
      onMenu={(point) => onFileMenu(point, f, true)}
    />
  );

  const unstagedRow = (f: FileChange, depth = 0) => (
    <FileRow
      key={`u:${f.path}`}
      file={f}
      letter={f.conflicted ? "!" : f.untracked ? "?" : f.worktree}
      active={selected?.staged === false && selected.path === f.path}
      actionLabel="+"
      actionTitle={f.conflicted ? "Marcar como resolvido (adiciona ao stage; confira se não restaram marcadores <<<<<<<)" : "Adicionar ao stage"}
      busy={busy}
      depth={depth}
      nameOnly={ui.mode === "tree"}
      onOpen={() => onOpen({ path: f.path, staged: false, untracked: f.untracked }, f)}
      onAction={() => onStage([f.path])}
      {...(f.conflicted ? {} : { onDiscard: () => onDiscard([f]) })}
      onMenu={(point) => onFileMenu(point, f, false)}
    />
  );

  return (
    <div className="changes">
      <ChangesHeader
        count={files.length}
        branch={branch}
        busy={busy}
        noDiscard={discardable.length === 0}
        onDiscardAll={() => onDiscard(discardable)}
        explainReason={explainReason}
        onExplain={onAiExplain}
        mode={ui.mode}
        onMode={ui.setMode}
        order={ui.order}
        onToggleOrder={ui.toggleOrder}
      />

      <FileSection
        title="Arquivos não staged"
        count={unstaged.length}
        collapsed={ui.sectionCollapsed("unstaged")}
        onToggle={() => ui.toggleSection("unstaged")}
        bulk={{ label: "Stage All Changes", variant: "stage", disabled: busy, onClick: () => onStage(unstaged.map((f) => f.path)) }}
      >
        {ui.mode === "tree" ? (
          <FileTree
            nodes={unstagedTree}
            section="unstaged"
            isCollapsed={ui.dirCollapsed}
            onToggleDir={ui.toggleDir}
            busy={busy}
            dirAction={{ label: "+", title: (name) => `Adicionar a pasta ${name} ao stage`, onClick: onStage }}
            renderFile={unstagedRow}
          />
        ) : (
          <ul>{unstaged.map((f) => unstagedRow(f))}</ul>
        )}
      </FileSection>

      <FileSection
        title="Arquivos staged"
        count={staged.length}
        collapsed={ui.sectionCollapsed("staged")}
        onToggle={() => ui.toggleSection("staged")}
        bulk={{ label: "Unstage All Changes", variant: "unstage", disabled: busy, onClick: () => onUnstage(staged.flatMap(pathsOf)) }}
      >
        {ui.mode === "tree" ? (
          <FileTree
            nodes={stagedTree}
            section="staged"
            isCollapsed={ui.dirCollapsed}
            onToggleDir={ui.toggleDir}
            busy={busy}
            dirAction={{ label: "−", title: (name) => `Tirar a pasta ${name} do stage`, onClick: onUnstage }}
            renderFile={stagedRow}
          />
        ) : (
          <ul>{staged.map((f) => stagedRow(f))}</ul>
        )}
      </FileSection>

      <CommitForm stagedCount={staged.length} busy={busy} onCommit={onCommit} generateReason={generateReason} onAiCommitMessage={onAiCommitMessage} />
    </div>
  );
}
