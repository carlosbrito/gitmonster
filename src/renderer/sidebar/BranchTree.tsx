import type { CSSProperties, ReactNode } from "react";
import type { BranchNode } from "../branchTree";
import { Icon } from "../icons";

export interface BranchTreeProps<T> {
  nodes: BranchNode<T>[];
  /** Identifica a lista nas chaves de pasta recolhida (`folder:escopo:caminho`). */
  scope: string;
  depth?: number;
  /** Com filtro ativo as pastas ficam abertas, sem mexer no recolhimento do usuário. */
  forceOpen: boolean;
  isCollapsed(key: string): boolean;
  onToggle(key: string): void;
  renderLeaf(item: T, name: string, depth: number): ReactNode;
  className?: string;
}

/** Branches agrupadas em pastas pelo `/`, recolhíveis e recuadas por nível. */
export function BranchTree<T>({ nodes, scope, depth = 0, forceOpen, isCollapsed, onToggle, renderLeaf, className }: BranchTreeProps<T>) {
  return (
    <ul className={className ? `sb-tree ${className}` : "sb-tree"}>
      {nodes.map((node) => {
        if (node.kind === "leaf") return renderLeaf(node.item, node.name, depth);
        const key = `folder:${scope}:${node.path}`;
        const open = forceOpen || !isCollapsed(key);
        return (
          <li key={key} className="sb-folder">
            <button
              className={open ? "sb-folder-row" : "sb-folder-row collapsed"}
              style={{ "--depth": depth } as CSSProperties}
              aria-expanded={open}
              aria-disabled={forceOpen || undefined}
              title={node.path}
              onClick={() => !forceOpen && onToggle(key)}
            >
              <Icon name="chevron" size={12} />
              <Icon name="folder" size={14} />
              <span className="sb-name">{node.name}</span>
            </button>
            {open && (
              <BranchTree nodes={node.children} scope={scope} depth={depth + 1} forceOpen={forceOpen} isCollapsed={isCollapsed} onToggle={onToggle} renderLeaf={renderLeaf} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
