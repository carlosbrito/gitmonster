import { useEffect, useState } from "react";
import { PROVIDERS } from "../../shared/aiProviders";
import { AI_FEATURES, AI_PROVIDERS, type AiFeature, type AiModelList, type AiProvider, type AiSettings, type AiSettingsView } from "../../shared/types";
import { errorMessage } from "../util";
import { appendInstruction, FEATURE_CHIPS, FEATURE_LABEL, GLOBAL_CHIPS, type Chip } from "./presets";

const MAX_INSTRUCTIONS = 4000;

interface InstructionsProps {
  label: string;
  value: string;
  chips: Chip[];
  disabled: boolean;
  onChange(value: string): void;
}

/** Campo de instruções com atalhos que acrescentam um texto pronto. */
function Instructions({ label, value, chips, disabled, onChange }: InstructionsProps) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {chips.map((c) => (
          <button key={c.label} type="button" className="chip" disabled={disabled} title={c.text} onClick={() => onChange(appendInstruction(value, c.text, MAX_INSTRUCTIONS))}>
            {c.label}
          </button>
        ))}
      </div>
      <textarea aria-label={label} rows={3} maxLength={MAX_INSTRUCTIONS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface ModelPickerProps {
  label: string;
  /** Texto do rótulo visível. */
  caption: string;
  value: string;
  models: AiModelList | null;
  recommended: string;
  disabled: boolean;
  onChange(model: string): void;
}

/** Lista de modelos do provedor; se ela não puder ser obtida, aceita o id digitado. Vazio = o recomendado. */
function ModelPicker({ label, caption, value, models, recommended, disabled, onChange }: ModelPickerProps) {
  const ids = models?.models.map((m) => m.id) ?? [];
  return (
    <label className="field">
      {caption}
      {models && ids.length > 0 ? (
        <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">{recommended ? `Usar recomendado (${recommended})` : "Escolha um modelo"}</option>
          {value !== "" && !ids.includes(value) && <option value={value}>{value}</option>}
          {models.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : (
        <input aria-label={label} value={value} disabled={disabled} placeholder={recommended ? `Recomendado: ${recommended}` : "id do modelo"} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Seção "IA" das Configurações: provedor, chave, teste de conexão, modelos e instruções. */
export function AiSettingsSection() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [models, setModels] = useState<AiModelList | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provider = draft?.provider ?? "anthropic";
  const info = PROVIDERS[provider];
  const hasKey = view?.hasKey[provider] === true;

  useEffect(() => {
    let cancelled = false;
    window.gitmonster
      .aiGetSettings()
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDraft(v.settings);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Lista de modelos do provedor atual, quando já dá para consultá-la (chave guardada ou modelo local).
  useEffect(() => {
    setModels(null);
    if (!view || !draft || (info.keyRequired && !hasKey)) return;
    let cancelled = false;
    // Chave null = a guardada. Refaz só ao trocar de provedor ou ganhar/perder a chave, não a cada tecla na URL.
    window.gitmonster
      .aiTest(provider, draft.baseUrls[provider], null)
      .then((m) => !cancelled && setModels(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey, provider, view !== null]);

  const run = async (op: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await op());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (change: Partial<AiSettings>) => setDraft((d) => (d ? { ...d, ...change } : d));
  const patchFeature = (feature: AiFeature, change: Partial<AiSettings["features"][AiFeature]>) =>
    setDraft((d) => (d ? { ...d, features: { ...d.features, [feature]: { ...d.features[feature], ...change } } } : d));
  const setProvider = (p: AiProvider) => patch({ provider: p });
  const setBaseUrl = (url: string) => setDraft((d) => (d ? { ...d, baseUrls: { ...d.baseUrls, [provider]: url } } : d));

  const save = () =>
    run(async () => {
      if (!draft) return "";
      const next = await window.gitmonster.aiSetSettings(draft);
      setView(next);
      setDraft(next.settings);
      return "Configurações da IA salvas.";
    });

  const saveKey = () =>
    run(async () => {
      const next = await window.gitmonster.aiSetKey(provider, keyInput);
      setKeyInput("");
      setView(next);
      return "Chave guardada com segurança.";
    });

  const clearKey = () =>
    run(async () => {
      setView(await window.gitmonster.aiClearKey(provider));
      setModels(null);
      return "Chave removida.";
    });

  const test = () =>
    run(async () => {
      if (!draft) return "";
      const list = await window.gitmonster.aiTest(provider, draft.baseUrls[provider], keyInput.trim() === "" ? null : keyInput);
      setModels(list);
      return `Conexão funcionando${list.models.length > 0 ? `: ${list.models.length} modelos disponíveis` : ""}.`;
    });

  const approved = draft?.sendCodeApproved[provider] === true;
  const off = !draft?.enabled;

  return (
    <fieldset className="ai-settings">
      <legend>IA</legend>
      {!draft && !error && <p className="dim">Carregando…</p>}

      {draft && (
        <>
          <label>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /> Habilitar IA
          </label>
          <p className="dim">Mensagem de commit, explicar alterações, mensagem de stash, conflitos e Pull Requests. Usa a sua chave: o código vai direto ao provedor escolhido, sem intermediário.</p>

          <label className="field">
            Provedor
            <select aria-label="Provedor de IA" value={provider} disabled={off} onChange={(e) => setProvider(e.target.value as AiProvider)}>
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            URL do endpoint (opcional)
            <input
              aria-label="URL do endpoint"
              value={draft.baseUrls[provider]}
              disabled={off}
              placeholder={info.defaultBaseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <span className="dim">Quase sempre não precisa mudar. Só https (ou http em localhost).</span>
          </label>

          <label className="field">
            Chave da API{info.keyRequired ? "" : " (opcional)"}
            <input
              type="password"
              aria-label="Chave da API"
              autoComplete="off"
              value={keyInput}
              disabled={off}
              placeholder={hasKey ? "Chave guardada (cole outra para trocar)" : "Cole a chave do provedor"}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </label>
          {view && !view.secureStorage && <p className="error">Este sistema não oferece armazenamento seguro: a chave não poderá ser guardada.</p>}
          <div className="conflict-actions">
            <button disabled={busy || off || keyInput.trim() === ""} onClick={() => void saveKey()}>
              Salvar chave
            </button>
            {hasKey && (
              <button disabled={busy} onClick={() => void clearKey()}>
                Remover chave
              </button>
            )}
            <button disabled={busy || off || (info.keyRequired && !hasKey && keyInput.trim() === "")} onClick={() => void test()}>
              Testar conexão
            </button>
            {hasKey && <span className="dim">Chave guardada.</span>}
          </div>

          <p className="dim">
            Envio de código para {info.label}: {approved ? "autorizado" : "ainda não autorizado (será pedido no primeiro uso)"}.
            {approved && (
              <>
                {" "}
                <button className="link" onClick={() => setDraft((d) => (d ? { ...d, sendCodeApproved: { ...d.sendCodeApproved, [provider]: false } } : d))}>
                  Revogar
                </button>
              </>
            )}
          </p>

          <h4>Instruções globais</h4>
          <Instructions
            label="Instruções personalizadas"
            value={draft.globalInstructions}
            chips={GLOBAL_CHIPS}
            disabled={off}
            onChange={(v) => patch({ globalInstructions: v })}
          />
          <p className="dim">Valem para todos os recursos, junto com as instruções de cada um.</p>

          {info.recommendedModel === "" && (
            <>
              <ModelPicker
                label="Modelo para todos os recursos"
                caption="Modelo para todos os recursos"
                value={AI_FEATURES.every((f) => draft.features[f].model === draft.features[AI_FEATURES[0]!].model) ? draft.features[AI_FEATURES[0]!].model : ""}
                models={models}
                recommended=""
                disabled={off}
                onChange={(model) => setDraft((d) => (d ? { ...d, features: Object.fromEntries(AI_FEATURES.map((f) => [f, { ...d.features[f], model }])) as AiSettings["features"] } : d))}
              />
              <p className="dim">Este provedor não tem modelo recomendado: escolha um aqui (ou ajuste cada recurso abaixo).</p>
            </>
          )}

          {AI_FEATURES.map((feature) => {
            const f = draft.features[feature];
            return (
              <details key={feature}>
                <summary>{FEATURE_LABEL[feature]}</summary>
                <ModelPicker
                  label={`Modelo: ${FEATURE_LABEL[feature]}`}
                  caption="Modelo"
                  value={f.model}
                  models={models}
                  recommended={info.recommendedModel}
                  disabled={off}
                  onChange={(model) => patchFeature(feature, { model })}
                />
                <Instructions
                  label={`Instruções: ${FEATURE_LABEL[feature]}`}
                  value={f.instructions}
                  chips={FEATURE_CHIPS[feature]}
                  disabled={off}
                  onChange={(v) => patchFeature(feature, { instructions: v })}
                />
              </details>
            );
          })}

          <button disabled={busy} onClick={() => void save()}>
            Salvar IA
          </button>
        </>
      )}

      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
