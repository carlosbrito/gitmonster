# graph-branch-menu Specification

## Purpose
TBD - created by archiving change grafo-menu-branch. Update Purpose after archive.
## Requirements
### Requirement: Menu da etiqueta de branch local no grafo
Ao clicar com o botão direito sobre a etiqueta de uma branch local na coluna BRANCH / TAG, o sistema SHALL abrir o mesmo menu que a sidebar mostra para essa branch, incluindo "Fazer merge da branch <etiqueta> na branch <atual>" e "Fazer rebase da branch <atual> em cima de <etiqueta>".

#### Scenario: Merge de branch local pela etiqueta do grafo
- **WHEN** a branch atual é `master` e o usuário clica com o botão direito na etiqueta `feature` no grafo
- **THEN** o menu mostra "Fazer merge da branch feature na branch master"
- **AND** escolher o item executa o mesmo merge que o item equivalente da sidebar

#### Scenario: Etiqueta da branch atual
- **WHEN** o usuário clica com o botão direito na etiqueta da própria branch atual
- **THEN** o menu não mostra itens de merge nem de rebase e o Checkout aparece desabilitado

### Requirement: Menu da etiqueta de branch remota no grafo
Ao clicar com o botão direito sobre a etiqueta de uma branch remota, o sistema SHALL abrir o menu da sidebar para essa branch remota, incluindo o merge dela na branch atual.

#### Scenario: Merge de branch remota pela etiqueta do grafo
- **WHEN** a branch atual é `master` e o usuário clica com o botão direito na etiqueta `origin/Release/Master/26-10-2026`
- **THEN** o menu mostra "Checkout (cria branch local)", "Fazer merge da branch origin/Release/Master/26-10-2026 na branch master" e "Fazer rebase da branch master em cima de origin/Release/Master/26-10-2026"

### Requirement: HEAD destacado
Com HEAD destacado, os itens de merge e rebase do menu da etiqueta SHALL aparecer desabilitados com a explicação, igual à sidebar.

#### Scenario: Etiqueta com HEAD destacado
- **WHEN** não há branch atual e o usuário clica com o botão direito numa etiqueta de branch
- **THEN** o menu mostra "Fazer merge da branch <etiqueta> (sem branch atual: HEAD destacado)" desabilitado

### Requirement: Menu da etiqueta de tag no grafo
Ao clicar com o botão direito sobre a etiqueta de uma tag, o sistema SHALL abrir o menu de tag da sidebar.

#### Scenario: Tag no grafo
- **WHEN** o usuário clica com o botão direito na etiqueta de uma tag
- **THEN** o menu mostra "Checkout (HEAD destacado)", "Publicar no remoto" e "Apagar tag local…"

### Requirement: Menu do commit fora das etiquetas
Botão direito numa linha do grafo fora de uma etiqueta de branch/tag (ou sobre a etiqueta `HEAD`, ou quando a ref não existe mais) SHALL continuar abrindo o menu do commit, sem alteração.

#### Scenario: Clique fora da etiqueta
- **WHEN** o usuário clica com o botão direito na coluna GRAPH ou COMMIT MESSAGE de uma linha
- **THEN** o menu mostra "Checkout (HEAD destacado)", "Cherry-pick na branch atual" e os demais itens do commit

#### Scenario: Ref não encontrada
- **WHEN** a etiqueta clicada não existe mais na lista de refs carregada
- **THEN** o menu do commit é aberto

