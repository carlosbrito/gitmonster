# Fase 1 — Abas, sessão, tela inicial e descartar alterações

Data: 2026-10-15. Aprovado pelo usuário em conversa (seções 1 e 2 explicitamente; seção 3 e demais etapas
delegadas com "siga até o final").

## Objetivo

Tornar o GitMonster utilizável no dia a dia com vários projetos: abrir/clonar/criar repositórios, trabalhar em
várias abas, voltar ao estado em que o app foi fechado e descartar alterações locais.

## Decisões do usuário

- Persistência: ao reabrir, **as mesmas abas voltam**, além da lista de recentes.
- Descartar: **confirmação simples e clara**, sem backup (os untracked são destacados na mensagem).
- Estado por aba: **um `RepoView` por aba, todos montados**, inativos escondidos por CSS.

## Premissas

- A regra de segurança não muda: o renderer só referencia raízes registradas em `openedRoots` no main.
- Só funcionalidade; sem copiar visual de terceiros.
- Sem barra de progresso percentual no clone (YAGNI).

## 1. Estrutura do renderer

```
App.tsx          casca: abas, tela inicial, sessão
TabBar.tsx       abas + "+"
StartScreen.tsx  Abrir / Clonar / Init / Recentes
RepoView.tsx     um repositório (layout atual); props: root, active
hooks/useRepo.ts, useRunner.ts, useDialogs.tsx, useDiff.ts
actions/branchActions.ts, remoteActions.ts, commitActions.ts, discardActions.ts
```

- `RepoView` não conhece abas. Inativo: `display: none`, sem refresh no `focus`; ao reativar, refresh de status.
- Actions recebem `{ root, run, ask, askForm, setNotice, status }` e movem o código existente sem mudar lógica.
- Ordem: extrair (testes verdes) → `RepoView` → abas e tela inicial.

## 2. Main e IPC

`userData/session.json` v1: `{ version, tabs: string[], active: number | null, recents: {root, openedAt}[] }`.

- `session:load`: zod; arquivo ausente/corrompido → sessão vazia. Cada raiz é validada
  (`resolveRepoRoot(root) === root`), registrada em `openedRoots`; inválidas voltam em `removed`.
- `session:save`: o main **filtra por `openedRoots`**, limita recentes a 20, sem duplicatas, escrita atômica.
- `repo:clone {url}`: diálogo de destino no main; URL só `https://`, `ssh://`, `git@host:path`, `file://`;
  recusa `-` inicial; `-c protocol.ext.allow=never`; `--`; nunca sobrescreve; `GIT_TERMINAL_PROMPT=0`; timeout
  10 min; remove a pasta parcial que ele criou se falhar.
- `repo:init`: diálogo de pasta; `git init` (ou só abre se já for repo).
- `repo:discard {root, paths}`: o main decide pelo `status` — rastreado: `git restore -- p`; untracked:
  `git clean -f -- p`. Ignora conflitados e já-staged-sem-mudança-na-árvore. Caminhos por `assertSafePath`.
- `repo:discard-hunk {root, hunk}`: recalcula o diff (índice→disco), confere cabeçalho, `git apply -R --recount`
  na árvore.

## 3. Fluxo de dados, erros e testes

Fluxo de UI:
- `App` mantém `tabs: {id, root}[]`, `activeId`, `recents`. Ao iniciar: `session:load` → tabs/recentes; aviso se `removed`.
- Qualquer mudança em tabs/active/recents → `session:save` com debounce de 300 ms.
- Abrir/Clonar/Init devolvem `{root}`; se a raiz já tem aba, ativa a existente (sem duplicar). Recente → nova aba.
- Fechar aba desmonta o `RepoView`; a raiz continua nos recentes. Fechar a última aba volta à tela inicial.
- Botões de descartar: lixeira por arquivo (seção Alterações) e por hunk (diff da árvore), e "descartar todos".
  Confirmação: lista até 10 arquivos, conta quantos são novos (untracked) e avisa que não há volta.

Erros:
- Falha de clone/init/discard → `error` do `RepoView`/tela inicial com mensagem do Git sem prefixo de IPC.
- Sessão inválida nunca impede o app de abrir. Raiz sumida vira aviso, não exceção.
- Diff de hunk desatualizado → mesma mensagem STALE do stage por hunk.

Testes:
- Unitários (vitest, Git real em pasta temporária): `validateCloneUrl`, `deriveRepoName`, `cloneRepo` (local
  `file://`, destino existente, URL inválida, falha limpa pasta parcial), `initRepo`, `discardPaths`
  (modificado, deletado, untracked arquivo e pasta, conflitado ignorado, caminho inseguro), `discardHunk`
  (um de dois hunks, hunk desatualizado), sessão (`loadSession`/`saveSession`: corrompido, raiz inválida, filtro
  por `openedRoots`, limite 20, dedupe).
- E2E: abas (abrir 2 repos, trocar, estado preservado, fechar), sessão (fechar e reabrir app restaura abas),
  descartar (arquivo, untracked, hunk), clonar e init pela tela inicial. Os e2e existentes devem continuar
  passando após a refatoração, adaptados só no que a UI nova muda (ex.: abrir repositório).
