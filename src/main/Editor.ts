import { spawn } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertSafePath } from "./git/WorkTree";

export interface EditorDeps {
  /** Abre com o programa padrão do sistema (devolve texto de erro, ou "" se deu certo). */
  openPath(path: string): Promise<string>;
  /** Inicia o editor sem shell. */
  launch(executable: string, args: string[]): void;
}

export const realEditorDeps = (openPath: EditorDeps["openPath"]): EditorDeps => ({
  openPath,
  launch(executable, args) {
    const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false, shell: false });
    child.on("error", () => undefined);
    child.unref();
  },
});

/**
 * Converte o comando configurado no executável a rodar. Nunca usa shell (um nome de arquivo com `&` ou aspas
 * não pode virar comando), então `.cmd`/`.bat` não servem: para o `code` do VS Code, que no Windows é um
 * `code.cmd`, usa o `Code.exe` que fica ao lado da pasta `bin`.
 */
export function resolveEditorExecutable(command: string, env: NodeJS.ProcessEnv = process.env): string {
  const cmd = command.trim();
  if (cmd === "" || /[\0\r\n]/.test(cmd)) throw new Error("Comando do editor inválido.");

  if (/[\\/]/.test(cmd) || isAbsolute(cmd)) {
    if (/\.(cmd|bat)$/i.test(cmd)) throw new Error("Informe o .exe do editor: arquivos .cmd/.bat não são executados.");
    if (!existsSync(cmd)) throw new Error(`Editor não encontrado: ${cmd}`);
    return cmd;
  }

  const dirs = (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter(Boolean);
  const name = cmd.replace(/\.exe$/i, "");
  for (const dir of dirs) {
    const exe = join(dir, `${name}.exe`);
    if (existsSync(exe)) return exe;
  }
  if (name.toLowerCase() === "code") {
    for (const dir of dirs) {
      if (existsSync(join(dir, "code.cmd"))) {
        const exe = join(dir, "..", "Code.exe");
        if (existsSync(exe)) return resolve(exe);
      }
    }
  }
  throw new Error(`Editor "${cmd}" não encontrado no PATH. Informe o caminho completo do .exe nas Configurações.`);
}

/** Caminho absoluto do arquivo dentro do repositório; recusa o que não existe, não é arquivo ou escapa da raiz. */
export function resolveRepoFile(root: string, path: string): string {
  const abs = join(root, assertSafePath(path));
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error("O arquivo não existe no disco.");
  // `realpath` pega links simbólicos que levariam para fora do repositório.
  const real = realpathSync(abs);
  const rel = relative(realpathSync(root), real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new Error("O arquivo está fora do repositório.");
  }
  return real;
}

/** Abre a pasta raiz do repositório no gerenciador de arquivos do sistema. */
export async function openProjectFolder(root: string, deps: Pick<EditorDeps, "openPath">): Promise<void> {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("Não foi possível abrir a pasta: ela não existe mais no disco.");
  const error = await deps.openPath(root);
  if (error) throw new Error(`Não foi possível abrir a pasta: ${error}`);
}

export async function openInEditor(root: string, path: string, editor: string, deps: EditorDeps): Promise<void> {
  const file = resolveRepoFile(root, path);
  if (editor.trim() === "") {
    const error = await deps.openPath(file);
    if (error) throw new Error(`Não foi possível abrir o arquivo: ${error}`);
    return;
  }
  deps.launch(resolveEditorExecutable(editor), [file]);
}
