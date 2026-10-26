import type { RemoteInfo } from "../../shared/types";
import { validateCloneUrl } from "./Clone";
import { runGit } from "./GitService";

/** Nome de remote: letras, números, ponto, hífen e sublinhado; não começa com `-` nem `.`. */
export function assertRemoteName(name: string): string {
  if (typeof name !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/.test(name) || name.endsWith(".lock") || name.includes("..")) {
    throw new Error(`Nome de remote inválido: "${name}".`);
  }
  return name;
}

/** Lê a saída de `git remote -v`: `<nome>\t<url> (fetch|push)`. */
export function parseRemotes(raw: string): RemoteInfo[] {
  const byName = new Map<string, RemoteInfo>();
  for (const line of raw.split("\n")) {
    const m = /^(\S+)\t(.+) \((fetch|push)\)$/.exec(line.trim());
    if (!m) continue;
    const [, name = "", url = "", kind = ""] = m;
    const info = byName.get(name) ?? { name, fetchUrl: "", pushUrl: "" };
    if (kind === "fetch") info.fetchUrl = url;
    else info.pushUrl = url;
    byName.set(name, info);
  }
  return [...byName.values()];
}

export async function listRemotes(root: string): Promise<RemoteInfo[]> {
  return parseRemotes(await runGit(root, ["remote", "-v"]));
}

async function assertExists(root: string, name: string): Promise<void> {
  if (!(await listRemotes(root)).some((r) => r.name === name)) throw new Error(`O remote "${name}" não existe.`);
}

export async function addRemote(root: string, name: string, url: string): Promise<void> {
  const safeName = assertRemoteName(name);
  const safeUrl = validateCloneUrl(url);
  if ((await listRemotes(root)).some((r) => r.name === safeName)) throw new Error(`Já existe um remote chamado "${safeName}".`);
  await runGit(root, ["remote", "add", "--", safeName, safeUrl]);
}

export async function removeRemote(root: string, name: string): Promise<void> {
  const safe = assertRemoteName(name);
  await assertExists(root, safe);
  await runGit(root, ["remote", "remove", "--", safe]);
}
