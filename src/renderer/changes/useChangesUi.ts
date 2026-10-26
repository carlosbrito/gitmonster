import { useCallback, useEffect, useState } from "react";
import type { SortDir } from "../changesTree";

export type ViewMode = "path" | "tree";
export type SectionId = "unstaged" | "staged";

interface Stored {
  mode: ViewMode;
  order: SortDir;
  /** Seções recolhidas. */
  sections: SectionId[];
  /** Pastas recolhidas (`seção:caminho`). */
  dirs: string[];
}

const KEY = "gitmonster.changesUi";
const DEFAULT: Stored = { mode: "path", order: "asc", sections: [], dirs: [] };

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null;
    if (!raw) return DEFAULT;
    return {
      mode: raw.mode === "tree" ? "tree" : "path",
      order: raw.order === "desc" ? "desc" : "asc",
      sections: Array.isArray(raw.sections) ? raw.sections.filter((s): s is SectionId => s === "unstaged" || s === "staged") : [],
      dirs: Array.isArray(raw.dirs) ? raw.dirs.filter((d): d is string => typeof d === "string") : [],
    };
  } catch {
    return DEFAULT;
  }
}

/** Preferências de exibição do painel de alterações; lembradas entre execuções (localStorage pode falhar: é só conveniência). */
export function useChangesUi() {
  const [ui, setUi] = useState<Stored>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ui));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }, [ui]);

  const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return {
    mode: ui.mode,
    order: ui.order,
    sectionCollapsed: (id: SectionId) => ui.sections.includes(id),
    dirCollapsed: (key: string) => ui.dirs.includes(key),
    setMode: useCallback((mode: ViewMode) => setUi((u) => ({ ...u, mode })), []),
    toggleOrder: useCallback(() => setUi((u) => ({ ...u, order: u.order === "asc" ? "desc" : "asc" })), []),
    toggleSection: useCallback((id: SectionId) => setUi((u) => ({ ...u, sections: toggle(u.sections, id) })), []),
    toggleDir: useCallback((key: string) => setUi((u) => ({ ...u, dirs: toggle(u.dirs, key) })), []),
  };
}
