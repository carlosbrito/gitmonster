import type { ReactNode } from "react";
import type { FileChange } from "../../shared/types";
import { collectPaths, type TreeNode } from "../changesTree";
import { Icon } from "../icons";

export interface FileTreeProps {
  nodes: TreeNode[];
  /** Identifica a seção nas chaves de pasta recolhida (`seção:caminho`). */
  section: string;
  depth?: number;
  isCollapsed(key: string): boolean;
  onToggleDir(key: string): void;
  busy: boolean;
  /** Ação de stage/unstage da pasta inteira. */
  dirAction: { label: string; title(name: string): string; onClick(paths: string[]): void };
  renderFile(file: FileChange, depth: number): ReactNode;
}

/** Modo Tree: pastas recolhíveis, com stage/unstage da pasta, e os arquivos recuados sob elas. */
export function FileTree({ nodes, section, depth = 0, isCollapsed, onToggleDir, busy, dirAction, renderFile }: FileTreeProps) {
  return (
    <ul>
      {nodes.map((node) => {
        if (node.kind === "file") return renderFile(node.file, depth);
        const key = `${section}:${node.path}`;
        const collapsed = isCollapsed(key);
        return (
          <li key={key} className="dir">
            <div className="dir-row" style={{ paddingLeft: depth * 14 }}>
              <button className={collapsed ? "dir-toggle collapsed" : "dir-toggle"} aria-expanded={!collapsed} title={node.path} onClick={() => onToggleDir(key)}>
                <Icon name="chevron" size={14} />
                <Icon name="folder" size={14} />
                <span className="file-name">{node.name}</span>
              </button>
              <button className="file-action" disabled={busy} title={dirAction.title(node.name)} aria-label={dirAction.title(node.name)} onClick={() => dirAction.onClick(collectPaths(node))}>
                {dirAction.label}
              </button>
            </div>
            {!collapsed && (
              <FileTree
                nodes={node.children}
                section={section}
                depth={depth + 1}
                isCollapsed={isCollapsed}
                onToggleDir={onToggleDir}
                busy={busy}
                dirAction={dirAction}
                renderFile={renderFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
