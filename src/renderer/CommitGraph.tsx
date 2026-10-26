import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphRow } from "../shared/graph/layoutGraph";
import type { CheckoutTarget, Commit, RefsSnapshot } from "../shared/types";
import { Splitter } from "./Splitter";
import { autoRefWidth, chipLabel, chipsFor, hashIndex, initials, PULSE_MS, pulseAlpha, relativeTime, revealScrollTop, toCommitIndex, toDisplayIndex, wipRowIndex, type Chip } from "./graphModel";

const ROW_H = 28;
const LANE_W = 22;
const PAD = 12;
const NODE_R = 9;
const LOAD_AHEAD_ROWS = 40;
const MAX_GRAPH_W = 360;
const MIN_REF_W = 140;
const DEFAULT_REF_W = 270;
const REF_KEY = "gitmonster.graphRefWidth";
const GRAPH_KEY = "gitmonster.graphColWidth";
const WIP_COLOR = "#ff9f43";
const PULSE_COLOR = "#4f8cff";

/** Corta `text` com reticências para caber em `maxWidth` pixels. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(text.slice(0, end) + "…").width > maxWidth) end--;
  return text.slice(0, end) + "…";
}

/** Computador (branch local): tela com pé. Desenha em (x, cy) com 11 px de largura. */
function drawComputer(ctx: CanvasRenderingContext2D, x: number, cy: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.roundRect(x, cy - 5.5, 11, 8, 1.5);
  ctx.moveTo(x + 5.5, cy + 2.5);
  ctx.lineTo(x + 5.5, cy + 5);
  ctx.moveTo(x + 2.5, cy + 5.5);
  ctx.lineTo(x + 8.5, cy + 5.5);
  ctx.stroke();
  ctx.restore();
}

/** Nuvem (branch remota). Desenha em (x, cy) com ~13 px de largura. */
function drawCloud(ctx: CanvasRenderingContext2D, x: number, cy: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x + 3, cy + 4);
  ctx.arc(x + 3, cy + 1.2, 2.8, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 6.8, cy - 0.8, 3.4, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(x + 10, cy + 1.2, 2.8, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

const ICON_W = 16;
/** O assunto do commit é cortado nesta quantidade de caracteres (com "…"), para a coluna ficar uniforme. */
const MAX_SUBJECT_CHARS = 72;
const TIME_COL_W = 64;
const AUTHOR_COL_W = 150;
/** Ícones de uma etiqueta: computador para local, nuvem para remota; local com remota no mesmo commit tem os dois. */
const iconsOf = (chip: Chip): ("pc" | "cloud")[] =>
  chip.kind === "local" ? (chip.hasRemote ? ["pc", "cloud"] : ["pc"]) : chip.kind === "remote" ? ["cloud"] : [];

const PALETTE = ["#4fb3ff", "#ff7a59", "#7bd88f", "#c792ea", "#ffcb6b", "#f78c9f", "#5ad4c8", "#a3b3ff"];
const colorOf = (n: number) => PALETTE[n % PALETTE.length]!;
/** `#rrggbb` + alfa em hexadecimal de 2 dígitos. */
const withAlpha = (hex: string, alpha: string) => hex + alpha;

interface Theme {
  bg: string;
  rowAlt: string;
  selected: string;
  text: string;
  dim: string;
  line: string;
  chipTextOnColor: string;
  /** Alfa (hex de 2 dígitos) do fundo de cada linha na cor da pista. */
  laneTint: string;
}

const LIGHT: Theme = { bg: "#ffffff", rowAlt: "#f7f8fa", selected: "#dbeafe", text: "#1c2430", dim: "#6b7685", line: "#e1e5ea", chipTextOnColor: "#0b1220", laneTint: "14" };
const DARK: Theme = { bg: "#12161c", rowAlt: "#161b22", selected: "#1f3a5f", text: "#e6edf3", dim: "#8b97a6", line: "#262d36", chipTextOnColor: "#0b1220", laneTint: "1c" };

/** Largura da coluna do grafo: limitada para o texto nunca sair da tela, mesmo com centenas de pistas. */
function graphWidth(maxLane: number, total: number, refW: number, userW: number | null): number {
  if (userW !== null) return Math.max(48, Math.min(userW, Math.floor((total - refW) * 0.6)));
  return Math.max(48, Math.min(PAD * 2 + (maxLane + 1) * LANE_W, MAX_GRAPH_W, Math.floor((total - refW) * 0.5)));
}

/** Largura escolhida pelo usuário ao arrastar uma divisória; `null` enquanto vale a largura automática. */
function readWidth(key: string, min: number): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min ? n : null;
  } catch {
    return null;
  }
}

