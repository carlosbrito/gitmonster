import { useCallback, useEffect, useRef, useState } from "react";
import { CANCELLED_MESSAGE, PROVIDERS } from "../../shared/aiProviders";
import type { AiSettingsView } from "../../shared/types";
import { errorMessage } from "../util";

export interface AiController {
  /** Por que a IA não pode ser usada agora (ou null). Já considera um pedido em andamento. */
  disabledReason: string | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
  /**
   * Roda um recurso de IA: confere configuração e consentimento, gera o id do pedido e trata erros.
   * Devolve o resultado, ou null se foi bloqueado, cancelado ou falhou (o motivo fica em `error`).
   */
  run<T>(op: (requestId: string) => Promise<T>): Promise<T | null>;
  cancel(): void;
}

/** Motivo de a configuração não permitir usar a IA, ou null. */
export function configReason(view: AiSettingsView | null): string | null {
  if (!view) return "Carregando as configurações da IA…";
  const { settings, hasKey } = view;
  if (!settings.enabled) return "A IA está desligada. Ative em Configurações > IA.";
  const info = PROVIDERS[settings.provider];
  if (info.keyRequired && !hasKey[settings.provider]) return `Falta a chave da API de ${info.label}. Informe em Configurações > IA.`;
  return null;
}

/**
 * Estado da IA de um repositório. `ask` é o diálogo de confirmação (para o consentimento de envio de código);
 * `rev` muda quando as Configurações são fechadas, para recarregar o que o usuário acabou de ajustar.
 */
export function useAi(ask: (message: string, confirmLabel: string) => Promise<boolean>, rev: number): AiController {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.gitmonster
      .aiGetSettings()
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView(null));
    return () => {
      cancelled = true;
    };
  }, [rev]);

  const run = useCallback(
    async <T>(op: (id: string) => Promise<T>): Promise<T | null> => {
      if (active.current) return null;
      active.current = true;
      setError(null);
      setNotice(null);
      try {
        // Confere de novo: as preferências podem ter mudado desde que a tela carregou.
        const fresh = await window.gitmonster.aiGetSettings();
        setView(fresh);
        const reason = configReason(fresh);
        if (reason) {
          setError(reason);
          return null;
        }
        const { provider } = fresh.settings;
        if (!fresh.settings.sendCodeApproved[provider]) {
          const label = PROVIDERS[provider].label;
          const ok = await ask(
            `Para usar a IA, o código das suas alterações (diffs, mensagens de commit e trechos de conflito) será enviado para ${label}, com a chave que você configurou. Deseja permitir?`,
            "Permitir envio",
          );
          if (!ok) return null;
          setView(await window.gitmonster.aiSetSettings({ ...fresh.settings, sendCodeApproved: { ...fresh.settings.sendCodeApproved, [provider]: true } }));
        }
        const id = crypto.randomUUID();
        requestId.current = id;
        setBusy(true);
        const result = await op(id);
        if (typeof result === "object" && result !== null && "truncated" in result && result.truncated === true) {
          setNotice("Diff grande: parte foi omitida do envio à IA.");
        }
        return result;
      } catch (e) {
        const message = errorMessage(e);
        if (message !== CANCELLED_MESSAGE) setError(message);
        return null;
      } finally {
        requestId.current = null;
        active.current = false;
        setBusy(false);
      }
    },
    [ask],
  );

  const cancel = useCallback(() => {
    if (requestId.current) void window.gitmonster.aiCancel(requestId.current).catch(() => undefined);
  }, []);

  return { disabledReason: busy ? "A IA já está trabalhando." : configReason(view), busy, notice, error, run, cancel };
}
