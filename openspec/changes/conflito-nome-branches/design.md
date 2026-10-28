## Context

`ConflictView` monta os títulos dos painéis com `block.oursLabel` / `block.theirsLabel`, extraídos por `parseConflicts` (`src/shared/conflict.ts`) das linhas `<<<<<<< X` e `>>>>>>> Y`. Num merge o git escreve `HEAD` no lado nosso e o nome passado ao `git merge` no lado deles; no rebase escreve `HEAD` e `<sha> (<assunto>)`; no `stash pop`, `Updated upstream` / `Stashed changes`. O renderer conhece `status.branch` e `status.operation`, mas não lê `.git`, então não sabe o que é `MERGE_HEAD`, qual branch está sendo rebaseada nem qual é a base do rebase.

`getConflict(root, path)` (`src/main/git/Conflicts.ts`) já é chamado a cada arquivo aberto e devolve `ConflictFile`. `detectOperation` em `GitService.ts` já sabe qual operação está parada.

## Goals / Non-Goals

**Goals:**
- Nome da branch/commit de cada lado visível no título de cada painel, inclusive para arquivos não editáveis (binário, removido de um lado), onde não há marcadores.
- Semântica correta por operação, em especial o rebase.
- Fallback sem regressão quando não houver como resolver.

**Non-Goals:**
- Renomear os botões "Usar nosso"/"Usar deles" para o nome da branch (nomes longos quebrariam o layout); ganham só tooltip.
- Mudar o prompt da IA de conflitos (continua recebendo os rótulos dos marcadores).
- Configurar `merge.conflictStyle` ou reescrever marcadores no arquivo.

## Decisions

### 1. Resolver os lados no main, dentro de `getConflict`
`ConflictFile` ganha:
```ts
interface ConflictSideInfo { name: string; detail: string | null }
interface ConflictFile { …; operation: Operation | null; sides: { ours: ConflictSideInfo; theirs: ConflictSideInfo } | null }
```
`name` é o que vai em destaque (`apresentacao`, `origin/Feature/x`, `a1b2c3d`); `detail` é o texto secundário (`HEAD`, assunto do commit, "base do rebase"). `sides === null` → renderer usa os rótulos dos marcadores.

*Por quê:* só o main lê `.git`; o cálculo é barato (poucos `rev-parse`/leituras) e o arquivo de conflito já é buscado ali. *Alternativas:* (a) pôr em `RepoStatus` — status é recarregado com frequência e o dado só interessa ao editor; (b) canal IPC novo `conflictSides(root)` — uma ida a mais por arquivo sem ganho, já que `getConflict` é o ponto de entrada natural.

### 2. Regras por operação
Função pura de montagem testável (`describeSides(op, facts)`) separada da coleta de fatos no git:

| Operação | Nosso | Deles |
|---|---|---|
| merge | branch atual (`status.branch`); sem branch: `HEAD destacado` + SHA curto | ref mesclada, extraída da 1ª linha de `.git/MERGE_MSG` (`Merge (remote-tracking )?branch '(.+?)'`, `Merge tag '…'`, `Merge commit '…'`); falha → SHA curto de `MERGE_HEAD` |
| cherry-pick | branch atual | SHA curto de `CHERRY_PICK_HEAD`, detail = assunto |
| revert | branch atual | SHA curto de `REVERT_HEAD`, detail = "revertendo: " + assunto |
| rebase | base: `git name-rev --name-only --refs=refs/heads/* --refs=refs/remotes/*` do `onto` (sem prefixo `remotes/`); falha → SHA curto; detail = "base do rebase" | branch de `head-name` (sem `refs/heads/`), detail = SHA curto + assunto de `REBASE_HEAD` quando existir |
| nenhuma | `null` (fallback) | `null` |

`rebase-merge/` e `rebase-apply/` têm os mesmos arquivos `head-name` e `onto`; ler do diretório que existir.

*Por quê `MERGE_MSG`:* o git grava essa linha sempre em inglês (não é traduzida) e com o nome exato que o usuário mesclou, que é o que aparece no print. `name-rev` em `MERGE_HEAD` poderia devolver outra ref que aponta para o mesmo commit. *Por quê `name-rev` no rebase:* `onto` é só um SHA; o app não persiste o nome que o usuário escolheu.

### 3. Apresentação
- Título do painel: `<h4><span class="conflict-side-name" title={name completo}>{name}</span> <span class="dim">nosso · {detail}</span></h4>`. Nome em negrito, `text-overflow: ellipsis`, uma linha.
- Barra do topo (`diff-bar`), abaixo do caminho: "Merge de **deles** em **nosso**" / "Cherry-pick de **a1b2c3d** em **apresentacao**" / "Revert de … em …" / "Rebase de **feature** sobre **main**".
- Só no rebase: aviso discreto "No rebase, “nosso” é a base e “deles” são os seus commits sendo reaplicados."
- Botões por bloco: `title="Usar apresentacao"` etc. "Arquivo inteiro: nosso (apresentacao)".
- O painel de base (diff3) continua "Base".

## Risks / Trade-offs

- [`MERGE_MSG` editado ou ausente (merge com `-m`, ferramenta externa)] → regex falha, cai no SHA curto de `MERGE_HEAD`; nunca lança.
- [`name-rev` escolhe ref inesperada ou é lento em repositório grande] → restrito a branches locais/remotas; erro ou `undefined` → SHA curto. Chamado uma vez por arquivo aberto, aceitável.
- [Rebase interativo com `edit`/`exec` sem `REBASE_HEAD`] → detail fica `null`; o nome da branch ainda aparece.
- [Octopus merge (vários `MERGE_HEAD`)] → mostra só a primeira ref da mensagem; caso raro no app (não oferece octopus).
- [Falha de I/O na coleta] → `sides: null` e o editor funciona como hoje; erros dessa coleta não podem impedir abrir o conflito.
