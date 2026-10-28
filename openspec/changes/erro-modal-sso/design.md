## Context

Hoje o erro de qualquer operação vira uma string em `error` (`useRepoState` na aba, `useState` no `App` para a tela inicial), passada por `errorMessage()` (`src/renderer/util.ts`), e é renderizada como `<p role="alert" className="error">` acima da área de trabalho (`RepoView.tsx:238`, `App.tsx:150`). A mensagem vem do `GitError` do main: `git <args> falhou: <stderr>`. Com `git-remote-codecommit` + AWS SSO vencido, o stderr é um traceback Python inteiro, que ocupa a tela e esconde a causa.

O projeto já tem modais com `<dialog>` nativo (`ConfirmDialog`, `FormDialog`, `ExplainDialog`) e cópia via `navigator.clipboard`. Testes unitários ficam em `tests/*.test.ts` (vitest) e e2e em `e2e/*.mjs`.

## Goals / Non-Goals

**Goals:**
- Erro global da aba e da tela inicial vira modal com mensagem curta + detalhes sob demanda.
- Classificação pura e testável do texto do erro, com SSO expirado como caso principal.
- Zero mudança no main/IPC: o texto do `GitError` continua o mesmo (o Monitor Git e os logs seguem iguais).

**Non-Goals:**
- Erros internos de painéis (blame, histórico de arquivo, conflitos, PRs, IA, configurações): continuam inline.
- Renovar o SSO pelo app (rodar `aws sso login` sozinho). Só sugerimos e copiamos o comando.
- Mudar `notice` (mensagens de sucesso) ou a faixa de operação em andamento (merge/rebase).

## Decisions

**1. Classificador puro no renderer: `describeError(raw: string): ErrorInfo`** em `src/renderer/errorInfo.ts`.
```ts
type ErrorKind = "sso-expired" | "auth" | "timeout" | "generic";
interface ErrorInfo { kind: ErrorKind; title: string; message: string; command?: string; detail: string }
```
Lista ordenada de regras `{ kind, test: RegExp[] }`; a primeira que casar vence (SSO primeiro). `detail` é sempre o texto bruto. Para SSO, extrai o perfil com regex sobre `profile ['"]?([\w.-]+)`, `--profile\s+([\w.-]+)` ou `AWS_PROFILE=([\w.-]+)`.
- *Alternativa:* classificar no main e mandar um código pelo IPC. Rejeitada: exige mudar `GitError`, o schema do IPC e todos os `catch`; o texto já chega inteiro ao renderer e a regra é puramente de apresentação.

**2. Estado continua `string | null`.** `RepoView` e `App` chamam `describeError(error)` no render. Nenhum `setError(...)` existente muda; fechar a modal chama `setError(null)`.
- *Alternativa:* guardar `ErrorInfo` no estado. Rejeitada: mexeria em ~50 chamadas de `setError` sem ganho.

**3. Componente `ErrorDialog`** (`src/renderer/ErrorDialog.tsx`), no padrão do `ConfirmDialog`: `<dialog className="error-dialog">` com `showModal()` no mount, `onCancel` (Esc) → `onClose`. Conteúdo: título, mensagem, bloco de comando (quando houver) com **Copiar comando**, botões **Ver detalhes/Ocultar detalhes**, **Copiar** (só com detalhes abertos) e **Fechar** (autoFocus). Detalhes num `<pre>` com `max-height` e `overflow: auto`, `white-space: pre-wrap; word-break: break-word`.
- Renderizado com `key={error}` para que um erro novo remonte o componente e recolha os detalhes.

**4. Montagem:** em `RepoView` só a aba ativa monta a modal (as abas inativas ficam escondidas e não devem abrir `showModal` em segundo plano). Em `App`, a modal aparece quando `active === null`, como a faixa de hoje.

**5. Mensagens (pt-BR):**
- generic: "A operação falhou" / "Não foi possível concluir a operação. Veja os detalhes para entender o que aconteceu."
- sso-expired: "Sessão SSO expirada" / "Seu login AWS SSO expirou, por isso o Git não conseguiu acessar o remote. Renove o login no terminal e tente a operação de novo."
- auth: "Credenciais recusadas" / "O remote não aceitou as credenciais. Verifique seu login ou token de acesso."
- timeout: "Tempo limite excedido" / "O remote demorou demais para responder. Verifique a conexão e tente de novo."

## Criar branch a partir da branch clicada

**Contexto.** `createBranch(root, name, startPoint, checkoutAfter)` (main, `Branches.ts`) já aceita ponto de partida; `assertStartPoint` aceita nomes de ref como `origin/x`. O commit menu já tem "Criar branch aqui…" (`commitActions.branchHere`) com `askForm` + `createBranch(..., hash, true)`. O menu da etiqueta do grafo reutiliza `sidebarMenu`, então mexer nele cobre sidebar e grafo.

**6. Item em `sidebarMenu`**, nos casos `branch` (após **Checkout**) e `remote` (após **Checkout (cria branch local)**), chamando `a.branches.createFrom(name)`. Para remota, `name` já é o nome completo `origin/x`, usado como base e no texto.
- *Alternativa:* item separado só no menu do grafo. Rejeitada: duplicaria a lógica e divergiria da sidebar.

**7. Ação `createFrom(base)` em `branchActions`**, no mesmo molde de `branchHere`: `askForm({ title: "Nova branch a partir de <base>", nameLabel: "Nome da branch", confirmLabel: "Criar e mudar" })` → `createBranch(root, nome, base, true)` dentro de `run(..., "all")`, para recarregar refs e grafo. Erros passam pelo `setError` de sempre e caem na modal de erro.
- *Checkout automático:* segue o "Criar branch aqui…" e o fluxo usual (`git switch -c`). Com base remota, o `switch --create` já configura o upstream (`branch.autoSetupMerge` padrão).
- *Sem pré-preencher o nome:* o `FormDialog` não tem valor inicial; não vale ampliar o componente agora.
- Sem tag: o pedido é só para branches; tags e commits já têm "Criar branch aqui…" pelo menu do commit.

## Risks / Trade-offs

- [Erros recorrentes em refresh automático (ex.: foco na janela) reabrem a modal] → `setError` com o mesmo texto não muda o estado enquanto aberta; depois de fechar, só reabre se o erro voltar de fato. Aceitável: hoje a faixa também reaparece.
- [Modal bloqueia a interação até fechar] → Esc/Fechar com foco inicial; mensagem curta. Preferível à faixa gigante, conforme pedido.
- [Regex de SSO não cobrir variações de mensagens do botocore/AWS CLI] → regras centralizadas e testadas com o traceback real; adicionar padrões é trivial. Sem casar, cai no genérico com detalhes, sem perda.
- [Falso positivo de "auth" com 403 vindo de outra causa] → mensagem é branda e os detalhes ficam acessíveis.
- [e2e que procuram `p.error` / `role="alert"`] → ajustar para a modal (`dialog.error-dialog`).
- [Usuário com alterações locais não commitadas cria branch a partir de outra base] → o `git switch -c` leva as alterações ou falha se houver conflito; a falha aparece na modal de erro, sem perda de dados.
- [Menu da branch fica mais longo] → um item só, agrupado com Checkout.
