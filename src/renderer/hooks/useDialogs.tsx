import { useCallback, useState, type ReactNode } from "react";
import type { RebasePlan, RebaseStep } from "../../shared/types";
import { ConfirmDialog } from "../ConfirmDialog";
import { FormDialog, type FormDialogProps } from "../FormDialog";
import { DropDialog, type DropChoice } from "../DropDialog";
import { RebaseDialog } from "../RebaseDialog";

export type FormConfig = Pick<FormDialogProps, "title" | "nameLabel" | "messageLabel" | "secondLabel" | "confirmLabel">;
export type FormResult = { name: string; message: string; second: string } | null;

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  resolve(confirmed: boolean): void;
}

interface PendingForm extends FormConfig {
  resolve(result: FormResult): void;
}

interface PendingRebase {
  ontoLabel: string;
  plan: RebasePlan;
  resolve(steps: RebaseStep[] | null): void;
}

interface PendingDrop {
  source: string;
  target: string;
  current: string | null;
  canRebase: boolean;
  resolve(choice: DropChoice | null): void;
}

export interface Dialogs {
  ask(message: string, confirmLabel: string): Promise<boolean>;
  askForm(config: FormConfig): Promise<FormResult>;
  askRebase(ontoLabel: string, plan: RebasePlan): Promise<RebaseStep[] | null>;
  /** Branch arrastada sobre outra: merge, rebase ou nada. */
  askDrop(source: string, target: string, current: string | null, canRebase: boolean): Promise<DropChoice | null>;
  /** Os diálogos em si; renderize uma vez dentro do componente. */
  element: ReactNode;
}

/** Diálogos que devolvem a resposta do usuário como Promise, para as ações poderem usar `await`. */
export function useDialogs(): Dialogs {
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [form, setForm] = useState<PendingForm | null>(null);
  const [rebaseDialog, setRebaseDialog] = useState<PendingRebase | null>(null);
  const [drop, setDrop] = useState<PendingDrop | null>(null);

  const ask = useCallback(
    (message: string, confirmLabel: string) =>
      new Promise<boolean>((resolve) => setConfirm({ message, confirmLabel, resolve })),
    [],
  );
  const askForm = useCallback(
    (config: FormConfig) => new Promise<FormResult>((resolve) => setForm({ ...config, resolve })),
    [],
  );
  const askRebase = useCallback(
    (ontoLabel: string, plan: RebasePlan) =>
      new Promise<RebaseStep[] | null>((resolve) => setRebaseDialog({ ontoLabel, plan, resolve })),
    [],
  );

  const askDrop = useCallback(
    (source: string, target: string, current: string | null, canRebase: boolean) =>
      new Promise<DropChoice | null>((resolve) => setDrop({ source, target, current, canRebase, resolve })),
    [],
  );

  const element = (
    <>
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onResolve={(confirmed) => {
            confirm.resolve(confirmed);
            setConfirm(null);
          }}
        />
      )}
      {form && (
        <FormDialog
          title={form.title}
          nameLabel={form.nameLabel}
          {...(form.messageLabel !== undefined ? { messageLabel: form.messageLabel } : {})}
          {...(form.secondLabel !== undefined ? { secondLabel: form.secondLabel } : {})}
          confirmLabel={form.confirmLabel}
          onResolve={(result) => {
            form.resolve(result);
            setForm(null);
          }}
        />
      )}
      {drop && (
        <DropDialog
          source={drop.source}
          target={drop.target}
          current={drop.current}
          canRebase={drop.canRebase}
          onResolve={(choice) => {
            drop.resolve(choice);
            setDrop(null);
          }}
        />
      )}
      {rebaseDialog && (
        <RebaseDialog
          ontoLabel={rebaseDialog.ontoLabel}
          plan={rebaseDialog.plan}
          onResolve={(steps) => {
            rebaseDialog.resolve(steps);
            setRebaseDialog(null);
          }}
        />
      )}
    </>
  );

  return { ask, askForm, askRebase, askDrop, element };
}
