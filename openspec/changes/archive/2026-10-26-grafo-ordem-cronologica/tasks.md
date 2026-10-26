## 1. Ordem do histórico

- [x] 1.1 Teste em `tests/GitService.test.ts`: repositório com merges seguidos em `stage` de branches com datas intercaladas; o log lista os commits por data e mantém filhos antes dos pais (falha com `--topo-order`)
- [x] 1.2 Trocar `--topo-order` por `--date-order` em `getLog` (`src/main/git/GitService.ts`) e atualizar o comentário
- [x] 1.3 Teste de paginação: páginas concatenadas = log completo e layout incremental = layout de uma vez
- [x] 1.4 Teste em `tests/layoutGraph.test.ts`: N merges sequenciais de branches curtas usam no máximo 2 pistas com a nova ordem

## 2. Visual da linha

- [x] 2.1 `CommitGraph.tsx`: fundo translúcido na cor da pista do nó até o fim da mensagem, antes de hover/seleção/pulso; alfa por tema
- [x] 2.2 `CommitGraph.tsx`: nó de merge como ponto cheio na cor da pista

## 3. e2e e verificação

- [x] 3.1 Trocar `--topo-order` por `--date-order` em `e2e/helpers.mjs` e `e2e/graph-reveal.mjs`
- [x] 3.2 e2e/screenshot com histórico de muitos merges (padrão das imagens) para conferir intercalação e largura do grafo
- [x] 3.3 `npm run typecheck`, `npm test` e e2e do grafo verdes
