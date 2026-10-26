---
name: publicar
description: Publica uma nova versão do GitMonster - sobe a versão (patch/minor/major), envia a tag, acompanha o workflow de release, revisa o rascunho em carlosbrito/gitmonster-releases, publica e confere que os apps instalados vão receber o aviso. Use quando o usuário pedir para publicar, lançar ou soltar uma versão.
argument-hint: "[patch|minor|major] (padrão: patch)"
disable-model-invocation: true
---

# Publicar uma versão do GitMonster

Fluxo: `npm version` → `git push --follow-tags` → workflow `release` (testes, instalador, **rascunho** em
`carlosbrito/gitmonster-releases`) → revisar → publicar → conferir. Só depois de publicado os apps instalados veem a
versão nova (verificam ao abrir e a cada 6 h).

Repositórios:
- Código (privado): `carlosbrito/gitmonster` — workflow `.github/workflows/release.yml`, segredo `RELEASES_TOKEN`.
- Releases (público): `carlosbrito/gitmonster-releases` — instalador, `.blockmap` e `latest.yml`.

Fale com o usuário em português. Pare e explique quando qualquer passo falhar; não tente contornar.

## 1. Pré-condições

Rode e confira tudo antes de criar qualquer tag:

```bash
git branch --show-current          # precisa ser main
git status --porcelain             # precisa estar vazio
git fetch origin && git status -sb # main igual a origin/main (sem ahead/behind)
gh secret list -R carlosbrito/gitmonster   # RELEASES_TOKEN precisa existir
npm run typecheck && npm test      # o workflow repete, mas falhar aqui é mais barato
```

Se algo não bater, pare e diga o que precisa ser feito (commitar, puxar, criar o segredo...). Se houver dúvida se o
token ainda vale, rode o ensaio `gh workflow run release.yml` (testa, empacota e cria/apaga um rascunho de teste,
sem publicar) e confira que o passo "Token de publicação válido" diz "RELEASES_TOKEN pode publicar".

## 2. Escolher a versão e preparar as notas

- Tipo: o argumento (`patch`, `minor` ou `major`); sem argumento, `patch`.
- Mostre a versão atual (`node -p "require('./package.json').version"`) e a próxima, e o que entra:
  ```bash
  last=$(git describe --tags --abbrev=0)
  git log --oneline "$last"..HEAD
  ```
- Sem commits desde a última tag: não há o que publicar; pare.
- Escreva as notas da versão em português, para o usuário final (o que mudou para quem usa, não detalhes internos),
  em lista curta. Ignore commits só de `docs(openspec)`, `ci`, `test`, `chore`. Guarde num arquivo temporário.
- Mostre versão + notas ao usuário e **peça confirmação** antes de seguir.

## 3. Criar a versão e enviar

```bash
npm version <tipo> -m "chore: versão %s"   # sobe package.json/package-lock, commita e cria a tag vX.Y.Z
git push --follow-tags
```

## 4. Acompanhar o workflow

```bash
gh run list --workflow release.yml -L 5 --json databaseId,headBranch,event,status
```

Pegue a execução com `event == "push"` e `headBranch == "vX.Y.Z"` e acompanhe:

```bash
gh run watch <id> --exit-status
```

Se falhar, mostre o erro (`gh run view <id> --log-failed`) e pare. Não apague nem mova a tag por conta própria:
explique as opções (corrigir e lançar a próxima versão `patch`, ou — se o usuário pedir — apagar a tag local e
remota e refazer).

## 5. Revisar o rascunho

```bash
gh release view vX.Y.Z -R carlosbrito/gitmonster-releases --json isDraft,name,assets -q '{draft: .isDraft, assets: [.assets[].name]}'
```

Precisa ser rascunho com os três arquivos: `GitMonster-Setup-X.Y.Z.exe`, `GitMonster-Setup-X.Y.Z.exe.blockmap` e
`latest.yml`. Aplique as notas e o título:

```bash
gh release edit vX.Y.Z -R carlosbrito/gitmonster-releases --title "GitMonster X.Y.Z" --notes-file <notas>
```

As notas aparecem no app em "Ver novidades". Termine sempre com o aviso de instalação:

> **Instalação:** baixe `GitMonster-Setup-X.Y.Z.exe`. Se o Windows mostrar "O Windows protegeu o computador", clique
> em **Mais informações** → **Executar assim mesmo**.

## 6. Publicar

Publicar avisa todos os usuários e não dá para "despublicar" de quem já baixou. **Peça confirmação explícita**,
mostrando o link do rascunho (`https://github.com/carlosbrito/gitmonster-releases/releases`). Com o sim:

```bash
gh release edit vX.Y.Z -R carlosbrito/gitmonster-releases --draft=false --latest
```

## 7. Conferir

```bash
curl -sL https://github.com/carlosbrito/gitmonster-releases/releases/latest/download/latest.yml | head -1   # version: X.Y.Z
curl -sIL -o /dev/null -w "%{http_code}\n" https://github.com/carlosbrito/gitmonster-releases/releases/download/vX.Y.Z/GitMonster-Setup-X.Y.Z.exe   # 200
npm run stats
```

## 8. Relatório

Termine com: versão publicada, link da release, link da execução do workflow, as notas usadas, e o lembrete de que
os apps instalados recebem o aviso ao abrir ou em até 6 h. O contador de downloads do `npm run stats` atualiza com
atraso no GitHub.
