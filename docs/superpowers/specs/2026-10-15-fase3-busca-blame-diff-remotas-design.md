# Fase 3 — Diff melhor, busca, blame/histórico de arquivo e remotas

Data: 2026-10-15. Escopo aprovado pelo usuário ("sim, pode seguir até o final"); detalhes decididos aqui.

## Objetivo

Deixar a leitura do histórico e do código no nível de um cliente Git completo: ver diffs com sintaxe e lado a lado,
achar commits, saber quem mexeu em cada linha e gerenciar remotas sem sair do app.

## Premissas

- Mesmas regras de segurança: o main valida tudo (consultas, caminhos, nomes, URLs); o renderer só descreve a intenção.
- Dependência nova aceita: `highlight.js` (bundle só com as linguagens usadas). Sem rede em runtime.
- Ordem: A diff (sintaxe + lado a lado), B busca, C blame e histórico de arquivo, D remotas.

## A. Diff: lado a lado e sintaxe

- Toggle "Unificado / Lado a lado" no `DiffView`; escolha lembrada em `localStorage` (só conveniência).
- `src/renderer/diffRows.ts` (puro): `pairRows(hunk)` agrupa execuções de remoções e adições em linhas pareadas
  (remoção N com adição N; sobra vira lado vazio); contexto aparece nos dois lados.
- `src/renderer/syntax.ts` (puro): `languageFor(path)` por extensão; `highlightLines(lines, lang)` devolve HTML por linha.
  O hunk é destacado como dois blocos (antigo = contexto + remoções; novo = contexto + adições) para manter strings e
  comentários de várias linhas; o HTML é fatiado por linha fechando e reabrindo os `<span>` abertos.
  highlight.js escapa o texto; sem linguagem conhecida ou acima de 2000 linhas por hunk, mostra texto puro (escapado).
- Aplica-se ao diff unificado também. Tema claro/escuro por CSS (`prefers-color-scheme`).

## B. Busca de commits

`searchCommits(root, field, query, limit)` com `field`: `message | author | hash | file | content`.
- message: `--grep=<q> --fixed-strings -i`; author: `--author=<q> -i`; content: `-S<q>` (pickaxe);
  file: `-- <caminho>` após `assertSafePath`; hash: `assertCommitHash` e `--no-walk` do commit.
- Argumentos sempre na forma colada (`--grep=...`, `-S...`), então a consulta nunca vira opção. Consulta até 200 caracteres,
  `limit` 1–500, `--all`, mais recentes primeiro. Resultado no mesmo formato de `Commit`.
- UI: campo de busca na toolbar do repositório (Ctrl+F foca) com seletor do campo. O resultado abre uma lista no centro;
  clicar num item seleciona o commit (painel de detalhe à direita). Fechar volta ao grafo.

## C. Histórico de arquivo e blame

- `fileHistory(root, path, skip, limit)`: `git log --follow` do arquivo (segue renomeações), mesma forma de `Commit`.
- `blame(root, path, rev | null)`: `git blame --porcelain` → linhas `{ line, hash, author, date, summary, text }`.
  `rev` é validado (hash ou ref); null = árvore de trabalho. Arquivo binário ou inexistente nessa revisão → erro claro.
- UI: itens "Histórico do arquivo" e "Blame" no menu de contexto de arquivos (alterações e arquivos de commit).
  Visões no centro: lista de commits do arquivo; tabela de blame com coluna do commit/autor (agrupa linhas consecutivas do
  mesmo commit) e o texto destacado. Clicar no commit seleciona-o.

## D. Remotas na sidebar

- Remotas agrupadas por remote (cabeçalho recolhível com nº de branches).
- `listRemotes` (nome + URL), `addRemote(name, url)` (URL pela mesma validação do clone), `removeRemote(name)`,
  `renameBranch(old, new)`, `deleteRemoteBranch(remote, branch)` (`push <remote> --delete`).
- UI: seção "Remotes" com adicionar/remover (remover pede confirmação); "Renomear…" no menu de contexto da branch local;
  "Apagar no remoto…" no menu da branch remota (confirmação explícita, rede com timeout).

## Testes

- Unitários: `pairRows`, fatiamento de HTML por linha, `languageFor`, `searchCommits` (cada campo, consulta com `-`/`--`,
  limite), `fileHistory` (renomeação), `blame` (parse porcelain, linha não commitada), remotas (add/remove/rename/delete).
- E2E: alternar lado a lado e ver `span` de sintaxe; buscar por mensagem/conteúdo e selecionar resultado; blame e histórico
  de arquivo pelo menu; adicionar/remover remote e renomear branch.
