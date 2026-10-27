## Why

Repositórios com muitas branches agrupadas por `/` (ex.: `Bug/55042/...`, `Feature/...`) geram dezenas de pastas na sidebar. Hoje cada pasta precisa ser aberta ou fechada com um clique individual, o que torna lento tanto "limpar a visão" quanto "ver tudo" nas listas LOCAL e REMOTE.

## What Changes

- Novo botão **Recolher tudo** no cabeçalho da seção LOCAL: fecha todas as pastas da árvore de branches locais.
- Novo botão **Expandir tudo** no cabeçalho da seção LOCAL: abre todas as pastas da árvore de branches locais (e a própria seção, se estiver recolhida).
- Os mesmos dois botões no cabeçalho da seção REMOTE, agindo sobre todos os grupos de remote e todas as pastas dentro deles.
- Com filtro de pesquisa ativo os botões ficam desabilitados, já que as pastas são forçadas abertas e o recolhimento do usuário não é alterado.
- Dois ícones novos (expandir tudo / recolher tudo) em `icons.tsx`.

## Capabilities

### New Capabilities
- `sidebar-expand-collapse-all`: ações de expandir e recolher, de uma vez, todas as pastas (e grupos de remote) das listas de branches LOCAL e REMOTE da sidebar.

### Modified Capabilities
<!-- Nenhuma: não existe spec atual para a sidebar. -->

## Impact

- `src/renderer/branchTree.ts`: helper puro para coletar os caminhos de todas as pastas de uma árvore.
- `src/renderer/Sidebar.tsx`: ações que adicionam/removem em lote as chaves `folder:<escopo>:<caminho>` e `remote:<nome>` do estado `collapsed`; botões nos cabeçalhos LOCAL e REMOTE.
- `src/renderer/icons.tsx`: ícones novos.
- `src/renderer/styles.css`: ajuste mínimo, se necessário, para os botões no cabeçalho.
- `tests/branchTree.test.ts`: testes do helper.
- Sem mudança no processo main, IPC ou persistência.
