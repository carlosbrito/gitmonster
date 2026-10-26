## 1. Resolução da etiqueta

- [x] 1.1 Em `src/renderer/menus.ts`, criar `chipTarget(chip, refs): SidebarTarget | null` (local → `branches`, remote → `remoteBranches`, tag → `tags`, head/não achado → `null`)
- [x] 1.2 Testes em `tests/menus.test.ts`: local, remota, tag, head e ref ausente; menu da etiqueta local/remota contém "Fazer merge da branch X na branch master"; HEAD destacado deixa merge desabilitado

## 2. Grafo

- [x] 2.1 Em `CommitGraph.tsx`, estender `onContextMenu` com `chip?: { name; kind }` e, em `onMenu`, preencher via `chipAt(localPoint(e))`, mantendo a seleção do commit
- [x] 2.2 Em `RepoView.tsx`, usar `chipTarget` + `sidebarMenu(target, menuActions, status?.branch ?? null)` quando houver alvo; senão `commitMenu`

## 3. Verificação

- [x] 3.1 E2E em `e2e/menus.mjs`: botão direito na etiqueta de uma branch no grafo mostra "Fazer merge da branch feature na branch main" e o merge é executado; botão direito fora da etiqueta mostra o menu do commit
- [x] 3.2 Rodar typecheck, testes unitários e e2e de menus

## 4. Ligações retas no grafo

- [x] 4.1 Em `CommitGraph.tsx`, trocar os `bezierCurveTo` de `incoming` (vertical na pista de origem até `mid`, horizontal até o nó) e `outgoing` (horizontal até a pista de destino, vertical até `y1`)
- [x] 4.2 Conferir visualmente com um repositório com merges e rodar typecheck, testes unitários e e2e do grafo
