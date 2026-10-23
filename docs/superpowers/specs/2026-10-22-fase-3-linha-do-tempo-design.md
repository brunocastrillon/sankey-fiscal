# Fase 3: linha do tempo (design) — WIP

**Rascunho em andamento durante o brainstorming.** Não é um design aprovado: as telas T2–T6 ainda estão em aberto, e o plano só
é escrito depois da aprovação. Complementa `docs/especificacao.md`, que continua sendo a fonte de verdade de produto e
metodologia.

Marcas: **[decidido]** veio do Bruno; **[minha decisão]** é escolha do implementador, revisável na leitura deste documento.

Os esboços ficam fora do repositório. Foram feitos com uma cópia do layout da fase 2, os números de `dados/*.json` e o medidor
determinístico dos testes (fatores 0,85, 1,00 e 1,25).

## T1 · Escala compartilhada em R$ constantes

### Alinhamento vertical [decidido: A, topo fixo]

O topo da terceira coluna (Repasse + Receita líquida + Déficit) fica numa linha fixa em todos os anos. O desenho cresce para
baixo, e o vazio dos anos menores fica todo embaixo, num lugar só.

| Alinhamento | Salto médio das bordas entre anos vizinhos (desktop) | Maior salto | Observação |
| --- | --- | --- | --- |
| **A. Topo fixo** | 19,7 px | 124 px (folha "Fundeb…", 2019→2020, vem do dado) | escolhido |
| B. Centro fixo | 20,8 px | 128 px (Receita total inteira, 2020→2021) | |
| C. Base fixa | 25,5 px | 177 px (Receita total inteira, 2020→2021) | |
| D. Topo da Receita líquida fixo | 17,3 px | 133 px | exige 775 px de altura e deixa até 205 px vazios |

Com A, nenhuma colisão e nenhum rótulo fora da margem nos 11 anos, nos dois formatos e nos três fatores do medidor.

### Correção da especificação [decidido]

A frase "os fluxos de 2025 ficam finos perto do pico" (casos de borda, "Escala em 2020") é falsa. Em R$ de dez/2025, a maior
coluna em valor é a terceira de 2020 (receita total + déficit). Em pixels, a maior é a das origens de 2025, por causa dos
cinco vãos entre os seis nós. 2020 e 2025 ficam quase da mesma altura.

Texto novo, em essência: "A escala é a da maior coluna da série (hoje, as origens de 2025); os anos menores ficam mais baixos,
e o rótulo do modo R$ diz que a mesma escala vale para todos os anos."

Entra no **mesmo commit da mudança de escala**, em: `docs/especificacao.md` (casos de borda e decisões), este documento e o
`CLAUDE.md` (que hoje diz "aviso na tela para 2020").

### Rótulo do modo R$ [decidido]

O aviso deixa de ser "de 2020" e vira um rótulo geral do modo R$ constantes: "mesma escala para todos os anos", junto de
"R$ constantes de dez/2025 (IPCA)". Texto em `TEXTOS`, sem dígitos; o mês-base vem de `mes_base` do JSON.

### Escala derivada dos dados [decidido]

A escala é calculada a cada build: a menor entre os anos e as colunas de `(alturaBarras − vãos da coluna) / soma da coluna`.
Quando um ano novo for maior que todos, todos os anos encolhem. A linha da âncora também é calculada a cada build (o quanto o
conteúdo sobe acima do topo da terceira coluna no pior ano, mais a margem). [minha decisão: âncora calculada]

### Altura do SVG: constante declarada e testada [decidido]

| Formato | Altura necessária (×0,85 / ×1,00 / ×1,25) | Constante (necessária + 10 px) | Fase 2 |
| --- | --- | --- | --- |
| Desktop 1200 | 736 / 736 / 736 | **746** | 738 |
| Celular 390 | 703 / 714 / 730 | **740** | 727 |

- A folga mínima é de 10 px nos dois formatos, porque na fase 2 a caixa real do texto, na fonte real, saiu maior que a
  modelada. Com a escala compartilhada, a constante 727 do celular não bastaria no fator ×1,25.
