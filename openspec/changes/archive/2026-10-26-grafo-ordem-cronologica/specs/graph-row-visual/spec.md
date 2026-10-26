## ADDED Requirements

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
