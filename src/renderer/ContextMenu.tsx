import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface MenuPoint {
  x: number;
  y: number;
}

export type MenuEntry =
  | { separator: true }
  | { label: string; onSelect(): void; disabled?: boolean; danger?: boolean };

interface ContextMenuProps extends MenuPoint {
  items: MenuEntry[];
  onClose(): void;
}

const isItem = (e: MenuEntry): e is Exclude<MenuEntry, { separator: true }> => !("separator" in e);

/** Menu de botão direito: fecha com Esc, clique fora, rolagem ou escolha; setas navegam. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>({ x, y });

  // Mantém o menu dentro da janela (abre para cima/esquerda se faltar espaço).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.max(0, Math.min(x, window.innerWidth - width - 4)),
      y: Math.max(0, Math.min(y, window.innerHeight - height - 4)),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const move = (e: React.KeyboardEvent, step: 1 | -1) => {
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") move(e, 1);
        else if (e.key === "ArrowUp") move(e, -1);
      }}
    >
      {items.map((item, i) =>
        isItem(item) ? (
          <button
            key={i}
            role="menuitem"
            className={item.danger ? "danger-text" : undefined}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ) : (
          <hr key={i} role="separator" />
        ),
      )}
    </div>
  );
}

/** Estado do menu aberto; `element` deve ser renderizado uma vez no componente que usa o hook. */
export function useContextMenu(): { open(point: MenuPoint, items: MenuEntry[]): void; element: ReactNode } {
  const [menu, setMenu] = useState<(MenuPoint & { items: MenuEntry[] }) | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((point: MenuPoint, items: MenuEntry[]) => setMenu({ ...point, items }), []);
  return { open, element: menu && <ContextMenu {...menu} onClose={close} /> };
}
