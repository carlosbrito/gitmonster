import { useEffect, useRef, useState } from "react";
import { APP_MENU, shortcutLabel, type MenuItem } from "../shared/appMenu";

/** Menu Arquivo/Editar/Exibir/Ajuda. A lista vem de `shared/appMenu`; executar é pedir ao main (`menuInvoke`). */
export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Clique fora e Esc fecham o menu sem executar nada.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (item: MenuItem) => {
    setOpen(null);
    void window.gitmonster.menuInvoke(item.id).catch(() => undefined);
  };

  /** Setas navegam entre os itens do menu aberto e entre os grupos. */
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const groups = APP_MENU.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowRight" ? 1 : groups - 1)) % groups;
      setOpen(APP_MENU[next]!.id);
      root.current?.querySelectorAll<HTMLButtonElement>(".menubar-title")[next]?.focus();
    } else if (e.key === "ArrowDown" && open === APP_MENU[index]!.id) {
      e.preventDefault();
      root.current?.querySelector<HTMLButtonElement>(".menubar-list button")?.focus();
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="menubar" role="menubar" aria-label="Menu" ref={root}>
      {APP_MENU.map((group, index) => (
        <div key={group.id} className="menubar-group">
          <button
            className={open === group.id ? "menubar-title open" : "menubar-title"}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === group.id}
            onClick={() => setOpen((cur) => (cur === group.id ? null : group.id))}
            onMouseEnter={() => open && setOpen(group.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {group.label}
          </button>
          {open === group.id && (
            <ul className="menubar-list" role="menu" aria-label={group.label} onKeyDown={onListKey}>
              {group.items.map((item, i) =>
                item === null ? (
                  <li key={`sep-${i}`} role="separator" className="menubar-sep" />
                ) : (
                  <li key={item.id} role="none">
                    <button role="menuitem" onClick={() => run(item)}>
                      <span>{item.label}</span>
                      <span className="menubar-shortcut">{shortcutLabel(item)}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
