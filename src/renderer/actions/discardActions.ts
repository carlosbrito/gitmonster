import type { FileChange } from "../../shared/types";
import type { ActionCtx } from "./context";

const MAX_LISTED = 10;

/** Texto da confirmação: lista os arquivos e destaca os novos, que não têm como voltar. */
export function discardMessage(files: Pick<FileChange, "path" | "untracked">[]): string {
  const listed = files.slice(0, MAX_LISTED).map((f) => `• ${f.path}${f.untracked ? " (novo)" : ""}`);
  const extra = files.length > MAX_LISTED ? `\n… e mais ${files.length - MAX_LISTED}` : "";
  const fresh = files.filter((f) => f.untracked).length;
  const warn = fresh > 0 ? ` ${fresh === 1 ? "1 arquivo novo será apagado" : `${fresh} arquivos novos serão apagados`} do disco.` : "";
  return `Descartar as alterações de ${files.length === 1 ? "1 arquivo" : `${files.length} arquivos`}?${warn} Isto não pode ser desfeito.\n${listed.join("\n")}${extra}`;
}

/** Descartar alterações não staged. A confirmação é obrigatória e não há backup. */
export function discardActions({ root, run, ask }: ActionCtx) {
  return {
    files: (files: FileChange[]) =>
      void run(async () => {
        const targets = files.filter((f) => !f.conflicted);
        if (targets.length === 0) return;
        if (!(await ask(discardMessage(targets), "Descartar"))) return;
        await window.gitmonster.discard(
          root,
          targets.map((f) => f.path),
        );
      }, "all"),

    hunk: (file: string, discard: () => void) => {
      void (async () => {
        if (await ask(`Descartar este trecho de "${file}"? Isto não pode ser desfeito.`, "Descartar trecho")) discard();
      })();
    },
  };
}
