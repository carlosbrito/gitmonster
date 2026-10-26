/**
 * Menu da aplicação: fonte única de rótulos, atalhos e ações. O main registra os aceleradores no menu nativo (invisível,
 * porque a barra de título é do app) e o renderer desenha o `MenuBar` a partir desta mesma lista.
 * Sem dependências: importado também pelo renderer.
 */

/** Ações que o main executa sobre a janela (webContents/app). */
export type MenuNativeAction =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "reload"
  | "toggleDevTools"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "toggleFullscreen"
  | "quit"
  | "about";

/** Comandos que dependem do estado do renderer (abas, diálogos); o main só os repassa. */
export type MenuRendererCommand = "new-tab" | "open-repo" | "clone-repo" | "init-repo" | "close-tab" | "settings";

export interface MenuItem {
  id: string;
  label: string;
  /** Formato do Electron (ex.: "CmdOrCtrl+Shift+O"); registrado no menu nativo. */
  accelerator?: string;
  /** Só para exibir quando o atalho é do sistema e não pode ser registrado (ex.: Alt+F4). */
  shortcutHint?: string;
  action: { kind: "native"; name: MenuNativeAction } | { kind: "renderer"; command: MenuRendererCommand };
}

export interface MenuGroup {
  id: string;
  label: string;
  /** `null` = separador. */
  items: (MenuItem | null)[];
}

const native = (id: string, label: string, name: MenuNativeAction, accelerator?: string, shortcutHint?: string): MenuItem => ({
  id,
  label,
  action: { kind: "native", name },
  ...(accelerator ? { accelerator } : {}),
  ...(shortcutHint ? { shortcutHint } : {}),
});

const command = (id: string, label: string, name: MenuRendererCommand, accelerator?: string): MenuItem => ({
  id,
  label,
  action: { kind: "renderer", command: name },
  ...(accelerator ? { accelerator } : {}),
});

export const APP_MENU: MenuGroup[] = [
  {
    id: "file",
    label: "Arquivo",
    items: [
      command("file.new-tab", "Nova aba", "new-tab", "CmdOrCtrl+T"),
      command("file.open", "Abrir repositório…", "open-repo", "CmdOrCtrl+O"),
      command("file.clone", "Clonar repositório…", "clone-repo", "CmdOrCtrl+Shift+O"),
      command("file.init", "Novo repositório…", "init-repo", "CmdOrCtrl+Shift+N"),
      null,
      command("file.close-tab", "Fechar aba", "close-tab", "CmdOrCtrl+W"),
      command("file.settings", "Configurações", "settings", "CmdOrCtrl+,"),
      null,
      native("file.quit", "Sair", "quit", undefined, "Alt+F4"),
    ],
  },
  {
    id: "edit",
    label: "Editar",
    items: [
      native("edit.undo", "Desfazer", "undo", "CmdOrCtrl+Z"),
      native("edit.redo", "Refazer", "redo", "CmdOrCtrl+Shift+Z"),
      null,
      native("edit.cut", "Recortar", "cut", "CmdOrCtrl+X"),
      native("edit.copy", "Copiar", "copy", "CmdOrCtrl+C"),
      native("edit.paste", "Colar", "paste", "CmdOrCtrl+V"),
      native("edit.select-all", "Selecionar tudo", "selectAll", "CmdOrCtrl+A"),
    ],
  },
  {
    id: "view",
    label: "Exibir",
    items: [
      native("view.reload", "Recarregar", "reload", "CmdOrCtrl+R"),
      native("view.devtools", "Ferramentas do desenvolvedor", "toggleDevTools", "CmdOrCtrl+Shift+I"),
      null,
      native("view.zoom-reset", "Zoom padrão", "resetZoom", "CmdOrCtrl+0"),
      native("view.zoom-in", "Aumentar zoom", "zoomIn", "CmdOrCtrl+Plus"),
      native("view.zoom-out", "Diminuir zoom", "zoomOut", "CmdOrCtrl+-"),
      null,
      native("view.fullscreen", "Tela cheia", "toggleFullscreen", "F11"),
    ],
  },
  {
    id: "help",
    label: "Ajuda",
    items: [native("help.about", "Sobre o GitMonster", "about")],
  },
];

/** Todos os itens (sem separadores), na ordem do menu. */
export const MENU_ITEMS: MenuItem[] = APP_MENU.flatMap((g) => g.items.filter((i): i is MenuItem => i !== null));

export const findMenuItem = (id: string): MenuItem | undefined => MENU_ITEMS.find((i) => i.id === id);

/** Texto do atalho para exibir no menu (Windows/Linux). */
export function shortcutLabel(item: MenuItem): string {
  if (item.shortcutHint) return item.shortcutHint;
  return (item.accelerator ?? "").replace("CmdOrCtrl", "Ctrl").replace("Plus", "+");
}
