import { describe, expect, it } from "vitest";
import type { MenuEntry } from "../src/renderer/ContextMenu";
import { sidebarMenu, type MenuActions } from "../src/renderer/menus";
import type { BranchInfo, RemoteBranchInfo } from "../src/shared/types";

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
