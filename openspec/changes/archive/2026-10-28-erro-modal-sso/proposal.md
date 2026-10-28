## Why

Esta change agrupa duas melhorias de usabilidade.

**Erros gigantes na tela.** Quando uma operação falha, o GitMonster despeja a mensagem inteira do git numa faixa vermelha acima do grafo. Num `git pull` com remote CodeCommit e sessão AWS SSO vencida, isso vira um traceback Python de ~10 linhas que empurra o grafo para baixo e esconde a causa real ("Token has expired and refresh failed") no meio do texto. O usuário não sabe o que fazer: o problema é só renovar o SSO.

**Criar branch a partir de outra.** Hoje, para criar uma branch baseada em `dev` ou em `origin/Release/...`, é preciso fazer checkout dela primeiro e depois usar o botão **Branch** da toolbar (que cria a partir do HEAD), ou achar o commit no grafo e usar "Criar branch aqui…". O menu de botão direito da branch, na sidebar e na etiqueta do grafo, não oferece isso.

## What Changes

### Modal de erro

- Erros de operação deixam de aparecer como faixa de texto cru. No lugar, abre uma modal com:
  - título e mensagem curta e genérica ("A operação falhou"), sem o texto técnico;
  - botão **Ver detalhes** que expande o erro completo (texto monoespaçado, com rolagem) e um botão **Copiar** para colar em chamados;
  - botão **Fechar**, que limpa o erro.
- O erro bruto é classificado antes de exibir. Categorias reconhecidas ganham mensagem própria:
  - **SSO expirado** (ex.: `TokenRetrievalError`, `Error when retrieving token from sso`, `Token has expired and refresh failed`, `The SSO session ... has expired`): título "Sessão SSO expirada", explicação clara de que é preciso renovar o login SSO, o comando sugerido (`aws sso login`, com `--profile <perfil>` quando o perfil aparece no erro) e botão para copiá-lo.
  - **Credenciais recusadas** (ex.: `Authentication failed`, `could not read Username`, `403`): mensagem dizendo que o remote recusou as credenciais.
  - **Tempo limite** (mensagem "excedeu o tempo limite"): mensagem de rede/tempo.
  - Qualquer outro erro cai na mensagem genérica.
- Em todos os casos o erro completo continua acessível em **Ver detalhes**.
- Vale para os erros globais da aba de repositório (`RepoView`) e da tela inicial (`App`). Erros já exibidos dentro de painéis próprios (blame, histórico de arquivo, conflitos, PRs, IA, configurações) ficam como estão.

### Criar branch a partir da branch clicada
- Novo item **Criar branch a partir de `<nome>`…** no menu de botão direito de branch local e de branch remota, tanto na sidebar (LOCAL / REMOTE) quanto na etiqueta da branch no grafo (que já usa o mesmo menu).
- O item abre o diálogo de nome de branch; confirmar cria a nova branch apontando para a branch clicada e faz checkout dela.
- Com base remota (`origin/x`), a nova branch já nasce rastreando `origin/x` (comportamento padrão do git).
- Funciona também com a branch atual como base e com HEAD destacado.

## Capabilities

### New Capabilities
- `error-dialog`: exibição de erros de operação em modal com mensagem amigável, detalhes sob demanda e reconhecimento de SSO expirado e outras causas comuns.
- `branch-from-branch`: criar uma branch nova a partir de uma branch local ou remota pelo menu de contexto da sidebar e do grafo.

### Modified Capabilities
<!-- nenhuma -->

## Impact

- Novo `src/renderer/errorInfo.ts`: função pura `describeError(raw)` → `{ kind, title, message, command?, detail }`.
- Novo `src/renderer/ErrorDialog.tsx`: modal `<dialog>` no padrão de `ConfirmDialog`.
- `src/renderer/RepoView.tsx` e `src/renderer/App.tsx`: trocam o `<p role="alert" className="error">` pela modal; fechar chama `setError(null)`.
- `src/renderer/styles.css`: estilos da modal e do bloco de detalhes.
- Testes: novo `tests/errorInfo.test.ts` (classificação, incluindo o traceback real do CodeCommit); e2e opcional para abrir/expandir/fechar.
- Sem mudança no processo main nem no IPC: a mensagem do `GitError` continua igual.
- `src/renderer/menus.ts`: novo item nos casos `branch` e `remote` de `sidebarMenu` (o grafo herda via `graphChipMenu`/`sidebarMenu`).
- `src/renderer/actions/branchActions.ts`: nova ação `createFrom(base)` reaproveitando `askForm` e `window.gitmonster.createBranch(root, nome, base, true)`, que já aceita ponto de partida.
- Testes: `tests/menus.test.ts` (item presente nos menus local/remoto e chamando a ação com a base certa) e e2e de criação pela sidebar/grafo.