- **O que passa por construção:** as barras sempre cabem em `alturaBarras`, porque a escala sai dela. Esse teste sozinho
  não prova nada.
- **A guarda que pode falhar:** (1) a extensão do conteúdo de cada ano (barras, rótulos, alvos de toque, guias), nos três
  fatores, dentro de `[margem, alturaSvg − margem]`; (2) a fila de rótulos lança erro se não couber; (3) as colisões. O relatório
  imprime a folga por formato e fator.
- **Mutações:** `alturaSvg` 20 px menor tem de derrubar teste. Um ano sintético igual a 2025 × 1,3 tem de encolher todos os
  anos e continuar passando, o que prova que a escala é derivada e não fixa.
- **Fim da 3b:** o Playwright, com a fonte real, em 2020 e 2025, desktop e celular, claro e escuro, tem de passar.

### Espessura mínima visível [decidido]

- Constante declarada: **3 px** para qualquer nó com valor positivo. Não é piso: a espessura continua valor × escala. É um
  teste que falha quando a escala encolhe demais.
- Hoje, o nó mais fino é Bolsa Família em 2020: 4,69 px no desktop e 4,24 px no celular.
- Mutações, com anos sintéticos (2025 × k):

| k | Desktop | Celular | Resultado esperado |
| --- | --- | --- | --- |
| 1,3 | 3,60 px | 3,26 px | passa |
| 1,5 | 3,12 px | 2,83 px | falha (no celular) |

## T2 · Superávit primário (2022)

### Posição [decidido: A]

- O superávit é um destino: sai da base da Receita líquida e termina num nó na quarta coluna, logo abaixo do Gasto total. O
  déficit continua origem na terceira coluna, abaixo da Receita líquida.
- **Os dois nós existem em todos os anos**, cada um no seu lugar fixo; o que não se aplica vale zero. Nenhum nó muda de
  coluna nem de ordem entre anos.
- Fluxos: Receita líquida → Gasto total = min(receita líquida, despesa total); Déficit → Gasto total = max(0, −resultado);
  Receita líquida → Superávit = max(0, resultado). A conservação por nó continua valendo em todos os anos, sem exceção.
- Alternativas medidas e descartadas: B (fim da linha, abaixo das Discricionárias: fluxo mais longo para o menor valor; o
  rótulo entrando e saindo da fila da direita faz os vizinhos pularem de 7 a 14 px num quadro) e C (parte de baixo da barra da
  Receita líquida, sem fluxo: quebra a conservação por nó).
- Medido com A (11 anos, 3 fatores): cabe em 746/740 px; zero colisões; maior passo de uma barra 0,71 px por quadro a 60
  quadros por transição.

### Posição do rótulo do superávit [decidido: A′ nos dois formatos]

- O rótulo do superávit fica **no lugar do rótulo do déficit**, sob a Receita líquida (desktop: à esquerda, como o do déficit;
  celular: abaixo, como o do déficit), **nos dois formatos**. Motivo: um só lugar para o rótulo do resultado nos 11 anos (o nó
  tem id neutro; só o texto e o sinal mudam), nenhum salto de rótulo na transição 2021→2022 e um só caminho de código.
  Substitui a posição "à esquerda do nó" que o desktop teria. No celular, junto do nó, o rótulo caía em cima do fluxo verde
  das Discricionárias e parecia pertencer a ele.
- **Guia por regra de distância:** se a caixa do rótulo fica a mais de 12 px do segmento onde o fluxo do superávit nasce
  (borda direita da Receita líquida), o rótulo ganha guia até o nó do superávit (quarta coluna), em L: do meio da base do nó,
  desce até a linha do rótulo e vai até a borda dele. A 12 px ou menos, a guia é opcional. Valem os testes de guia existentes
  (mesmo id, sem cruzar outra barra ou rótulo, ≥ 3 px de guias de outros nós).
