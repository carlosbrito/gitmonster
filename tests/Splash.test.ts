import { describe, expect, it } from "vitest";
import { SPLASH_MS, remainingSplashMs } from "../src/main/Splash";

describe("remainingSplashMs", () => {
  it("a splash dura 5 segundos", () => expect(SPLASH_MS).toBe(5_000));

  it("conta de quando a splash apareceu", () => {
    expect(remainingSplashMs(1000, 1000)).toBe(5000);
    expect(remainingSplashMs(1000, 4000)).toBe(2000);
    expect(remainingSplashMs(1000, 5999)).toBe(1);
  });

  it("nunca é negativo: passou do tempo, é zero", () => {
    expect(remainingSplashMs(1000, 6000)).toBe(0);
    expect(remainingSplashMs(1000, 99_000)).toBe(0);
  });

  it("relógio que volta no tempo não passa do total", () => {
    expect(remainingSplashMs(5000, 1000)).toBe(5000);
  });

  it("aceita outra duração", () => {
    expect(remainingSplashMs(0, 1500, 3000)).toBe(1500);
  });
});
