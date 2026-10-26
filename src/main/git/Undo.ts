import type { UndoInfo } from "../../shared/types";
import { assertStartPoint } from "./Branches";
import { getStatus, runGit } from "./GitService";

/**
 * Desfazer/refazer a última operação, a partir do reflog de HEAD. Só desfaz o que sabe desfazer com segurança;
 * o resto fica indisponível com o motivo. É um passo por vez: depois de desfazer, só há "refazer".
 */

type Action =
  | { kind: "soft"; to: string }
  | { kind: "hard"; to: string }
  | { kind: "checkout"; to: string };

interface Plan {
  label: string;
  undo: Action;
  /** Ação que devolve o estado de antes do desfazer. */
  redo: Action;
  redoLabel: string;
}

interface RedoRecord {
  /** Estado em que o undo deixou o repositório; se mudou, o redo não vale mais. */
  head: string;
  branch: string | null;
  action: Action;
  label: string;
}

const redoByRoot = new Map<string, RedoRecord>();

interface ReflogEntry {
  oid: string;
  subject: string;
}

async function readReflog(root: string): Promise<ReflogEntry[]> {
  let out: string;
  try {
    out = await runGit(root, ["reflog", "show", "--format=%H%x1f%gs", "-n", "2", "HEAD"]);
  } catch {
    return []; // repositório sem commits
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [oid = "", subject = ""] = line.split("\x1f");
      return { oid, subject };
    });
}

/** Interpreta o reflog; `reason` explica por que não dá para desfazer. */
function plan(entries: ReflogEntry[]): { plan: Plan } | { reason: string } {
  const [last, before] = entries;
  if (!last) return { reason: "Não há nada para desfazer." };
  if (/^commit \(initial\)/.test(last.subject)) return { reason: "O commit inicial não pode ser desfeito." };
  if (!before) return { reason: "Não há uma operação anterior para voltar." };

  const s = last.subject;
  const make = (label: string, kind: "soft" | "hard", redoLabel: string): { plan: Plan } => ({
    plan: { label, undo: { kind, to: before.oid }, redo: { kind, to: last.oid }, redoLabel },
  });

  if (/^commit( \(amend\)| \(merge\))?:/.test(s)) {
    return make(/amend/.test(s) ? "Desfazer amend" : "Desfazer commit", "soft", "Refazer commit");
  }
  if (/^merge /.test(s)) return make("Desfazer merge", "hard", "Refazer merge");
  if (/^pull(?!.*rebase)/.test(s)) return make("Desfazer pull", "hard", "Refazer pull");
  if (/^cherry-pick/.test(s)) return make("Desfazer cherry-pick", "hard", "Refazer cherry-pick");
  if (/^revert/.test(s)) return make("Desfazer revert", "hard", "Refazer revert");
  if (/^reset: moving to/.test(s)) return make("Desfazer reset", "hard", "Refazer reset");

  const co = /^checkout: moving from (\S+) to (\S+)$/.exec(s);
  if (co?.[1] && co[2]) {
    return {
      plan: {
        label: `Voltar para ${co[1]}`,
        undo: { kind: "checkout", to: co[1] },
        redo: { kind: "checkout", to: co[2] },
        redoLabel: `Ir para ${co[2]}`,
      },
    };
  }
  return { reason: `A última operação ("${s.split(":")[0]}") não pode ser desfeita automaticamente.` };
}

async function currentState(root: string) {
  const status = await getStatus(root);
  return { status, head: status.headOid, branch: status.branch };
}

export async function undoInfo(root: string): Promise<UndoInfo> {
  const { status, head, branch } = await currentState(root);
  const record = redoByRoot.get(root);
  const redoValid = record !== undefined && record.head === head && record.branch === branch;
  if (record && !redoValid) redoByRoot.delete(root);
  const redo = redoValid ? { label: record.label } : null;

  if (redoValid) return { undo: null, redo, blocked: "Você acabou de desfazer: use Refazer ou faça outra operação." };
  const planned = plan(await readReflog(root));
  if ("reason" in planned) return { undo: null, redo, blocked: planned.reason };

  const needsClean = planned.plan.undo.kind === "hard";
  if (status.operation) return { undo: null, redo, blocked: "Há uma operação em andamento: conclua ou aborte antes." };
  if (needsClean && status.files.some((f) => !f.untracked)) {
    return { undo: null, redo, blocked: "Há alterações não commitadas: guarde-as (stash) ou commite antes de desfazer." };
  }
  return { undo: { label: planned.plan.label }, redo, blocked: null };
}

async function apply(root: string, action: Action): Promise<void> {
  switch (action.kind) {
    case "soft":
      return void (await runGit(root, ["reset", "--soft", action.to]));
    case "hard":
      return void (await runGit(root, ["reset", "--hard", action.to]));
    case "checkout":
      return void (await runGit(root, ["checkout", "--end-of-options", assertStartPoint(action.to)]));
  }
}

/** Desfaz a última operação reconhecida. As mesmas travas de `undoInfo` valem aqui, no main. */
export async function undo(root: string): Promise<void> {
  const info = await undoInfo(root);
  if (!info.undo) throw new Error(info.blocked ?? "Nada para desfazer.");
  const planned = plan(await readReflog(root));
  if ("reason" in planned) throw new Error(planned.reason);

  await apply(root, planned.plan.undo);
  const { head, branch } = await currentState(root);
  redoByRoot.set(root, { head: head ?? "", branch, action: planned.plan.redo, label: planned.plan.redoLabel });
}

/** Refaz o que acabou de ser desfeito; só enquanto o repositório está exatamente como o undo o deixou. */
export async function redo(root: string): Promise<void> {
  const record = redoByRoot.get(root);
  const { status, head, branch } = await currentState(root);
  if (!record || record.head !== head || record.branch !== branch) {
    redoByRoot.delete(root);
    throw new Error("O repositório mudou depois do desfazer: não há o que refazer.");
  }
  if (record.action.kind === "hard" && status.files.some((f) => !f.untracked)) {
    throw new Error("Há alterações não commitadas: guarde-as (stash) ou commite antes de refazer.");
  }
  await apply(root, record.action);
  redoByRoot.delete(root);
}
