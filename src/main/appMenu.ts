import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from "electron";
import { Channels } from "../shared/channels";
import { APP_MENU, type MenuItem, type MenuNativeAction } from "../shared/appMenu";

const ZOOM_STEP = 0.5;

function runNative(win: BrowserWindow, name: MenuNativeAction): void {
  const wc = win.webContents;
  switch (name) {
    case "undo": return wc.undo();
    case "redo": return wc.redo();
    case "cut": return wc.cut();
    case "copy": return wc.copy();
    case "paste": return wc.paste();
    case "selectAll": return wc.selectAll();
    case "reload": return wc.reload();
    case "toggleDevTools": return wc.toggleDevTools();
    case "resetZoom": return wc.setZoomLevel(0);
    case "zoomIn": return wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP);
    case "zoomOut": return wc.setZoomLevel(wc.getZoomLevel() - ZOOM_STEP);
    case "toggleFullscreen": return win.setFullScreen(!win.isFullScreen());
    case "quit": return app.quit();
    case "about":
      void dialog.showMessageBox(win, { type: "info", title: "Sobre o GitMonster", message: "GitMonster", detail: `Versão ${app.getVersion()}`, buttons: ["OK"] });
      return;
  }
}

/** Executa um item do menu (clique no `MenuBar` ou atalho): ações nativas aqui, comandos de tela no renderer. */
export function runMenuItem(win: BrowserWindow, item: MenuItem): void {
  if (win.isDestroyed()) return;
  if (item.action.kind === "native") runNative(win, item.action.name);
  else win.webContents.send(Channels.menuCommand, item.action.command);
}

/**
 * Registra os aceleradores no menu nativo. A barra de menu nativa fica oculta (o app desenha a sua),
 * mas os atalhos do menu da aplicação continuam valendo.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = APP_MENU.map((group) => ({
    label: group.label,
    submenu: group.items.map((item): MenuItemConstructorOptions =>
      item === null
        ? { type: "separator" }
        : {
            label: item.label,
            ...(item.accelerator ? { accelerator: item.accelerator } : {}),
            click: (_mi, bw) => {
              const win = bw instanceof BrowserWindow ? bw : BrowserWindow.getFocusedWindow();
              if (win) runMenuItem(win, item);
            },
          },
    ),
  }));
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
