# graph-commit-order Specification

## Purpose
TBD - created by archiving change grafo-ordem-cronologica. Update Purpose after archive.
## Requirements
### Requirement: Histórico em ordem cronológica
O grafo SHALL listar os commits de todas as refs em ordem de data de commit, mais recente primeiro, sem nunca mostrar um pai antes de todos os seus filhos.

#### Scenario: Branches mescladas aparecem perto dos merges
- **WHEN** a branch `stage` tem vários merges seguidos de branches cujos commits têm datas entre esses merges
- **THEN** cada commit dessas branches aparece entre os merges de acordo com sua data, e não depois de todos os merges

#### Scenario: Filhos antes dos pais
- **WHEN** um commit tem data anterior à de um pai (relógio errado)
- **THEN** o commit ainda aparece acima do pai

### Requirement: Grafo compacto em históricos com muitos merges
O número de pistas abertas ao mesmo tempo SHALL refletir as branches realmente paralelas naquele trecho, e não a quantidade de merges seguidos.

#### Scenario: Merges sequenciais de branches curtas
- **WHEN** `stage` recebe em sequência N merges de branches de um commit cada, criadas e mescladas uma após a outra
- **THEN** o grafo usa no máximo 2 pistas nesse trecho

### Requirement: Paginação estável
A leitura do histórico em páginas SHALL produzir a mesma sequência que a leitura de uma vez só.

#### Scenario: Duas páginas
- **WHEN** o histórico é lido em páginas consecutivas sem mudança nas refs
- **THEN** a concatenação das páginas é igual ao histórico completo e o layout incremental é igual ao layout feito de uma vez

