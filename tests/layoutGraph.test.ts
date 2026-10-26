import { describe, expect, it } from "vitest";
import { emptyGraphState, layoutGraph } from "../src/shared/graph/layoutGraph";

type C = { hash: string; parents: string[] };
const c = (hash: string, ...parents: string[]): C => ({ hash, parents });

/** PRNG determinístico para os testes de propriedade. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** DAG aleatório já em ordem topológica: pais sempre vêm depois dos filhos. */
function randomDag(n: number, seed: number): C[] {
  const rnd = mulberry32(seed);
  const out: C[] = [];
  for (let i = 0; i < n; i++) {
    const parents = new Set<string>();
    if (i < n - 1) {
      const count = rnd() < 0.15 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const j = Math.min(n - 1, i + 1 + Math.floor(rnd() * 12));
        parents.add(`h${j}`);
      }
    }
    out.push({ hash: `h${i}`, parents: [...parents] });
  }
  return out;
}

describe("layoutGraph", () => {
  it("histórico linear usa uma única pista, sem cruzamentos", () => {
    const { rows } = layoutGraph([c("c3", "c2"), c("c2", "c1"), c("c1")]);

    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows[0]!.incoming).toEqual([]);
    expect(rows[1]!.incoming).toEqual([{ lane: 0, color: rows[0]!.color }]);
    expect(rows.every((r) => r.through.length === 0)).toBe(true);
    expect(rows[2]!.outgoing).toEqual([]);
  });

  it("losango (merge): abre segunda pista no merge e converge na base", () => {
    const { rows, state } = layoutGraph([c("M", "A", "B"), c("A", "Base"), c("B", "Base"), c("Base")]);
    const [m, a, b, base] = rows as [typeof rows[0], typeof rows[0], typeof rows[0], typeof rows[0]];

    expect(m.outgoing.map((o) => o.lane)).toEqual([0, 1]);
    expect(m.outgoing[0]!.color).not.toBe(m.outgoing[1]!.color);

    expect(a.lane).toBe(0);
    expect(a.through.map((t) => t.lane)).toEqual([1]);
    expect(b.lane).toBe(1);
    expect(b.through.map((t) => t.lane)).toEqual([0]);

    expect(base.lane).toBe(0);
    expect(base.incoming.map((i) => i.lane)).toEqual([0, 1]);
    expect(base.through).toEqual([]);
    expect(state.lanes.every((l) => l === null)).toBe(true);
  });

  it("segundo pai que já tem pista reaproveita-a em vez de abrir outra", () => {
    // M2 e M1 apontam para X; M1 tem X como segundo pai, já esperado por M2.
    const { rows } = layoutGraph([c("M2", "X"), c("M1", "Y", "X"), c("Y", "X"), c("X")]);

    expect(rows[1]!.outgoing.map((o) => o.lane)).toContain(0);
    expect(Math.max(...rows.map((r) => r.lane))).toBeLessThanOrEqual(1);
  });

  it("pista liberada é reutilizada por ramo posterior (largura não cresce à toa)", () => {
    const { state } = layoutGraph([
      c("M", "A", "B"),
      c("B"), // ramo B termina; libera a pista 1
      c("A", "Z"),
      c("N", "W", "V"), // novo merge deve reutilizar a pista 1
      c("W"),
      c("V"),
      c("Z"),
    ]);

    expect(state.maxLane).toBeLessThanOrEqual(2);
  });

  it("layout em duas páginas é idêntico ao layout de uma vez", () => {
    const dag = randomDag(500, 42);
    const whole = layoutGraph(dag);

    const first = layoutGraph(dag.slice(0, 217));
    const second = layoutGraph(dag.slice(217), first.state);

    expect([...first.rows, ...second.rows]).toEqual(whole.rows);
    expect(second.state).toEqual(whole.state);
  });

  it("não muta o estado recebido", () => {
    const first = layoutGraph([c("a", "b", "c")]);
    const snapshot = JSON.stringify(first.state);

    layoutGraph([c("b"), c("c")], first.state);

    expect(JSON.stringify(first.state)).toBe(snapshot);
  });

  it("invariantes em DAGs aleatórios completos", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const dag = randomDag(1500, seed);
      const referenced = new Set(dag.flatMap((x) => x.parents));
      const { rows, state } = layoutGraph(dag);

      rows.forEach((row, i) => {
        const commit = dag[i]!;
        const incomingLanes = row.incoming.map((x) => x.lane);
        const throughLanes = row.through.map((x) => x.lane);

        // toda linha de commit referenciado recebe a própria pista; ponta de ramo não recebe nada
        if (referenced.has(commit.hash)) expect(incomingLanes).toContain(row.lane);
        else expect(incomingLanes).toEqual([]);

        // pistas que atravessam nunca colidem com as que terminam no nó, nem se repetem
        expect(throughLanes).not.toContain(row.lane);
        expect(new Set(throughLanes).size).toBe(throughLanes.length);
        expect(incomingLanes.filter((l) => throughLanes.includes(l))).toEqual([]);

        // uma saída por pai
        expect(row.outgoing).toHaveLength(commit.parents.length);
      });

      // histórico completo: todos os pais foram encontrados, nenhuma pista fica pendente
      expect(state.lanes.every((l) => l === null)).toBe(true);
    }
  });

  it("50 mil commits em menos de 3 s (spike de desempenho do layout)", () => {
    const dag = randomDag(50_000, 7);

    const t0 = performance.now();
    const { rows } = layoutGraph(dag, emptyGraphState());
    const ms = performance.now() - t0;

    expect(rows).toHaveLength(50_000);
    expect(ms).toBeLessThan(3000);
    console.info(`layoutGraph 50k commits: ${ms.toFixed(0)} ms`);
  });
});
