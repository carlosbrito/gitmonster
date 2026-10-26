import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { UpdaterState } from "../src/shared/types";
import { createUpdater, releaseNotesText, scheduleChecks, type AutoUpdaterLike } from "../src/main/Updater";

class FakeUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  feed: { provider: string; url: string } | null = null;
  installed = false;
  checkBehavior: () => Promise<unknown> = async () => undefined;
  downloadBehavior: () => Promise<unknown> = async () => undefined;
  setFeedURL(o: { provider: "generic"; url: string }) {
    this.feed = o;
  }
  checkForUpdates() {
    return this.checkBehavior();
  }
  downloadUpdate() {
    return this.downloadBehavior();
  }
  quitAndInstall() {
    this.installed = true;
  }
}

function setup(opts: { feedUrl?: string | null; packaged?: boolean } = {}) {
  const fake = new FakeUpdater();
  const changes: UpdaterState[] = [];
  let loads = 0;
  const updater = createUpdater({
    feedUrl: opts.feedUrl ?? null,
    isPackaged: opts.packaged ?? true,
    loadAutoUpdater: async () => {
      loads++;
      return fake;
    },
    onChange: (s) => changes.push(s),
  });
  return { fake, updater, changes, loads: () => loads };
}

describe("atualizador", () => {
  it("fora do app instalado, fica desligado sem nem carregar o electron-updater", async () => {
    const { updater, loads } = setup({ packaged: false });
    expect(await updater.check()).toMatchObject({ status: "disabled", message: expect.stringMatching(/instalado/) });
    expect(loads()).toBe(0);
  });

  it("usa o feed embutido no build (sem setFeedURL) e não baixa sozinho", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("update-available", { version: "2.0.0", releaseNotes: "<p>Novo <b>grafo</b></p>" });

    expect(await updater.check()).toEqual({ status: "available", version: "2.0.0", notes: "Novo grafo" });

    expect(fake.feed).toBeNull();
    expect(fake.autoDownload).toBe(false);
    expect(fake.autoInstallOnAppQuit).toBe(true);
  });

  it("feed alternativo (variável de ambiente) vira setFeedURL genérico", async () => {
    const { updater, fake } = setup({ feedUrl: "https://homolog.example/updates" });
    fake.checkBehavior = async () => void fake.emit("update-not-available");
    await updater.check();
    expect(fake.feed).toEqual({ provider: "generic", url: "https://homolog.example/updates" });
  });

  it("sem versão nova", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("update-not-available");
    expect(await updater.check()).toEqual({ status: "none" });
  });

  it("avisa cada mudança de estado", async () => {
    const { updater, fake, changes } = setup();
    fake.checkBehavior = async () => void fake.emit("update-available", { version: "2.0.0" });
    await updater.check();
    expect(changes.map((c) => c.status)).toEqual(["checking", "available"]);
  });

  it("fluxo completo: verificar, baixar com progresso, ficar pronta e instalar", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("update-available", { version: "2.0.0" });
    await updater.check();

    fake.downloadBehavior = async () => {
      fake.emit("download-progress", { percent: 41.6 });
      expect(updater.getState()).toEqual({ status: "downloading", percent: 42 });
      fake.emit("update-downloaded", { version: "2.0.0" });
    };
    expect(await updater.download()).toEqual({ status: "ready", version: "2.0.0" });

    updater.install();
    expect(fake.installed).toBe(true);
  });

  it("falha no download guarda a versão e permite tentar de novo", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("update-available", { version: "2.0.0" });
    await updater.check();

    fake.downloadBehavior = async () => {
      throw new Error("conexão caiu");
    };
    expect(await updater.download()).toEqual({ status: "error", message: "conexão caiu", version: "2.0.0" });

    fake.downloadBehavior = async () => void fake.emit("update-downloaded", { version: "2.0.0" });
    expect(await updater.download()).toEqual({ status: "ready", version: "2.0.0" });
  });

  it("verificar de novo durante o download ou com a versão pronta não apaga o estado", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("update-available", { version: "2.0.0" });
    await updater.check();
    fake.downloadBehavior = async () => void fake.emit("update-downloaded", { version: "2.0.0" });
    await updater.download();
    expect(await updater.check()).toEqual({ status: "ready", version: "2.0.0" });
  });

  it("erro de rede na verificação vira estado de erro sem versão", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => {
      throw new Error("net::ERR_NAME_NOT_RESOLVED\n    at stack...");
    };
    expect(await updater.check()).toEqual({ status: "error", message: "net::ERR_NAME_NOT_RESOLVED" });
  });

  it("erro assíncrono emitido pelo electron-updater também é capturado", async () => {
    const { updater, fake } = setup();
    fake.checkBehavior = async () => void fake.emit("error", new Error("assinatura inválida"));
    expect(await updater.check()).toEqual({ status: "error", message: "assinatura inválida" });
  });

  it("baixar ou instalar fora de hora é recusado", async () => {
    const { updater } = setup();
    await expect(updater.download()).rejects.toThrow(/Verifique primeiro/);
    expect(() => updater.install()).toThrow(/não foi baixada/);
  });

  it("carrega o electron-updater uma vez só, mesmo verificando várias vezes", async () => {
    const { updater, fake, loads } = setup();
    fake.checkBehavior = async () => void fake.emit("update-not-available");
    await updater.check();
    await updater.check();
    expect(loads()).toBe(1);
  });
});

describe("releaseNotesText", () => {
  it("tira HTML e decodifica entidades", () => {
    expect(releaseNotesText("<h2>Novidades</h2><ul><li>A &amp; B</li><li>C</li></ul>")).toBe("Novidades\n• A & B\n• C");
  });
  it("junta notas por versão", () => {
    expect(releaseNotesText([{ version: "2.0.0", note: "x" }, { version: "1.9.0", note: null }])).toBe("2.0.0\nx\n\n1.9.0");
  });
  it("sem notas: texto vazio; notas enormes são cortadas", () => {
    expect(releaseNotesText(undefined)).toBe("");
    expect(releaseNotesText("a".repeat(30_000)).length).toBe(20_001);
  });
});

describe("scheduleChecks", () => {
  it("verifica depois do atraso inicial e depois periodicamente", () => {
    const timers: { kind: string; ms: number; fn: () => void }[] = [];
    let checks = 0;
    scheduleChecks(
      { check: async () => (checks++, { status: "none" }) },
      {
        firstDelayMs: 10_000,
        everyMs: 21_600_000,
        setTimeout: (fn, ms) => timers.push({ kind: "timeout", ms, fn }),
        setInterval: (fn, ms) => timers.push({ kind: "interval", ms, fn }),
      },
    );
    expect(checks).toBe(0);
    expect(timers).toMatchObject([{ kind: "timeout", ms: 10_000 }]);
    timers[0]!.fn();
    expect(checks).toBe(1);
    expect(timers[1]).toMatchObject({ kind: "interval", ms: 21_600_000 });
    timers[1]!.fn();
    expect(checks).toBe(2);
  });

  it("falha na verificação não escapa", () => {
    let run: () => void = () => undefined;
    scheduleChecks({ check: () => Promise.reject(new Error("offline")) }, { setTimeout: (fn) => (run = fn), setInterval: () => undefined });
    expect(() => run()).not.toThrow();
  });
});
