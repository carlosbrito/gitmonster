import { Icon } from "./icons";

export interface TabBarProps {
  /** Raízes dos repositórios abertos, na ordem das abas. */
  tabs: string[];
  /** Raiz da aba ativa; null quando a tela inicial está à frente. */
  active: string | null;
  onSelect(root: string): void;
  onClose(root: string): void;
  onNew(): void;
  onSettings(): void;
}

export const repoName = (root: string) => root.replace(/[\x5c/]+$/, "").split(/[\x5c/]/).pop() || root;

export function TabBar({ tabs, active, onSelect, onClose, onNew, onSettings }: TabBarProps) {
  return (
    <nav className="tabbar" aria-label="Repositórios abertos">
      <button className={active === null ? "tab-home active" : "tab-home"} onClick={onNew} aria-label="Tela inicial" title="Tela inicial: abrir, clonar ou criar repositório">
        <Icon name="folder" />
      </button>
      {tabs.map((root) => (
        <div key={root} className={root === active ? "tab active" : "tab"} title={root}>
          <button className="tab-name" onClick={() => onSelect(root)} aria-current={root === active ? "page" : undefined}>
            <Icon name="tab" size={14} />
            <span className="tab-label">{repoName(root)}</span>
          </button>
          <button className="tab-close" onClick={() => onClose(root)} aria-label={`Fechar ${repoName(root)}`} title="Fechar aba">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <button className={active === null ? "tab-new active" : "tab-new"} onClick={onNew} aria-label="Nova aba" title="Abrir, clonar ou criar repositório">
        <Icon name="plus" />
      </button>
      <button className="tab-settings" onClick={onSettings} aria-label="Configurações" title="Configurações">
        <Icon name="gear" />
      </button>
    </nav>
  );
}