function storeWidth(key: string, value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export interface WipSummary {
  modified: number;
  added: number;
}

export interface CommitGraphProps {
  commits: Commit[];
  rows: GraphRow[];
  maxLane: number;
  hasMore: boolean;
  selectedHash: string | null;
  /** Para classificar as etiquetas (local, remota, tag). */
  refs: RefsSnapshot | null;
  /** Alterações não commitadas: aparece como a linha "// WIP" logo acima do HEAD. */
  wip: WipSummary | null;
  onSelect(commit: Commit): void;
  /** Clique na linha WIP. */
  onSelectWip(): void;
  /** Botão direito numa linha (o commit já foi selecionado). */
  onContextMenu(commit: Commit, point: { x: number; y: number }): void;
  /** Uma branch foi arrastada do grafo e solta sobre outra branch local. */
  onBranchDrop(source: string, target: string): void;
  /** Duplo clique numa etiqueta de branch (local ou remota). */
  onCheckout(target: CheckoutTarget): void;
  onLoadMore(): void;
  /** Arraste de etiqueta em curso: origem e alvo (no grafo ou na sidebar); `null, null` ao terminar. */
  onDragTarget(source: string | null, over: string | null): void;
  /** Pedido para rolar até o commit e destacá-lo (depois de um checkout); o `nonce` repete o pedido. */
  reveal: { hash: string; nonce: number } | null;
}

interface ChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  kind: Chip["kind"];
}

interface DragState {
  name: string;
  startX: number;
  startY: number;
  active: boolean;
  x: number;
  y: number;
  /** Branch local sob o ponteiro (alvo válido do drop). */
  over: string | null;
}

/**
 * Grafo de commits em três colunas, num único <canvas> virtualizado:
 * BRANCH / TAG (etiquetas dos commits) | GRAPH (pistas) | COMMIT MESSAGE (barra colorida, assunto, autor); o avatar do autor é o nó do commit.
 * Só as linhas visíveis são desenhadas, então o custo por quadro independe do tamanho do histórico.
 * As etiquetas de branch podem ser arrastadas sobre outra branch (merge), com o ponteiro, sem HTML5 DnD.
 */
