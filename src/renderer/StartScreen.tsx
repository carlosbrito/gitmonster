import { useState } from "react";
import type { SessionState } from "../shared/types";
import logo from "./assets/logo.png";
import { repoName } from "./TabBar";

export interface StartScreenProps {
  recents: SessionState["recents"];
  busy: boolean;
  onOpen(): void;
  onClone(url: string): void;
  onInit(): void;
  onOpenRecent(root: string): void;
}

/** Tela inicial / "nova aba": abrir, clonar, criar e reabrir recentes. */
export function StartScreen({ recents, busy, onOpen, onClone, onInit, onOpenRecent }: StartScreenProps) {
  const [url, setUrl] = useState("");

  return (
    <div className="start">
      <h1 className="sr-only">GitMonster</h1>
      <img className="start-logo" src={logo} alt="GitMonster — Unleash your commits" />

      <div className="start-actions">
        <button disabled={busy} onClick={onOpen}>
          Abrir repositório…
        </button>
        <button disabled={busy} onClick={onInit}>
          Novo repositório (git init)…
        </button>
      </div>

      <form
        className="start-clone"
        onSubmit={(e) => {
          e.preventDefault();
          onClone(url);
        }}
      >
        <label>
          Clonar por URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://servidor/projeto.git ou git@servidor:projeto.git"
            aria-label="URL do repositório"
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy || url.trim() === ""}>
          Clonar…
        </button>
      </form>

      {busy && <p className="dim">trabalhando…</p>}

      <section className="start-recents">
        <h2>Recentes</h2>
        {recents.length === 0 ? (
          <p className="dim">Nenhum repositório recente.</p>
        ) : (
          <ul>
            {recents.map((r) => (
              <li key={r.root}>
                <button className="recent" disabled={busy} onClick={() => onOpenRecent(r.root)} title={r.root}>
                  <strong>{repoName(r.root)}</strong>
                  <span className="dim">{r.root}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