- Medido em 2022 (×0,85, ×1,00 e ×1,25): distância de 22,8 px no desktop e 25,2 px no celular → guia nos dois formatos.
- **Teste:** em 2022, nos 3 fatores e nos 2 formatos, o rótulo do superávit não colide com nenhum rótulo, guia, barra nem com o
  fluxo verde (faixa do fluxo amostrada ao longo da curva). Nos outros anos, o rótulo do déficit fica onde está hoje
  (deslocamento 0 px com e sem a emenda; no esboço passa por construção, porque a emenda só toca no superávit, e fica como
  guarda contra um caminho de código único que mova os dois).
- **Mutação:** levar o rótulo do superávit para a posição A (junto do nó) no celular derruba o teste nos 3 fatores (rótulo sobre
  o fluxo verde).

### Texto [decidido]

- Rótulo "Superávit primário", de `TEXTOS.rotulos.superavit`, sem "financiado com dívida", com o valor e a linha secundária
  "não inclui juros" (`TEXTOS.naoIncluiJuros`), como no déficit. Motivo: em 2022 o resultado nominal, com juros, foi negativo;
  sem a linha, o leitor pode entender que "sobrou dinheiro".
- Os testes de guarda de texto continuam: nenhum rótulo com "dívida nova" nem "gov.br"; `textos.ts` sem dígitos.

### Cor e padrão [decidido]

| Papel | Claro | Escuro |
| --- | --- | --- |
| Superávit (pontos no nó e no fluxo) | `#a03c9a` | `#b04aa9` |
| Texto secundário **e guias** (token alterado) | `#4e4d4a` (era `#52514e`) | `#c3c2b7` (sem mudança) |

- Nó: cor cheia com pontos da cor do fundo (85%). Fluxo: a cor a 36% com pontos da cor cheia. O déficit continua vermelho com
  listras diagonais. Nos dois, a cor nunca é o único sinal: padrão, posição e rótulo também mudam.
- Validador de cor, todos os pares, contra as quatro cores de série da fase 2: passa nos dois temas, sem aviso novo; o pior par
  continua o da fase 2.
- Contraste: barra × fundo 5,7:1 (claro) e 3,6:1 (escuro); texto × fluxo do superávit 11,0:1 e 10,2:1; texto secundário ×
  fluxo do superávit 4,74:1 e 6,5:1 (com o token antigo dava 4,45:1 no claro, abaixo do mínimo; pela regra da fase 2,
  escureceu-se o texto, não a cor). Guia de 1,25 px × fundo: 8,2:1 (claro) e 9,7:1 (escuro).
- **Teste de contraste:** percorre a lista EXATA de cores de série que o site usa (lida de `TEMAS`, inclusive o superávit), não
  uma lista escrita à mão. Mutação: acrescentar a `TEMAS` uma cor de série com contraste baixo derruba o teste. O token do texto
  secundário vale também para as guias, e o teste confere a guia contra o fundo nos dois temas.

### Nó com valor zero [decidido]

Em cada ano e formato, o nó de resultado que vale 0 (o superávit em ano de déficit; o déficit em ano de superávit) **não tem**
rótulo, guia, alvo de toque, parada no Tab nem linha na tabela de valores; também não entra na fila de rótulos (no esboço, um
rótulo invisível empurrava o visível em até 120 px). Teste por ano (2021, 2022 e 2023 primeiro, depois os 11), nos dois
formatos; mutação: desenhar o rótulo do nó zero derruba o teste.

### Interpolação do resultado e M5 [decidido]

- A animação interpola o resultado **com sinal** (de −46 para +56 em 2021→2022, em R$ bi constantes): o déficit encolhe até zero e
  só então o superávit nasce do zero. Por isso a M5 dá zero quadros com os dois ao mesmo tempo.
- **Mutação da M5:** interpolar os dois nós separadamente (déficit de 46 a 0 e superávit de 0 a 56, no mesmo t) faz os dois
  aparecerem juntos nos quadros do meio e derruba o teste.
