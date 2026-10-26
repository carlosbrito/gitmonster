import type { BranchInfo, RefsSnapshot, RemoteBranchInfo } from "../shared/types";

export interface FilteredRefs {
  branches: BranchInfo[];
  remoteBranches: RemoteBranchInfo[];
  /** Nomes dos remotes com ao menos uma branch que casa com o termo. */
  visibleRemotes: ReadonlySet<string>;
}

/** Nome da branch remota como a sidebar exibe: sem o prefixo `remote/`. */
export const shortRemoteName = (b: RemoteBranchInfo): string => b.name.slice(b.remote.length + 1);

/** Filtra branches locais e remotas por substring, sem diferenciar maiúsculas. Termo vazio devolve tudo. */
export function filterRefs(refs: RefsSnapshot, query: string): FilteredRefs {
  const term = query.trim().toLowerCase();
  if (!term) return { branches: refs.branches, remoteBranches: refs.remoteBranches, visibleRemotes: new Set(refs.remotes.map((r) => r.name)) };
  const remoteBranches = refs.remoteBranches.filter((b) => shortRemoteName(b).toLowerCase().includes(term));
  return {
    branches: refs.branches.filter((b) => b.name.toLowerCase().includes(term)),
    remoteBranches,
    visibleRemotes: new Set(remoteBranches.map((b) => b.remote)),
  };
}