export function CommitGraph(props: CommitGraphProps) {
  const { commits, rows, maxLane, hasMore, selectedHash, refs, wip, onSelect, onSelectWip, onContextMenu, onBranchDrop, onCheckout, onLoadMore, onDragTarget, reveal } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const size = useRef({ w: 0, h: 0 });
  const [width, setWidth] = useState(0);
  const [userRefW, setUserRefW] = useState(() => readWidth(REF_KEY, MIN_REF_W));
  const [userGraphW, setUserGraphW] = useState(() => readWidth(GRAPH_KEY, 48));
  /** Maior etiqueta já vista: a coluna só cresce, para não "pular" ao rolar. */
  const [widestChip, setWidestChip] = useState(0);
  const refW = userRefW ?? autoRefWidth(widestChip, width || 800, MIN_REF_W, DEFAULT_REF_W);
  /** Linhas (índice do commit) cujas etiquetas não couberam inteiras na coluna. */
  const clippedRows = useRef<Set<number>>(new Set());
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const chipRects = useRef<ChipRect[]>([]);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  /** Reveal aguardando o canvas ter tamanho (a área central pode estar escondida) e linha em destaque. */
  const pendingReveal = useRef<{ hash: string; nonce: number } | null>(null);
  const pulse = useRef<{ di: number; start: number } | null>(null);
  /** Linha sob o ponteiro (índice de exibição), para o realce de hover; -1 = nenhuma. */
  const hoverDi = useRef(-1);

  const wipAt = wipRowIndex(commits, wip !== null);
  const displayCount = rows.length + (wipAt >= 0 ? 1 : 0);

  // O desenho lê sempre a versão mais recente das props sem recriar listeners.
  const latest = useRef({ commits, rows, maxLane, hasMore, selectedHash, refs, wip, wipAt, displayCount, refW, userGraphW, onLoadMore, onBranchDrop, onDragTarget });
  latest.current = { commits, rows, maxLane, hasMore, selectedHash, refs, wip, wipAt, displayCount, refW, userGraphW, onLoadMore, onBranchDrop, onDragTarget };

  const draw = useCallback(() => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scroller || !canvas) return;
    const { w, h } = size.current;
    if (w === 0 || h === 0) return;

    const { commits, rows, maxLane, selectedHash, refs, wip, wipAt, displayCount, refW, userGraphW } = latest.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? DARK : LIGHT;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // Reveal pendente: rola até a linha do commit (centralizada) e começa o pulso de destaque.
    const wanted = pendingReveal.current;
    if (wanted) {
      pendingReveal.current = null;
      const ci = commits.findIndex((c) => c.hash === wanted.hash);
      if (ci >= 0) {
        const di = toDisplayIndex(ci, wipAt);
        scroller.scrollTop = revealScrollTop(di, ROW_H, h, displayCount * ROW_H);
        pulse.current = { di, start: performance.now() };
      }
    }

    const scrollTop = scroller.scrollTop;
    const pulseNow = pulse.current ? { di: pulse.current.di, alpha: pulseAlpha(performance.now() - pulse.current.start) } : null;
    const first = Math.max(0, Math.floor(scrollTop / ROW_H));
    const last = Math.min(displayCount - 1, Math.ceil((scrollTop + h) / ROW_H));
    const gW = graphWidth(maxLane, w, refW, userGraphW);
    const gx0 = refW;
    const msgX = gx0 + gW + 10;
    const x = (lane: number) => gx0 + PAD + lane * LANE_W + LANE_W / 2;
    const dragState = drag.current?.active ? drag.current : null;
    // Larga: autor e data; média: só a data relativa; estreita: só o assunto.
    const showMeta = w > 760;
    const showTime = w > 520;

    chipRects.current = [];
    clippedRows.current.clear();
    ctx.textBaseline = "middle";
    ctx.lineCap = "round";

    for (let di = first; di <= last; di++) {
      const ci = toCommitIndex(di, wipAt);
      const y0 = di * ROW_H - scrollTop;
      const mid = y0 + ROW_H / 2;
      const y1 = y0 + ROW_H;
      const isWip = ci === -1;
      const row = isWip ? undefined : rows[ci];
      const commit = isWip ? undefined : commits[ci];
      if (!isWip && (!row || !commit)) continue;

      // fundo da linha
      const selected = isWip ? selectedHash === null : commit!.hash === selectedHash;
      if (selected) {
        ctx.fillStyle = theme.selected;
        ctx.fillRect(0, y0, w, ROW_H);
      } else if (di === hoverDi.current) {
        ctx.fillStyle = theme.rowAlt;
        ctx.fillRect(0, y0, w, ROW_H);
      }
      // fundo suave na cor da pista, do nó até o fim da mensagem (a seleção prevalece)
      if (!isWip && !selected) {
        const tintX = Math.min(gx0 + gW, x(row!.lane));
        ctx.fillStyle = withAlpha(colorOf(row!.color), theme.laneTint);
        ctx.fillRect(tintX, y0, w - tintX, ROW_H);
      }
      if (pulseNow && pulseNow.di === di && pulseNow.alpha > 0) {
        ctx.fillStyle = withAlpha(PULSE_COLOR, Math.round(pulseNow.alpha * 255).toString(16).padStart(2, "0"));
        ctx.fillRect(0, y0, w, ROW_H);
        ctx.strokeStyle = withAlpha(PULSE_COLOR, Math.round(Math.min(1, pulseNow.alpha * 2) * 255).toString(16).padStart(2, "0"));
        ctx.lineWidth = 2;
        ctx.strokeRect(1, y0 + 1, w - 2, ROW_H - 2);
      }

      if (isWip) {
        // ----- linha WIP: nó tracejado no pista do HEAD, ligado ao commit logo abaixo -----
        const head = rows[wipAt];
        const lane = head?.lane ?? 0;
        ctx.fillStyle = withAlpha(WIP_COLOR, "22");
        ctx.fillRect(0, y0, gx0 + gW, ROW_H);

        ctx.save();
        ctx.beginPath();
        ctx.rect(gx0, y0, gW, ROW_H);
        ctx.clip();
        ctx.lineWidth = 2;
        for (const t of [...(head?.through ?? []), ...(head?.incoming ?? [])]) {
          if (t.lane === lane) continue;
          ctx.strokeStyle = colorOf(t.color);
          ctx.beginPath();
          ctx.moveTo(x(t.lane), y0);
          ctx.lineTo(x(t.lane), y1);
          ctx.stroke();
        }
        ctx.strokeStyle = WIP_COLOR;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x(lane), mid);
        ctx.lineTo(x(lane), y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x(lane), mid, NODE_R + 1, 0, Math.PI * 2);
        ctx.fillStyle = theme.bg;
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(gx0 + gW, y0, w - gx0 - gW, ROW_H);
        ctx.clip();
        ctx.fillStyle = WIP_COLOR;
        ctx.fillRect(msgX - 2, y0 + 4, 3, ROW_H - 8);
        ctx.font = "italic 600 13px 'Segoe UI', sans-serif";
        ctx.fillStyle = theme.dim;
        ctx.fillText("// WIP", msgX + 10, mid + 0.5);
        const at = msgX + 10 + ctx.measureText("// WIP").width + 12;
        ctx.font = "600 12px 'Segoe UI', sans-serif";
        ctx.fillStyle = WIP_COLOR;
        const mod = `✎ ${wip?.modified ?? 0}`;
        ctx.fillText(mod, at, mid + 0.5);
        ctx.fillStyle = "#2ea043";
        ctx.fillText(`+ ${wip?.added ?? 0}`, at + ctx.measureText(mod).width + 12, mid + 0.5);
        ctx.restore();
        continue;
      }

      const lane = row!.lane;
      const laneColor = colorOf(row!.color);
      const chips = chipsFor(commit!, refs);

      // faixa colorida do commit que tem etiqueta (some em direção à mensagem)
      if (chips.length > 0) {
        const grad = ctx.createLinearGradient(0, 0, gx0 + gW, 0);
        grad.addColorStop(0, withAlpha(laneColor, "38"));
        grad.addColorStop(1, withAlpha(laneColor, "00"));
        ctx.fillStyle = grad;
        ctx.fillRect(0, y0, gx0 + gW, ROW_H);
      }

      // ----- coluna BRANCH / TAG -----
      ctx.font = "12px 'Segoe UI', sans-serif";
      let cx = 8;
      const maxX = refW - 14;
      let shown = 0;
      for (let k = 0; k < chips.length; k++) {
        const chip = chips[k]!;
        const remaining = maxX - cx;
        if (remaining < 54) break;
        const icons = iconsOf(chip);
        const text = chipLabel(chip);
        const maxW = remaining;
        const label = fitText(ctx, text, maxW - 14 - icons.length * ICON_W);
        if (label !== text) clippedRows.current.add(ci);
        const textW = Math.ceil(ctx.measureText(label).width);
        const cw = textW + 14 + icons.length * ICON_W;
        const cy = mid - 10;

        const isSource = dragState?.name === chip.name;
        const isTarget = dragState?.over === chip.name;
        ctx.save();
        if (isSource) ctx.globalAlpha = 0.4;
        const tagColor = "#ffcb6b";
        const base = chip.kind === "tag" ? tagColor : chip.kind === "head" ? theme.dim : laneColor;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, 20, 5);
        ctx.fillStyle = chip.current ? base : withAlpha(base, chip.kind === "remote" ? "26" : "50");
        ctx.fill();
        ctx.lineWidth = isTarget ? 2.5 : 1;
        ctx.strokeStyle = isTarget ? theme.text : withAlpha(base, chip.kind === "remote" ? "88" : "ff");
        ctx.stroke();
        ctx.fillStyle = chip.current ? theme.chipTextOnColor : chip.kind === "remote" ? theme.dim : theme.text;
        ctx.fillText(label, cx + 7, mid + 0.5);
        const iconColor = ctx.fillStyle as string;
        icons.forEach((icon, n) => {
          const ix = cx + 7 + textW + 5 + n * ICON_W;
          if (icon === "pc") drawComputer(ctx, ix, mid, iconColor);
          else drawCloud(ctx, ix, mid, iconColor);
        });
        ctx.restore();

        chipRects.current.push({ x: cx, y: cy, w: cw, h: 20, name: chip.name, kind: chip.kind });
        cx += cw + 4;
        shown++;
      }
      if (shown < chips.length) {
        clippedRows.current.add(ci);
        const more = `+${chips.length - shown}`;
        const mw = ctx.measureText(more).width + 10;
        ctx.fillStyle = theme.dim;
        ctx.fillText(more, Math.min(cx + 2, refW - mw), mid + 0.5);
        cx = Math.min(cx + mw, refW - 6);
      }
      // linha que liga as etiquetas ao nó do commit
      if (chips.length > 0) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = withAlpha(laneColor, "99");
        ctx.beginPath();
        ctx.moveTo(cx, mid);
        ctx.lineTo(x(lane) - NODE_R - 1, mid);
        ctx.stroke();
      }

      // ----- coluna GRAPH -----
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx0, y0, gW, ROW_H);
      ctx.clip();
      ctx.lineWidth = 2;
      for (const t of row!.through) {
        ctx.strokeStyle = colorOf(t.color);
        ctx.beginPath();
        ctx.moveTo(x(t.lane), y0);
        ctx.lineTo(x(t.lane), y1);
        ctx.stroke();
      }
      for (const inc of row!.incoming) {
        ctx.strokeStyle = colorOf(inc.color);
        ctx.beginPath();
        ctx.moveTo(x(inc.lane), y0);
        if (inc.lane === lane) ctx.lineTo(x(lane), mid);
        else ctx.bezierCurveTo(x(inc.lane), mid, x(lane), y0, x(lane), mid);
        ctx.stroke();
      }
      for (const out of row!.outgoing) {
        ctx.strokeStyle = colorOf(out.color);
        ctx.beginPath();
        ctx.moveTo(x(lane), mid);
        if (out.lane === lane) ctx.lineTo(x(out.lane), y1);
        else ctx.bezierCurveTo(x(lane), y1, x(out.lane), mid, x(out.lane), y1);
        ctx.stroke();
      }
      // nó: avatar do autor com anel na cor da pista; merge (2+ pais) é um ponto cheio pequeno; HEAD ganha um halo
      const isMerge = commit!.parents.length > 1;
      if (isMerge) {
        ctx.fillStyle = laneColor;
        ctx.beginPath();
        ctx.arc(x(lane), mid, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE[hashIndex(commit!.authorEmail || commit!.authorName, PALETTE.length)]!;
        ctx.strokeStyle = laneColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x(lane), mid, NODE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = "600 8px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#0b1220";
        ctx.textAlign = "center";
        ctx.fillText(initials(commit!.authorName), x(lane), mid + 0.5);
        ctx.textAlign = "start";
      }
      if (commit!.refs.some((r) => r === "HEAD" || r.startsWith("HEAD -> "))) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = theme.text;
        ctx.beginPath();
        ctx.arc(x(lane), mid, (isMerge ? 4 : NODE_R) + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // ----- coluna COMMIT MESSAGE -----
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx0 + gW, y0, w - gx0 - gW, ROW_H);
      ctx.clip();
      ctx.fillStyle = laneColor;
      ctx.fillRect(msgX - 2, y0 + 4, 3, ROW_H - 8);

      ctx.font = "13px 'Segoe UI', sans-serif";
      let right = w - 16;
      // Colunas fixas (data à direita, autor à esquerda dela): assim tudo fica alinhado de uma linha para outra.
      ctx.fillStyle = theme.dim;
      if (showTime) {
        ctx.textAlign = "right";
        ctx.fillText(relativeTime(commit!.authorDate), right, mid + 0.5);
        ctx.textAlign = "start";
        right -= TIME_COL_W;
      }
      if (showMeta) {
        ctx.fillText(fitText(ctx, commit!.authorName, AUTHOR_COL_W - 10), right - AUTHOR_COL_W, mid + 0.5);
        right -= AUTHOR_COL_W;
      }
      ctx.fillStyle = theme.text;
      const subject = commit!.subject.length > MAX_SUBJECT_CHARS ? commit!.subject.slice(0, MAX_SUBJECT_CHARS - 1) + "…" : commit!.subject;
      ctx.fillText(fitText(ctx, subject, Math.max(40, right - (msgX + 10))), msgX + 10, mid + 0.5);

      ctx.restore();
    }

    // divisórias das colunas
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.line;
    for (const lx of [gx0, gx0 + gW]) {
      ctx.beginPath();
      ctx.moveTo(lx + 0.5, 0);
      ctx.lineTo(lx + 0.5, h);
      ctx.stroke();
    }

    // o pulso redesenha quadro a quadro só enquanto dura
    if (pulse.current) {
      if (performance.now() - pulse.current.start < PULSE_MS) schedule();
      else pulse.current = null;
    }

    // etiqueta sendo arrastada, seguindo o ponteiro
    if (dragState) {
      ctx.font = "12px 'Segoe UI', sans-serif";
      const label = fitText(ctx, dragState.name, 200);
      const cw = ctx.measureText(label).width + 16;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(dragState.x + 10, dragState.y - 10, cw, 20, 5);
      ctx.fillStyle = "#4f8cff";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, dragState.x + 18, dragState.y + 0.5);
      ctx.restore();
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    if (!reveal) return;
    pendingReveal.current = reveal;
    schedule();
  }, [reveal, schedule]);

  const onScroll = useCallback(() => {
    schedule();
    const scroller = scrollRef.current;
    const { displayCount, hasMore, onLoadMore } = latest.current;
    if (!scroller || !hasMore) return;
    const remaining = displayCount * ROW_H - (scroller.scrollTop + scroller.clientHeight);
    if (remaining < LOAD_AHEAD_ROWS * ROW_H) onLoadMore();
  }, [schedule]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => {
      size.current = { w: scroller.clientWidth, h: scroller.clientHeight };
      setWidth(scroller.clientWidth);
      schedule();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule]);

  // Tema claro/escuro mudou (Configurações ou sistema): o canvas não segue o CSS, então redesenha.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", schedule);
    return () => media.removeEventListener("change", schedule);
  }, [schedule]);

  // Mede a maior etiqueta (nome inteiro + ícones) para a coluna BRANCH / TAG caber os nomes.
  useEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = "12px 'Segoe UI', sans-serif";
    let widest = 0;
    for (const commit of commits) {
      for (const chip of chipsFor(commit, refs)) {
        const text = chipLabel(chip);
        widest = Math.max(widest, ctx.measureText(text).width + 14 + iconsOf(chip).length * ICON_W);
      }
    }
    setWidestChip((prev) => Math.max(prev, widest));
  }, [commits, refs]);

  // Novas linhas, seleção, alterações ou largura das colunas mudaram: redesenha.
  useEffect(schedule, [schedule, commits, rows, maxLane, selectedHash, refs, wip, refW, userGraphW]);

  /** Posição do ponteiro dentro da área visível do grafo (a mesma do canvas). */
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = scrollRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const chipAt = (p: { x: number; y: number }) =>
    chipRects.current.find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
  /** Commit (ou -1 = linha WIP) sob a coordenada Y. */
  const commitIndexAt = (clientY: number) => {
    const scroller = scrollRef.current!;
    const di = Math.floor((clientY - scroller.getBoundingClientRect().top + scroller.scrollTop) / ROW_H);
    const { displayCount, wipAt } = latest.current;
    return di < 0 || di >= displayCount ? null : toCommitIndex(di, wipAt);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = localPoint(e);
    const chip = chipAt(p);
    if (chip && (chip.kind === "local" || chip.kind === "remote")) {
      drag.current = { name: chip.name, startX: p.x, startY: p.y, active: false, x: p.x, y: p.y, over: null };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollRef.current!;
    const p = localPoint(e);
    const d = drag.current;
    if (!d) {
      const chip = chipAt(p);
      scroller.style.cursor = chip && (chip.kind === "local" || chip.kind === "remote") ? "grab" : "";
      const di = Math.floor((e.clientY - scroller.getBoundingClientRect().top + scroller.scrollTop) / ROW_H);
      if (di !== hoverDi.current) {
        hoverDi.current = di;
        schedule();
      }
      // Etiquetas que não couberam: o nome completo aparece num overlay ao pairar sobre a coluna.
      const i = p.x < latest.current.refW ? commitIndexAt(e.clientY) : null;
      const next = i !== null && i >= 0 && clippedRows.current.has(i) ? i : null;
      setHoverRow((cur) => (cur === next ? cur : next));
      return;
    }
    if (!d.active && Math.hypot(p.x - d.startX, p.y - d.startY) > 5) {
      d.active = true;
      scroller.setPointerCapture(e.pointerId);
      latest.current.onDragTarget(d.name, null);
    }
    if (d.active) {
      d.x = p.x;
      d.y = p.y;
      const rect = scroller.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      let target: string | null = null;
      if (outside) {
        // Fora do canvas só vale uma branch local da sidebar; a linha de commit na mesma altura não conta.
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const name = el?.closest<HTMLElement>("[data-branch]")?.dataset.branch;
        if (name && name !== d.name) target = name;
      } else {
        const over = chipAt(p);
        target = over && over.kind === "local" && over.name !== d.name ? over.name : null;
        // Soltar em qualquer ponto da linha de um commit vale para a branch local desse commit.
        if (!target && !over) {
          const i = commitIndexAt(e.clientY);
          const commit = i !== null && i >= 0 ? latest.current.commits[i] : undefined;
          if (commit) target = chipsFor(commit, latest.current.refs).find((c) => c.kind === "local" && c.name !== d.name)?.name ?? null;
        }
      }
      if (target !== d.over) latest.current.onDragTarget(d.name, target);
      d.over = target;
      scroller.style.cursor = "grabbing";
      schedule();
    }
  };

  const endDrag = (drop: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    latest.current.onDragTarget(null, null);
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (scrollRef.current) scrollRef.current.style.cursor = "";
    if (drop && d.over) latest.current.onBranchDrop(d.name, d.over);
    schedule();
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) return;
    const i = commitIndexAt(e.clientY);
    if (i === null) return;
    if (i === -1) onSelectWip();
    else {
      const commit = latest.current.commits[i];
      if (commit) onSelect(commit);
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const chip = chipAt(localPoint(e));
    if (chip?.kind === "local") onCheckout({ kind: "local", name: chip.name });
    else if (chip?.kind === "remote") onCheckout({ kind: "remote", name: chip.name });
  };

  const onMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const i = commitIndexAt(e.clientY);
    if (i === null || i === -1) return;
    const commit = latest.current.commits[i];
    if (!commit) return;
    onSelect(commit);
    onContextMenu(commit, { x: e.clientX, y: e.clientY });
  };

  const total = displayCount * ROW_H;
  const hoverCommit = hoverRow !== null ? commits[hoverRow] : undefined;
  const hoverOverlay =
    hoverCommit && scrollRef.current
      ? {
          top: 26 + toDisplayIndex(hoverRow!, wipAt) * ROW_H - scrollRef.current.scrollTop,
          names: chipsFor(hoverCommit, refs).map((c) => c.name),
        }
      : null;
  const gW = graphWidth(maxLane, width || 800, refW, userGraphW);
  return (
    <div className="graph-wrap">
      <div className="graph-header" style={{ gridTemplateColumns: `${refW}px ${gW}px 1fr` }}>
        <div className="gh-cell">
          BRANCH / TAG
          <Splitter
            orientation="vertical"
            className="col-resizer"
            label="Largura da coluna BRANCH / TAG"
            value={refW}
            onChange={(next) => setUserRefW(Math.max(MIN_REF_W, Math.min(Math.floor(size.current.w * 0.6), Math.round(next))))}
            onCommit={() => storeWidth(REF_KEY, latest.current.refW)}
            onReset={() => {
              setUserRefW(null);
              storeWidth(REF_KEY, null);
            }}
          />
        </div>
        <div className="gh-cell">
          GRAPH
          <Splitter
            orientation="vertical"
            className="col-resizer"
            label="Largura da coluna GRAPH"
            value={gW}
            onChange={(next) => setUserGraphW(Math.max(48, Math.min(Math.floor((size.current.w - refW) * 0.6), Math.round(next))))}
            onCommit={() => storeWidth(GRAPH_KEY, latest.current.userGraphW)}
            onReset={() => {
              setUserGraphW(null);
              storeWidth(GRAPH_KEY, null);
            }}
          />
        </div>
        <div className="gh-cell">COMMIT MESSAGE</div>
      </div>
      <div
        ref={scrollRef}
        className="graph-scroll"
        onScroll={onScroll}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onPointerLeave={() => {
          setHoverRow(null);
          hoverDi.current = -1;
          schedule();
        }}
      >
        <canvas ref={canvasRef} className="graph-canvas" />
        <div style={{ height: Math.max(0, total - size.current.h) }} />
      </div>
      {hoverOverlay && (
        <div className="chip-overlay" style={{ top: hoverOverlay.top, maxWidth: Math.max(refW, 320) }}>
          {hoverOverlay.names.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}
