import { useCallback, useState } from "react";
import type { PullMode } from "../../shared/types";

const KEY = "gitmonster.pullMode";
const MODES: readonly PullMode[] = ["ff-only", "merge", "rebase"];

function readStored(): PullMode {
  try {
    const value = localStorage.getItem(KEY);
    return MODES.find((m) => m === value) ?? "ff-only";
  } catch {
    return "ff-only";
  }
}

/** Modo do pull escolhido pelo usuário; lembrado entre execuções (localStorage pode falhar, então é só conveniência). */
export function usePullMode(): [PullMode, (mode: PullMode) => void] {
  const [mode, setMode] = useState<PullMode>(readStored);
  const update = useCallback((next: PullMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }, []);
  return [mode, update];
}
