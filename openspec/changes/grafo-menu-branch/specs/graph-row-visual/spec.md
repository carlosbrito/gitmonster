## ADDED Requirements

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
