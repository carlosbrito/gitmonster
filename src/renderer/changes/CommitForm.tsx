import { useRef, useState } from "react";
import type { AiTextResult } from "../../shared/types";
import { composeMessage, splitMessage, SUMMARY_LIMIT } from "../changesTree";
import { Icon } from "../icons";

export interface CommitFormProps {
  stagedCount: number;
  busy: boolean;
  onCommit(message: string, amend: boolean): Promise<boolean>;
  /** Por que a IA não pode gerar a mensagem agora, ou null. */
  generateReason: string | null;
  /** Gera a mensagem do commit; null se foi bloqueado, cancelado ou falhou (o erro aparece na faixa da IA). */
  onAiCommitMessage(amend: boolean): Promise<AiTextResult | null>;
}

/** Formulário de commit: amend, resumo (com contador até 72), descrição e o botão de commit que muda com o estado. */
export function CommitForm({ stagedCount, busy, onCommit, generateReason, onAiCommitMessage }: CommitFormProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [amend, setAmend] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  const remaining = SUMMARY_LIMIT - summary.length;
  const canCommit = !busy && (amend || (stagedCount > 0 && summary.trim() !== ""));
  const label = amend ? "Amend Commit" : stagedCount === 0 ? "Stage Changes to Commit" : "Commit Changes";

  /** Troca o texto do resumo pela digitação do navegador, para o Ctrl+Z recuperar o texto anterior. */
  const fillSummary = (text: string) => {
    const el = box.current;
    if (el) {
      el.focus();
      el.select();
      if (document.execCommand("insertText", false, text)) return;
    }
    setSummary(text);
  };

  const generate = async () => {
    const result = await onAiCommitMessage(amend);
    if (!result) return;
    fillSummary(result.summary);
    setDescription(result.body ?? "");
  };

  const submit = async () => {
    if (await onCommit(composeMessage(summary, description), amend)) {
      setSummary("");
      setDescription("");
      setAmend(false);
    }
  };

  return (
    <form
      className="commit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="cf-amend">
        <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} disabled={busy} />
        Corrigir último commit (amend)
      </label>
      <div className="cf-box">
        <div className="cf-summary">
          <input
            ref={box}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPaste={(e) => {
              // O campo de uma linha descartaria as quebras: o que vem depois da primeira linha vai para a descrição.
              const text = e.clipboardData.getData("text");
              if (!/[\r\n]/.test(text)) return;
              e.preventDefault();
              const parts = splitMessage(text);
              setSummary(parts.summary);
              if (parts.description) setDescription(parts.description);
            }}
            placeholder={amend ? "Novo resumo (vazio mantém o atual)" : "Resumo"}
            aria-label="Resumo do commit"
            disabled={busy}
          />
          <span className={remaining < 0 ? "cf-count over" : "cf-count"} title="Caracteres restantes no resumo (recomendado: até 72)">
            {remaining}
          </span>
          <button
            type="button"
            className="cf-ai"
            aria-label="Gerar mensagem"
            disabled={busy || generateReason !== null}
            title={generateReason ?? "Gera a mensagem com IA a partir do que está no stage"}
            onClick={() => void generate()}
          >
            <Icon name="sparkle" size={16} />
          </button>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" aria-label="Descrição do commit" rows={4} disabled={busy} />
      </div>
      <button type="submit" className="cf-commit" disabled={!canCommit}>
        {label}
      </button>
    </form>
  );
}
