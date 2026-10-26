import { describe, expect, it } from "vitest";
import { APP_MENU, findMenuItem, MENU_ITEMS, shortcutLabel } from "../src/shared/appMenu";

describe("appMenu", () => {
  it("tem os quatro grupos esperados", () => {
    expect(APP_MENU.map((g) => g.label)).toEqual(["Arquivo", "Editar", "Exibir", "Ajuda"]);
  });

  it("ids dos itens são únicos", () => {
    const ids = MENU_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("aceleradores registrados não se repetem", () => {
    const acc = MENU_ITEMS.map((i) => i.accelerator).filter(Boolean);
    expect(new Set(acc).size).toBe(acc.length);
  });

  it("mantém os atalhos do menu padrão do Electron", () => {
    expect(findMenuItem("view.devtools")?.accelerator).toBe("CmdOrCtrl+Shift+I");
    expect(findMenuItem("view.reload")?.accelerator).toBe("CmdOrCtrl+R");
    expect(findMenuItem("edit.copy")?.accelerator).toBe("CmdOrCtrl+C");
  });

  it("Ctrl+F fica livre para a busca de commits", () => {
    expect(MENU_ITEMS.some((i) => i.accelerator === "CmdOrCtrl+F")).toBe(false);
  });

  it("findMenuItem devolve undefined para id desconhecido", () => {
    expect(findMenuItem("nao.existe")).toBeUndefined();
  });

  it("shortcutLabel formata o atalho para exibição", () => {
    expect(shortcutLabel(findMenuItem("file.clone")!)).toBe("Ctrl+Shift+O");
    expect(shortcutLabel(findMenuItem("view.zoom-in")!)).toBe("Ctrl++");
    expect(shortcutLabel(findMenuItem("file.quit")!)).toBe("Alt+F4");
    expect(shortcutLabel(findMenuItem("help.about")!)).toBe("");
  });
});
