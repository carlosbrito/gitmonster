import { homedir } from "node:os";
import type { GitIdentity, GitProfile } from "../../shared/types";
import { runGit } from "./GitService";

export type ProfileScope = "global" | "local";

const MAX = 200;

/** Valor de configuração do Git: uma linha, sem controle, sem começar com `-` (viraria opção). */
function cleanValue(label: string, value: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length > MAX || /[\0-\x1f\x7f]/.test(v)) throw new Error(`${label} inválido.`);
  if (v.startsWith("-")) throw new Error(`${label} não pode começar com "-".`);
  return v;
}

export function validateIdentity(name: string, email: string): GitIdentity {
  const n = cleanValue("Nome", name);
  const e = cleanValue("E-mail", email);
  if (e !== "" && !/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");
  return { name: n, email: e };
}

/** `git config --get` sai com 1 quando a chave não existe: isso é "vazio", não erro. */
async function read(cwd: string, scope: ProfileScope | null, key: string): Promise<string> {
  const args = ["config", ...(scope ? [`--${scope}`] : []), "--get", key];
  return (await runGit(cwd, args, { okExitCodes: [1] })).trim();
}

async function readIdentity(cwd: string, scope: ProfileScope | null): Promise<GitIdentity> {
  const [name, email] = await Promise.all([read(cwd, scope, "user.name"), read(cwd, scope, "user.email")]);
  return { name, email };
}

/**
 * Perfil do Git: o do usuário (global), o do repositório (local, se houver `root`) e o efetivo
 * (o que o Git usaria num commit). Sem repositório, o local e o efetivo ficam vazios.
 */
export async function getGitProfile(root: string | null): Promise<GitProfile> {
  const empty: GitIdentity = { name: "", email: "" };
  const home = homedir();
  const [global, local, effective] = await Promise.all([
    readIdentity(root ?? home, "global"),
    root ? readIdentity(root, "local") : empty,
    root ? readIdentity(root, null) : empty,
  ]);
  return { global, local, effective };
}

async function write(cwd: string, scope: ProfileScope, key: string, value: string): Promise<void> {
  if (value === "") {
    // `--unset` sai com 5 quando a chave já não existia.
    await runGit(cwd, ["config", `--${scope}`, "--unset-all", key], { okExitCodes: [5] });
    return;
  }
  await runGit(cwd, ["config", `--${scope}`, key, value]);
}

/** Grava nome e e-mail no escopo escolhido; vazio remove a chave. O escopo local exige repositório. */
export async function setGitProfile(root: string | null, scope: ProfileScope, name: string, email: string): Promise<void> {
  if (scope !== "global" && scope !== "local") throw new Error("Escopo inválido.");
  if (scope === "local" && !root) throw new Error("Abra um repositório para definir o perfil dele.");
  const identity = validateIdentity(name, email);
  const cwd = scope === "local" ? root! : homedir();
  await write(cwd, scope, "user.name", identity.name);
  await write(cwd, scope, "user.email", identity.email);
}