- Espessura mínima de 3 px: vale nos layouts **estáticos** de cada ano, não nos quadros da animação (onde o resultado passa
  por zero).
- Na T4: limiar para o rótulo do resultado aparecer e sumir durante a transição, **com histerese**, para não piscar.

## T3 · Controle de ano e play

### Posição [decidido: A, com o ano em destaque]

- **A:** barra acima do desenho, entre o aviso e o SVG, **não fixa** (nunca cobre o desenho). Tem botão play/pausa, deslizante
  de 2015 a 2025, "Ano: 2020" em texto visível e setas de ano anterior e próximo. Medido no protótipo: barra de 76 px no
  desktop e 153 px no celular. Na primeira tela de um notebook de 1280 × 800 entram 617 dos 746 px do desenho; num celular de
  390 × 844, 546 dos 740.
- **B (barra fixa no topo da janela): vetada**, porque cobre o desenho ao rolar (153 px no celular).
- **C (linha do tempo com o resultado de cada ano como trilho): registrada para a fase 5.**
- **A altura da barra do celular não é reduzida agora:** o seletor de modo da T5 vai nela; a altura final se decide na T5.

### Ano em destaque no vão sob as origens [decidido]

- O ano em texto grande no canto inferior esquerdo do desenho, onde sobra espaço com o alinhamento no topo (T1): **56 px no
  desktop e 44 px no celular**, negrito, na cor do texto, sobre o fundo. No celular, fica na primeira parada e ocupa a faixa
  vazia pendente da fase 2.
- É decorativo (`aria-hidden`). O ano acessível está na barra ("Ano: 2020", texto visível), no deslizante, no `h1` e no
  `document.title`.
- **Folga ≥ 8 px** de qualquer barra, rótulo, guia ou alvo de toque, nos 11 anos × 3 fatores do medidor × 2 formatos. Medido:
  menor folga de 41,5 px (desktop, ×1,25, 2025); no celular, 108,3 px. **Mutações:** fonte 40 px maior, ou o destaque 60 px mais
  alto, derrubam o teste (folga 0 px no desktop).
- Entra na trava do `gerar-og.mjs`: o destaque é mais uma caixa medida, dentro do recorte com a margem e a 8 px dos rótulos;
  senão o script sai com erro e não grava a imagem.

### Comportamento [decidido]

1. **Ano em texto** visível na barra ("Ano: 2020"); o destaque do desenho é `aria-hidden`.
2. **Folga do destaque**, como acima, com mutação, e na trava do `gerar-og.mjs`.
3. **Barra do celular** com a altura de hoje até a T5.
4. **`#ano`:** só anos de `dados/indice.json`. Valor inválido volta ao padrão (último ano) sem erro. `history.replaceState` ao
   trocar de ano (sem encher o histórico); `hashchange` tratado. O `?ano=` do build de teste sai (ajustar `conferir-bundle` e
   a sentinela).
5. **Play:**
   - nunca começa sozinho; para em 2025; em 2025, recomeça de 2015;
   - qualquer interação manual (deslizante, setas, link) pausa; pausa também quando a aba fica oculta (`visibilitychange`);
   - com `prefers-reduced-motion`, troca de ano sem interpolar;
   - botão separado do deslizante, com 44 px; a barra de espaço só aciona o botão quando ele tem o foco;
   - no deslizante valem setas, Home/End e PageUp/PageDown.
6. **Painel aberto + troca de ano:** continua no mesmo nó e atualiza os valores. Se o nó passa a valer zero (o resultado que
   troca de sinal), o painel fecha e o foco volta ao deslizante.
7. **`aria-valuetext`** do deslizante com o ano e o resultado, lidos do JSON ("Ano: 2020, déficit R$ 1.027,4 bi"); nenhum
   anúncio a cada passo do play.
8. **`h1` e `document.title`** acompanham o ano.

## T4 · Transição entre anos

### Decisões [decidido]

