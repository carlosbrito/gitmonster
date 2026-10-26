import { useRef, useState } from "react";

export interface SplitterProps {
  /** `vertical`: divide colunas (arrasta na horizontal); `horizontal`: divide linhas. */
  orientation: "vertical" | "horizontal";
  /** Tamanho atual do painel controlado (para `aria-valuenow` e como base do arraste). */
  value: number;
  /** Novo tamanho pedido, já com o sinal certo: `start + delta * direction`. */
  onChange(next: number): void;
  /** Fim do arraste ou da tecla: hora de gravar. */
  onCommit(): void;
  /** Duplo clique: volta ao tamanho padrão. */
  onReset(): void;
  /** 1 se arrastar para a direita/baixo aumenta o painel; -1 se diminui. */
  direction?: 1 | -1;
  label: string;
  className?: string;
}

const STEP = 16;

/**
 * Divisória arrastável entre painéis. Captura o ponteiro para não perder o arraste sobre o canvas do grafo,
 * e trava cursor e seleção de texto no `body` enquanto arrasta.
 */
export function Splitter({ orientation, value, onChange, onCommit, onReset, direction = 1, label, className }: SplitterProps) {
  const start = useRef<{ pos: number; value: number } | null>(null);
  const [active, setActive] = useState(false);
  const vertical = orientation === "vertical";

  const end = () => {
    if (!start.current) return;
    start.current = null;
    setActive(false);
    document.body.classList.remove("resizing", "resizing-row");
    onCommit();
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label} — arraste para ajustar, duplo clique para voltar ao padrão`}
      className={`splitter splitter-${orientation}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: vertical ? e.clientX : e.clientY, value };
        document.body.classList.add(vertical ? "resizing" : "resizing-row");
        setActive(true);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        onChange(s.value + ((vertical ? e.clientX : e.clientY) - s.pos) * direction);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      onKeyDown={(e) => {
        const grow = vertical ? "ArrowRight" : "ArrowDown";
        const shrink = vertical ? "ArrowLeft" : "ArrowUp";
        if (e.key !== grow && e.key !== shrink) return;
        e.preventDefault();
        onChange(value + (e.key === grow ? STEP : -STEP) * direction);
        onCommit();
      }}
    />
  );
}
