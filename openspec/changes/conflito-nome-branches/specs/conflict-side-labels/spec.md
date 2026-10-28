## ADDED Requirements

### Requirement: Nome da branch em cada painel do conflito
O editor de conflitos SHALL exibir, no título de cada painel (nosso e deles), o nome da branch ou commit correspondente em destaque, com o papel ("nosso" ou "deles") como texto secundário. O nome completo SHALL ficar disponível em tooltip quando for truncado.

#### Scenario: Merge de branch remota na branch atual
- **WHEN** o usuário está na branch `apresentacao`, mescla `origin/Feature/55694/DiscadorFlutuanteHistoricoLigacoes`, o merge para em conflito e ele abre um arquivo conflitado
- **THEN** o painel esquerdo mostra **apresentacao** com o texto secundário "nosso" e o painel direito mostra **origin/Feature/55694/DiscadorFlutuanteHistoricoLigacoes** com o texto secundário "deles"

#### Scenario: Merge de branch local
- **WHEN** o usuário está em `main`, mescla a branch local `feature`, e há conflito
- **THEN** o painel nosso mostra **main** e o painel deles mostra **feature**

#### Scenario: Nome longo
- **WHEN** o nome de uma branch não cabe na largura do painel
- **THEN** o nome é truncado com reticências e o tooltip mostra o nome completo

### Requirement: Lados resolvidos conforme a operação
O sistema SHALL determinar o nome de cada lado a partir da operação em andamento: no merge, nosso é a branch atual e deles a ref mesclada; no cherry-pick e no revert, nosso é a branch atual e deles o commit (SHA curto, com o assunto como detalhe); no rebase, nosso é a base onde os commits são reaplicados e deles a branch sendo rebaseada, com o commit da vez como detalhe quando conhecido.

#### Scenario: Cherry-pick com conflito
- **WHEN** o usuário, na branch `dev`, faz cherry-pick do commit `a1b2c3d` ("corrige cálculo") e há conflito
- **THEN** o painel nosso mostra **dev** e o painel deles mostra **a1b2c3d** com o detalhe "corrige cálculo"

#### Scenario: Revert com conflito
- **WHEN** o usuário, na branch `dev`, reverte o commit `a1b2c3d` e há conflito
- **THEN** o painel nosso mostra **dev** e o painel deles mostra **a1b2c3d** com detalhe indicando que é o commit revertido

#### Scenario: Rebase com conflito
- **WHEN** o usuário rebaseia a branch `feature` sobre `main` e o rebase para em conflito
- **THEN** o painel nosso mostra **main** com detalhe "base do rebase", o painel deles mostra **feature** com o commit sendo reaplicado como detalhe, e o editor exibe um aviso de que no rebase "nosso" é a base e "deles" são os commits reaplicados

#### Scenario: HEAD destacado
- **WHEN** há merge em andamento com HEAD destacado no commit `9f8e7d6`
- **THEN** o painel nosso mostra "HEAD destacado" com o SHA curto `9f8e7d6`

#### Scenario: Mensagem de merge indisponível
- **WHEN** há merge em andamento mas não é possível extrair o nome da ref mesclada da mensagem de merge
- **THEN** o painel deles mostra o SHA curto de `MERGE_HEAD`

### Requirement: Contexto da operação no topo do editor
O editor de conflitos SHALL exibir, na barra superior, uma linha que descreve a operação com os nomes dos dois lados (por exemplo, "Merge de origin/Feature/x em apresentacao" ou "Rebase de feature sobre main").

#### Scenario: Linha de contexto no merge
- **WHEN** o usuário abre um arquivo conflitado durante o merge de `origin/Feature/x` em `apresentacao`
- **THEN** a barra superior mostra "Merge de origin/Feature/x em apresentacao"

### Requirement: Nomes nas ações de escolha de lado
As ações de escolha SHALL deixar claro qual branch cada lado representa: os botões "Usar nosso" e "Usar deles" SHALL ter tooltip com o nome da branch do lado ("Usar apresentacao"), e as ações "Arquivo inteiro: nosso/deles" SHALL mostrar o nome entre parênteses, inclusive para arquivos não editáveis.

#### Scenario: Arquivo binário em conflito no merge
- **WHEN** o usuário abre um arquivo binário conflitado durante o merge de `feature` em `main`
- **THEN** os botões mostram "Arquivo inteiro: nosso (main)" e "Arquivo inteiro: deles (feature)"

#### Scenario: Tooltip do botão de bloco
- **WHEN** o usuário passa o mouse sobre "Usar nosso" durante o merge em `apresentacao`
- **THEN** o tooltip mostra "Usar apresentacao"

### Requirement: Fallback sem operação identificável
Quando não for possível determinar os lados (nenhuma operação registrada, como em conflito de `stash pop`, ou falha ao ler o estado do git), o editor SHALL continuar funcionando e SHALL usar os rótulos dos marcadores de conflito, como antes desta change.

#### Scenario: Conflito de stash pop
- **WHEN** um `stash pop` deixa um arquivo em conflito sem operação em andamento
- **THEN** os painéis mostram "Nosso (Updated upstream)" e "Deles (Stashed changes)", a partir dos marcadores, e a resolução funciona normalmente

#### Scenario: Erro ao coletar os nomes
- **WHEN** a leitura do estado da operação falha
- **THEN** o arquivo de conflito abre normalmente com os rótulos dos marcadores, sem exibir erro
