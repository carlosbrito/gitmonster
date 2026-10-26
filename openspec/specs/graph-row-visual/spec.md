# graph-row-visual Specification

## Purpose
TBD - created by archiving change grafo-ordem-cronologica. Update Purpose after archive.
## Requirements
### Requirement: Fundo da linha na cor da pista
Cada linha de commit SHALL ter um fundo translúcido na cor da pista do seu nó, do nó até o fim da coluna de mensagem. Hover, seleção e o pulso de destaque SHALL continuar visíveis por cima.

#### Scenario: Commit sem etiqueta
- **WHEN** um commit sem branch/tag está na pista de cor X
- **THEN** a linha dele tem fundo translúcido na cor X a partir do nó

#### Scenario: Linha selecionada
- **WHEN** o usuário seleciona um commit
- **THEN** a cor de seleção prevalece sobre o fundo da pista

### Requirement: Nó de merge cheio
O nó de um commit com dois ou mais pais SHALL ser um ponto cheio na cor da pista; commits comuns continuam com o avatar do autor e anel na cor da pista.

#### Scenario: Merge
- **WHEN** um commit tem dois pais
- **THEN** o nó é um círculo preenchido na cor da pista, sem avatar

### Requirement: Ligações entre pistas retas
As ligações do grafo que mudam de pista SHALL ser desenhadas só com segmentos retos, sem curvas: um trecho vertical na pista e um trecho horizontal na altura do nó do commit, unidos em ângulo reto.

#### Scenario: Pai em outra pista
- **WHEN** um commit na pista A tem o pai na pista B
- **THEN** a ligação sai do nó na horizontal até a pista B e desce na vertical pela pista B, sem curva

#### Scenario: Filho em outra pista (merge)
- **WHEN** a linha que chega a um commit na pista A vem da pista B
- **THEN** ela desce na vertical pela pista B até a altura do nó e segue na horizontal até o nó, sem curva

#### Scenario: Mesma pista
- **WHEN** a ligação fica na mesma pista
- **THEN** ela é um segmento vertical, como antes

