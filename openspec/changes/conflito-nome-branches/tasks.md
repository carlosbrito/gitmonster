## 1. Contrato

- [x] 1.1 Em `src/shared/types.ts`, adicionar `ConflictSideInfo { name: string; detail: string | null }` e os campos `operation: Operation | null` e `sides: { ours: ConflictSideInfo; theirs: ConflictSideInfo } | null` em `ConflictFile`
- [x] 1.2 Ajustar todos os `return` de `getConflict` (inclusive os não editáveis) para preencher os novos campos

## 2. Resolução dos lados (main)

- [x] 2.1 Escrever testes unitários da função pura `describeSides(op, facts)` cobrindo merge (com `MERGE_MSG` de branch local, remote-tracking, tag e mensagem ilegível → SHA curto), cherry-pick, revert, rebase (com e sem `REBASE_HEAD`), HEAD destacado e operação nula → `null`
- [x] 2.2 Implementar `describeSides` em `src/main/git/Conflicts.ts` (ou módulo vizinho) conforme a tabela do design
- [x] 2.3 Implementar a coleta de fatos no git: branch atual/HEAD curto, 1ª linha de `.git/MERGE_MSG`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `REBASE_HEAD` (SHA curto + assunto), `head-name` e `onto` de `rebase-merge/` ou `rebase-apply/`, e `git name-rev` restrito a `refs/heads/*` e `refs/remotes/*` (removendo prefixo `remotes/`)
- [x] 2.4 Envolver a coleta em `try/catch`: qualquer falha resulta em `sides: null`, sem impedir abrir o conflito
- [x] 2.5 Em `tests/Conflicts.test.ts`, cenários com repositório real: merge de branch local, merge de ref remota (ex.: `origin/feature`), cherry-pick, revert, rebase e `stash pop` (fallback `null`)
- [x] 2.6 Rodar `npm test` e confirmar verde

## 3. Editor de conflitos (renderer)

- [x] 3.1 `ConflictView.tsx`: títulos dos painéis com nome em destaque (`conflict-side-name`, `title` com o nome completo) e "nosso · detail" / "deles · detail" secundário; sem `sides`, manter o formato atual com os rótulos dos marcadores
- [x] 3.2 Linha de contexto na `diff-bar`: "Merge de X em Y", "Cherry-pick de X em Y", "Revert de X em Y", "Rebase de X sobre Y"
- [x] 3.3 Aviso do rebase ("No rebase, “nosso” é a base e “deles” são os seus commits sendo reaplicados.") só quando `operation === "rebase"`
- [x] 3.4 Tooltips "Usar <nome>" nos botões "Usar nosso"/"Usar deles" e nomes entre parênteses em "Arquivo inteiro: nosso/deles" (seção não editável e rodapé do resultado)
- [x] 3.5 `styles.css`: nome em negrito, uma linha, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, usando os tokens de cor existentes dos lados nosso/deles

## 4. Verificação

- [x] 4.1 Teste e2e (ou de componente) que abre um conflito de merge e confere o nome das duas branches nos títulos dos painéis e na barra superior
- [x] 4.2 Rodar `npm test`, `npm run typecheck` (ou equivalente do `package.json`) e o build
- [x] 4.3 Conferir manualmente no app: merge de `origin/Feature/...` em `apresentacao` mostra **apresentacao** à esquerda e a branch remota à direita; rebase mostra o aviso e os lados invertidos
