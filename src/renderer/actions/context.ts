import type { Operation, OperationResult, RepoStatus } from "../../shared/types";
import type { Dialogs } from "../hooks/useDialogs";
import type { RunAfter } from "../hooks/useRepoState";

/** O que as ações de um repositório precisam: a raiz, o executor e os diálogos. */
export interface ActionCtx extends Pick<Dialogs, "ask" | "askForm" | "askRebase" | "askDrop"> {
  root: string;
  status: RepoStatus | null;
  run(op: () => Promise<unknown>, after?: RunAfter): Promise<boolean>;
  setNotice(text: string | null): void;
  /** Leva o grafo até o commit de HEAD e o destaca (depois de um checkout). */
  revealHead(): Promise<void>;
}

export const OPERATION_LABEL: Record<Operation, string> = {
  merge: "Merge",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
  rebase: "Rebase",
};

export const STOPPED_NOTICE = `parou e aguarda você: resolva os conflitos, marque os arquivos com "+" e use Continuar — ou aborte.`;

/** Executa uma operação que pode parar no meio e explica o resultado na tela. */
export function doOperation(ctx: ActionCtx, label: string, op: (root: string) => Promise<OperationResult>): void {
  void ctx.run(async () => {
    const result = await op(ctx.root);
    ctx.setNotice(result.conflicted ? `${label} ${STOPPED_NOTICE}` : `${label} concluído.`);
  }, "all");
}
