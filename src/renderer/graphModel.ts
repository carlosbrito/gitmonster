import type { Commit, RefsSnapshot } from "../shared/types";

/** Uma etiqueta de ref (branch local, remota, tag ou HEAD solto) mostrada na coluna BRANCH / TAG. */
export interface Chip {
  name: string;
  kind: "local" | "remote" | "tag" | "head";
  /** É a branch atual (HEAD -> nome). */
  current: boolean;
  /** Também existe `<remote>/<nome>` neste mesmo commit: o chip local ganha o ícone de nuvem. */
  hasRemote: boolean;
  /** Branch local à frente do upstream: commits que faltam enviar (só presente quando > 0). */
  ahead?: number;
}

/** Texto da etiqueta: marcador da branch atual, ícone de tag, nome inteiro e ↑N quando falta push. */
export const chipLabel = (chip: Chip): string =>
  `${chip.current && chip.kind !== "head" ? "● " : ""}${chip.kind === "tag" ? "🏷 " : ""}${chip.name}${chip.ahead ? ` ↑${chip.ahead}` : ""}`;

/**
 * Converte as decorações de um commit (`HEAD -> main`, `origin/main`, `tag: v1`...) em chips.
 * Branch local e a remota dela no mesmo commit viram um chip só (com nuvem), como nos clientes Git usuais.
 */
export function chipsFor(commit: Pick<Commit, "refs">, refs: RefsSnapshot | null): Chip[] {
  const locals = new Set(refs?.branches.map((b) => b.name));
  const aheadOf = new Map(refs?.branches.filter((b) => b.upstream && b.ahead > 0).map((b) => [b.name, b.ahead]));
  const remotes = new Set(refs?.remoteBranches.map((b) => b.name));
  const remoteNames = new Set(refs?.remotes.map((r) => r.name));

  const chips: Chip[] = [];
  const remoteChips: Chip[] = [];
  for (const raw of commit.refs) {
    if (raw.endsWith("/HEAD")) continue; // alias simbólico (origin/HEAD): ruído
    if (raw === "HEAD") {
      chips.push({ name: "HEAD", kind: "head", current: true, hasRemote: false });
      continue;
    }
    if (raw.startsWith("tag: ")) {
      chips.push({ name: raw.slice(5), kind: "tag", current: false, hasRemote: false });
      continue;
    }
    const current = raw.startsWith("HEAD -> ");
    const name = current ? raw.slice("HEAD -> ".length) : raw;
    const slash = name.indexOf("/");
    const isRemote = !locals.has(name) && (remotes.has(name) || (slash > 0 && remoteNames.has(name.slice(0, slash))));
    const ahead = isRemote ? undefined : aheadOf.get(name);
    (isRemote ? remoteChips : chips).push({ name, kind: isRemote ? "remote" : "local", current, hasRemote: false, ...(ahead ? { ahead } : {}) });
  }

  for (const remote of remoteChips) {
    const slash = remote.name.indexOf("/");
    const local = chips.find((c) => c.kind === "local" && slash > 0 && c.name === remote.name.slice(slash + 1));
    if (local) local.hasRemote = true;
    else chips.push(remote);
  }

  // branch atual primeiro, depois locais, remotas e tags
  const rank = (c: Chip) => (c.current ? 0 : c.kind === "local" ? 1 : c.kind === "remote" ? 2 : c.kind === "tag" ? 3 : 4);
  return chips.sort((a, b) => rank(a) - rank(b));
}

/** Iniciais para o avatar: primeira letra do primeiro e do último nome (ou só a primeira). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

/** Índice estável numa paleta a partir de um texto (cor do avatar por autor). */
export function hashIndex(text: string, size: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % size;
}

/** Posição da linha WIP (alterações não commitadas): logo acima do commit de HEAD, ou no topo se ele não está carregado. */
export function wipRowIndex(commits: ReadonlyArray<Pick<Commit, "refs">>, hasWip: boolean): number {
  if (!hasWip) return -1;
  const head = commits.findIndex((c) => c.refs.some((r) => r === "HEAD" || r.startsWith("HEAD -> ")));
  return head >= 0 ? head : 0;
}

/**
 * Linhas exibidas = commits + (WIP, se houver). Converte o índice de uma linha exibida no do commit
 * (ou -1 para a linha WIP) e vice-versa.
 */
export function toCommitIndex(displayIndex: number, wipAt: number): number {
  if (wipAt < 0 || displayIndex < wipAt) return displayIndex;
  if (displayIndex === wipAt) return -1;
  return displayIndex - 1;
}

export function toDisplayIndex(commitIndex: number, wipAt: number): number {
  return wipAt >= 0 && commitIndex >= wipAt ? commitIndex + 1 : commitIndex;
}

/** Posição de rolagem que centraliza a linha `displayIndex` na área visível, sem passar dos limites. */
export function revealScrollTop(displayIndex: number, rowH: number, viewH: number, total: number): number {
  const target = displayIndex * rowH + rowH / 2 - viewH / 2;
  const max = Math.max(0, total - viewH);
  return Math.min(max, Math.max(0, Math.round(target)));
}

/** Duração do pulso que destaca a linha revelada. */
export const PULSE_MS = 2400;

/** Opacidade (0..1) do pulso `elapsedMs` depois de começar: três batidas que se apagam até zero em `PULSE_MS`. */
export function pulseAlpha(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= PULSE_MS) return 0;
  const decay = 1 - elapsedMs / PULSE_MS;
  const wave = (1 + Math.cos((2 * Math.PI * elapsedMs) / 800)) / 2;
  return decay * (0.15 + 0.4 * wave);
}

/** "agora", "há 5 min", "há 3 h", "há 2 d", "há 4 meses" ou a data, para datas muito antigas. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  const months = Math.floor(d / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  return new Date(t).toLocaleDateString("pt-BR");
}

/** Largura da coluna BRANCH / TAG que comporta a maior etiqueta, entre `minW` e metade da largura total. */
export function autoRefWidth(widestChip: number, totalW: number, minW: number, defaultW: number): number {
  const cap = Math.max(minW, Math.floor(totalW * 0.6));
  return Math.min(cap, Math.max(defaultW, Math.ceil(widestChip) + 22));
}
