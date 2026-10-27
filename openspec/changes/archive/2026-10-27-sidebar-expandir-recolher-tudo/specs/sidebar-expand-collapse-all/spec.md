## ADDED Requirements

### Requirement: Recolher tudo nas branches locais
O cabeçalho da seção LOCAL SHALL oferecer a ação "Recolher tudo", que fecha todas as pastas da árvore de branches locais, em qualquer nível, sem alterar o estado das outras seções.

#### Scenario: Recolher todas as pastas locais
- **WHEN** as branches locais incluem `Bug/55042/fix-a`, `Bug/55043/fix-b` e `Feature/login`, com as pastas abertas, e o usuário aciona "Recolher tudo" na seção LOCAL
- **THEN** as pastas `Bug`, `Bug/55042`, `Bug/55043` e `Feature` ficam recolhidas
- **AND** branches na raiz (ex.: `main`) continuam visíveis
- **AND** o recolhimento das pastas da seção REMOTE não muda

### Requirement: Expandir tudo nas branches locais
O cabeçalho da seção LOCAL SHALL oferecer a ação "Expandir tudo", que abre todas as pastas da árvore de branches locais, em qualquer nível. Se a seção LOCAL estiver recolhida, ela SHALL ser aberta também.

#### Scenario: Expandir todas as pastas locais
- **WHEN** as pastas `Bug` e `Bug/55042` estão recolhidas e o usuário aciona "Expandir tudo" na seção LOCAL
- **THEN** todas as pastas locais ficam abertas e todas as branches locais ficam visíveis

#### Scenario: Expandir com a seção recolhida
- **WHEN** a seção LOCAL está recolhida e o usuário aciona "Expandir tudo" no seu cabeçalho
- **THEN** a seção LOCAL abre com todas as pastas abertas

### Requirement: Recolher tudo nas branches remotas
O cabeçalho da seção REMOTE SHALL oferecer a ação "Recolher tudo", que recolhe todos os grupos de remote e todas as pastas dentro deles, sem alterar o estado da seção LOCAL.

#### Scenario: Recolher todos os remotes
- **WHEN** existem os remotes `origin` e `upstream`, ambos abertos com pastas abertas, e o usuário aciona "Recolher tudo" na seção REMOTE
- **THEN** os grupos `origin` e `upstream` ficam recolhidos, mostrando apenas o nome de cada remote
- **AND** as pastas dentro deles também ficam marcadas como recolhidas
- **AND** o recolhimento das pastas da seção LOCAL não muda

### Requirement: Expandir tudo nas branches remotas
O cabeçalho da seção REMOTE SHALL oferecer a ação "Expandir tudo", que abre todos os grupos de remote e todas as pastas dentro deles. Se a seção REMOTE estiver recolhida, ela SHALL ser aberta também.

#### Scenario: Expandir todos os remotes
- **WHEN** o grupo `origin` e a pasta `origin` › `Release` estão recolhidos e o usuário aciona "Expandir tudo" na seção REMOTE
- **THEN** todos os grupos de remote e todas as suas pastas ficam abertos e todas as branches remotas ficam visíveis

### Requirement: Ações indisponíveis durante a pesquisa
Enquanto houver termo de pesquisa ativo na sidebar, as ações "Expandir tudo" e "Recolher tudo" das seções LOCAL e REMOTE SHALL ficar desabilitadas, e o recolhimento definido pelo usuário SHALL ser preservado para quando a pesquisa for limpa.

#### Scenario: Pesquisa ativa
- **WHEN** o usuário digita um termo na pesquisa da sidebar
- **THEN** os botões "Expandir tudo" e "Recolher tudo" de LOCAL e REMOTE aparecem desabilitados

#### Scenario: Estado preservado após a pesquisa
- **WHEN** o usuário aciona "Recolher tudo" na seção LOCAL, pesquisa um termo e depois limpa a pesquisa
- **THEN** as pastas locais voltam a aparecer recolhidas

### Requirement: Ações acessíveis
Os botões "Expandir tudo" e "Recolher tudo" SHALL ter rótulo acessível e dica (title) com o nome da ação, e SHALL ficar desabilitados quando a lista correspondente não tiver nenhuma pasta nem grupo de remote para alterar.

#### Scenario: Lista sem pastas
- **WHEN** todas as branches locais estão na raiz (nenhum `/` no nome)
- **THEN** os botões "Expandir tudo" e "Recolher tudo" da seção LOCAL ficam desabilitados
