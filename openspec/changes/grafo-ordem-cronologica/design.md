## Context

`getLog` lê `git log --all --topo-order` em páginas (`--skip`/`--max-count`) e o renderer roda `layoutGraph` incrementalmente, guardando `GraphState` entre páginas. O algoritmo de pistas já reaproveita pistas livres; o problema é a sequência de entrada.

Com `--topo-order`, o git mostra cada linha de história inteira antes de passar para a outra. Quando uma release foi mesclada em `stage`, `master` e outras branches, seus commits só podem sair depois de todos os filhos — que estão em tips listadas depois. Resultado: os merges de `stage` saem seguidos e cada segundo pai abre uma pista que fica aberta por dezenas de linhas.

## Goals / Non-Goals

**Goals:**
- Commits intercalados por data, como na referência, com o mesmo algoritmo de pistas.
- Grafo mais estreito em históricos com muitos merges.
- Fundo da linha na cor da pista e nó de merge cheio.

**Non-Goals:**
- Reescrever o algoritmo de pistas ou o desenho das curvas.
- Opção de escolher a ordem nas configurações (pode vir depois, se pedirem).

## Decisions

- **`--date-order` em vez de `--topo-order`.** Mantém a garantia "nenhum pai antes de todos os filhos" (pré-condição de `layoutGraph`) e ordena por data de commit, o que intercala as branches. Alternativas: `--author-date-order` (datas de autor ficam fora de ordem após rebase/cherry-pick, pior para merges); ordem padrão sem flag (não garante filhos antes dos pais → layout quebra).
- **Paginação continua por `--skip`.** A ordem de `--date-order` é determinística para o mesmo conjunto de refs, então páginas consecutivas não se sobrepõem. Se as refs mudarem, o recarregamento já refaz o layout do zero (comportamento atual).
- **Fundo por pista com alfa baixo**, desenhado antes de hover/seleção para que estes continuem prevalecendo. Vai do nó até o fim da coluna de mensagem, como na referência; a faixa em gradiente das linhas com etiqueta continua na coluna BRANCH/TAG.
- **Merge = ponto cheio** na cor da pista, raio 4 (mesmo tamanho de hoje).

## Risks / Trade-offs

- [Datas de commit erradas (relógio adiantado) deslocam um commit para cima] → é o mesmo comportamento de `git log --graph --date-order`; aceitável.
- [e2e e helpers calculam o índice de linha com `--topo-order`] → trocar para `--date-order` junto.
- [Fundo em toda linha pode poluir com tema claro] → alfa diferente por tema (via `theme`), validado por screenshot.

## Open Questions

- ~~Validar no repositório real das imagens.~~ Resolvido: no repositório real (46 mil commits), a largura máxima nas primeiras 200 linhas caiu de 132 pistas (`--topo-order`) para 20 (`--date-order`), com o mesmo `layoutGraph`; o merge de `stage` fica logo acima do commit mesclado, como na referência.
