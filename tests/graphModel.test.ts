import { describe, expect, it } from "vitest";
import type { RefsSnapshot } from "../src/shared/types";
import { autoRefWidth, chipLabel, chipsFor, hashIndex, initials, PULSE_MS, pulseAlpha, relativeTime, revealScrollTop, toCommitIndex, toDisplayIndex, wipRowIndex } from "../src/renderer/graphModel";

const refs = (over: Partial<RefsSnapshot> = {}): RefsSnapshot => ({
  branches: [
    { name: "main", isCurrent: true, upstream: "origin/main", ahead: 0, behind: 0, gone: false, hash: "a" },
    { name: "feature/x", isCurrent: false, upstream: null, ahead: 0, behind: 0, gone: false, hash: "b" },
  ],
  remoteBranches: [
    { name: "origin/main", remote: "origin", hash: "a" },
    { name: "origin/outra", remote: "origin", hash: "c" },
  ],
  tags: [],
  stashes: [],
  remotes: [{ name: "origin", fetchUrl: "", pushUrl: "" }],
  ...over,
});

describe("chipsFor", () => {
  it("branch atual primeiro; local + remota do mesmo commit viram um chip com nuvem", () => {
    const chips = chipsFor({ refs: ["HEAD -> main", "origin/main", "origin/HEAD", "feature/x"] }, refs());
    expect(chips).toEqual([
      { name: "main", kind: "local", current: true, hasRemote: true },
      { name: "feature/x", kind: "local", current: false, hasRemote: false },
    ]);
  });

  it("remota sem local no commit continua como chip remoto; tags por último", () => {
    const chips = chipsFor({ refs: ["tag: v1", "origin/outra", "main"] }, refs());
    expect(chips.map((c) => [c.name, c.kind])).toEqual([
      ["main", "local"],
      ["origin/outra", "remote"],
      ["v1", "tag"],
    ]);
  });

  it("branch local à frente do upstream leva ↑N na etiqueta", () => {
    const ahead = refs({
      branches: [{ name: "main", isCurrent: true, upstream: "origin/main", ahead: 2, behind: 0, gone: false, hash: "a" }],
    });
    const [chip] = chipsFor({ refs: ["HEAD -> main"] }, ahead);
    expect(chip).toMatchObject({ name: "main", ahead: 2 });
    expect(chipLabel(chip!)).toBe("● main ↑2");
  });

  it("sem upstream não mostra ↑N", () => {
    const noUpstream = refs({
      branches: [{ name: "solta", isCurrent: false, upstream: null, ahead: 3, behind: 0, gone: false, hash: "a" }],
    });
    expect(chipLabel(chipsFor({ refs: ["solta"] }, noUpstream)[0]!)).toBe("solta");
  });

  it("branch local com barra no nome não é confundida com remota", () => {
    expect(chipsFor({ refs: ["feature/x"] }, refs())[0]).toMatchObject({ name: "feature/x", kind: "local" });
  });

  it("HEAD solto (detached) vira chip HEAD; sem refs conhecidas tudo é local", () => {
    expect(chipsFor({ refs: ["HEAD"] }, refs())).toEqual([{ name: "HEAD", kind: "head", current: true, hasRemote: false }]);
    expect(chipsFor({ refs: ["qualquer"] }, null)[0]).toMatchObject({ kind: "local" });
  });

  it("sem decorações, sem chips", () => {
    expect(chipsFor({ refs: [] }, refs())).toEqual([]);
  });
});

describe("initials / hashIndex", () => {
  it.each([
    ["Ana Souza", "AS"],
    ["ana", "A"],
    ["  Carlos  Alberto  de Brito ", "CB"],
    ["", "?"],
  ])("%j → %s", (name, out) => expect(initials(name)).toBe(out));

  it("hashIndex é estável e fica dentro da paleta", () => {
    expect(hashIndex("ana@x.com", 8)).toBe(hashIndex("ana@x.com", 8));
    for (const s of ["a", "bruno@x.com", "", "ççç"]) expect(hashIndex(s, 8)).toBeLessThan(8);
  });
});

