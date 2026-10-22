# Fase 2: Sankey de 2025 (design)

Posição de 21/10/2026, após o brainstorming. Complementa `docs/especificacao.md`, que continua sendo a fonte de verdade de
produto e metodologia; as decisões abaixo que mudam a especificação entram nela no commit indicado.

Marcas: **[decidido]** veio do Bruno; **[minha decisão]** é escolha do implementador, revisável na leitura deste documento.

## Intenção

Desenhar o Sankey do Governo Central de 2025, em R$ constantes de dez/2025, lendo só `dados/2025.json`, e provar com testes
que o desenho bate com o gráfico original (até R$ 2 bi por nó) e que as identidades fecham. É a fase que reduz o risco: se o
desenho não bater, o mapeamento está errado, e é melhor saber antes da linha do tempo.

### Objetivos

- Sankey de um ano (2025), modo R$ constantes, temas claro e escuro, desktop e celular.
- Painel de detalhes por nó: valor, participação com a base escrita, linhas do RTN (código + nome oficial) e boletim de origem.
- Testes que falham de verdade: identidades, conservação por nó, escala única, regressão contra o original, rótulos sem colisão
  nos 11 anos, guardas de texto, comportamento no navegador.

### Fora da fase 2 [decidido]

Seletor de ano, modos percentuais, módulo de financiamento, linha do tempo, deploy. A função de grafo não pode impedir o
superávit (2022), que é desenhado só na fase 3.

### Anti-objetivos [decidido]

Qualquer número fiscal digitado no código ou na interface; "dívida nova"; "gov.br" ou marca que sugira origem oficial;
caminho absoluto a partir da raiz do domínio; d3-sankey.

## Commits na branch `fase-2-sankey-2025` [decidido]

Cada commit com os testes verdes; um PR no final; nada direto na `main`.

0. Este documento de design (e o plano).
1. **(a)** Campo `linhas` no pipeline, teste primeiro.
2. **(a2)** Campo `estrutura` no pipeline e `desenho.ordem_obrigatorias` no mapeamento, teste primeiro.
3. **(b)** `referencias/original-2025.json` compartilhado entre `testes.py` e Vitest (refatoração sem mudança de comportamento).
4. **(c)** Código web, em commits pequenos.

### (a) Campo `linhas` em cada `dados/AAAA.json`

- Item: `{"codigo": "4.4.1.2", "nome": "Bolsa Família e Auxílio Brasil", "operacao": "soma" | "subtrai"}`, na ordem de `soma` e
  depois `subtrai` do `mapeamento.json`.
- Chaves: os 15 nós do mapeamento (inclui o repasse) e os totais `receita_total`, `receita_liquida`, `despesa_total` e
  `primario_acima` (um item cada, `operacao: "soma"`, código de `mapeamento.json → totais`).
- Gravado em todos os anos, para o JSON ser autossuficiente; mudança de mapeamento é registrada por `mapeamento_versao`.
- Nome lido da aba 1.2 (um rótulo por linha, válido para a série toda) e normalizado: tira o código do início, o separador
  `" - "` só logo depois do código (`"1.3 -  Arrecadação…"`), marcadores de nota no fim (`"… 2/"`) e espaços sobrando. Mantém a
  caixa do boletim e todo hífen interno: `"CIDE - Combustíveis"`, `"RECEITA LÍQUIDA (1-2)"` e
  `"RESULTADO PRIMÁRIO GOVERNO CENTRAL - ACIMA DA LINHA (3 - 4)"` (a linha 5 conserva "acima da linha" e "(3 - 4)").
- Testes em `testes.py`: todo código de `linhas` existe na aba 1.2 com nome não vazio; as `linhas` de cada nó reproduzem
  exatamente `soma`/`subtrai` e as dos totais reproduzem `mapeamento.totais`; a normalização preserva os casos acima; gerar duas
  vezes dá JSON idêntico.
- Prova de escopo: JSON antigos e novos, sem a chave `linhas`, idênticos.
- README ganha a seção "Formato de cada AAAA.json". [minha decisão: a seção não existia]

### (a2) Campo `estrutura` e ordem fixa das obrigatórias

