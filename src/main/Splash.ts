/** Quanto tempo a tela de abertura (splash) com o logo fica à vista. */
export const SPLASH_MS = 5_000;

/**
 * Quanto ainda falta de splash, contando de quando ela foi mostrada. Nunca negativo e nunca maior que o total
 * (relógio que volta no tempo não pode prender o app na splash).
 */
export function remainingSplashMs(shownAt: number, now: number, total: number = SPLASH_MS): number {
  return Math.min(total, Math.max(0, total - (now - shownAt)));
}
