import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { CheckoutTarget, PullMode, RefsSnapshot, RepoStatus, UndoInfo } from "../shared/types";
import { filterRefs } from "./branchFilter";
import { useDismiss } from "./hooks/useDismiss";
import { Icon, type IconName } from "./icons";
import { repoName } from "./TabBar";

const PULL_TITLE: Record<PullMode, string> = {
  "ff-only": "Atualiza a branch atual (somente fast-forward)",
  merge: "Atualiza a branch atual com um merge da remota",
  rebase: "Atualiza a branch atual reaplicando seus commits em cima da remota",
};

const PULL_MODE_LABEL: Record<PullMode, string> = {
  "ff-only": "Somente fast-forward",
  merge: "Merge",
  rebase: "Rebase",
};

export interface RepoToolbarProps {
  root: string;
  status: RepoStatus | null;
  refs: RefsSnapshot | null;
  undoInfo: UndoInfo | null;
  busy: boolean;
  pullMode: PullMode;
  onPullMode(mode: PullMode): void;
  /** Repositórios para o seletor: abertos (abas) e recentes. */
  repoChoices: { root: string; open: boolean }[];
  onSwitchRepo(root: string): void;
  onCheckout(target: CheckoutTarget): void;
  onUndo(): void;
  onRedo(): void;
  onFetch(): void;
  onPull(): void;
  onPush(): void;
  onForcePush(): void;
  onCreateBranch(): void;
  onStash(): void;
  onPop(): void;
  hasChanges: boolean;
  pullsOpen: boolean;
  onTogglePulls(): void;
  monitorOpen: boolean;
  onToggleMonitor(): void;
  searchOpen: boolean;
  onToggleSearch(): void;
}

interface ActionProps {
  icon: IconName;
  label: string;
  title?: string;
  disabled?: boolean;
  pressed?: boolean;
  badge?: number;
  onClick(): void;
}

