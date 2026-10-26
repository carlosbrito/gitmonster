import { describe, expect, it } from "vitest";
import { clampPanel } from "../src/renderer/panelSize";

describe("clampPanel", () => {
  it("respeita mínimo e máximo", () => {
    expect(clampPanel(100, 180, 480)).toBe(180);
    expect(clampPanel(900, 180, 480)).toBe(480);
    expect(clampPanel(300, 180, 480)).toBe(300);
  });
  it("não passa do espaço disponível", () => {
    expect(clampPanel(450, 180, 480, 400)).toBe(400);
  });
  it("o mínimo vence quando falta espaço", () => {
    expect(clampPanel(450, 180, 480, 100)).toBe(180);
  });
});
