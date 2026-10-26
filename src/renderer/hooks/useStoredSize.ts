import { useCallback, useRef, useState } from "react";

function readStored(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Tamanho de um painel lembrado entre execuções (só conveniência: se o armazenamento falhar, vale na sessão).
 * `set` só muda o estado (a cada movimento do arraste); `commit` grava; `reset` apaga e volta ao padrão.
 */
export function useStoredSize(key: string, fallback: number) {
  const [size, setSize] = useState(() => readStored(key) ?? fallback);
  const current = useRef(size);
  current.current = size;

  const commit = useCallback(() => {
    try {
      localStorage.setItem(key, String(current.current));
    } catch {
      /* sem armazenamento */
    }
  }, [key]);

  const reset = useCallback(() => {
    setSize(fallback);
    try {
      localStorage.removeItem(key);
    } catch {
      /* sem armazenamento */
    }
  }, [key, fallback]);

  return { size, set: setSize, commit, reset };
}
