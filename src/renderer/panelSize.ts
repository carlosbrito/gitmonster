/** Área central mínima: nenhum painel lateral pode espremer o grafo abaixo disso. */
export const MIN_CENTER_W = 360;

/** Limita `size` a [min, max] e ao espaço `available` (sem nunca ficar abaixo de `min`). */
export function clampPanel(size: number, min: number, max: number, available: number = Infinity): number {
  return Math.round(Math.max(min, Math.min(size, max, available)));
}
