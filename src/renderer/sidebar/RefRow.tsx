import type { CSSProperties, LiHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../icons";

export interface RefRowProps extends Omit<LiHTMLAttributes<HTMLLIElement>, "onClick" | "title"> {
  depth?: number;
  icon: IconName;
  /** Texto exibido (o último segmento, nas pastas). */
  label: string;
  /** Nome acessível do botão; o padrão é o próprio `label`. */
  fullName?: string;
  title?: string;
  current?: boolean;
  disabled?: boolean;
  /** Sem clique, o nome é só texto (stash). */
  onClick?(): void;
  /** Caixa de seleção do lote: fica sobre o ícone e aparece no hover. */
  check?: { label: string; checked: boolean; disabled: boolean; onChange(): void };
  /** Contadores e etiquetas à direita do nome. */
  badges?: ReactNode;
  /** Botões da linha, revelados no hover ou com foco. */
  actions?: ReactNode;
  "data-branch"?: string;
}

/** Linha de referência da sidebar: ícone, nome, etiquetas à direita e ações no hover. */
export function RefRow({ depth = 0, icon, label, fullName, title, current, disabled, onClick, check, badges, actions, className, style, ...li }: RefRowProps) {
  const content = (
    <>
      <Icon name={current ? "check" : icon} size={14} />
      <span className="sb-name">{label}</span>
    </>
  );
  return (
    <li {...li} className={`ref${current ? " current" : ""}${className ? ` ${className}` : ""}`} style={{ ...style, "--depth": depth } as CSSProperties}>
      {check && (
        <input type="checkbox" className="ref-check" aria-label={check.label} disabled={check.disabled} checked={check.checked} onChange={check.onChange} />
      )}
      {onClick ? (
        <button className="ref-name" title={title} aria-label={fullName && fullName !== label ? fullName : undefined} aria-current={current || undefined} disabled={disabled} onClick={onClick}>
          {content}
        </button>
      ) : (
        <span className="ref-name static" title={title}>
          {content}
        </span>
      )}
      {badges}
      {actions && <span className="sb-actions">{actions}</span>}
    </li>
  );
}
