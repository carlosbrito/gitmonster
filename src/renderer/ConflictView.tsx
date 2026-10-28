import { useEffect, useMemo, useState } from "react";
import { buildResult, matchLineEndings, parseConflicts, type Choice, type ConflictBlock } from "../shared/conflict";
import type { AiConflictResult, ConflictFile, ConflictKind, ConflictSide, ConflictSides, Operation } from "../shared/types";
import { errorMessage } from "./util";

export interface ConflictViewProps {
  root: string;
  path: string;
  busy: boolean;
  onClose(): void;
  /** Grava o arquivo resolvido (conteúdo final) e o coloca no stage. */
  onResolve(content: string): void;
  /** Resolve o arquivo inteiro com um dos lados. */
  onResolveSide(side: ConflictSide): void;
  /** Por que a IA não pode ser usada agora (desligada, sem chave, ocupada), ou null. */
  aiReason: string | null;
  /** Pede a resolução de todos os blocos; null se foi bloqueado, cancelado ou falhou. */
  onAiResolve(): Promise<AiConflictResult | null>;
}

/** O que a IA disse de um bloco: mostrado junto da proposta para o usuário revisar. */
interface AiNote {
  explanation: string;
  confidence: number;
}

const KIND_LABEL: Record<ConflictKind, string> = {
  "both-modified": "modificado nos dois lados",
  "added-by-both": "adicionado nos dois lados",
  "deleted-by-us": "removido por nós e modificado por eles",
  "deleted-by-them": "modificado por nós e removido por eles",
  "added-by-us": "adicionado por nós",
  "added-by-them": "adicionado por eles",
  "deleted-by-both": "removido nos dois lados",
};

/** O lado escolhido remove o arquivo? (avisa antes de o usuário clicar) */
const removesFile = (kind: ConflictKind, side: ConflictSide) =>
  kind === "deleted-by-both" || (kind === "deleted-by-us" && side === "ours") || (kind === "deleted-by-them" && side === "theirs");

const CHOICES: { choice: Exclude<Choice, { custom: string }>; label: string; side?: ConflictSide }[] = [
  { choice: "ours", label: "Usar nosso", side: "ours" },
  { choice: "theirs", label: "Usar deles", side: "theirs" },
  { choice: "both-ours-first", label: "Ambos (nosso primeiro)" },
  { choice: "both-theirs-first", label: "Ambos (deles primeiro)" },
];

const ROLE: Record<ConflictSide, string> = { ours: "nosso", theirs: "deles" };

/** "Merge de X em Y": como a operação junta os dois lados. */
const CONTEXT: Record<Operation, [string, string]> = {
  merge: ["Merge de", "em"],
  "cherry-pick": ["Cherry-pick de", "em"],
  revert: ["Revert de", "em"],
  rebase: ["Rebase de", "sobre"],
};

/** Título do painel: nome da branch/commit em destaque; sem nomes, o rótulo do marcador como antes. */
function SideTitle({ side, sides, label }: { side: ConflictSide; sides: ConflictSides | null; label: string }) {
  const info = sides?.[side];
  if (!info) {
    return (
      <h4>
        {side === "ours" ? "Nosso" : "Deles"} {label && <span className="dim">({label})</span>}
      </h4>
    );
  }
  return (
    <h4 className="conflict-side-title">
      <span className="conflict-side-name" title={info.name}>
        {info.name}
      </span>
      <span className="dim">
        {ROLE[side]}
        {info.detail ? ` · ${info.detail}` : ""}
      </span>
    </h4>
  );
}

