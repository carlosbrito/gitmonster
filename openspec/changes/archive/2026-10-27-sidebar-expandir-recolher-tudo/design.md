## Context

A sidebar (`src/renderer/Sidebar.tsx`) mantém um único estado `collapsed: ReadonlySet<string>` com chaves que identificam o que está recolhido:

- `section:<local|remote|tags|stash>` — a seção inteira;
- `remote:<nome>` — o grupo de um remote dentro da seção REMOTE;
- `folder:<escopo>:<caminho>` — uma pasta da árvore de branches, com escopo `local` ou `remote:<nome>` (gerada em `sidebar/BranchTree.tsx`).

A árvore vem de `buildBranchTree` (`src/renderer/branchTree.ts`), que agrupa pelo `/`. Pastas começam abertas (ausência da chave = aberta). Com filtro ativo, `forceOpen` mantém tudo aberto sem tocar em `collapsed`.

Os cabeçalhos de seção (`sidebar/SectionHeader.tsx`) já aceitam controles extras via `children`, renderizados em `.sb-extra` e revelados no hover/foco.

## Goals / Non-Goals

**Goals:**
- Expandir/recolher, num clique, todas as pastas das listas LOCAL e REMOTE.
- Reaproveitar o estado `collapsed` e o padrão de controles revelados no hover do cabeçalho.
- Lógica de coleta de caminhos testável sem React.

**Non-Goals:**
- Persistir o estado de recolhimento entre sessões (continua só em memória, como hoje).
- Botões equivalentes para TAGS e STASH (não têm pastas).
- Atalhos de teclado ou itens de menu de contexto.

## Decisions

1. **Helper puro `folderPaths(nodes)` em `branchTree.ts`.** Percorre a árvore e devolve o `path` de toda pasta, em qualquer nível. A Sidebar monta as chaves (`folder:<escopo>:<path>`). Alternativa: calcular as chaves dentro do `BranchTree` e expor via callback — rejeitada por acoplar render a estado e dificultar teste.

2. **Operação em lote sobre `collapsed`.** Uma função `setMany(keys, collapse)` adiciona (recolher) ou remove (expandir) um conjunto de chaves numa só atualização. Chaves de outras seções ficam intactas.

3. **Escopo de cada botão:**
   - LOCAL → todas as chaves `folder:local:*` da árvore local atual.
   - REMOTE → para cada remote: `remote:<nome>` + todas as `folder:remote:<nome>:*`.
   - Recolher tudo no REMOTE fecha também os grupos de remote, deixando só os nomes dos remotes visíveis (visão mais "limpa"); Expandir tudo reabre grupos e pastas.
   - Expandir tudo também remove `section:<local|remote>`, para o resultado ser visível mesmo se a seção estava recolhida. Recolher tudo não fecha a seção — fechá-la já é o clique no próprio cabeçalho.

4. **Reusar as árvores já memoizadas (`localTree`, `remoteTrees`).** Elas são montadas sobre `filtered`, mas os botões só ficam ativos sem filtro, quando `filtered` é a lista completa. Evita construir uma segunda árvore.

5. **Ícones novos** `expandAll` e `collapseAll` em `icons.tsx` (chevrons duplos para baixo / para cima), seguindo o estilo de traço dos ícones existentes. Botões com classe `mini`, `title` e `aria-label` ("Expandir tudo", "Recolher tudo").

6. **Desabilitar com filtro ativo ou sem pastas.** Com `filtering`, `forceOpen` ignora `collapsed`, então o clique não teria efeito visível — desabilitar comunica isso. Sem nenhuma pasta (e, no REMOTE, sem remotes), também desabilitado.

## Risks / Trade-offs

- [Chaves órfãs de pastas que deixaram de existir permanecem em `collapsed`] → Inofensivo (já ocorre hoje com o toggle individual); Expandir tudo remove só as chaves atuais, o que basta.
- [Botões revelados só no hover podem passar despercebidos] → Mesmo padrão já usado na seleção em lote; `title` explica a ação.
- [Cabeçalho do LOCAL fica mais cheio com seleção + apagar + 2 botões] → Botões `mini` com ícone apenas; o "Apagar selecionadas" só aparece com seleção.