- **Rótulos: modo (b)**, acompanham a geometria, com a fila de rótulos recalculada a cada quadro. O valor escrito é o do ano
  mais próximo (troca em t = 0,5), **nunca um valor interpolado**, que seria um número fora dos dados. Alternativas medidas:
  (a) somem e voltam (sem nomes durante ~470 ms dos 700); (c) congelados (rótulo sobre outra barra em 76 quadros no desktop e 56
  no celular, até 152 px longe da própria barra).
- **Duração de 700 ms**, suavização seno de entrada e saída (sem ultrapassagem), **1,3 s de pausa** em cada ano no play.
- **Geometria:** interpolam-se os valores (o resultado com sinal) e o layout é recalculado em cada quadro, com a escala e a
  âncora fixas da T1.
- **A animação é por tempo** (`performance.now()`), não por contagem de quadros: t = (agora − início) / duração. Quadros que o
  navegador pula não atrasam nem aceleram a animação; o número de quadros (42, a 60 por segundo) é nominal.
- **Limite de 6 px por quadro (a 60 quadros/s) para M2(b) e M4.**
  - Justificativa: com a suavização seno, o pico de velocidade é (π/2) × deslocamento ÷ quadros; com 42 quadros, 6 px/quadro
    cobre deslocamentos de até ~160 px em 700 ms.
  - O maior deslocamento medido nos 10 pares é ~124 px (4,64 px/quadro, folha "Fundeb…" no desktop, 2019→2020).
  - **Se um ano futuro exigir mais, aumenta-se a duração, não o limite.**
- **Acessibilidade:** o nome acessível dos nós e o `aria-valuetext` mudam **uma vez**, no início da transição, para o ano de
  destino. Nenhum anúncio por quadro. O foco é preservado durante a transição (o nó focado continua focado).
- **Histerese do rótulo do resultado, com uma só fonte:** o rótulo aparece quando a barra tem ≥ `ESPESSURA_MINIMA` (3 px, a
  mesma constante da espessura mínima estática da T1) e some abaixo de `ESPESSURA_MINIMA − 1` (2 px). Medido: uma troca por
  rótulo e por transição, sem piscar.

### Métricas (10 pares × 2 formatos, 43 quadros por transição)

| Métrica | Critério | Medido |
| --- | --- | --- |
| M1 ancoragem fluxo–nó | ≤ 0,5 px em todo quadro | 2·10⁻⁷ px |
| M2(a) passo relativo | ≤ inclinação do trecho × passo da suavização | 1,000 (no limite) |
| M2(b) passo absoluto | ≤ 6 px/quadro | 4,64 px/quadro |
| M2(c) ultrapassagem | nenhuma coordenada fora do trecho | 0 |
| M3 ordem das faixas | igual à do quadro 0 | 0 quadros diferentes |
| M4 bordas das barras | como M2 | 4,64 px/quadro; 0 ultrapassagens |
| M5 déficit e superávit juntos | 0 quadros | 0 |
| M6 rótulos sem colisão (modo b) | 0 quadros com colisão, 3 fatores | 0 de 2.580 |
| M7 extremos = estático | ≤ 0,01 px | 0 |
| M8 interrupção | ≤ 0,5 px | 0 |
| Movimento reduzido | troca sem interpolar | conferido no protótipo |

- **Correção da M2 (por trechos).** Nos pares em que o resultado troca de sinal (2021→2022 e 2022→2023), três grandezas dobram
  no instante em que o resultado vale zero: déficit = max(0, −r), superávit = max(0, r) e Receita líquida → Gasto total =
  min(receita líquida, despesa total). Em 2022→2023 esse fluxo sobe a 387 px e volta a 380,6 px. É contínuo e sem salto, mas
  não é monotônico: a M2 como escrita antes ("nunca sai do intervalo entre início e fim") dava 328 falhas falsas. **O par é
  cortado onde o resultado vale zero, e M2(a) e M2(c) valem dentro de cada trecho**, onde toda coordenada é afim no progresso.
- **Mutação da suavização:** trocar o seno por uma suavização que ultrapassa o destino (easeOutBack) dá 58.389 ultrapassagens e
  13,46 px/quadro, e derruba M2(b) e M2(c).
