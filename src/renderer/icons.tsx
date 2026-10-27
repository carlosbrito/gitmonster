import type { ReactNode } from "react";

/** Ícones de traço (stroke 1.5, 24×24, cor herdada). Desenhados à mão para evitar uma dependência de ícones. */
const PATHS = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  tab: <path d="M9 6l7 6-7 6z" />,
  undo: (
    <>
      <path d="M9 8H4V3" />
      <path d="M4 8a9 9 0 1 1-1 7" />
    </>
  ),
  redo: (
    <>
      <path d="M15 8h5V3" />
      <path d="M20 8a9 9 0 1 0 1 7" />
    </>
  ),
  pull: (
    <>
      <path d="M12 4v12" />
      <path d="M6 11l6 6 6-6" />
      <path d="M5 20h14" />
    </>
  ),
  push: (
    <>
      <path d="M12 20V8" />
      <path d="M6 13l6-6 6 6" />
      <path d="M5 4h14" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <path d="M6 7.2v9.6" />
      <path d="M18 10.2c0 4-6 3-12 6" />
    </>
  ),
  stash: (
    <>
      <path d="M4 14l2-8h12l2 8" />
      <path d="M4 14v5h16v-5h-5a3 3 0 0 1-6 0z" />
    </>
  ),
  pop: (
    <>
      <path d="M4 14l2-8h12l2 8" />
      <path d="M4 14v5h16v-5h-5a3 3 0 0 1-6 0z" />
      <path d="M12 3v7" />
      <path d="M9 7l3-3 3 3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  pulls: (
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="M6 7.2v9.6" />
      <path d="M18 16.8V9a3 3 0 0 0-3-3h-3" />
      <path d="M14 3l-2 3 2 3" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 10l3 2-3 2" />
      <path d="M12 15h5" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 19h18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
    </>
  ),
  tag: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 7V4h4v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </>
  ),
  rename: <path d="M4 12h14M13 6l6 6-6 6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  sort: (
    <>
      <path d="M7 4v16M3 16l4 4 4-4" />
      <path d="M15 6h6M15 11h4M15 16h2" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  tree: (
    <>
      <path d="M5 4v10a2 2 0 0 0 2 2h4M5 9h6" />
      <rect x="13" y="6.5" width="7" height="5" rx="1" />
      <rect x="13" y="13.5" width="7" height="5" rx="1" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16v4M17 18h4" />
    </>
  ),
  repo: (
    <>
      <path d="M6 4h12v16H6z" />
      <path d="M6 16h12" />
    </>
  ),
  expandAll: (
    <>
      <path d="M7 6l5 5 5-5" />
      <path d="M7 13l5 5 5-5" />
    </>
  ),
  collapseAll: (
    <>
      <path d="M7 11l5-5 5 5" />
      <path d="M7 18l5-5 5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
