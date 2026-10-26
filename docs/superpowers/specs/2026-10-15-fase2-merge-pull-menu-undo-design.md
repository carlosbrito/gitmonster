# Fase 2 — Pull com opções, menu de contexto, Undo/Redo e editor de conflitos

Data: 2026-10-15. Escopo e ordem aprovados pelo usuário ("sim, pode fazer tudo"); detalhes decididos aqui.

## Objetivo

Fechar os buracos de uso diário que a Fase 1 deixou: resolver conflitos dentro do app, escolher como o pull integra,
agir por botão direito e desfazer o último passo.

## Premissas

- Mesmas regras de segurança da Fase 1: o renderer não manda patches nem caminhos fora do repositório, o main valida tudo.
- Só funcionalidade, sem copiar visual de terceiros.
- Ordem de entrega (do menor risco ao maior): A pull, B menu de contexto, C undo/redo, D editor de conflitos.

## A. Pull com opções

`pull(root, mode)` com `mode: "ff-only" | "merge" | "rebase"` (padrão `ff-only`, comportamento atual).
- `merge` → `git pull --no-rebase --no-edit`; `rebase` → `git pull --rebase`.
- Pode parar em conflito: devolve `OperationResult` (`conflicted`) como merge/rebase; o resto da UI de operação parada já existe.
- UI: seletor "Modo do pull" ao lado do botão Pull; a escolha fica em `localStorage`.
- Erros: sem upstream, divergência no modo ff-only (mensagem existente sugere trocar o modo).

## B. Menu de contexto

Componente `ContextMenu` (posição absoluta, fecha com Esc, clique fora ou escolha; navegação por setas).
Itens reutilizam as actions existentes, sem lógica nova:
- Commit (no grafo): Checkout, Branch aqui, Tag aqui, Cherry-pick, Revert, Reset ▸ soft/mixed/hard, Rebase interativo, Copiar hash. O clique direito também seleciona o commit.
- Branch local: Checkout, Merge na atual, Rebase da atual em cima desta, Apagar.
- Branch remota: Checkout, Merge, Rebase.
- Tag: Checkout, Publicar, Apagar.
- Arquivo (painel de alterações): Abrir diff, Adicionar/Remover do stage, Descartar, Copiar caminho.
Botões existentes continuam (o menu é atalho, não substituição).

## C. Undo / Redo

Baseado no reflog de HEAD. Desfaz **uma** operação por vez, só das conhecidas:

| Entrada do reflog (HEAD@{0}) | Desfazer | Exige |
| --- | --- | --- |
| `commit`, `commit (amend)` | `reset --soft HEAD@{1}` (alterações voltam ao stage) | nada |
| `merge`, `pull`, `cherry-pick`, `revert`, `reset: moving to` | `reset --hard <oid anterior>` | árvore limpa |
| `checkout: moving from X to Y` | `checkout X` | git recusa se houver conflito |
| outras (rebase, commit inicial...) | indisponível, com o motivo | |

- `undoInfo(root)` → `{ undo: {label}|null, redo: {label}|null, undoBlocked?: string }`.
- Redo: o main guarda por raiz, em memória, `{ afterUndo: {head, branch}, action }`. Só vale se o estado atual ainda é
  exatamente o que o undo deixou; qualquer outra mudança invalida o redo (nunca reaplica no escuro).
- Árvore suja bloqueia undo destrutivo com mensagem; undo de commit (soft) é sempre seguro.
- UI: botões Desfazer/Refazer na toolbar com o rótulo da operação (ou o motivo do bloqueio) no `title`. Sem confirmação: o desfazer exige árvore limpa e sempre há Refazer logo em seguida.

## D. Editor de conflitos

- Núcleo puro em `src/shared/conflict.ts`: `parseConflicts(text)` → segmentos (`text` | `conflict{ours,theirs,base?,labels}`),
  suporta estilo `diff3` (`|||||||`), CRLF e conflito sem fim de linha final; `buildResult(segments, choices)` e
  `hasMarkers`. Escolhas por bloco: `ours` | `theirs` | `both-ours-first` | `both-theirs-first` | `custom(text)`.
- Main (`Conflicts.ts`):
  - `getConflict(root, path)`: só para arquivo conflitado no status; devolve `{ content, binary, kind }`
    (`kind` por XY: both-modified, added-by-both, deleted-by-us, deleted-by-them...).
  - `resolveConflict(root, path, content)`: só para arquivo conflitado; escreve o arquivo (caminho validado dentro do repo)
    e faz `git add`. Recusa conteúdo que ainda tem marcadores de conflito.
  - `resolveConflictSide(root, path, "ours"|"theirs")`: `checkout --ours|--theirs -- path` + `add`; se o lado removeu o arquivo, `git rm`.
- UI: `ConflictView` no lugar do diff para arquivo conflitado: por bloco, colunas "Nosso" / "Deles" com os botões de escolha
  e opção de editar à mão; "Resultado" ao final mostra o arquivo montado. Salvar só habilita sem blocos pendentes.
  Arquivo binário ou modify/delete: só "Usar o nosso" / "Usar o deles".
- Após salvar, o arquivo vira staged e o fluxo existente (Continuar/Abortar) segue.

## Testes

- Unitários: `parseConflicts`/`buildResult` (variações), `pull` nos três modos com remoto local (inclusive conflito),
  `Undo` (cada tipo, bloqueio por árvore suja, redo válido e invalidado), `Conflicts` (resolver, recusar marcadores, recusar arquivo não conflitado, lado removido).
- E2E: pull merge/rebase; menu de contexto (commit, branch, arquivo); undo/redo de commit e checkout; resolver conflito pelo editor
  (escolha por bloco, ambos, edição manual) e continuar o merge.
