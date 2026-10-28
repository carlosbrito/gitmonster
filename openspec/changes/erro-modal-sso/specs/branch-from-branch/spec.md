## ADDED Requirements

### Requirement: Criar branch a partir de branch local pelo menu
O menu de botão direito de uma branch local SHALL ter o item **Criar branch a partir de `<nome>`…**, logo após **Checkout**. O item MUST aparecer tanto na sidebar (seção LOCAL) quanto na etiqueta da branch no grafo, e MUST ficar habilitado mesmo quando a branch clicada é a atual ou quando o HEAD está destacado.

#### Scenario: Item no menu da sidebar
- **WHEN** o usuário clica com o botão direito na branch local `apresentacao` na sidebar
- **THEN** o menu mostra "Criar branch a partir de apresentacao…" logo abaixo de "Checkout"

#### Scenario: Item no menu da etiqueta do grafo
- **WHEN** o usuário clica com o botão direito na etiqueta `master` no grafo, sendo `master` a branch atual
- **THEN** o menu mostra "Criar branch a partir de master…" habilitado

### Requirement: Criar branch a partir de branch remota pelo menu
O menu de botão direito de uma branch remota SHALL ter o item **Criar branch a partir de `<remote>/<nome>`…**, logo após **Checkout (cria branch local)**, na sidebar (seção REMOTE) e na etiqueta remota do grafo.

#### Scenario: Branch remota no grafo
- **WHEN** o usuário clica com o botão direito na etiqueta `origin/Release/Master/27-10-2026` no grafo
- **THEN** o menu mostra "Criar branch a partir de origin/Release/Master/27-10-2026…"

### Requirement: Diálogo e criação da branch
Escolher o item SHALL abrir o diálogo de nome de branch com o título "Nova branch a partir de `<base>`" e o botão "Criar e mudar". Confirmar MUST criar a branch com o nome informado apontando para a ponta da branch base e fazer checkout dela. Cancelar MUST não alterar nada. Nome inválido ou já existente MUST resultar no erro do git, exibido pela modal de erro.

#### Scenario: Criar a partir de branch local
- **WHEN** a branch atual é `master`, o usuário escolhe "Criar branch a partir de dev…" e informa `feature/x`
- **THEN** a branch `feature/x` é criada no commit de `dev`
- **AND** `feature/x` passa a ser a branch atual

#### Scenario: Criar a partir de branch remota
- **WHEN** o usuário escolhe "Criar branch a partir de origin/hmg02…" e informa `fix/y`
- **THEN** a branch `fix/y` é criada no commit de `origin/hmg02`, rastreando `origin/hmg02`, e passa a ser a branch atual

#### Scenario: Cancelar o diálogo
- **WHEN** o usuário abre o diálogo e cancela
- **THEN** nenhuma branch é criada e a branch atual não muda

#### Scenario: Nome já existente
- **WHEN** o usuário informa o nome de uma branch que já existe
- **THEN** nenhuma branch é criada e a modal de erro é exibida
