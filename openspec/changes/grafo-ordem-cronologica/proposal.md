## Why

No histórico de repositórios com muitos merges (ex.: `stage` recebendo `origin/Release/Master/*`, `master` e features), o grafo mostra todos os merges da branch principal empilhados na mesma pista, e os commits das branches mescladas só aparecem dezenas de linhas abaixo. Cada merge abre uma pista que desce até lá, formando uma "escada" larga e ilegível. A referência desejada mostra os commits intercalados por data, cada branch na sua pista, com poucas colunas.

A causa é a ordem do `git log --all --topo-order`: ela evita intercalar linhas de história e adia commits que ainda têm filhos não mostrados (comum quando a mesma release foi mesclada em várias branches).

## What Changes

- O histórico do grafo passa a ser lido em ordem cronológica de commit (`--date-order`), que continua garantindo filhos antes dos pais. Os commits de cada branch aparecem perto dos merges que os trazem.
- Cada linha de commit ganha um fundo suave na cor da pista do commit (do nó até o fim da mensagem), não só as linhas com etiqueta.
- O nó de merge vira um ponto cheio na cor da pista (hoje é vazado).
- A página do log (`skip`/`limit`) e o layout incremental entre páginas continuam funcionando com a nova ordem.

## Capabilities

### New Capabilities
- `graph-commit-order`: ordem em que os commits são listados no grafo e garantias de layout (filhos antes dos pais, paginação estável).
- `graph-row-visual`: fundo da linha na cor da pista e aparência do nó de merge.

### Modified Capabilities

## Impact

- `src/main/git/GitService.ts` (`getLog`): troca de `--topo-order` por `--date-order`.
- `src/renderer/CommitGraph.tsx`: fundo da linha por pista e nó de merge cheio.
- Testes: `tests/GitService.test.ts` (ordem do log), `tests/layoutGraph.test.ts` (largura com histórico intercalado), e2e que calculam o índice de linha com `--topo-order` (`e2e/helpers.mjs`, `e2e/graph-reveal.mjs`).
