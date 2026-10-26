import { z } from "zod";
import type { GitHubRepoRef } from "../shared/types";

const NAME = /^[A-Za-z0-9._-]+$/;
const validName = (s: string) => NAME.test(s) && s !== "." && s !== ".." && s.length <= 100;

/**
 * Dono e nome do repositório a partir da URL de um remote do GitHub. Aceita https, ssh:// e o formato scp
 * (`git@github.com:dono/repo.git`). Qualquer outro host ou formato devolve null.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const value = url.trim();
  const m =
    /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(value) ??
    /^ssh:\/\/git@github\.com(?::22)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(value) ??
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(value);
  if (!m) return null;
  const [, owner = "", repo = ""] = m;
  return validName(owner) && validName(repo) ? { owner, repo } : null;
}

/** Escolhe o remote do GitHub: `origin` se for dele, senão o primeiro que for. */
export function pickGitHubRemote(remotes: readonly { name: string; fetchUrl: string }[]): GitHubRepoRef | null {
  const ordered = [...remotes].sort((a, b) => Number(b.name === "origin") - Number(a.name === "origin"));
  for (const r of ordered) {
    const parsed = parseGitHubUrl(r.fetchUrl);
    if (parsed) return { remote: r.name, ...parsed };
  }
  return null;
}

/** Tokens do GitHub (`ghp_...`, `github_pat_...`, `gho_...`) são só letras, números, `_` e `-`. */
const tokenSchema = z
  .string()
  .trim()
  .min(8)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/, "O token tem caracteres inválidos.");

export function validateToken(token: string): string {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) throw new Error("Token inválido. Cole o token pessoal do GitHub, sem espaços.");
  return parsed.data;
}

/** Criptografia do sistema (no Electron, `safeStorage`). */
export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface TokenIo {
  read(file: string): Promise<string | null>;
  write(file: string, content: string): Promise<void>;
  remove(file: string): Promise<void>;
}

const fileSchema = z.object({ version: z.literal(1), token: z.string().min(1) });

/**
 * Guarda o segredo (token do GitHub ou chave de IA, conforme `validate`) só criptografado. Se o sistema não oferece criptografia, recusa guardar:
 * nunca grava o token em texto puro.
 */
export function createTokenStore(file: string, crypto: SecretCrypto, io: TokenIo, validate: (secret: string) => string = validateToken) {
  return {
    secureStorageAvailable: () => crypto.isAvailable(),

    async save(token: string): Promise<void> {
      const clean = validate(token);
      if (!crypto.isAvailable()) {
        throw new Error("Este sistema não oferece armazenamento seguro de segredos; o token não será guardado.");
      }
      const encrypted = crypto.encrypt(clean).toString("base64");
      await io.write(file, JSON.stringify({ version: 1, token: encrypted }));
    },

    /** O token, ou null se não houver, o arquivo estiver estragado ou não der para descriptografar. */
    async load(): Promise<string | null> {
      try {
        const raw = await io.read(file);
        if (raw === null || !crypto.isAvailable()) return null;
        const { token } = fileSchema.parse(JSON.parse(raw));
        return crypto.decrypt(Buffer.from(token, "base64"));
      } catch {
        return null;
      }
    },

    async clear(): Promise<void> {
      await io.remove(file);
    },
  };
}
