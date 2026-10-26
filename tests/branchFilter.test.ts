import { describe, expect, it } from "vitest";
import type { RefsSnapshot } from "../src/shared/types";
import { filterRefs } from "../src/renderer/branchFilter";

const refs: RefsSnapshot = {
  remotes: [
    { name: "origin", fetchUrl: "u1", pushUrl: "u1" },
    { name: "fork", fetchUrl: "u2", pushUrl: "u2" },
  ],
  branches: [
    { name: "main", isCurrent: true, upstream: null, ahead: 0, behind: 0, gone: false, hash: "a" },
    { name: "feature/a", isCurrent: false, upstream: null, ahead: 0, behind: 0, gone: false, hash: "b" },
  ],
  remoteBranches: [
    { name: "origin/main", remote: "origin", hash: "a" },
    { name: "origin/Feature/b", remote: "origin", hash: "c" },
  ],
  tags: [],
  stashes: [],
} as unknown as RefsSnapshot;

describe("filterRefs", () => {
  it("termo vazio ou só espaços devolve tudo", () => {
    for (const q of ["", "   "]) {
      const r = filterRefs(refs, q);
      expect(r.branches).toHaveLength(2);
      expect(r.remoteBranches).toHaveLength(2);
      expect([...r.visibleRemotes].sort()).toEqual(["fork", "origin"]);
    }
  });

  it("casa por substring sem diferenciar maiúsculas, em locais e remotas", () => {
    const r = filterRefs(refs, "  FEAT ");
    expect(r.branches.map((b) => b.name)).toEqual(["feature/a"]);
    expect(r.remoteBranches.map((b) => b.name)).toEqual(["origin/Feature/b"]);
  });

  it("o nome do remote não casa", () => {
    const r = filterRefs(refs, "origin");
    expect(r.branches).toEqual([]);
    expect(r.remoteBranches).toEqual([]);
    expect(r.visibleRemotes.size).toBe(0);
  });

  it("visibleRemotes só inclui remotes com casamento", () => {
    const r = filterRefs(refs, "main");
    expect(r.branches.map((b) => b.name)).toEqual(["main"]);
    expect([...r.visibleRemotes]).toEqual(["origin"]);
  });

  it("sem nenhum resultado", () => {
    const r = filterRefs(refs, "zzz");
    expect(r.branches).toEqual([]);
    expect(r.remoteBranches).toEqual([]);
    expect(r.visibleRemotes.size).toBe(0);
  });
});
