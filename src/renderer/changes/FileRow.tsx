import type { FileChange } from "../../shared/types";
import { changeKind, KIND_TITLE, splitPath, type ChangeKind } from "../changesTree";
import { Icon, type IconName } from "../icons";

const KIND_ICON: Record<ChangeKind, IconName> = {
  modified: "pencil",
  added: "plus",
  deleted: "trash",
  renamed: "rename",
  conflict: "alert",
  other: "pencil",
};

export interface FileRowProps {
  file: FileChange;
  /** Letra de status do lado em que o arquivo aparece (`?` novo, `!` conflito). */
  letter: string;
  active: boolean;
  actionLabel: string;
  actionTitle: string;
  busy: boolean;
  /** Recuo em níveis (modo Tree). */
  depth?: number;
  /** Mostra só o nome (modo Tree); senão, pasta em tom secundário e nome. */
  nameOnly?: boolean;
  onOpen(): void;
  onAction(): void;
  /** Quando presente, mostra o botão de descartar a alteração do arquivo. */
  onDiscard?(): void;
  onMenu(point: { x: number; y: number }): void;
}

/** Uma linha de arquivo: ícone do tipo de alteração, nome (com a pasta em tom secundário) e ações ao passar o mouse. */
export function FileRow({ file, letter, active, actionLabel, actionTitle, busy, depth = 0, nameOnly = false, onOpen, onAction, onDiscard, onMenu }: FileRowProps) {
  const kind = changeKind(letter);
  const title = KIND_TITLE[letter] ?? letter;
  const { dir, name } = splitPath(file.path);
  return (
    <li
      className={active ? "file active" : "file"}
      style={depth > 0 ? { paddingLeft: depth * 14 } : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button className="file-open" title={file.path} onClick={onOpen}>
        <span className={`fk-icon fk-${kind}`} role="img" aria-label={title} title={title}>
          <Icon name={KIND_ICON[kind]} size={14} />
        </span>
        <span className="file-name">
          {file.origPath ? (
            `${file.origPath} → ${file.path}`
          ) : nameOnly ? (
            name
          ) : (
            <>
              <span className="file-dir">{dir}</span>
              {name}
            </>
          )}
        </span>
      </button>
      {onDiscard && (
        <button className="file-action file-discard" title="Descartar alterações" disabled={busy} onClick={onDiscard} aria-label={`Descartar alterações de ${file.path}`}>
          ⟲
        </button>
      )}
      <button className="file-action" title={actionTitle} disabled={busy} onClick={onAction} aria-label={actionTitle}>
        {actionLabel}
      </button>
    </li>
  );
}
