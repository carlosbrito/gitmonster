## Why

No painel da esquerda, o botão direito numa branch oferece "Fazer merge da branch X na branch atual" (e o rebase correspondente). No grafo, o botão direito sobre a etiqueta da mesma branch abre só o menu do commit (checkout destacado, cherry-pick, reset…), sem merge. O usuário enxerga a branch no grafo e precisa ir procurá-la na sidebar (às vezes entre centenas de remotas) só para mesclá-la.

## What Changes

- Botão direito sobre uma etiqueta de branch no grafo (coluna BRANCH / TAG) abre o mesmo menu que a sidebar mostra para aquela branch:
  - Branch local: Checkout, "Fazer merge da branch X na branch <atual>", "Fazer rebase da branch <atual> em cima de X", Renomear, Apagar, Copiar nome, Abrir pasta.
  - Branch remota: Checkout (cria branch local), merge, rebase, Apagar no remote, Copiar nome.
  - Tag: o menu de tag da sidebar.
- As regras de merge/rebase são as mesmas da sidebar: somem na branch atual; com HEAD destacado aparecem desabilitadas com a explicação.
- Botão direito em qualquer outro ponto da linha (fora de uma etiqueta, ou na etiqueta `HEAD`) continua abrindo o menu do commit, sem mudança.
- As ligações entre pistas no grafo deixam de ser curvas (Bézier) e passam a ser retas em ângulo reto: trecho vertical na pista e trecho horizontal na altura do nó. Fica mais fácil seguir uma pista com o olho, sem as "ondas" de hoje.

## Capabilities

### New Capabilities
- `graph-branch-menu`: menu de contexto das etiquetas de branch/tag no grafo, equivalente ao da sidebar.

### Modified Capabilities
- `graph-row-visual`: nova regra de traçado das ligações entre pistas (retas, sem curvas).

## Impact

- `src/renderer/CommitGraph.tsx`: `onMenu` detecta a etiqueta sob o ponteiro e repassa nome e tipo no `onContextMenu`; ligações `incoming`/`outgoing` trocam `bezierCurveTo` por segmentos retos.
- `src/renderer/RepoView.tsx`: resolve a etiqueta em `BranchInfo`/`RemoteBranchInfo`/`TagInfo` (via `refs`) e usa `sidebarMenu`; sem etiqueta, segue com `commitMenu`.
- `src/renderer/menus.ts`: possivelmente um helper `graphChipMenu` reaproveitando `sidebarMenu`.
- Testes: `tests/menus.test.ts` (resolução da etiqueta → menu) e `e2e/menus.mjs` (botão direito na etiqueta do grafo mostra o merge).
