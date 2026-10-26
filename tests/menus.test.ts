import { describe, expect, it } from "vitest";
import type { MenuEntry } from "../src/renderer/ContextMenu";
import { chipTarget, sidebarMenu, type MenuActions } from "../src/renderer/menus";
import type { BranchInfo, RefsSnapshot, RemoteBranchInfo } from "../src/shared/types";

/** Ações falsas: registram o que foi pedido. */
function fakeActions() {
  const calls: string[] = [];
  const record = (prefix: string) => new Proxy({}, { get: (_t, key) => (...args: unknown[]) => calls.push(`${prefix}.${String(key)}(${args.join(",")})`) });
  const a = { branches: record("branches"), commits: record("commits"), remotes: record("remotes"), discard: record("discard"), copy: () => undefined, openFolder: () => undefined } as unknown as MenuActions;
  return { a, calls };
}

const local = (name: string, isCurrent = false): BranchInfo => ({ name, isCurrent, upstream: null, ahead: 0, behind: 0, gone: false, hash: "a" });
const remote = (name: string): RemoteBranchInfo => ({ name, remote: "origin", hash: "b" });
const labels = (entries: MenuEntry[]) => entries.flatMap((e) => ("label" in e ? [e.label] : []));
const entry = (entries: MenuEntry[], label: string) => entries.find((e) => "label" in e && e.label === label) as Extract<MenuEntry, { label: string }>;

describe("sidebarMenu: merge e rebase com os nomes", () => {
  it("branch local diferente da atual", () => {
    const { a, calls } = fakeActions();
    const items = sidebarMenu({ kind: "branch", branch: local("Release/Master/26-10-2026") }, a, "master");
    expect(labels(items)).toContain("Fazer merge da branch Release/Master/26-10-2026 na branch master");
    expect(labels(items)).toContain("Fazer rebase da branch master em cima de Release/Master/26-10-2026");
    entry(items, "Fazer merge da branch Release/Master/26-10-2026 na branch master").onSelect();
    expect(calls).toEqual(["branches.merge(Release/Master/26-10-2026)"]);
  });

  it("branch remota usa o nome completo", () => {
    const { a } = fakeActions();
    const items = sidebarMenu({ kind: "remote", branch: remote("origin/Release/X") }, a, "master");
    expect(labels(items)).toContain("Fazer merge da branch origin/Release/X na branch master");
  });

  it("na própria branch atual não há merge nem rebase", () => {
    const { a } = fakeActions();
    const items = labels(sidebarMenu({ kind: "branch", branch: local("master", true) }, a, "master"));
    expect(items.some((l) => /merge|rebase/i.test(l))).toBe(false);
  });

  it("com HEAD destacado, fica desabilitado explicando", () => {
    const { a } = fakeActions();
    const items = sidebarMenu({ kind: "branch", branch: local("feature") }, a, null);
    const merge = items.find((e) => "label" in e && e.label.startsWith("Fazer merge")) as Extract<MenuEntry, { label: string }>;
    expect(merge.label).toMatch(/HEAD destacado/);
    expect(merge.disabled).toBe(true);
  });
});

describe("chipTarget: etiqueta do grafo vira o alvo do menu da sidebar", () => {
  const refs: RefsSnapshot = {
    remotes: [],
    branches: [local("master", true), local("feature")],
    remoteBranches: [remote("origin/Release/Master/26-10-2026")],
    tags: [{ name: "v1", hash: "c" }],
    stashes: [],
  };

  it("branch local abre o menu da sidebar com o merge na branch atual", () => {
    const { a, calls } = fakeActions();
    const target = chipTarget({ name: "feature", kind: "local" }, refs);
    expect(target).toEqual({ kind: "branch", branch: refs.branches[1] });
    const items = sidebarMenu(target!, a, "master");
    entry(items, "Fazer merge da branch feature na branch master").onSelect();
    expect(calls).toEqual(["branches.merge(feature)"]);
  });

  it("branch remota abre o menu da remota", () => {
    const { a } = fakeActions();
    const target = chipTarget({ name: "origin/Release/Master/26-10-2026", kind: "remote" }, refs);
    expect(target?.kind).toBe("remote");
    const items = labels(sidebarMenu(target!, a, "master"));
    expect(items).toContain("Checkout (cria branch local)");
    expect(items).toContain("Fazer merge da branch origin/Release/Master/26-10-2026 na branch master");
    expect(items).toContain("Fazer rebase da branch master em cima de origin/Release/Master/26-10-2026");
  });

  it("tag abre o menu de tag", () => {
    const { a } = fakeActions();
    const target = chipTarget({ name: "v1", kind: "tag" }, refs);
    expect(labels(sidebarMenu(target!, a, "master"))).toContain("Publicar no remoto");
  });

  it("HEAD destacado deixa o merge da etiqueta desabilitado", () => {
    const { a } = fakeActions();
    const items = sidebarMenu(chipTarget({ name: "feature", kind: "local" }, refs)!, a, null);
    const merge = entry(items, "Fazer merge da branch feature (sem branch atual: HEAD destacado)");
    expect(merge.disabled).toBe(true);
  });

  it("etiqueta HEAD, ref ausente ou sem refs: menu do commit", () => {
    expect(chipTarget({ name: "HEAD", kind: "head" }, refs)).toBeNull();
    expect(chipTarget({ name: "sumiu", kind: "local" }, refs)).toBeNull();
    expect(chipTarget({ name: "feature", kind: "local" }, null)).toBeNull();
  });
});
