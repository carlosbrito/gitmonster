import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";

export interface SectionHeaderProps {
  icon: IconName;
  title: string;
  /** Total exibido à direita ("25" ou, com filtro, "3/25"). */
  count: string;
  open: boolean;
  onToggle(): void;
  /** Com filtro ativo a seção fica aberta e o recolher não responde. */
  locked?: boolean;
  /** Dica do cabeçalho. */
  hint?: string;
  /** Controles extras (seleção em lote), revelados no hover. */
  children?: ReactNode;
}

/** Cabeçalho de seção da sidebar: seta, ícone, título em caixa alta e total à direita. */
export function SectionHeader({ icon, title, count, open, onToggle, locked, hint, children }: SectionHeaderProps) {
  return (
    <div className={open ? "sb-head" : "sb-head collapsed"}>
      <button className="sb-toggle" aria-expanded={open} aria-disabled={locked || undefined} title={hint} onClick={() => !locked && onToggle()}>
        <Icon name="chevron" size={12} />
        <Icon name={icon} size={14} />
        <span className="sb-title">{title}</span>
      </button>
      {children && <div className="sb-extra">{children}</div>}
      <span className="sb-count">{count}</span>
    </div>
  );
}
