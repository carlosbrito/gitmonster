# Fase 4 — Configurações, GitHub e empacotamento

Data: 2026-10-15. Escopo aprovado pelo usuário ("sim, pode fazer tudo"); detalhes decididos aqui.

## Objetivo

Tornar o app personalizável e instalável, e conectá-lo ao GitHub para trabalhar com Pull Requests sem sair dele.

## Premissas e decisões

- **GitHub só por token pessoal (PAT)**, não OAuth: o fluxo OAuth exige um app registrado (client id) que este projeto não tem.
  O token é guardado com `safeStorage` (DPAPI no Windows). Se o sistema não oferecer criptografia, o app **recusa** guardar o token
  (nunca em texto puro). O token nunca chega ao renderer; ele só vê `{ conectado, login }`.
- Só GitHub (GitLab/Bitbucket/Azure ficam fora). A API base é `https://api.github.com`; testes apontam para um servidor local por
  variável de ambiente do processo principal (o renderer não controla).
- **Auto-update fica opcional e desligado**: exige um servidor de releases (URL `https`), que o usuário configura. Sem URL, nada roda.
  Não há como validar contra um feed real aqui; só a parte pura (validação da URL, estado) é testada.
- Ordem: A configurações, B GitHub, C empacotamento e atualização.

## A. Configurações

Arquivo `userData/settings.json` (v1, zod, escrita atômica): `{ theme: "system"|"light"|"dark", editor: string, updateUrl: string }`.
- **Tema:** `nativeTheme.themeSource` no main faz `prefers-color-scheme` seguir a escolha; o grafo (canvas) redesenha ao mudar.
- **Perfil Git:** lê/grava `user.name` e `user.email` no escopo **global** ou no do **repositório** (`git config`), com validação
  (sem quebra de linha, até 200 caracteres).
- **Editor externo:** comando (ex.: `code`) ou vazio para o programa padrão do sistema. O arquivo é aberto com `execFile` (sem shell), só
  se estiver dentro do repositório e existir. Item "Abrir no editor" no menu de contexto dos arquivos.
- UI: diálogo "Configurações" (botão ⚙ na barra de abas), com salvar/cancelar.

## B. GitHub

- `github.json`: token criptografado (base64 do `safeStorage`). Conectar valida o token em `GET /user` antes de guardar. Desconectar apaga.
- Repositório do GitHub deduzido do remote (`origin` ou o primeiro): aceita `https://github.com/o/r(.git)` e `git@github.com:o/r(.git)`;
  `o` e `r` só `[A-Za-z0-9._-]`. Remote que não é do GitHub → recurso indisponível, com explicação.
- Operações (todas no main, via `fetch`, timeout de 20 s): listar PRs (abertos/fechados, 50 por vez), detalhe de um PR, criar PR
  (título, corpo, base, head = branch atual já publicada), fazer checkout de um PR (`fetch <remote> pull/N/head:pr-N` e troca para ela),
  abrir o PR no navegador (URL `https://github.com/...` validada).
- UI: aba "Pull Requests" no centro (lista + detalhe + "Criar PR" com a branch atual) e conexão em Configurações.
- Erros da API (401, 403, 404, 422) viram mensagens em português; limite de taxa é informado.

## C. Empacotamento e atualização

- `electron-builder` com alvo NSIS (Windows x64), `npm run dist`. Ícone e metadados em `build/`.
- `electron-updater` com provedor genérico; só inicializa empacotado, com `updateUrl` https configurada. Botão "Verificar atualizações" e
  texto de estado em Configurações.
- Sem assinatura de código (exige certificado): o instalador gerado não é assinado e o Windows mostrará aviso.

## Testes

- Unitários: schema/arquivo de configurações (corrompido, escrita atômica), validação do perfil Git e escrita com `git config`,
  abrir no editor (caminho fora do repo, inexistente), parser de URL do GitHub, cliente da API contra servidor HTTP local (listar,
  detalhe, criar, erros 401/403/404/422, token nunca vai a URL errada), armazenamento do token com `safeStorage` simulado, validação da URL de atualização.
- E2E: trocar o tema pelas configurações; salvar perfil Git; conectar ao GitHub simulado, listar PR, criar PR e fazer checkout.
- Empacotamento: gerar o instalador (`npm run dist`) e verificar que o artefato existe, se a rede permitir baixar as dependências do builder.
