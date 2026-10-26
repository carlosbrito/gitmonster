import { z } from "zod";
import { AI_FEATURES, AI_PROVIDERS, type AiFeature, type AiFeatureSettings, type AiProvider, type AiSettings } from "../../shared/types";
import type { SettingsIo } from "../Settings";

export const MAX_INSTRUCTIONS = 4000;

const mapOf = <T>(keys: readonly string[], make: (key: string) => T) => Object.fromEntries(keys.map((k) => [k, make(k)]));

export const defaultFeature = (): AiFeatureSettings => ({ model: "", instructions: "" });

export const defaultAiSettings = (): AiSettings => ({
  version: 1,
  enabled: false,
  provider: "anthropic",
  baseUrls: mapOf(AI_PROVIDERS, () => "") as Record<AiProvider, string>,
  sendCodeApproved: mapOf(AI_PROVIDERS, () => false) as Record<AiProvider, boolean>,
  globalInstructions: "",
  features: mapOf(AI_FEATURES, defaultFeature) as Record<AiFeature, AiFeatureSettings>,
});

/** Localhost vale para modelos locais (Ollama, LM Studio), onde https não é comum. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Vazio (usa o padrão) ou uma URL https; http só em localhost. Sem credenciais, consulta ou fragmento. */
export function validateBaseUrl(value: string): string {
  const url = value.trim();
  if (url === "") return "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL do endpoint não é válida.");
  }
  if (url.length > 2048 || /[\0\r\n\s]/.test(url)) throw new Error("A URL do endpoint não é válida.");
  if (parsed.username || parsed.password) throw new Error("A URL do endpoint não pode conter usuário ou senha.");
  if (parsed.search || parsed.hash) throw new Error("A URL do endpoint não pode ter parâmetros.");
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new Error("A URL do endpoint precisa começar com https:// (http:// só vale para localhost).");
  }
  return url.replace(/\/+$/, "");
}

const providerSchema = z.enum(AI_PROVIDERS as [AiProvider, ...AiProvider[]]);
const instructions = z.string().max(MAX_INSTRUCTIONS);
const modelId = z.string().max(200).refine((v) => !/[\0\r\n]/.test(v), "Modelo inválido.");

const featureStrict = z.object({ model: modelId, instructions });
const featureLenient = z.object({ model: modelId.catch(""), instructions: instructions.catch("") });

const record = <S extends z.ZodType>(keys: readonly string[], value: S) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<string, S>);

const strictSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  provider: providerSchema,
  baseUrls: record(AI_PROVIDERS, z.string().max(2048)),
  sendCodeApproved: record(AI_PROVIDERS, z.boolean()),
  globalInstructions: instructions,
  features: record(AI_FEATURES, featureStrict),
});

/** Na leitura, um campo estragado volta ao padrão sem derrubar os outros. */
const lenientSchema = z.object({
  enabled: z.boolean().catch(false),
  provider: providerSchema.catch("anthropic"),
  baseUrls: z.record(z.string(), z.unknown()).catch({}),
  sendCodeApproved: z.record(z.string(), z.unknown()).catch({}),
  globalInstructions: instructions.catch(""),
  features: z.record(z.string(), z.unknown()).catch({}),
});

function normalize(parsed: z.infer<typeof strictSchema>): AiSettings {
  const settings = defaultAiSettings();
  settings.enabled = parsed.enabled;
  settings.provider = parsed.provider;
  settings.globalInstructions = parsed.globalInstructions;
  for (const p of AI_PROVIDERS) {
    settings.baseUrls[p] = validateBaseUrl((parsed.baseUrls as Record<string, string>)[p] ?? "");
    settings.sendCodeApproved[p] = (parsed.sendCodeApproved as Record<string, boolean>)[p] === true;
  }
  for (const f of AI_FEATURES) {
    const feature = (parsed.features as Record<string, AiFeatureSettings>)[f];
    settings.features[f] = { model: (feature?.model ?? "").trim(), instructions: feature?.instructions ?? "" };
  }
  return settings;
}

export async function loadAiSettings(file: string, io: SettingsIo): Promise<AiSettings> {
  try {
    const raw = await io.read(file);
    if (raw === null) return defaultAiSettings();
    const parsed = lenientSchema.parse(JSON.parse(raw));
    const settings = defaultAiSettings();
    settings.enabled = parsed.enabled;
    settings.provider = parsed.provider;
    settings.globalInstructions = parsed.globalInstructions;
    for (const p of AI_PROVIDERS) {
      try {
        const url = parsed.baseUrls[p];
        settings.baseUrls[p] = typeof url === "string" ? validateBaseUrl(url) : "";
      } catch {
        /* URL adulterada: volta ao padrão do provedor */
      }
      settings.sendCodeApproved[p] = parsed.sendCodeApproved[p] === true;
    }
    for (const f of AI_FEATURES) {
      const feature = featureLenient.safeParse(parsed.features[f]);
      settings.features[f] = feature.success ? { model: feature.data.model.trim(), instructions: feature.data.instructions } : defaultFeature();
    }
    return settings;
  } catch {
    return defaultAiSettings();
  }
}

/** Valida com rigor (recusa em vez de corrigir), normaliza e grava. */
export async function saveAiSettings(file: string, incoming: unknown, io: SettingsIo): Promise<AiSettings> {
  const settings = normalize(strictSchema.parse(incoming));
  await io.write(file, JSON.stringify(settings, null, 2));
  return settings;
}
