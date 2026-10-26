import {
  AI_PROVIDERS,
  type AiConflictResult,
  type AiExplainTarget,
  type AiFeature,
  type AiModelList,
  type AiProvider,
  type AiSettings,
  type AiSettingsView,
  type AiTextResult,
} from "../../shared/types";
import type { SettingsIo } from "../Settings";
import { CANCELLED_MESSAGE } from "../../shared/aiProviders";
import * as git from "./AiGit";
import { assertAiProvider, type AiKeyStore, validateAiKey } from "./AiKeyStore";
import { loadAiSettings, saveAiSettings, validateBaseUrl } from "./AiSettings";
import { diffBudget, fitDiff, maxPromptChars, omittedNote } from "./budget";
import { firstLine, parseConflictResolutions, parseSummaryBody } from "./parse";
import { createAiClient, PROVIDERS } from "./providers";
import { AiError, type AiClient } from "./providers/types";
import { combineInstructions, commitMessagePrompt, conflictPrompt, explainPrompt, FEATURE_LIMITS, pullRequestPrompt, stashMessagePrompt } from "./templates";


/** Folga para a nota de arquivos omitidos, que só é montada depois de medir o resto do prompt. */
const NOTE_MARGIN = 3000;

export interface AiServiceDeps {
  settingsFile: string;
  io: SettingsIo;
  keyStore: AiKeyStore;
  /** Só testes: servidor de mentira no lugar do provedor. */
  fetchImpl?: typeof fetch;
}

interface Prepared {
  client: AiClient;
  provider: AiProvider;
  model: string;
  instructions: string;
}