describe("linha WIP", () => {
  const commits = [{ refs: [] }, { refs: ["HEAD -> main"] }, { refs: [] }];

  it("fica logo acima do commit de HEAD; sem HEAD carregado, no topo; sem alterações, nenhuma", () => {
    expect(wipRowIndex(commits, true)).toBe(1);
    expect(wipRowIndex([{ refs: [] }], true)).toBe(0);
    expect(wipRowIndex(commits, false)).toBe(-1);
  });

  it("converte entre linhas exibidas e commits", () => {
    // exibidas: c0, WIP, c1, c2
    expect([0, 1, 2, 3].map((d) => toCommitIndex(d, 1))).toEqual([0, -1, 1, 2]);
    expect([0, 1, 2].map((c) => toDisplayIndex(c, 1))).toEqual([0, 2, 3]);
    // sem WIP nada muda
    expect([0, 1, 2].map((d) => toCommitIndex(d, -1))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((c) => toDisplayIndex(c, -1))).toEqual([0, 1, 2]);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  it.each([
    ["2026-10-15T11:59:40Z", "agora"],
    ["2026-10-15T11:55:00Z", "há 5 min"],
    ["2026-10-15T09:00:00Z", "há 3 h"],
    ["2026-10-13T12:00:00Z", "há 2 d"],
    ["2026-07-01T12:00:00Z", "há 3 meses"],
    ["2026-09-10T12:00:00Z", "há 1 mês"],
    ["lixo", ""],
  ])("%s → %s", (iso, out) => expect(relativeTime(iso, now)).toBe(out));

  it("mais de um ano vira data; data no futuro conta como agora", () => {
    expect(relativeTime("2020-01-02T12:00:00Z", now)).toMatch(/2020/);
    expect(relativeTime("2027-01-01T00:00:00Z", now)).toBe("agora");
  });
});

describe("revealScrollTop", () => {
  it("centraliza a linha na área visível", () => {
    // linha 100 (28 px) numa área de 400 px, lista de 1000 linhas
    expect(revealScrollTop(100, 28, 400, 28_000)).toBe(100 * 28 + 14 - 200);
  });

  it("não passa do início", () => {
    expect(revealScrollTop(2, 28, 400, 28_000)).toBe(0);
  });

  it("não passa do fim", () => {
    expect(revealScrollTop(999, 28, 400, 28_000)).toBe(28_000 - 400);
  });

  it("lista menor que a área não rola", () => {
    expect(revealScrollTop(3, 28, 400, 10 * 28)).toBe(0);
  });
});

describe("pulseAlpha", () => {
  it("começa visível e fica entre 0 e 1", () => {
    expect(pulseAlpha(0)).toBeGreaterThan(0.4);
    for (let t = 0; t < PULSE_MS; t += 50) {
      const a = pulseAlpha(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("é zero ao terminar e antes de começar", () => {
    expect(pulseAlpha(PULSE_MS)).toBe(0);
    expect(pulseAlpha(PULSE_MS + 500)).toBe(0);
    expect(pulseAlpha(-10)).toBe(0);
  });

  it("vai se apagando: a primeira batida é mais forte que a última", () => {
    expect(pulseAlpha(0)).toBeGreaterThan(pulseAlpha(1600));
  });
});

describe("autoRefWidth", () => {
  it("mantém o padrão quando as etiquetas são curtas", () => {
    expect(autoRefWidth(80, 1200, 140, 270)).toBe(270);
  });
  it("cresce para caber a maior etiqueta", () => {
    expect(autoRefWidth(350, 1200, 140, 270)).toBe(372);
  });
  it("não passa de 60% da largura", () => {
    expect(autoRefWidth(900, 1000, 140, 270)).toBe(600);
  });
});
