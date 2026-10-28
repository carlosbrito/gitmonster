## ADDED Requirements

### Requirement: Erros de operação abrem em modal com mensagem curta
Quando uma operação da aba de repositório ou da tela inicial falhar, o sistema SHALL exibir o erro numa modal (`<dialog>`), e não mais como faixa de texto acima do grafo. A modal MUST mostrar um título e uma mensagem curta, sem o texto técnico do erro. O grafo e os painéis MUST continuar no mesmo lugar (a modal não empurra o layout).

#### Scenario: Pull falha com erro desconhecido
- **WHEN** o `git pull` falha com uma mensagem que não se encaixa em nenhuma categoria conhecida
- **THEN** abre a modal com o título "A operação falhou" e uma mensagem genérica
- **AND** o texto bruto do git não aparece na modal até o usuário pedir os detalhes
- **AND** nenhuma faixa vermelha com o erro aparece acima do grafo

#### Scenario: Erro na tela inicial
- **WHEN** abrir, clonar ou iniciar um repositório falha na tela inicial
- **THEN** o erro aparece na mesma modal

### Requirement: Erro completo disponível sob demanda
A modal SHALL ter um botão **Ver detalhes** que expande o erro completo, sem cortes, em texto monoespaçado com rolagem própria. Com os detalhes visíveis, a modal MUST oferecer **Copiar**, que copia o erro completo para a área de transferência. O botão MUST alternar para **Ocultar detalhes**.

#### Scenario: Usuário expande os detalhes
- **WHEN** o usuário clica em **Ver detalhes**
- **THEN** o texto completo do erro aparece dentro da modal, com rolagem se for maior que a área disponível
- **AND** o botão passa a se chamar **Ocultar detalhes**

#### Scenario: Usuário copia o erro
- **WHEN** os detalhes estão visíveis e o usuário clica em **Copiar**
- **THEN** o erro completo vai para a área de transferência

### Requirement: Fechar a modal descarta o erro
A modal SHALL fechar pelo botão **Fechar** e pela tecla Esc. Fechar MUST limpar o erro, de modo que a modal não reabra sozinha com o mesmo erro já dispensado. Um novo erro abre a modal de novo, com os detalhes recolhidos.

#### Scenario: Fechar com Esc
- **WHEN** a modal de erro está aberta e o usuário pressiona Esc
- **THEN** a modal fecha e o erro é descartado

#### Scenario: Novo erro depois de fechar
- **WHEN** o usuário fechou a modal e outra operação falha
- **THEN** a modal abre de novo com o novo erro e os detalhes recolhidos

### Requirement: Reconhecer sessão SSO expirada
O sistema SHALL reconhecer erros de sessão AWS SSO vencida, identificados por qualquer um destes trechos (sem diferenciar maiúsculas): `TokenRetrievalError`, `Error when retrieving token from sso`, `Token has expired and refresh failed`, `SSO session` seguido de `expired`, `UnauthorizedSSOTokenError`. Nesse caso a modal MUST usar o título "Sessão SSO expirada" e explicar que o login SSO precisa ser renovado antes de repetir a operação. A modal MUST mostrar o comando sugerido `aws sso login` e um botão para copiá-lo. Quando o erro citar o perfil AWS (ex.: `profile 'x'` / `--profile x` / `AWS_PROFILE=x`), o comando MUST incluir `--profile <perfil>`.

#### Scenario: Pull no CodeCommit com SSO vencido
- **WHEN** o `git pull` falha com o traceback do `git-remote-codecommit` terminando em `botocore.exceptions.TokenRetrievalError: Error when retrieving token from sso: Token has expired and refresh failed`
- **THEN** a modal mostra o título "Sessão SSO expirada"
- **AND** a mensagem diz que é preciso renovar o login SSO e tentar a operação de novo
- **AND** mostra o comando `aws sso login` com botão para copiar
- **AND** o traceback continua disponível em **Ver detalhes**

#### Scenario: Perfil citado no erro
- **WHEN** o erro de SSO menciona o perfil `blackarrow`
- **THEN** o comando sugerido é `aws sso login --profile blackarrow`

### Requirement: Reconhecer outras causas comuns
O sistema SHALL reconhecer, além do SSO:
- **credenciais recusadas** (`Authentication failed`, `could not read Username`, `Permission denied (publickey)`, `The requested URL returned error: 403`): título "Credenciais recusadas", mensagem dizendo que o remote não aceitou as credenciais;
- **tempo limite** (mensagem contendo `excedeu o tempo limite`): título "Tempo limite excedido", mensagem sugerindo verificar a conexão e tentar de novo.

SSO MUST ter prioridade sobre as demais categorias. Erros que não se encaixam MUST cair na mensagem genérica.

#### Scenario: Autenticação HTTPS recusada
- **WHEN** o `git push` falha com `fatal: Authentication failed for 'https://...'`
- **THEN** a modal mostra o título "Credenciais recusadas"

#### Scenario: Operação de rede estoura o tempo
- **WHEN** o `git fetch` falha com "git fetch excedeu o tempo limite de 60s."
- **THEN** a modal mostra o título "Tempo limite excedido"

#### Scenario: Erro de SSO com 403 no texto
- **WHEN** o erro contém tanto `TokenRetrievalError` quanto `403`
- **THEN** a categoria é SSO expirado
