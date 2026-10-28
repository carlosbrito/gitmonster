import type { CheckoutTarget } from "../../shared/types";
import { errorMessage } from "../util";
import { OPERATION_LABEL, STOPPED_NOTICE, doOperation, type ActionCtx } from "./context";

/** Lista de nomes para o texto de confirmação; abrevia quando é longa. */
const listNames = (names: string[]) => (names.length > 10 ? [...names.slice(0, 10), `… e mais ${names.length - 10}`] : names).join("\n");

/** Branches, rebase, operações paradas e stash. */
export function branchActions(ctx: ActionCtx) {
  const { root, run, ask, askRebase, askDrop, setNotice, status } = ctx;
  const operationLabel = (fallback: string) => (status?.operation ? OPERATION_LABEL[status.operation] : fallback);

  /** Fim do aviso de merge: com upstream e commits a enviar, deixa claro que o merge é local e falta o push. */
  const mergedNotice = async (branch: string | null): Promise<string> => {
    if (!branch) return " concluído.";
    const info = (await window.gitmonster.refs(root)).branches.find((b) => b.name === branch);
    return info?.upstream && info.ahead > 0 ? ` concluído localmente; falta o push (↑${info.ahead}).` : " concluído.";
  };

  /**
   * Operação que move o HEAD (merge, rebase): recarrega tudo e, se terminou sem conflito, leva o grafo até o
   * HEAD e o destaca, como no checkout. `op` devolve true quando o grafo deve ser revelado.
   */
  const moveHead = (op: () => Promise<boolean>) => {
    let reveal = false;
    void run(async () => {
      reveal = await op();
    }, "all").then((ok) => (ok && reveal ? ctx.revealHead() : undefined));
  };

  return {
    checkout: (target: CheckoutTarget) => {
      let switched = false;
      void run(async () => {
        if (target.kind === "remote") {
          const plan = await window.gitmonster.remoteCheckoutPlan(root, target.name);
          if (plan.differs && plan.localName) {
            const lost = plan.ahead > 0 ? ` Os ${plan.ahead} commit(s) que só existem na local deixarão de estar na branch (continuam no reflog).` : "";
            const ok = await ask(
              `A branch local "${plan.localName}" é diferente de "${target.name}" (${plan.ahead} à frente, ${plan.behind} atrás). Ela vai ser igualada à remota.${lost}`,
              "Igualar à remota",
            );
            if (!ok) return;
            await window.gitmonster.checkout(root, { ...target, matchRemote: true });
            switched = true;
            return;
          }
        }
        await window.gitmonster.checkout(root, target);
        switched = true;
      }, "all").then((ok) => (ok && switched ? ctx.revealHead() : undefined));
    },

    create: (name: string) => run(() => window.gitmonster.createBranch(root, name, null, true), "all"),

    /** Nova branch apontando para `base` (local ou remota, ex.: origin/x) e checkout dela. */
    createFrom: (base: string) =>
      void run(async () => {
        const result = await ctx.askForm({ title: `Nova branch a partir de ${base}`, nameLabel: "Nome da branch", confirmLabel: "Criar e mudar" });
        if (!result) return;
        await window.gitmonster.createBranch(root, result.name, base, true);
      }, "all"),

    rename: (oldName: string) =>
      void run(async () => {
        const result = await ctx.askForm({ title: `Renomear "${oldName}"`, nameLabel: "Novo nome", confirmLabel: "Renomear" });
        if (!result) return;
        await window.gitmonster.renameBranch(root, oldName, result.name);
        setNotice(`Branch renomeada para "${result.name}". O upstream continua apontando para o nome antigo no remote.`);
      }, "all"),

    /**
     * Arrastar `source` sobre `target`: pergunta se é merge (de `source` em `target`) ou rebase (de `source`
     * em cima de `target`); o app muda de branch quando o Git exige.
     */
    dropOnto: (source: string, target: string, sourceIsLocal: boolean) =>
      moveHead(async () => {
        const choice = await askDrop(source, target, status?.branch ?? null, sourceIsLocal);
        if (choice === "merge") {
          const result = await window.gitmonster.mergeInto(root, source, target);
          if (result.conflicted) setNotice(`O merge de "${source}" em "${target}" ${STOPPED_NOTICE}`);
          else setNotice(`Merge de "${source}" em "${target}"${await mergedNotice(target)}`);
          return !result.conflicted;
        }
        if (choice === "rebase") {
          const result = await window.gitmonster.rebaseBranch(root, source, target);
          setNotice(
            result.conflicted
              ? `O rebase de "${source}" em "${target}" ${STOPPED_NOTICE}`
              : `Rebase de "${source}" em cima de "${target}" concluído.`,
          );
          return !result.conflicted;
        }
        return false;
      }),

    merge: (name: string) =>
      moveHead(async () => {
        const current = status?.branch ?? null;
        const result = await window.gitmonster.merge(root, name);
        if (result.conflicted) setNotice(`O merge de "${name}" ${STOPPED_NOTICE}`);
        else setNotice(`Merge de "${name}"${current ? ` em "${current}"` : ""}${await mergedNotice(current)}`);
        return !result.conflicted;
      }),

    rebase: (onto: string) =>
      moveHead(async () => {
        const branch = status?.branch ?? "a branch atual";
        const yes = await ask(
          `Fazer rebase de "${branch}" em cima de "${onto}"? Isto reescreve os commits da branch; se eles já foram publicados, será preciso force push.`,
          "Fazer rebase",
        );
        if (!yes) return false;
        const result = await window.gitmonster.rebase(root, onto);
        setNotice(result.conflicted ? `O rebase ${STOPPED_NOTICE}` : "Rebase concluído.");
        return !result.conflicted;
      }),

    interactiveRebase: (onto: string, ontoLabel: string) =>
      void run(async () => {
        const plan = await window.gitmonster.rebasePlan(root, onto);
        if (plan.hasMerges) throw new Error("Há commits de merge neste intervalo: o rebase interativo os achataria. Use um ponto mais recente.");
        if (plan.commits.length === 0) throw new Error("Não há commits depois deste ponto para reordenar.");
        const steps = await askRebase(ontoLabel, plan);
        if (!steps) return;
        const result = await window.gitmonster.rebaseInteractive(root, onto, steps);
        setNotice(result.conflicted ? `O rebase ${STOPPED_NOTICE}` : "Rebase interativo concluído.");
      }, "all"),

    continueOperation: () =>
      doOperation(ctx, operationLabel("A operação"), (r) => window.gitmonster.operationContinue(r)),

    skipOperation: () => doOperation(ctx, operationLabel("A operação"), (r) => window.gitmonster.operationSkip(r)),

    abortOperation: () =>
      void run(async () => {
        const label = operationLabel("a operação");
        if (!(await ask(`Abortar ${label}? As resoluções de conflito já feitas serão descartadas.`, "Abortar"))) return;
        await window.gitmonster.operationAbort(root);
        setNotice(`${label} abortado.`);
      }, "all"),

    deleteBranch: (name: string) =>
      void run(async () => {
        if (!(await ask(`Apagar a branch "${name}"?`, "Apagar"))) return;
        try {
          await window.gitmonster.deleteBranch(root, name, false);
        } catch (e) {
          // `-d` recusa branch com commits que não estão em nenhuma outra: só `-D` apaga, perdendo-os.
          if (!/not fully merged/i.test(errorMessage(e))) throw e;
          if (!(await ask(`"${name}" tem commits que não foram mesclados em nenhuma branch. Apagar mesmo assim vai perdê-los.`, "Apagar e perder commits"))) return;
          await window.gitmonster.deleteBranch(root, name, true);
        }
      }, "all"),

    /** Apaga várias branches locais com uma confirmação; devolve false se o usuário desistiu. */
    deleteBranches: async (names: string[]) => {
      let done = false;
      await run(async () => {
        if (!(await ask(`Apagar ${names.length} branch(es)?
${listNames(names)}`, "Apagar"))) return;
        const unmerged: string[] = [];
        const failed: string[] = [];
        let deleted = 0;
        for (const name of names) {
          try {
            await window.gitmonster.deleteBranch(root, name, false);
            deleted++;
          } catch (e) {
            // `-d` recusa branch com commits que não estão em nenhuma outra: só `-D` apaga, perdendo-os.
            if (/not fully merged/i.test(errorMessage(e))) unmerged.push(name);
            else failed.push(name);
          }
        }
        if (unmerged.length > 0 && (await ask(`${unmerged.length} branch(es) têm commits que não foram mesclados em nenhuma branch. Apagar mesmo assim vai perdê-los:
${listNames(unmerged)}`, "Apagar e perder commits"))) {
          for (const name of unmerged) {
            try {
              await window.gitmonster.deleteBranch(root, name, true);
              deleted++;
            } catch {
              failed.push(name);
            }
          }
        }
        done = true;
        setNotice(failed.length > 0 ? `${deleted} apagada(s); falhou: ${failed.join(", ")}.` : `${deleted} branch(es) apagada(s).`);
      }, "all");
      return done;
    },

    stashPush: (message: string, includeUntracked: boolean) =>
      run(() => window.gitmonster.stashPush(root, message, includeUntracked)),

    stashPop: (index: number) => void run(() => window.gitmonster.stashPop(root, index)),

    stashDrop: (index: number) =>
      void run(async () => {
        if (!(await ask("Descartar este stash? As alterações guardadas nele serão perdidas.", "Descartar"))) return;
        await window.gitmonster.stashDrop(root, index);
      }),
  };
}