- **Mutação da M6:** desligar a fila de rótulos nos quadros intermediários (rótulos laterais no centro da própria barra) dá
  colisão em 2.460 de 2.580 quadros.
- **Por que M2(a), M2(c) e M3 ficam, embora passem por construção.** Com os valores interpolados e o layout recalculado, cada
  coordenada é afim no progresso dentro de cada trecho, e a ordem de empilhamento não muda. As métricas continuam para proteger
  contra uma troca da suavização (a mutação acima), contra suavização diferente entre nó e fluxo e contra ordenação
  recalculada por quadro. M5, M6, M7 e M8 não passam por construção.

### Orçamento de desempenho [meta decidida; critério de medição e estratégia aguardando o Bruno]

Meta: **p95 ≤ 8 ms por quadro** (cálculo + pintura) no Chromium com CPU limitada em 4×; 6× é reportado. A meta não é relaxada.

Medido no protótipo, transição 2019→2020, modo (b), numa página com um só desenho. A 3c repete a medição sobre o componente
real.

| Estratégia por quadro | 1× · p95 de CPU da thread (trace) | × 4 | 4× emulada · p50 / p95 de parede |
| --- | --- | --- | --- |
| Quadro vazio (só agendar e pintar) | 0,21 ms | 0,8 ms | 0,8 / 6,9–8,3 ms |
| SVG remontado (`innerHTML`) | — | — | 15–18 / 44–53 ms |
| SVG com atributos atualizados no lugar | 2,32 desktop · 2,74 celular | **9,3 · 11,0** | 11,6 / 39 desktop · 11,9 / 55 celular |
| SVG com atributos e quadros pré-calculados | — | — | 10–11 / 29–31 ms (cálculo ≈ 0) |
| Canvas durante a transição | 1,00 · 1,32 | **4,0 · 5,3** | 4,8 / 22 · 3,7 / 9 |
| Canvas com quadros pré-calculados | 0,74 · 0,70 | **3,0 · 2,8** | 3,5 / 22 · 2,8 / 17 |

- **O cálculo não é o gargalo** (layout + rótulos: p95 ≤ 4,4 ms a 4×). O custo está no navegador: estilo, layout e montagem da
  pintura do SVG. Por isso **pré-calcular os quadros não basta no SVG** (p95 de 29–31 ms a 4×).
- **O p95 de parede com CPU emulada mede o emulador:** um quadro vazio já dá p95 de 6,9–8,3 ms a 4×, com 0,35 ms de CPU. O
  Chrome emula a CPU lenta pausando a thread, e os eventos que caem sobre uma pausa inflam na cauda.
- **Proposta de critério:** p95 do tempo de CPU da thread principal por quadro, medido pelo trace a 1× e multiplicado pela taxa
  (4×: ≤ 8 ms; 6× reportado), com o p50 de parede a 4× como conferência.
- **Proposta de estratégia:** desenhar os quadros intermediários num `<canvas>` sobreposto, com os quadros calculados uma vez no
  início da transição:
  - mesmas cores, padrões, contornos e rótulos; `aria-hidden`; sem eventos de ponteiro;
  - o SVG do ano de partida fica no DOM por baixo (o foco não se perde) e é trocado pelo do ano de destino no último quadro;
  - pelo critério proposto, cumpre com folga (3,0 e 2,8 ms);
  - a medir na 3c: densidade de pixels 2× e 3× (o canvas pinta de 4 a 9 vezes mais pixels), o quadro final de troca para o SVG
    (um quadro longo de SVG) e a fonte real no canvas.

## Em aberto

- T4: critério de medição do orçamento e canvas durante a transição (propostas acima).
- T5: modos percentuais; altura final da barra do celular com o seletor de modo.
- T6: painel com subcontas e a nota de 2020.
- Dados (3a): PIB do IBGE, subcontas, notas de contexto.
- Sub-fases, critérios de saída e plano.
