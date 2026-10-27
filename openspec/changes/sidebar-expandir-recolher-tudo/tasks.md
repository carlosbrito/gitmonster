## 1. Coleta de pastas

- [x] 1.1 Escrever testes em `tests/branchTree.test.ts` para `folderPaths`: lista sem pastas devolve `[]`; pastas aninhadas (`Bug/55042/x`, `Bug/55043/y`, `Feature/z`) devolvem `Bug`, `Bug/55042`, `Bug/55043`, `Feature`
- [x] 1.2 Implementar `folderPaths(nodes)` em `src/renderer/branchTree.ts` (percurso recursivo, devolve o `path` de toda pasta)

## 2. Ícones

- [x] 2.1 Adicionar `expandAll` e `collapseAll` (chevrons duplos para baixo / para cima) em `src/renderer/icons.tsx`, no mesmo estilo de traço

## 3. Sidebar

- [x] 3.1 Em `Sidebar.tsx`, criar `setMany(keys, collapse)` que adiciona ou remove um lote de chaves de `collapsed` numa única atualização
- [x] 3.2 Montar as chaves da LOCAL (`folder:local:<path>`) e da REMOTE (`remote:<nome>` + `folder:remote:<nome>:<path>` de cada remote) a partir de `localTree`/`remoteTrees`
- [x] 3.3 Criar helper de render dos dois botões `mini` ("Expandir tudo" / "Recolher tudo", com `title` e `aria-label`), desabilitados com `filtering` ou sem chaves
- [x] 3.4 Colocar os botões no `SectionHeader` da LOCAL (junto da seleção em lote) e da REMOTE (junto do "Adicionar remote")
- [x] 3.5 "Expandir tudo" também remove `section:local` / `section:remote`; "Recolher tudo" não fecha a seção
- [x] 3.6 Ajustar `styles.css` só se os botões não alinharem no `.sb-extra`

## 4. Verificação

- [x] 4.1 Rodar `npm run typecheck` e `npm test` sem falhas
- [x] 4.2 Validar no app (`npm run dev`) os cenários da spec: recolher/expandir LOCAL e REMOTE, seção recolhida, pesquisa ativa desabilitando e preservando estado, lista sem pastas — coberto pelo novo e2e `e2e/sidebar-expand-all.mjs`