/** Botão de ação: ícone grande e rótulo pequeno abaixo. O `aria-label` é o nome estável do botão. */
function Action({ icon, label, title, disabled, pressed, badge, onClick }: ActionProps) {
  return (
    <button className="tb-action" aria-label={label} title={title ?? label} disabled={disabled} aria-pressed={pressed} onClick={onClick}>
      <span className="tb-icon">
        <Icon name={icon} />
        {badge ? <span className="tb-badge">{badge}</span> : null}
      </span>
      <span className="tb-label" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

interface SplitProps extends Omit<ActionProps, "title"> {
  title: string;
  menuLabel: string;
  children(close: () => void): ReactNode;
}

/** Botão com seta ao lado que abre um menu (Pull/Push). */
function SplitAction({ menuLabel, children, ...action }: SplitProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="tb-split" ref={ref}>
      <Action {...action} />
      <button className="tb-caret" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={open} disabled={action.disabled} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <ul className="tb-menu" role="menu" aria-label={menuLabel}>
          {children(close)}
        </ul>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, checked, danger }: { children: ReactNode; onClick(): void; checked?: boolean; danger?: boolean }) {
  return (
    <li role="none">
      <button role={checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={checked} className={danger ? "danger" : undefined} onClick={onClick}>
        <span className="tb-check" aria-hidden="true">
          {checked ? "✓" : ""}
        </span>
        {children}
      </button>
    </li>
  );
}

function RepoSwitcher({ root, choices, onSwitch }: { root: string; choices: RepoToolbarProps["repoChoices"]; onSwitch(root: string): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const opened = choices.filter((c) => c.open);
  const recents = choices.filter((c) => !c.open);
  const pick = (r: string) => {
    setOpen(false);
    if (r !== root) onSwitch(r);
  };
  return (
    <div className="tb-picker" ref={ref}>
      <button className="tb-select repo-path" aria-haspopup="menu" aria-expanded={open} title={root} onClick={() => setOpen((o) => !o)}>
        <span className="tb-select-label">repositório</span>
        <span className="tb-select-value">
          {repoName(root)}
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div className="tb-popover" role="menu" aria-label="Repositórios">
          {opened.length > 0 && <p className="tb-group">Abertos</p>}
          <ul>
            {opened.map((c) => (
              <MenuItem key={c.root} checked={c.root === root} onClick={() => pick(c.root)}>
                <span title={c.root}>{repoName(c.root)}</span>
              </MenuItem>
            ))}
          </ul>
          {recents.length > 0 && <p className="tb-group">Recentes</p>}
          <ul>
            {recents.map((c) => (
              <MenuItem key={c.root} onClick={() => pick(c.root)}>
                <span title={c.root}>{repoName(c.root)}</span>
              </MenuItem>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BranchSwitcher({ status, refs, onCheckout }: { status: RepoStatus | null; refs: RefsSnapshot | null; onCheckout(t: CheckoutTarget): void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDismiss(ref, open, close);
  const matches = useMemo(() => (refs ? filterRefs(refs, query).branches : []), [refs, query]);
  const choose = (name: string, isCurrent: boolean) => {
    close();
    if (!isCurrent) onCheckout({ kind: "local", name });
  };
  const current = status?.branch ?? "(HEAD destacado)";
  const title = status?.upstream ? `${current} → ${status.upstream}` : current;
  return (
    <div className="tb-picker" ref={ref}>
      <button className="tb-select current-branch" aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((o) => !o)}>
        <span className="tb-select-label">branch</span>
        <span className="tb-select-value">
          {current}
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div className="tb-popover" role="menu" aria-label="Branches locais">
          <input
            autoFocus
            type="search"
            className="tb-filter"
            placeholder="Filtrar branches"
            aria-label="Filtrar branches locais"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const first = matches.find((b) => !b.isCurrent);
              if (e.key === "Enter" && first) choose(first.name, false);
            }}
          />
          <ul>
            {matches.map((b) => (
              <MenuItem key={b.name} checked={b.isCurrent} onClick={() => choose(b.name, b.isCurrent)}>
                {b.name}
              </MenuItem>
            ))}
          </ul>
          {matches.length === 0 && <p className="tb-group">Nenhuma branch encontrada</p>}
        </div>
      )}
    </div>
  );
}

/** Toolbar do repositório: seletores à esquerda, ações no centro, painéis e busca à direita. */
export function RepoToolbar(p: RepoToolbarProps) {
  const { busy, status } = p;
  const stashes = p.refs?.stashes.length ?? 0;
  return (
    <header className="toolbar repo-toolbar">
      <div className="tb-selectors">
        <RepoSwitcher root={p.root} choices={p.repoChoices} onSwitch={p.onSwitchRepo} />
        <span className="tb-arrow" aria-hidden="true">
          ›
        </span>
        <BranchSwitcher status={status} refs={p.refs} onCheckout={p.onCheckout} />
      </div>

      <div className="tb-actions">
        <Action icon="undo" label="Desfazer" title={p.undoInfo?.undo?.label ?? p.undoInfo?.blocked ?? "Nada para desfazer"} disabled={busy || !p.undoInfo?.undo} onClick={p.onUndo} />
        <Action icon="redo" label="Refazer" title={p.undoInfo?.redo?.label ?? "Nada para refazer"} disabled={busy || !p.undoInfo?.redo} onClick={p.onRedo} />
        <SplitAction icon="pull" label="Pull" title={PULL_TITLE[p.pullMode]} disabled={busy} badge={status?.behind} onClick={p.onPull} menuLabel="Opções do Pull">
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  close();
                  p.onFetch();
                }}
              >
                Fetch
              </MenuItem>
              <li role="separator" className="tb-sep" />
              {(Object.keys(PULL_MODE_LABEL) as PullMode[]).map((m) => (
                <MenuItem
                  key={m}
                  checked={p.pullMode === m}
                  onClick={() => {
                    p.onPullMode(m);
                    close();
                  }}
                >
                  {PULL_MODE_LABEL[m]}
                </MenuItem>
              ))}
            </>
          )}
        </SplitAction>
        <SplitAction icon="push" label="Push" title="Envia a branch atual" disabled={busy} badge={status?.ahead} onClick={p.onPush} menuLabel="Opções do Push">
          {(close) => (
            <MenuItem
              danger
              onClick={() => {
                close();
                p.onForcePush();
              }}
            >
              Force push
            </MenuItem>
          )}
        </SplitAction>
        <Action icon="branch" label="Branch" title="Cria uma branch a partir do HEAD e muda para ela" disabled={busy} onClick={p.onCreateBranch} />
        <Action icon="stash" label="Stash" title="Guarda as alterações no stash" disabled={busy || !p.hasChanges} onClick={p.onStash} />
        <Action icon="pop" label="Pop" title="Aplica e remove o stash mais recente" disabled={busy || stashes === 0} onClick={p.onPop} />
      </div>

      <div className="tb-right">
        {busy && (
          <span className="tb-busy" role="status">
            trabalhando…
          </span>
        )}
        <Action icon="pulls" label="Pull Requests" title="Pull Requests do GitHub" pressed={p.pullsOpen} onClick={p.onTogglePulls} />
        <Action icon="monitor" label="Monitor" title="Mostra os comandos git que o GitMonster executa" pressed={p.monitorOpen} onClick={p.onToggleMonitor} />
        <Action icon="search" label="Pesquisar" title="Pesquisar commits (Ctrl+F)" pressed={p.searchOpen} onClick={p.onToggleSearch} />
      </div>
    </header>
  );
}
