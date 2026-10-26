import { useEffect, useMemo, useRef, useState } from "react";
import type { GitLogEntry } from "../shared/types";

const SHOW_READS_KEY = "gitmonster.monitorShowReads";
const MAX_SHOWN = 1000;

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const clock = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour12: false });

function readFlag(): boolean {
  try {
    return localStorage.getItem(SHOW_READS_KEY) === "1";
  } catch {
    return false;
  }
}

export interface GitMonitorProps {
  /** Raiz do repositório desta aba: só os comandos dele aparecem. */
  root: string;
  onClose(): void;
}

/**
 * Mostra os comandos `git` que o app executa por baixo dos panos, prontos para colar num terminal.
 * Por padrão esconde as leituras (status, log...) que o app dispara o tempo todo para atualizar a tela.
 */
export function GitMonitor({ root, onClose }: GitMonitorProps) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [showReads, setShowReads] = useState(readFlag);
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let alive = true;
    const buffered: GitLogEntry[] = [];
    let loaded = false;
    // Assina antes de pedir o histórico: nada se perde entre os dois; ids repetidos são descartados.
    const off = window.gitmonster.onGitLog((entry) => {
      if (!loaded) buffered.push(entry);
      else setEntries((prev) => merge(prev, [entry]));
    });
    void window.gitmonster.gitLogList().then((list) => {
      if (!alive) return;
      loaded = true;
      setEntries((prev) => merge(prev, [...list, ...buffered]));
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const mine = useMemo(() => {
    const r = norm(root);
    return entries.filter((e) => (showReads || !e.readOnly) && (norm(e.cwd) === r || norm(e.cwd).startsWith(r + "/")));
  }, [entries, root, showReads]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [mine]);

  const copy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
      },
      () => undefined,
    );
  };
  const toggleReads = (on: boolean) => {
    setShowReads(on);
    try {
      localStorage.setItem(SHOW_READS_KEY, on ? "1" : "0");
    } catch {
      /* vale só nesta sessão */
    }
  };
  const cdLine = `cd "${root}"`;

  return (
    <section className="git-monitor" aria-label="Monitor de comandos Git">
      <header className="gm-head">
        <strong>Monitor de comandos Git</strong>
        <span className="dim gm-hint">Os comandos que o GitMonster executa; cole no terminal, na pasta do repositório.</span>
        <label className="gm-reads">
          <input type="checkbox" checked={showReads} onChange={(e) => toggleReads(e.target.checked)} /> mostrar leituras
        </label>
        <button onClick={() => copy(cdLine, "cd")} title="Copia o comando para entrar na pasta do repositório">
          {copied === "cd" ? "Copiado" : "Copiar cd"}
        </button>
        <button
          disabled={mine.length === 0}
          onClick={() => copy(mine.map((e) => e.command).join("\n"), "all")}
          title="Copia todos os comandos listados, um por linha"
        >
          {copied === "all" ? "Copiado" : "Copiar tudo"}
        </button>
        <button
          onClick={() => {
            void window.gitmonster.gitLogClear();
            setEntries([]);
          }}
        >
          Limpar
        </button>
        <button onClick={onClose} aria-label="Fechar monitor" title="Fechar">
          ×
        </button>
      </header>
      <div
        ref={listRef}
        className="gm-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {mine.length === 0 && <p className="dim gm-empty">Nenhum comando ainda. As ações que alteram o repositório aparecem aqui.</p>}
        {mine.map((e) => (
          <div key={e.id} className={`gm-row${e.ok ? "" : " fail"}${e.readOnly ? " read" : ""}`}>
            <span className="gm-time">{clock(e.at)}</span>
            <span className="gm-state" title={e.ok ? "Concluído" : `Falhou (código ${e.exitCode ?? "?"})`}>
              {e.ok ? "✓" : "✗"}
            </span>
            <code className="gm-cmd">{e.command}</code>
            <span className="gm-dur dim">{e.durationMs} ms</span>
            <button className="gm-copy" onClick={() => copy(e.command, String(e.id))} title="Copiar este comando">
              {copied === String(e.id) ? "✓" : "⧉"}
            </button>
            {!e.ok && e.error && <div className="gm-error">{e.error}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Junta listas de entradas sem repetir ids, em ordem de id, guardando só as mais recentes. */
function merge(prev: GitLogEntry[], incoming: GitLogEntry[]): GitLogEntry[] {
  const byId = new Map<number, GitLogEntry>();
  for (const e of prev) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  const all = [...byId.values()].sort((a, b) => a.id - b.id);
  return all.length > MAX_SHOWN ? all.slice(all.length - MAX_SHOWN) : all;
}
