import { describe, expect, it } from "vitest";
import { MAX_RECENTS, loadSession, saveSession, type SessionDeps } from "../src/main/Session";

function fakeDeps(files: Record<string, string>, validRoots: string[]): SessionDeps & { files: Record<string, string> } {
  return {
    files,
    read: async (f) => files[f] ?? null,
    write: async (f, c) => {
      files[f] = c;
    },
    isRepoRoot: async (r) => validRoots.includes(r),
  };
}

const rec = (root: string, openedAt = "2026-10-15T10:00:00Z") => ({ root, openedAt });
const F = "session.json";
const empty = (over: object = {}) => JSON.stringify({ version: 1, tabs: [], active: null, recents: [], ...over });

describe("loadSession", () => {
  it("sem arquivo: sessão vazia", async () => {
    const { session, removed } = await loadSession(F, fakeDeps({}, []));
    expect(session).toEqual({ version: 1, tabs: [], active: null, recents: [] });
    expect(removed).toEqual([]);
  });

  it.each(["{ nao e json", "[]", empty({ version: 2 }), empty({ tabs: [1] })])(
    "arquivo corrompido ou inválido (%s) não impede abrir",
    async (content) => {
      const { session } = await loadSession(F, fakeDeps({ [F]: content }, []));
      expect(session.tabs).toEqual([]);
    },
  );

  it("descarta raízes que não existem mais e as informa em `removed`", async () => {
    const saved = empty({ tabs: ["C:/a", "C:/sumiu"], active: "C:/sumiu", recents: [rec("C:/a"), rec("C:/sumiu"), rec("C:/b")] });
    const { session, removed } = await loadSession(F, fakeDeps({ [F]: saved }, ["C:/a", "C:/b"]));

    expect(session.tabs).toEqual(["C:/a"]);
    expect(session.active).toBe("C:/a"); // a ativa sumiu: cai para a última aba restante
    expect(session.recents.map((r) => r.root)).toEqual(["C:/a", "C:/b"]);
    expect(removed).toEqual(["C:/sumiu"]);
  });

  it("remove duplicatas", async () => {
    const saved = empty({ tabs: ["C:/a", "C:/a"], active: "C:/a", recents: [rec("C:/a"), rec("C:/a")] });
    const { session } = await loadSession(F, fakeDeps({ [F]: saved }, ["C:/a"]));
    expect(session.tabs).toEqual(["C:/a"]);
    expect(session.recents).toHaveLength(1);
  });

  it("falha ao validar uma raiz conta como removida, não derruba o load", async () => {
    const deps = fakeDeps({ [F]: empty({ tabs: ["C:/a"] }) }, []);
    deps.isRepoRoot = async () => {
      throw new Error("boom");
    };
    const { session, removed } = await loadSession(F, deps);
    expect(session.tabs).toEqual([]);
    expect(removed).toEqual(["C:/a"]);
  });
});

describe("saveSession", () => {
  it("só grava raízes que o usuário abriu (opened)", async () => {
    const deps = fakeDeps({}, []);
    const incoming = { version: 1, tabs: ["C:/a", "C:/invasor"], active: "C:/invasor", recents: [rec("C:/a"), rec("C:/invasor")] };

    const saved = await saveSession(F, incoming, new Set(["C:/a"]), deps);

    expect(saved.tabs).toEqual(["C:/a"]);
    expect(saved.active).toBeNull();
    expect(saved.recents.map((r) => r.root)).toEqual(["C:/a"]);
    expect(JSON.parse(deps.files[F]!)).toEqual(saved);
  });

  it(`limita os recentes a ${MAX_RECENTS}`, async () => {
    const roots = Array.from({ length: 30 }, (_, i) => `C:/r${i}`);
    const incoming = { version: 1, tabs: [], active: null, recents: roots.map((r) => rec(r)) };
    const saved = await saveSession(F, incoming, new Set(roots), fakeDeps({}, []));
    expect(saved.recents).toHaveLength(MAX_RECENTS);
    expect(saved.recents[0]!.root).toBe("C:/r0");
  });

  it("recusa formato inválido", async () => {
    await expect(saveSession(F, { version: 1, tabs: "x" }, new Set(), fakeDeps({}, []))).rejects.toThrow();
  });
});