export function createAiService(deps: AiServiceDeps) {
  let cached: AiSettings | null = null;
  const requests = new Map<string, AbortController>();

  async function settings(): Promise<AiSettings> {
    cached ??= await loadAiSettings(deps.settingsFile, deps.io);
    return cached;
  }

  async function view(): Promise<AiSettingsView> {
    const current = await settings();
    const hasKey = Object.fromEntries(await Promise.all(AI_PROVIDERS.map(async (p) => [p, await deps.keyStore.hasKey(p)]))) as Record<AiProvider, boolean>;
    return { settings: current, hasKey, secureStorage: deps.keyStore.secureStorageAvailable() };
  }

  /** Confere tudo o que precisa estar certo antes de enviar código a um provedor. */
  async function prepare(feature: AiFeature): Promise<Prepared> {
    const s = await settings();
    if (!s.enabled) throw new Error("A IA está desligada. Ative em Configurações > IA.");
    const provider = s.provider;
    const info = PROVIDERS[provider];
    const key = await deps.keyStore.load(provider);
    if (info.keyRequired && key === null) throw new Error(`Falta a chave da API de ${info.label}. Informe em Configurações > IA.`);
    if (!s.sendCodeApproved[provider]) throw new Error(`Confirme o envio de código para ${info.label} antes de usar a IA.`);
    const model = s.features[feature].model.trim() || info.recommendedModel;
    if (model === "") throw new Error("Escolha um modelo em Configurações > IA: este provedor não tem um modelo recomendado.");
    return {
      client: createAiClient(provider, s.baseUrls[provider], key, deps.fetchImpl),
      provider,
      model,
      instructions: combineInstructions(s.globalInstructions, s.features[feature].instructions),
    };
  }

  /** Registra o pedido para poder cancelar e garante a limpeza no fim. */
  async function tracked<T>(requestId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    requests.get(requestId)?.abort();
    requests.set(requestId, controller);
    try {
      const result = await work(controller.signal);
      if (controller.signal.aborted) throw new AiError(CANCELLED_MESSAGE, 0, "cancelled");
      return result;
    } finally {
      if (requests.get(requestId) === controller) requests.delete(requestId);
    }
  }

  /** Mede o prompt sem o diff para saber quanto resta, corta o diff para caber e monta o prompt final. */
  function fit(build: (diff: string, note: string) => string, diff: string): { prompt: string; truncated: boolean } {
    const fitted = fitDiff(diff, diffBudget(build("", "").length + NOTE_MARGIN));
    return { prompt: build(fitted.text, omittedNote(fitted.omitted)), truncated: fitted.truncated };
  }

  async function run(feature: AiFeature, p: Prepared, prompt: string, signal: AbortSignal): Promise<string> {
    const limits = FEATURE_LIMITS[feature];
    const out = await p.client.complete({ model: p.model, prompt, maxTokens: limits.maxTokens, timeoutMs: limits.timeoutMs, signal });
    return out.text;
  }

  /** Lista os modelos com o endpoint e a chave informados (ou a guardada, se `key` for null): confere a conexão sem enviar código. */
  async function testConnection(provider: AiProvider, baseUrl: string, key: string | null): Promise<AiModelList> {
    const safe = assertAiProvider(provider);
    const url = validateBaseUrl(baseUrl);
    const secret = key === null || key.trim() === "" ? await deps.keyStore.load(safe) : validateAiKey(key);
    if (PROVIDERS[safe].keyRequired && secret === null) throw new Error("Informe a chave da API para testar a conexão.");
    const models = await createAiClient(safe, url, secret, deps.fetchImpl).listModels();
    return { models, recommended: PROVIDERS[safe].recommendedModel };
  }

  const textResult = (raw: string, truncated: boolean): AiTextResult => ({ ...parseSummaryBody(raw), truncated });

  return {
    getSettings: view,

    async setSettings(incoming: unknown): Promise<AiSettingsView> {
      cached = await saveAiSettings(deps.settingsFile, incoming, deps.io);
      return view();
    },

    async setKey(provider: AiProvider, key: string): Promise<AiSettingsView> {
      await deps.keyStore.save(assertAiProvider(provider), validateAiKey(key));
      return view();
    },

    async clearKey(provider: AiProvider): Promise<AiSettingsView> {
      await deps.keyStore.clear(assertAiProvider(provider));
      return view();
    },

    test: testConnection,

    /** Modelos do provedor atual, com a configuração salva. */
    async models(): Promise<AiModelList> {
      const s = await settings();
      return testConnection(s.provider, s.baseUrls[s.provider], null);
    },

    async commitMessage(root: string, amend: boolean, requestId: string): Promise<AiTextResult> {
      return tracked(requestId, async (signal) => {
        const p = await prepare("commitMessage");
        const diff = await git.commitDiff(root, amend);
        if (diff.trim() === "") throw new Error(amend ? "Não há alterações para descrever." : "Coloque alterações no stage para gerar a mensagem.");
        const [branch, email] = await Promise.all([git.currentBranch(root), git.authorEmail(root)]);
        const [repoHistory, authorHistory] = await Promise.all([git.recentMessages(root), git.recentMessages(root, email)]);
        const { prompt, truncated } = fit((d, note) => commitMessagePrompt({ diff: d, branch, repoHistory, authorHistory, instructions: p.instructions, omittedNote: note }), diff);
        const result = textResult(await run("commitMessage", p, prompt, signal), truncated);
        // O assunto do commit é uma linha só; se o modelo passou de uma, o resto vai para o corpo.
        const [subject = "", ...rest] = result.summary.split(/\r?\n/);
        const body = [rest.join("\n").trim(), result.body].filter(Boolean).join("\n\n");
        return { summary: subject.trim(), body, truncated };
      });
    },

    async explain(root: string, target: AiExplainTarget, requestId: string): Promise<AiTextResult> {
      return tracked(requestId, async (signal) => {
        const p = await prepare("explain");
        let message: string | null = null;
        let diff: string;
        if (target.kind === "commit") {
          const content = await git.commitContent(root, target.hash);
          message = content.message;
          diff = content.diff;
        } else {
          diff = (await git.worktreeDiff(root, true)).diff;
        }
        if (diff.trim() === "") throw new Error(target.kind === "commit" ? "Este commit não tem alterações de arquivos para explicar." : "Não há alterações para explicar.");
        const { prompt, truncated } = fit((d, note) => explainPrompt({ diff: d, message, instructions: p.instructions, omittedNote: note }), diff);
        return textResult(await run("explain", p, prompt, signal), truncated);
      });
    },

    async stashMessage(root: string, includeUntracked: boolean, requestId: string): Promise<AiTextResult> {
      return tracked(requestId, async (signal) => {
        const p = await prepare("stashMessage");
        if ((await git.stashableFiles(root, includeUntracked)).length === 0) throw new Error("Não há alterações para guardar no stash.");
        const [{ diff, untracked }, branch] = await Promise.all([git.worktreeDiff(root, false), git.currentBranch(root)]);
        const names = includeUntracked ? untracked : [];
        if (diff.trim() === "" && names.length === 0) throw new Error("Não há alterações para guardar no stash.");
        const { prompt, truncated } = fit((d, note) => stashMessagePrompt({ diff: d, branch, untracked: names, instructions: p.instructions, omittedNote: note }), diff);
        const raw = parseSummaryBody(await run("stashMessage", p, prompt, signal));
        return { summary: firstLine(raw.summary), body: "", truncated };
      });
    },

    async pullRequest(root: string, base: string, requestId: string): Promise<AiTextResult> {
      return tracked(requestId, async (signal) => {
        const p = await prepare("pullRequest");
        const content = await git.pullContent(root, base);
        const { prompt, truncated } = fit(
          (d, note) => pullRequestPrompt({ base: content.base, head: content.head, commits: content.commits, diff: d, template: content.template, instructions: p.instructions, omittedNote: note }),
          content.diff,
        );
        const result = textResult(await run("pullRequest", p, prompt, signal), truncated);
        return { ...result, summary: firstLine(result.summary) };
      });
    },

    async conflict(root: string, path: string, requestId: string): Promise<AiConflictResult> {
      return tracked(requestId, async (signal) => {
        const p = await prepare("conflict");
        const { blocks } = await git.conflictContent(root, path);
        const build = (bs: typeof blocks) => conflictPrompt({ path, blocks: bs, instructions: p.instructions });
        let used = blocks;
        let truncated = false;
        const limit = maxPromptChars();
        if (build(used).length > limit) {
          // Primeiro abre mão do entorno; se ainda não couber, o arquivo é grande demais para a IA.
          used = blocks.map((b) => ({ ...b, before: "", after: "" }));
          truncated = true;
          if (build(used).length > limit) throw new Error("Os conflitos deste arquivo são grandes demais para a IA. Resolva-os à mão.");
        }
        const resolutions = parseConflictResolutions(await run("conflict", p, build(used), signal), used.length);
        return { resolutions, truncated };
      });
    },

    cancel(requestId: string): void {
      requests.get(requestId)?.abort();
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
