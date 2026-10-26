## Context

- O grafo é um único `<canvas>` (`CommitGraph.tsx`). As etiquetas desenhadas na coluna BRANCH / TAG ficam registradas em `chipRects` (`{x, y, w, h, name, kind}`) e já são usadas para arrastar (merge por drag) e duplo clique (checkout) via `chipAt(localPoint(e))`.
- `onMenu` hoje só resolve a linha (`commitIndexAt`) e chama `onContextMenu(commit, point)`; `RepoView` monta `commitMenu(commit, menuActions)`.
- A sidebar usa `sidebarMenu(target, menuActions, status?.branch ?? null)`, com `mergeEntries` cuidando das regras de branch atual e HEAD destacado. `SidebarTarget` exige o objeto completo (`BranchInfo`, `RemoteBranchInfo`, `TagInfo`), que está em `refs` (`RefsSnapshot`).

## Goals / Non-Goals

**Goals:**
- Botão direito na etiqueta de branch/tag do grafo = mesmo menu da sidebar para aquela ref, com os mesmos textos e regras.
- Zero lógica de menu duplicada: reaproveitar `sidebarMenu`.

**Non-Goals:**
- Submenus ou juntar menu da branch com o menu do commit numa lista só.
- Mudar o menu do commit (resto da linha) ou o menu da sidebar.
- Menu para a etiqueta `HEAD` (HEAD destacado): continua com o menu do commit.

## Decisions

1. **`CommitGraph` só informa a etiqueta; `RepoView` decide o menu.**
   `onContextMenu(commit, point, chip?: { name: string; kind: Chip["kind"] })`. Em `onMenu`, `chipAt(localPoint(e))` dá a etiqueta; o commit continua sendo selecionado como hoje. Mantém o grafo sem conhecer `menus.ts` (mesmo padrão de `onCheckout`/`onBranchDrop`).
   Alternativa: passar `refs` e `menuActions` para o grafo — acopla o canvas aos menus, descartada.

2. **Resolver a etiqueta num `SidebarTarget` com função pura em `menus.ts`.**
   `chipTarget(chip, refs): SidebarTarget | null` — `local` → `branches.find(name)`, `remote` → `remoteBranches.find(name)`, `tag` → `tags.find(name)`, `head`/não achado → `null`. Função pura é testável em `tests/menus.test.ts` sem DOM. `RepoView`: `target ? sidebarMenu(target, menuActions, status?.branch ?? null) : commitMenu(commit, menuActions)`.

3. **Etiqueta local com remota no mesmo commit (ícones computador + nuvem) abre o menu da local.**
   O chip representa a local; a remota continua acessível pela sua própria etiqueta quando o commit diverge, ou pela sidebar.

4. **Só a etiqueta, não a linha inteira.**
   Clique direito fora da etiqueta segue com o menu do commit — preserva cherry-pick/reset/revert, que são ações sobre o commit.

5. **Ligações entre pistas em ângulo reto.**
   Hoje `incoming` (pista do filho → nó) e `outgoing` (nó → pista do pai) usam `bezierCurveTo` quando a pista muda. Passam a ser polilinhas: `incoming` desce na vertical pela pista de origem até a altura do nó e cruza na horizontal até o nó; `outgoing` sai do nó na horizontal até a pista de destino e desce na vertical até o fim da linha. Ligações na mesma pista e as que só atravessam (`through`) já são retas e não mudam.
   Alternativa: diagonal reta do topo da linha ao nó — cria zigue-zague a cada troca de pista e cruza outras pistas em ângulos variados; descartada.

## Risks / Trade-offs

- [Trechos horizontais de vários merges/forks no mesmo commit se sobrepõem na altura do nó] → cada um termina na sua pista e tem a cor da sua pista; o desenho fica igual ao estilo "metrô" de outros clientes git.

- [Etiqueta cortada por falta de largura não está em `chipRects`] → cai no menu do commit; aceitável (o usuário pode alargar a coluna ou usar o overlay/sidebar).
- [`refs` desatualizado em relação ao commit (ref apagada entre refresh)] → `chipTarget` devolve `null` e o menu do commit aparece; nada quebra.
- [Usuário esperava cherry-pick ao clicar na etiqueta] → o menu do commit continua a um clique fora da etiqueta na mesma linha.
