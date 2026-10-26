import { useCallback, useState } from "react";

export type DiffMode = "unified" | "split";

const KEY = "gitmonster.diffMode";

function readStored(): DiffMode {
  try {
    return localStorage.getItem(KEY) === "split" ? "split" : "unified";
  } catch {
    return "unified";
  }
}

/** Modo de exibição do diff, lembrado entre execuções (só conveniência: se o armazenamento falhar, vale na sessão). */
export function useDiffMode(): [DiffMode, (mode: DiffMode) => void] {
  const [mode, setMode] = useState<DiffMode>(readStored);
  const update = useCallback((next: DiffMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sem armazenamento */
    }
  }, []);
  return [mode, update];
}
