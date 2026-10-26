import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveRepoRoot, runGit } from "./GitService";

export const CLONE_TIMEOUT_MS = 10 * 60_000;

const SCP_LIKE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s-][^\s]*$/;
const URL_LIKE = /^(https:\/\/|ssh:\/\/|file:\/\/\/?)[^\s]+$/i;

/**
 * Só aceita transportes previsíveis. Recusa `-` inicial (viraria opção do git) e qualquer outro esquema
 * (`ext::` executa comandos). O clone ainda roda com `protocol.ext.allow=never` como segunda barreira.
 */
export function validateCloneUrl(url: string): string {
  const value = typeof url === "string" ? url.trim() : "";
  if (value === "" || value.length > 2048) throw new Error("Informe a URL do repositório.");
  if (value.startsWith("-") || /[\0\r\n]/.test(value)) throw new Error("URL inválida.");
  if (!URL_LIKE.test(value) && !SCP_LIKE.test(value)) {
    throw new Error("URL não suportada. Use https://, ssh://, git@host:caminho ou file://.");
  }
  return value;
}

/** Nome da pasta de destino a partir da URL (`.../projeto.git` → `projeto`). */
export function deriveRepoName(url: string): string {
  const last = url.trim().replace(/[\x5c/]+$/, "").split(/[\x5c/:]/).pop() ?? "";
  const name = last.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new Error("Não foi possível deduzir o nome da pasta a partir da URL.");
  }
  return name;
}

/** Clona `url` em `<parentDir>/<nome>` e devolve a raiz do novo repositório. Nunca sobrescreve. */
export async function cloneRepo(url: string, parentDir: string): Promise<string> {
  const safeUrl = validateCloneUrl(url);
  const target = join(parentDir, deriveRepoName(safeUrl));
  if (existsSync(target)) throw new Error(`A pasta "${target}" já existe.`);
  try {
    await runGit(parentDir, ["-c", "protocol.ext.allow=never", "clone", "--", safeUrl, target], {
      timeoutMs: CLONE_TIMEOUT_MS,
    });
  } catch (e) {
    rmSync(target, { recursive: true, force: true }); // só existe se este clone a criou (checado acima)
    throw e;
  }
  return resolveRepoRoot(target);
}

/** `git init` na pasta (ou apenas resolve a raiz, se já for repositório). */
export async function initRepo(dir: string): Promise<string> {
  try {
    return await resolveRepoRoot(dir);
  } catch {
    await runGit(dir, ["init"]);
    return resolveRepoRoot(dir);
  }
}
