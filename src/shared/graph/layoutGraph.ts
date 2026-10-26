import type { Commit } from "../types";

/** Uma "pista" (coluna) do grafo com sua cor lógica. A paleta é decidida pelo renderer. */
export interface LaneRef {
  lane: number;
  color: number;
}

/**
 * Geometria de uma linha do grafo, de cima (y0) para baixo (y1) com o nó no meio:
 *  - `incoming`: pistas que chegam de cima e terminam neste commit (inclui a própria pista do nó);
 *  - `through`: pistas que atravessam a linha sem tocar o nó;
 *  - `outgoing`: pistas para onde o nó segue embaixo, uma por pai.
 */
export interface GraphRow {
  hash: string;
  lane: number;
  color: number;
  incoming: LaneRef[];
  through: LaneRef[];
  outgoing: LaneRef[];
}

/** Estado entre páginas: permite continuar o layout sem recalcular o que já foi desenhado. */
export interface GraphState {
  /** `lanes[i]` é o hash que a pista `i` espera encontrar, ou null se livre. */
  lanes: (string | null)[];
  colors: number[];
  nextColor: number;
  /** Maior índice de pista já usado (define a largura da coluna do grafo). */
  maxLane: number;
}

export interface GraphLayout {
  rows: GraphRow[];
  state: GraphState;
}

export function emptyGraphState(): GraphState {
  return { lanes: [], colors: [], nextColor: 0, maxLane: 0 };
}

/**
 * Atribui pistas a commits em ordem topológica (filhos antes dos pais).
 *
 * Regras (algoritmo clássico de grafo de git):
 *  - o primeiro pai continua na pista do commit; os demais reutilizam uma pista que já
 *    espere aquele pai ou abrem a primeira pista livre;
 *  - várias pistas podem esperar o mesmo commit (ramos que divergiram dele): todas
 *    convergem na linha dele, que fica na menor delas e libera as outras.
 *
 * Não muta `prev`. Complexidade O(commits × pistas abertas).
 */
export function layoutGraph(
  commits: ReadonlyArray<Pick<Commit, "hash" | "parents">>,
  prev: GraphState = emptyGraphState(),
): GraphLayout {
  const lanes = prev.lanes.slice();
  const colors = prev.colors.slice();
  let nextColor = prev.nextColor;
  let maxLane = prev.maxLane;
  const rows: GraphRow[] = new Array(commits.length);

  const firstFree = (): number => {
    let i = 0;
    while (lanes[i] != null) i++;
    return i;
  };

  for (let r = 0; r < commits.length; r++) {
    const commit = commits[r]!;
    const hash = commit.hash;

    const matches: number[] = [];
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === hash) matches.push(i);

    const lane = matches.length > 0 ? matches[0]! : firstFree();
    const color = matches.length > 0 ? colors[lane]! : nextColor++;

    const incoming: LaneRef[] = matches.map((i) => ({ lane: i, color: colors[i]! }));
    const through: LaneRef[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] != null && lanes[i] !== hash) through.push({ lane: i, color: colors[i]! });
    }

    for (const m of matches) lanes[m] = null;

    const outgoing: LaneRef[] = [];
    const parents = commit.parents;
    for (let p = 0; p < parents.length; p++) {
      const parent = parents[p]!;
      if (p === 0) {
        lanes[lane] = parent;
        colors[lane] = color;
        outgoing.push({ lane, color });
        continue;
      }
      const existing = lanes.indexOf(parent);
      if (existing >= 0) {
        outgoing.push({ lane: existing, color: colors[existing]! });
      } else {
        const l = firstFree();
        lanes[l] = parent;
        colors[l] = nextColor++;
        outgoing.push({ lane: l, color: colors[l]! });
      }
    }

    let rowMax = lane;
    for (const ref of incoming) if (ref.lane > rowMax) rowMax = ref.lane;
    for (const ref of through) if (ref.lane > rowMax) rowMax = ref.lane;
    for (const ref of outgoing) if (ref.lane > rowMax) rowMax = ref.lane;
    if (rowMax > maxLane) maxLane = rowMax;

    rows[r] = { hash, lane, color, incoming, through, outgoing };
  }

  return { rows, state: { lanes, colors, nextColor, maxLane } };
}