export function ConflictView({ root, path, busy, onClose, onResolve, onResolveSide, aiReason, onAiResolve }: ConflictViewProps) {
  const [file, setFile] = useState<ConflictFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice | undefined>>({});
  const [aiNotes, setAiNotes] = useState<Record<number, AiNote | undefined>>({});
  /** Escolhas de antes da IA, para "Desfazer IA". */
  const [beforeAi, setBeforeAi] = useState<Record<number, Choice | undefined> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setChoices({});
    setAiNotes({});
    setBeforeAi(null);
    window.gitmonster
      .getConflict(root, path)
      .then((f) => !cancelled && setFile(f))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [root, path]);

  const segments = useMemo(() => (file?.editable ? parseConflicts(file.content) : []), [file]);
  const blocks = segments.filter((s): s is ConflictBlock => s.kind === "conflict");
  const built = useMemo(() => buildResult(segments, choices), [segments, choices]);
  const pending = built.unresolved.length;

  const choose = (id: number, choice: Choice) => setChoices((prev) => ({ ...prev, [id]: choice }));

  /** A proposta da IA entra como texto editável em cada bloco; nada é gravado até o usuário salvar. */
  const resolveWithAi = async () => {
    const result = await onAiResolve();
    if (!result || result.resolutions.length !== blocks.length) return;
    setBeforeAi((prev) => prev ?? choices);
    setChoices(Object.fromEntries(blocks.map((b, n) => [b.id, { custom: matchLineEndings(result.resolutions[n]!.resolved, b.ours + b.theirs) }])));
    setAiNotes(Object.fromEntries(blocks.map((b, n) => [b.id, { explanation: result.resolutions[n]!.explanation, confidence: result.resolutions[n]!.confidence }])));
  };

  const undoAi = () => {
    if (!beforeAi) return;
    setChoices(beforeAi);
    setBeforeAi(null);
    setAiNotes({});
  };

  const aiBlocked = aiReason ?? (file?.editable ? null : "Este arquivo não pode ser resolvido com IA (binário, grande demais ou sem marcadores).");
  const sides = file?.sides ?? null;
  /** "Arquivo inteiro: nosso (main)". */
  const wholeLabel = (side: ConflictSide) => `Arquivo inteiro: ${ROLE[side]}${sides ? ` (${sides[side].name})` : ""}`;

  return (
    <div className="diff conflict">
      <header className="diff-bar">
        <button onClick={onClose}>← Grafo</button>
        <strong>{path}</strong>
        <span className="dim">conflito{file ? `: ${KIND_LABEL[file.kind]}` : ""}</span>
      </header>
      {sides && file?.operation && (
        <div className="conflict-context">
          <span>
            {CONTEXT[file.operation][0]} <strong className="conflict-name theirs">{sides.theirs.name}</strong> {CONTEXT[file.operation][1]}{" "}
            <strong className="conflict-name ours">{sides.ours.name}</strong>
          </span>
          {file.operation === "rebase" && (
            <span className="dim">No rebase, “nosso” é a base e “deles” são os seus commits sendo reaplicados.</span>
          )}
        </div>
      )}

      <div className="diff-body">
        {error && <p role="alert" className="error">{error}</p>}
        {!file && !error && <p className="dim pad">Carregando…</p>}

        {file && !file.editable && (
          <section className="conflict-whole">
            <p className="pad">{file.reason}</p>
            {(["ours", "theirs"] as const).map((side) => (
              <button key={side} disabled={busy} onClick={() => onResolveSide(side)}>
                {wholeLabel(side)}
                {removesFile(file.kind, side) ? " (remove o arquivo)" : ""}
              </button>
            ))}
          </section>
        )}

        {file && (
          <div className="conflict-ai">
            <button disabled={busy || aiBlocked !== null} title={aiBlocked ?? "Pede à IA uma resolução para cada conflito; você revisa antes de salvar"} onClick={() => void resolveWithAi()}>
              ✨ Resolver com IA
            </button>
            {beforeAi && (
              <button disabled={busy} onClick={undoAi}>
                Desfazer IA
              </button>
            )}
          </div>
        )}

        {file?.editable &&
          blocks.map((block, n) => {
            const choice = choices[block.id];
            return (
              <section key={block.id} className="conflict-block" aria-label={`Conflito ${n + 1} de ${blocks.length}`}>
                <div className="hunk-bar">
                  <code>
                    Conflito {n + 1} de {blocks.length}
                  </code>
                  <span className="dim">{choice === undefined ? "pendente" : "resolvido"}</span>
                </div>
                <div className="conflict-sides">
                  <div className="conflict-side ours">
                    <SideTitle side="ours" sides={sides} label={block.oursLabel} />
                    <pre>{block.ours || "(vazio)"}</pre>
                  </div>
                  {block.base !== null && (
                    <div className="conflict-side base">
                      <h4>Base</h4>
                      <pre>{block.base || "(vazio)"}</pre>
                    </div>
                  )}
                  <div className="conflict-side theirs">
                    <SideTitle side="theirs" sides={sides} label={block.theirsLabel} />
                    <pre>{block.theirs || "(vazio)"}</pre>
                  </div>
                </div>
                <div className="conflict-choices">
                  {CHOICES.map(({ choice: c, label, side }) => (
                    <button
                      key={c}
                      aria-pressed={choice === c}
                      disabled={busy}
                      title={side && sides ? `Usar ${sides[side].name}` : undefined}
                      onClick={() => choose(block.id, c)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    aria-pressed={typeof choice === "object"}
                    disabled={busy}
                    onClick={() => choose(block.id, typeof choice === "object" ? choice : { custom: block.ours })}
                  >
                    Editar à mão
                  </button>
                </div>
                {typeof choice === "object" && aiNotes[block.id] && (
                  <p className="ai-note">
                    <strong>✨ IA · confiança {Math.round(aiNotes[block.id]!.confidence * 100)}%</strong> {aiNotes[block.id]!.explanation}{" "}
                    <span className="dim">Gerado por IA: revise antes de salvar.</span>
                  </p>
                )}
                {typeof choice === "object" && (
                  <textarea
                    className="conflict-custom"
                    aria-label={`Texto final do conflito ${n + 1}`}
                    value={choice.custom}
                    onChange={(e) => choose(block.id, { custom: e.target.value })}
                    rows={Math.max(3, choice.custom.split("\n").length + 1)}
                  />
                )}
              </section>
            );
          })}

        {file?.editable && (
          <section className="conflict-result">
            <h4>Resultado {pending > 0 && <span className="dim">({pending} conflito(s) pendente(s))</span>}</h4>
            <pre aria-label="Resultado final">{built.text}</pre>
            <div className="conflict-actions">
              <button disabled={busy || pending > 0} onClick={() => onResolve(built.text)}>
                Salvar resolução
              </button>
              {(["ours", "theirs"] as const).map((side) => (
                <button key={side} className="link" disabled={busy} onClick={() => onResolveSide(side)}>
                  {wholeLabel(side)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
