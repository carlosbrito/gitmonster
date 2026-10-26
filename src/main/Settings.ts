import { z } from "zod";
import type { AppSettings } from "../shared/types";

export interface SettingsIo {
  /** Conteúdo do arquivo, ou null se não existir. */
  read(file: string): Promise<string | null>;
  write(file: string, content: string): Promise<void>;
}

export const defaultSettings = (): AppSettings => ({ version: 1, theme: "system", editor: "" });

/** Linha única, sem NUL: vale para o comando do editor. */
const singleLine = (max: number) => z.string().max(max).refine((v) => !/[\0\r\n]/.test(v), "Valor inválido.");

/** Vazio ou uma URL https (feed alternativo de atualização). Outros esquemas (http, file, javascript...) são recusados. */
export function validateUpdateUrl(value: string): string {
  const url = value.trim();
  if (url === "") return "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL de atualização não é válida.");
  }
  if (parsed.protocol !== "https:" || url.length > 2048 || /[\0\r\n]/.test(url)) {
    throw new Error("A URL de atualização precisa começar com https://.");
  }
  return url;
}

const fields = {
  theme: z.enum(["system", "light", "dark"]),
  editor: singleLine(260),
};

const strictSchema = z.object({ version: z.literal(1), ...fields });

/** Na leitura, um campo estragado volta ao padrão sem derrubar os outros; campos antigos (ex.: `updateUrl`) são ignorados. */
const lenientSchema = z.object({
  theme: fields.theme.catch("system"),
  editor: fields.editor.catch(""),
});

export async function loadSettings(file: string, io: SettingsIo): Promise<AppSettings> {
  try {
    const raw = await io.read(file);
    if (raw === null) return defaultSettings();
    const parsed = lenientSchema.parse(JSON.parse(raw));
    return { version: 1, ...parsed };
  } catch {
    return defaultSettings();
  }
}

/** Valida com rigor (recusa em vez de corrigir), normaliza e grava de forma atômica. */
export async function saveSettings(file: string, incoming: unknown, io: SettingsIo): Promise<AppSettings> {
  const parsed = strictSchema.parse(incoming);
  const settings: AppSettings = {
    version: 1,
    theme: parsed.theme,
    editor: parsed.editor.trim(),
  };
  await io.write(file, JSON.stringify(settings, null, 2));
  return settings;
}
