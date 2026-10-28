## Why

No editor de conflitos, cada bloco mostra dois painéis com os títulos **Nosso (HEAD)** e **Deles (origin/Feature/…)**. O lado esquerdo nunca diz qual branch ele é: `HEAD` vem do marcador `<<<<<<< HEAD` que o git escreve, e o usuário precisa lembrar em qual branch estava ao iniciar o merge (no caso que motivou a change, `apresentacao`). Os termos "nosso"/"deles" também confundem, e no rebase eles se invertem (o "nosso" é a base, não a branch do usuário), o que leva a escolher o lado errado.

## What Changes

- O editor de conflitos passa a mostrar o **nome da branch (ou commit) de cada lado** em destaque no título de cada painel, com o papel ("nosso" / "deles") como texto secundário. No print: esquerda **apresentacao** · nosso, direita **origin/Feature/55694/DiscadorFlutuanteHistoricoLigacoes** · deles.
- A barra do topo do editor ganha uma linha de contexto com a operação e os dois lados, por exemplo: "Merge de **origin/Feature/…** em **apresentacao**".
- Os nomes são resolvidos pelo processo main a partir do estado do git, por tipo de operação:
  - **merge**: nosso = branch atual; deles = branch/ref que está sendo mesclada.
  - **cherry-pick / revert**: nosso = branch atual; deles = commit aplicado/revertido (SHA curto + assunto).
  - **rebase**: nosso = base onde os commits estão sendo reaplicados; deles = branch sendo rebaseada + commit da vez. Um aviso curto explica que, no rebase, os lados ficam invertidos em relação ao merge.
  - HEAD destacado: mostra "HEAD destacado" com o SHA curto.
- Quando não dá para resolver um nome (conflito sem operação registrada, ex.: `stash pop`), o painel cai no rótulo do marcador do git, como hoje.
- Os botões de escolha mantêm o texto atual, mas ganham dica (tooltip) com o nome da branch ("Usar apresentacao"); "Arquivo inteiro: nosso/deles" mostra o nome entre parênteses.
- Nomes longos são truncados com reticências no painel, com o nome completo no tooltip.

## Capabilities

### New Capabilities
- `conflict-side-labels`: identificação clara, no editor de conflitos, de qual branch ou commit corresponde a cada lado (nosso/deles), conforme a operação em andamento.

### Modified Capabilities
<!-- nenhuma -->

## Impact

- `src/shared/types.ts`: `ConflictFile` ganha `sides` com nome e detalhe de cada lado, e a operação.
- `src/main/git/Conflicts.ts`: `getConflict` resolve os lados (leitura de `MERGE_HEAD`/`MERGE_MSG`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`/`rebase-apply` com `head-name` e `onto`, `REBASE_HEAD`).
- `src/renderer/ConflictView.tsx`: títulos dos painéis, linha de contexto na barra, tooltips dos botões e aviso do rebase.
- `src/renderer/styles.css`: estilo do nome em destaque e truncamento.
- Testes: `tests/Conflicts.test.ts` (resolução dos lados em merge, merge de remota, cherry-pick, revert, rebase, HEAD destacado e fallback) e e2e/componente do título dos painéis.
- IPC continua o mesmo canal (`getConflict`); só o formato da resposta cresce, sem quebra.
