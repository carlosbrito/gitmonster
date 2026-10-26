import type { ReactNode } from "react";
import { Icon } from "../icons";

export interface FileSectionProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle(): void;
  /** Botão de ação em lote ao lado do título (aparece quando a seção tem arquivos). */
  bulk: { label: string; variant: "stage" | "unstage"; disabled: boolean; onClick(): void };
  children: ReactNode;
}

/** Seção recolhível ("Arquivos não staged (N)" / "Arquivos staged (N)") com o botão de ação em lote. */
export function FileSection({ title, count, collapsed, onToggle, bulk, children }: FileSectionProps) {
  return (
    <section className="fsec">
      <div className="fsec-head">
        <button className={collapsed ? "fsec-title collapsed" : "fsec-title"} aria-expanded={!collapsed} onClick={onToggle}>
          <Icon name="chevron" size={14} />
          {`${title} (${count})`}
        </button>
        {count > 0 && (
          <button className={`fsec-bulk bulk-${bulk.variant}`} disabled={bulk.disabled} onClick={bulk.onClick}>
            {bulk.label}
          </button>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}
