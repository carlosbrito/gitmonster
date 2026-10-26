import type { ResetMode } from "../../shared/types";
import { short } from "../util";
import { doOperation, type ActionCtx } from "./context";

/** Ações sobre um commit do histórico, e tags locais. */
export function commitActions(ctx: ActionCtx) {
  const { root, run, ask, askForm, setNotice, status } = ctx;

  return {
    undo: () => void run(() => window.gitmonster.undo(root), "all"),
    redo: () => void run(() => window.gitmonster.redo(root), "all"),

    cherryPick: (hash: string) => doOperation(ctx, "O cherry-pick", (r) => window.gitmonster.cherryPick(r, hash)),

    revert: (hash: string) => doOperation(ctx, "O revert", (r) => window.gitmonster.revert(r, hash)),

    reset: (hash: string, mode: ResetMode) =>
      void run(async () => {
        const text: Record<ResetMode, string> = {
          soft: `Mover "${status?.branch ?? "HEAD"}" para ${short(hash)}? Os commits depois dele saem da branch, mas as alterações deles ficam no stage.`,
          mixed: `Mover "${status?.branch ?? "HEAD"}" para ${short(hash)}? Os commits depois dele saem da branch e as alterações deles ficam no disco, fora do stage.`,
          hard: `Mover "${status?.branch ?? "HEAD"}" para ${short(hash)} e DESCARTAR todas as alterações não commitadas e os commits depois dele? Só dá para recuperar pelo reflog.`,
        };
        if (!(await ask(text[mode], `Reset ${mode}`))) return;
        await window.gitmonster.reset(root, hash, mode);
        setNotice(`Reset ${mode} para ${short(hash)} concluído.`);
      }, "all"),

    tagHere: (hash: string) =>
      void run(async () => {
        const result = await askForm({
          title: `Nova tag em ${short(hash)}`,
          nameLabel: "Nome da tag",
          messageLabel: "Mensagem (opcional: com mensagem a tag é anotada)",
          confirmLabel: "Criar tag",
        });
        if (!result) return;
        await window.gitmonster.createTag(root, result.name, hash, result.message);
        setNotice(`Tag "${result.name}" criada.`);
      }),

    branchHere: (hash: string) =>
      void run(async () => {
        const result = await askForm({ title: `Nova branch em ${short(hash)}`, nameLabel: "Nome da branch", confirmLabel: "Criar e mudar" });
        if (!result) return;
        await window.gitmonster.createBranch(root, result.name, hash, true);
      }, "all"),

    deleteTag: (name: string) =>
      void run(async () => {
        if (!(await ask(`Apagar a tag local "${name}"? Se ela já foi publicada, continuará no remoto.`, "Apagar tag"))) return;
        await window.gitmonster.deleteTag(root, name);
      }),
  };
}