- `mapeamento.json` ganha só a seção `desenho`, com `ordem_obrigatorias`: `aposentadorias_pensoes`, `servidores`,
  `fundeb_seguro_desemprego_outras`, `saude_obrigatoria`, `bolsa_familia`, `bpc`, `demais_controle_fluxo`. Como JSON não aceita
  comentário, a seção leva um campo `nota`: "Ordem fixada com base nos valores de 2025. NÃO reordenar por ano." [minha decisão:
  `nota` no lugar do comentário; `versao` do mapeamento continua 1, porque nenhuma linha do RTN muda de nó]
- O pipeline grava em cada AAAA.json `estrutura`: `receita` (os 6 ids, na ordem do mapeamento), `repasse` (id),
  `obrigatorias` (a ordem fixa) e `discricionarias` (id da folha do grupo discricionário).
- Testes em `testes.py`: `obrigatorias` tem exatamente os ids de grupo `"obrigatoria"`, sem repetir nem faltar; `receita` é igual
  à ordem do mapeamento; todo id de `estrutura` existe entre os nós; gerar duas vezes dá JSON idêntico.
- Prova de escopo: JSON antigos e novos, sem `linhas` e `estrutura`, idênticos.

### (b) `referencias/original-2025.json`

Fora de `dados/` e de `web/public/`. Conteúdo, na ordem: `ano`, `unidade` ("R$ bi"), `precos` ("dez/2025"), `fonte` ("valores
impressos no gráfico 'Como o gov.br gasta o dinheiro', divulgado por Pixel Financeiro; a imagem não é versionada"),
`tolerancia_por_no` (2.0), `nos` (os 12 nós com valor impresso), `grupos` (`bolsa_familia_saude_outros`: ids dos três nós
abertos e valor 374), `totais` (`receita_total`, `receita_liquida`, `despesa_total`, `obrigatorias` 2220) e `deficit` (60).

- O T8 lê o arquivo e falha se ele vier vazio ou se o número de valores comparados for diferente de 18 (12 nós + 1 grupo +
  4 totais + déficit). `obrigatorias` no T8 = soma dos nós do grupo obrigatório.
- Prova: saída do T8 idêntica antes e depois, exceto a contagem (17 → 18) e o novo valor `obrigatorias` (maior diferença
  continua R$ 0,58 bi, no déficit); mutação temporária (tirar `1.1.01` de `iof_ipi_importacao`) faz T8 e T1 falharem;
  `git diff mapeamento.json` vazio depois.
- O Vitest lê o arquivo com `fs` a partir de `../referencias`; nada em `web/src` o importa.
- `docs/como-conduzir.md`, seção 6: o `git grep` de auditoria olha só `web/src`; as referências ficam em `referencias/`.

## O site (commit c)

### Pilha [decidido]

Vite + React + TypeScript, Vitest, pasta `web/`, layout próprio em SVG (função pura, sem d3-sankey). `base: '/sankey-fiscal/'`;
todo fetch usa `import.meta.env.BASE_URL`. Um script Node copia `dados/*.json` para `web/public/dados/` antes do dev e do build
(sem symlink); `web/public/dados/` fica no `.gitignore`. Playwright (Chromium) para o teste de navegador.

No primeiro commit web que introduz o layout, atualizam-se no mesmo commit `docs/especificacao.md` (pilha "React + layout próprio
em SVG" e o diagrama Mermaid de arquitetura), `CLAUDE.md` e `README.md`.

### Grafo (função pura `dados → grafo`)

- Papéis e ordem vêm de `estrutura` do JSON; nenhum id de nó de receita ou despesa é escrito no TypeScript. Os ids estruturais
  (`receita_total`, `receita_liquida`, `despesa_total`, `obrigatorias`, `resultado_primario`) são os de `totais` ou do próprio
  grafo.
- Fluxos: origens → `receita_total` → repasse e `receita_liquida`; `receita_liquida` e `resultado_primario` → `despesa_total`
  (rótulo "Gasto total") → `obrigatorias` e a folha discricionária; `obrigatorias` → as folhas na ordem de
  `estrutura.obrigatorias`. A discricionária vai para a última coluna, abaixo das folhas, ligada direto ao Gasto total.
- Valores de `real.nos` e `real.totais`, sem recalcular totais. `obrigatorias` = soma das folhas de `estrutura.obrigatorias`.
  O nó `resultado_primario` carrega a magnitude, `|primario_acima|` (sempre ≥ 0); o sinal fica em `Grafo.resultado`
  (`'deficit'` ou `'superavit'`). Em déficit, `receita_liquida` + resultado = `despesa_total`; em superávit,
  `receita_liquida` = `despesa_total` + resultado, e o grafo liga `receita_liquida` → `resultado_primario`, continuando a
  conservar. O site desta fase só desenha déficit.
- Rótulos das folhas vêm de `rotulos` do JSON, sem encurtar; rótulos estruturais vêm de `web/src/textos.ts`.

### Desenho

- Seis colunas: origens | Receita total | Repasse, Receita líquida, Déficit | Gasto total | Obrigatórias | folhas + Discricionárias.
- Fluxos são faixas preenchidas (duas curvas de Bézier fechadas), não traços com `stroke-width`, para o teste medir a
  espessura exata nas duas pontas. Fluxos a 36% de opacidade sobre o fundo; nós opacos. Texto nunca usa a cor da série.
- Cores por variáveis CSS, com `prefers-color-scheme` e dois temas:

| Papel | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#fcfcfb` | `#1a1a19` |
| Texto e valor | `#0b0b0b` | `#f0efec` |
| Texto secundário e guias | `#52514e` | `#c3c2b7` |
| Receitas | `#2a78d6` | `#3987e5` |
| Repasse | `#8b8a85` | `#8b8a85` |
| Gastos | `#eb6834` | `#e0702e` |
| Discricionárias | `#1baf7a` | `#199e70` |
| Déficit (hachura diagonal no nó e no fluxo) | `#b91c1c` (6,3:1 no fundo) | `#b8322f` + contorno de 1 px `#f2b8b5` no nó e no fluxo (10,2:1 no fundo) |

As quatro cores de série passam nos critérios obrigatórios do validador de cor, nos dois temas e com todos os pares comparados
(daltonismo e visão normal); vermelho × laranja dá 17,1 no claro e 15,6 no escuro (mínimo 15). Avisos que ficam: verde-água
claro (2,7:1) e vermelho escuro (2,9:1) abaixo de 3:1 contra o fundo; o rótulo direto compensa os dois, e o contorno leva o
déficit escuro acima de 3:1.

- Rótulos: origens à esquerda e folhas à direita, com guias em cotovelo (1,25 px) só quando o rótulo sai do lugar; os quatro
  nós grandes e o repasse com rótulo ao lado e contorno da cor do fundo por cima do fluxo; déficit com "Déficit primário
  (financiado com dívida)", valor e "não inclui juros".
- Contraste do texto (mínimo 4,5:1) contra fundo e fluxos azul, rosa, cinza e verde-água: pior caso 4,8:1 no claro (texto
  secundário sobre azul) e 5,5:1 no escuro. Se uma cor mudar e algo cair abaixo, escurece-se o texto, não o contorno.
- Margens: todo texto a ≥ 12 px da borda do SVG; esquerda e direita pela largura medida do maior rótulo de cada lado; topo e
  base pela pilha de rótulos mais alta e mais baixa.
- Altura única: uma constante de layout por formato, não calculada por ano; o teste prova que o pior ano cabe. Nesta fase a
  escala (px por R$) é de cada ano, com área de barras fixa. [minha decisão]
- Quebra de linha dos rótulos pela largura medida (máximo em px por lado e formato), não por número de caracteres; pode quebrar
  logo depois de um hífen ("seguro-" / "desemprego"). [minha decisão]
- Cartão: aviso "Visualização independente, baseada em dados do Tesouro Nacional." no topo; painel; rodapé "Somas podem diferir
  por arredondamento.", boletim de origem (`versao_dados`) e mês-base, fora do SVG.

### Celular (rolagem horizontal)

- Mesmo Sankey, desenho de ~760 px num contêiner rolável com `scroll-snap` e duas paradas: (1) origens e Receita total;
  (2) destinos. Começa na parada 1 (lê-se de onde vem para onde vai). As bordas das paradas caem no vão entre Receita total e a
  coluna seguinte; se for impossível numa largura, aceita-se o corte e a dica fica.
- No celular, "Gasto total" tem o rótulo acima da barra (alinhado à esquerda), "Obrigatórias" um nível acima, e o déficit abaixo.
- Contêiner focável (`tabindex="0"`, `role="region"`, `aria-label` descritivo). Dica "arraste →" que some na primeira rolagem e
  não depende de hover.
- Alvos de toque ≥ 44 × 44 px: cada rótulo lateral ocupa uma faixa de ≥ 44 px que inclui barra, guia e texto; faixas vizinhas
  não se sobrepõem; o × do painel tem 44 × 44 px. Fonte mínima 11 px.
- Larguras [minha decisão]: layout de desktop a partir de 1100 px de contêiner (largura = min(contêiner, 1200)); abaixo, o
  desenho do celular. Paradas calculadas para a largura visível real; teste estrito a 390 px; 360 px e 768 px são reportados.

### Painel de detalhes

- Abre com clique, toque ou Enter (cada nó é focável). [decidido] O hover de mouse no desktop **não** abre o painel: mostra só uma
  dica flutuante e curta (rótulo, valor, participação), dentro do cartão e da janela, `aria-hidden`, sem mudar o layout nem o
  foco — porque o SVG ocupa ~740 px e o painel ficava abaixo da dobra em notebooks.
- Fica abaixo do SVG, dentro do cartão; vazio, mostra "Clique ou toque num nó para ver os detalhes.". Não é região `aria-live`
  (ele recebe foco). Traz o boletim de origem (`versao_dados`) e o mês-base em todo nó.
- Altura: **desktop** reservada (18 rem, 288 px na fonte padrão, crescendo com a fonte do navegador), para o rodapé não se mover ao abrir, trocar ou fechar; listas longas em duas colunas.
  **Desenho do celular**: altura automática (vazio, só o convite; aberto, cresce até o conteúdo). O SVG nunca se move; rodapé e
  tabela descem, o que é aceitável porque só ocorre depois de uma ação do usuário. [decidido; motivo: como o hover agora só mostra
  a dica, a reserva só se justifica no desktop, e no celular ela deixava ~380 px vazios]
- Ao abrir, a página rola o mínimo: o nó fica inteiro na tela, a pelo menos 16 px do topo, e ao menos 120 px do painel entram.
  Se as duas condições não cabem juntas, o nó vence e o painel mostra o máximo possível (o resto se lê rolando). Medido: a 390 ×
  844, Imposto de Renda fica a 711 px do painel (o limite para caber tudo é 708), e o painel mostra 117 px. [decidido]
- Botão "↑ ver no desenho" (alvo de 44 × 44 px): devolve o foco ao nó e rola até ele; o painel continua aberto. [decidido]
- Foco: o painel só recebe foco por clique, toque ou Enter; hover e foco no nó não abrem o painel. O × devolve o foco ao nó de
  origem; Esc fecha o painel e devolve o foco.
- Conteúdo: rótulo; valor; participação com a base escrita ("6,1% da receita total" para origens, Receita total, Receita líquida
  e repasse; "x% da despesa total" para despesas, Gasto total, Obrigatórias e resultado), calculada do JSON; linhas do RTN como
  código + nome vindos de `linhas` (nunca digitados), com o prefixo "menos" nas de `operacao: "subtrai"` (por exemplo,
  "menos 4.3.05 Benefícios de Prestação Continuada da LOAS/RMV"); para Obrigatórias, "Soma das despesas do grupo obrigatório" e a lista das
  folhas de `estrutura.obrigatorias`; para o déficit, "não inclui juros"; aviso de registro por caixa e por pagamento; mês-base.
- Abaixo do cartão, tabela recolhível com todos os valores, para leitor de tela. [minha decisão]

## Testes

**Vitest** (`web/`), sobre os JSON de `../dados` e `../referencias`, sem importá-los em `web/src`:

1. Grafo de 2025 contra o original: cada nó, o grupo Bolsa Família + Saúde + Demais (≈ 374) e os totais, até a tolerância do
   arquivo; guarda de 18 valores comparados; toda chave da referência existe no grafo; todo nó do grafo está na referência ou
   num grupo; cada valor do grafo é exatamente o do JSON.
2. Identidades: receita total = soma das origens; receita total = repasse + receita líquida; receita líquida + déficit =
   despesa total.
3. Conservação por nó (entradas = valor = saídas) e escala única (espessura ÷ valor igual em todo fluxo de valor > 0, ±1%,
   medida nas duas pontas da faixa), no grafo e na geometria. Contra o erro da tela 1 dos esboços (fluxos com o valor do total):
   cada fluxo do layout tem o mesmo valor do fluxo do grafo com a mesma origem e destino, e espessura = valor do grafo × escala
   (±1%); e um teste de renderização sem navegador (`renderToStaticMarkup` do componente do Sankey de 2025) mede a espessura no
   atributo `d` de cada fluxo desenhado e compara com valor do grafo × escala (±1%). Não há piso mínimo de espessura; se um dia
   houver, será constante declarada e testada.
4. Rótulos sobre os 11 JSON, desktop e celular, com a medição injetada multiplicada por 0,85, 1,00 e 1,25: zero colisões, zero
   rótulos cortados ou a menos de 12 px da borda, toda guia liga a barra ao rótulo do mesmo id, nenhuma guia cruza outra barra
   ou outro rótulo, deslocamento máximo do rótulo em relação ao centro da barra dentro do limite declarado no código (ponto de
   partida: 48 px no desktop e 80 px no celular; no esboço, o pior ano deu 32 px e 63 px). O teste imprime, por ano, o
   deslocamento máximo e a menor distância entre guia e obstáculo, em vez de repetir a folga mínima configurada.
   **Isto é um teste de fumaça:** com escala por ano, cada ano preenche a mesma área. Na fase 3, com escala compartilhada entre
   anos, os mesmos testes rodam de novo e a prova passa a valer de verdade.
5. Altura: o pior ano cabe na constante de cada formato.
6. Paradas do celular a 390 px: nenhum rótulo atravessa as bordas; 360 px e 768 px reportados.
7. Alvos de toque: faixas de rótulos vizinhos não se sobrepõem; todas com ≥ 44 px.
8. Guardas de texto: nenhum rótulo (de `textos.ts` e de `rotulos`) contém "dívida nova" nem "gov.br"; `textos.ts` exporta
   "não inclui juros" e o aviso de independência; `textos.ts` não contém dígitos.
9. Participação: a base escrita corresponde ao papel do nó.
10. Contraste: texto e texto secundário ≥ 4,5:1 contra fundo e fluxos (mistura a 36%), nos dois temas; guias e contorno do
    déficit escuro ≥ 3:1 contra o fundo.

**Medição de texto**: o layout recebe `medirTexto(texto, estilo) → largura` por injeção. Produção: medição no navegador depois
de `document.fonts.ready`, com a família de fonte lida por `getComputedStyle` do próprio texto do SVG (o CSS declara uma pilha
de fontes com fallback), nunca um nome fixo. Vitest: tabela determinística por caractere.

**Playwright** (Chromium), job próprio no CI, contra o site construído em modo de teste: `getBBox` real em 2020 e 2025, desktop e
celular, claro e escuro (rótulos sem sobreposição, a ≥ 12 px da borda, sem corte nas paradas); painel sem pulo de layout ao
abrir, trocar e fechar, e sem cobrir texto; foco (hover não move; × e Esc devolvem ao nó). O parâmetro `?ano=` só existe no
build de teste (`vite build --mode teste`, que o job do Playwright usa); o código do parâmetro carrega a cadeia sentinela
`PARAM_ANO_SO_TESTE`, e uma conferência prova que o bundle de produção não a contém e o de teste contém. Se o job passar de
3 minutos no CI, isso é reportado antes de mantê-lo.

**CI cedo**: depois do esqueleto do site, a branch é empurrada e um PR em rascunho é aberto; cada commit seguinte é empurrado
para o CI rodar; o PR sai do rascunho no fechamento da fase.

**CI**: o job Python não muda. Jobs novos: `site` (npm ci, Vitest, build, conferência do bundle) e `site-navegador`
(Playwright). Node 24 LTS, cache do npm e do Chromium. [minha decisão: versão e cache]

## O que fica para o implementador

Nomes internos de componentes, a tabela de larguras por caractere, os valores exatos das constantes de altura e de deslocamento
(dentro do que o teste prova) e a redação do painel, desde que respeite as regras acima.
