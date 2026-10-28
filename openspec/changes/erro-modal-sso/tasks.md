## 1. Classificador de erros

- [x] 1.1 Criar `tests/errorInfo.test.ts` com os casos da spec: traceback real do CodeCommit (SSO), SSO com perfil citado (`--profile`, `profile 'x'`, `AWS_PROFILE=x`), `Authentication failed`, `could not read Username`, `Permission denied (publickey)`, 403, "excedeu o tempo limite", SSO + 403 (SSO vence) e erro genérico; `detail` sempre igual ao texto bruto
- [x] 1.2 Implementar `src/renderer/errorInfo.ts` com `describeError(raw)` → `{ kind, title, message, command?, detail }`, regras ordenadas (SSO primeiro) e extração do perfil AWS
- [x] 1.3 Rodar `npm test` e confirmar os novos testes passando

## 2. Modal de erro

- [x] 2.1 Criar `src/renderer/ErrorDialog.tsx` (`<dialog className="error-dialog">`, `showModal` no mount, Esc → `onClose`): título, mensagem, bloco de comando com **Copiar comando** quando houver, **Ver detalhes/Ocultar detalhes**, **Copiar** (com detalhes abertos) e **Fechar** com autoFocus
- [x] 2.2 Adicionar estilos em `src/renderer/styles.css`: largura máxima da modal, `<pre>` de detalhes com `max-height`, `overflow: auto`, `white-space: pre-wrap`, `word-break: break-word`, bloco de comando monoespaçado; seguir os tokens de cor existentes

## 3. Integração

- [x] 3.1 `RepoView.tsx`: trocar `<p role="alert" className="error">` por `<ErrorDialog key={s.error} info={describeError(s.error)} onClose={() => s.setError(null)} />`, montado só na aba ativa
- [x] 3.2 `App.tsx`: mesma troca na tela inicial (`active === null`), fechando com `setError(null)`
- [x] 3.3 Remover a regra `.error` de `styles.css` se não houver mais uso (checar outros componentes antes) — mantida: ainda usada por blame, conflitos, PRs, IA, configurações e rebase
- [x] 3.4 Rodar `npm run typecheck`

## 4. Criar branch a partir da branch clicada

- [x] 4.1 Em `tests/menus.test.ts`, cobrir: menu de branch local tem "Criar branch a partir de <nome>…" logo após "Checkout", habilitado inclusive na branch atual e com HEAD destacado; menu de branch remota tem o item após "Checkout (cria branch local)"; selecionar chama `branches.createFrom` com a base certa (`dev`, `origin/hmg02`); menu da etiqueta do grafo também mostra o item
- [x] 4.2 Adicionar `createFrom(base)` em `src/renderer/actions/branchActions.ts` (e no tipo de `MenuActions`): `askForm` com título "Nova branch a partir de <base>" e "Criar e mudar", depois `createBranch(root, nome, base, true)` em `run(..., "all")`
- [x] 4.3 Incluir o item nos casos `branch` e `remote` de `sidebarMenu` em `src/renderer/menus.ts`
- [x] 4.4 Rodar `npm test` e `npm run typecheck`

## 5. Verificação

- [x] 5.1 Criar `e2e/error-dialog.mjs`: provocar uma falha (ex.: pull num repo com remote inválido), conferir que abre a modal com título genérico, sem faixa acima do grafo; **Ver detalhes** mostra o texto completo; Esc fecha e o erro some
- [x] 5.2 Em `e2e/branches.mjs` (ou novo `e2e/branch-from.mjs`): botão direito numa branch local da sidebar → "Criar branch a partir de…" → informar nome → nova branch existe no commit da base e é a atual; repetir pela etiqueta de uma branch remota no grafo
- [x] 5.3 Rodar `npm run test:e2e` e confirmar que nenhum e2e existente quebrou (history.mjs falhou 1× na suíte completa no passo do rebase interativo, sem mensagem; passou em 4 outras execuções)
- [ ] 5.4 Teste manual no app com remote CodeCommit e SSO vencido: modal "Sessão SSO expirada", comando `aws sso login` copiável e traceback em **Ver detalhes**
