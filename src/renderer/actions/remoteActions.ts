import type { PullMode } from "../../shared/types";
import { doOperation, type ActionCtx } from "./context";

/** Fetch, pull, push, force push e tags publicadas. */
export function remoteActions(ctx: ActionCtx) {
  const { root, run, ask, setNotice } = ctx;
  const remoteOp = (label: string, op: (root: string) => Promise<void>) =>
    void run(async () => {
      await op(root);
      setNotice(`${label} concluído.`);
    }, "all");

  return {
    fetch: () => remoteOp("Fetch", window.gitmonster.fetch),
    // merge/rebase podem parar em conflito: doOperation explica e deixa a faixa de operação em andamento.
    pull: (mode: PullMode) => doOperation(ctx, "O pull", (r) => window.gitmonster.pull(r, mode)),
    push: () => remoteOp("Push", window.gitmonster.push),

    forcePush: () =>
      void run(async () => {
        const yes = await ask(
          "O force push substitui a branch remota pelo seu histórico local. Usa --force-with-lease: só vale se ninguém publicou nada novo desde o seu último fetch. Mesmo assim, commits remotos que você já buscou e não tem serão perdidos no remoto.",
          "Force push",
        );
        if (!yes) return;
        await window.gitmonster.forcePush(root);
        setNotice("Force push concluído.");
      }, "all"),

    /** Pede nome e URL num diálogo e adiciona o remote. */
    addRemote: () =>
      void run(async () => {
        const result = await ctx.askForm({ title: "Adicionar remote", nameLabel: "Nome", secondLabel: "URL", confirmLabel: "Adicionar" });
        if (!result) return;
        await window.gitmonster.addRemote(root, result.name, result.second);
        setNotice(`Remote "${result.name}" adicionado. Use Fetch para trazer as branches dele.`);
      }, "all"),

    removeRemote: (name: string) =>
      void run(async () => {
        if (!(await ask(`Remover o remote "${name}"? As branches de rastreamento dele (${name}/...) também somem daqui; nada é apagado no servidor.`, "Remover remote"))) return;
        await window.gitmonster.removeRemote(root, name);
      }, "all"),

    /** `fullName` é o nome de rastreamento completo, ex.: origin/feature/x. */
    deleteRemoteBranch: (remote: string, fullName: string) =>
      void run(async () => {
        const branch = fullName.slice(remote.length + 1);
        const question = `Apagar a branch "${branch}" no servidor "${remote}"? Isto afeta todo mundo que usa o remote e não dá para desfazer por aqui.`;
        if (!(await ask(question, "Apagar no remote"))) return;
        await window.gitmonster.deleteRemoteBranch(root, remote, branch);
        setNotice(`Branch "${branch}" apagada em ${remote}.`);
      }, "all"),

    /** Apaga várias branches de um remote com uma confirmação; devolve false se o usuário desistiu. */
    deleteRemoteBranches: async (remote: string, fullNames: string[]) => {
      let done = false;
      await run(async () => {
        const shown = fullNames.length > 10 ? [...fullNames.slice(0, 10), `… e mais ${fullNames.length - 10}`] : fullNames;
        const question = `Apagar ${fullNames.length} branch(es) no servidor "${remote}"? Isto afeta todo mundo que usa o remote e não dá para desfazer por aqui.
${shown.join("\n")}`;
        if (!(await ask(question, "Apagar no remote"))) return;
        const failed: string[] = [];
        for (const fullName of fullNames) {
          try {
            await window.gitmonster.deleteRemoteBranch(root, remote, fullName.slice(remote.length + 1));
          } catch {
            failed.push(fullName);
          }
        }
        done = true;
        const deleted = fullNames.length - failed.length;
        setNotice(failed.length > 0 ? `${deleted} apagada(s) em ${remote}; falhou: ${failed.join(", ")}.` : `${deleted} branch(es) apagada(s) em ${remote}.`);
      }, "all");
      return done;
    },

    pushTag: (name: string) =>
      void run(async () => {
        await window.gitmonster.pushTag(root, name);
        setNotice(`Tag "${name}" publicada.`);
      }),
  };
}
