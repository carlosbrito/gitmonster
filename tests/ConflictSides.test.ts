import { describe, expect, it } from "vitest";
import { describeSides, mergedRef, type SideFacts } from "../src/main/git/ConflictSides";

const facts = (f: Partial<SideFacts> = {}): SideFacts => ({
  branch: "apresentacao",
  head: null,
  mergeMsg: null,
  mergeHead: null,
  commit: null,
  rebaseBranch: null,
  rebaseOnto: null,
  ...f,
});

describe("mergedRef", () => {
  it("extrai a ref das mensagens que o git grava", () => {
    expect(mergedRef("Merge branch 'feature'")).toBe("feature");
    expect(mergedRef("Merge branch 'feature' into main")).toBe("feature");
    expect(mergedRef("Merge remote-tracking branch 'origin/Feature/55694/Discador' into apresentacao")).toBe("origin/Feature/55694/Discador");
    expect(mergedRef("Merge tag 'v1.0'")).toBe("v1.0");
    expect(mergedRef("Merge commit 'abc1234'")).toBe("abc1234");
  });

  it("devolve null para mensagem editada ou ausente", () => {
    expect(mergedRef("minha mensagem")).toBeNull();
    expect(mergedRef(null)).toBeNull();
  });
});

describe("describeSides", () => {
  it("merge: nosso é a branch atual, deles a ref da mensagem", () => {
    const s = describeSides("merge", facts({ mergeMsg: "Merge remote-tracking branch 'origin/Feature/x' into apresentacao", mergeHead: "a1b2c3d" }));
    expect(s).toEqual({ ours: { name: "apresentacao", detail: null }, theirs: { name: "origin/Feature/x", detail: null } });
  });

  it("merge com mensagem ilegível cai no SHA curto de MERGE_HEAD", () => {
    expect(describeSides("merge", facts({ mergeMsg: "outra coisa", mergeHead: "a1b2c3d" }))?.theirs.name).toBe("a1b2c3d");
  });

  it("HEAD destacado mostra o SHA curto como detalhe", () => {
    const s = describeSides("merge", facts({ branch: null, head: "9f8e7d6", mergeMsg: "Merge branch 'feature'" }));
    expect(s?.ours).toEqual({ name: "HEAD destacado", detail: "9f8e7d6" });
  });

  it("cherry-pick: deles é o commit com o assunto", () => {
    const s = describeSides("cherry-pick", facts({ branch: "dev", commit: { hash: "a1b2c3d", subject: "corrige cálculo" } }));
    expect(s).toEqual({ ours: { name: "dev", detail: null }, theirs: { name: "a1b2c3d", detail: "corrige cálculo" } });
  });

  it("revert: deles é o commit revertido", () => {
    const s = describeSides("revert", facts({ branch: "dev", commit: { hash: "a1b2c3d", subject: "corrige cálculo" } }));
    expect(s?.theirs).toEqual({ name: "a1b2c3d", detail: "revertendo: corrige cálculo" });
  });

  it("rebase: nosso é a base, deles a branch rebaseada com o commit da vez", () => {
    const s = describeSides("rebase", facts({ branch: null, rebaseOnto: "main", rebaseBranch: "feature", commit: { hash: "a1b2c3d", subject: "feat" } }));
    expect(s).toEqual({ ours: { name: "main", detail: "base do rebase" }, theirs: { name: "feature", detail: "a1b2c3d feat" } });
  });

  it("rebase sem REBASE_HEAD mantém o nome da branch", () => {
    expect(describeSides("rebase", facts({ rebaseOnto: "main", rebaseBranch: "feature" }))?.theirs).toEqual({ name: "feature", detail: null });
  });

  it("sem operação ou sem os fatos essenciais devolve null", () => {
    expect(describeSides(null, facts())).toBeNull();
    expect(describeSides("cherry-pick", facts())).toBeNull();
    expect(describeSides("merge", facts())).toBeNull();
    expect(describeSides("rebase", facts())).toBeNull();
  });
});
