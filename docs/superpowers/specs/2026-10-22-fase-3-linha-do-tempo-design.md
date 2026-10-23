# Fase 3: linha do tempo (design)

Posição de 22/10/2026, ao fim do brainstorming (telas T1 a T6). Complementa `docs/especificacao.md`, que continua sendo a
fonte de verdade de produto e metodologia; as mudanças que este documento faz na especificação estão listadas em
"Mudanças na especificação e no CLAUDE.md" e entram nos commits indicados.

Marcas: **[decidido]** veio do Bruno; **[minha decisão]** é escolha do implementador, revisável na leitura deste documento;
**[aberto]** espera decisão do Bruno antes da sub-fase indicada.

Os esboços ficaram fora do repositório. Foram feitos com uma cópia do layout da fase 2, os números de `dados/*.json` e o
medidor determinístico dos testes (fatores 0,85, 1,00 e 1,25); as subcontas, com as funções do pipeline sobre a série
histórica em `entrada/` (só leitura). Os números deste documento são medidas desses esboços; a implementação mede de novo.

## Intenção

Transformar o Sankey de um ano (fase 2) numa linha do tempo de 2015 a 2025: o leitor troca de ano (ou toca o play) e vê as
mesmas colunas, na mesma ordem e na mesma escala, mudarem de espessura, inclusive a troca de déficit para superávit em 2022 e
o pico de 2020. Três modos de leitura (R$ constantes, % da despesa, % do PIB) e um painel que explica o que há dentro dos nós
agregados (subcontas do RTN e notas de contexto).

### Objetivos

- Escala compartilhada entre anos em cada modo, derivada dos dados, com altura fixa e testada.
- Superávit de 2022 desenhado com posição, cor, padrão e rótulo próprios, sem nó que mude de lugar.
- Controle de ano acessível (deslizante, setas, play/pausa, `#ano`), sem autoplay e com movimento reduzido.
- Transição animada entre anos e entre modos, provada por métricas (M1–M8), não por impressão.
- Modos "% da despesa" e "% do PIB", com o PIB do IBGE.
- Painel com subcontas e notas, de altura automática.
- Fechar as pendências da fase 2 listadas abaixo.

### Fora da fase 3 [decidido]

Módulo de financiamento (fase 4), exportação, comparação de dois períodos, visão mensal, a linha do tempo com o resultado de
cada ano como trilho do deslizante (alternativa C da T3, registrada para a fase 5).

### Anti-objetivos [decidido]

Qualquer número fiscal digitado no código, na interface ou nas notas; "dívida nova"; "gov.br" ou marca que sugira origem
oficial; caminho absoluto a partir da raiz do domínio; d3-sankey; afirmação de contexto sem fonte do Tesouro verificada; valor
interpolado escrito na tela; animação ao carregar a página.

## Sub-fases, branches e critérios de saída

| Sub-fase | Conteúdo | Branch e PR | Critério de saída |
| --- | --- | --- | --- |
| **3a · Dados** | PIB do IBGE, subcontas, notas | `fase-3a-dados`, PR próprio a partir da `main` [decidido] | `pytest` verde; prova de escopo (JSON antigos e novos, sem as chaves novas, idênticos); âncoras do PIB; CI verde; mesclado na `main` |
| **3b · Layout** | escala compartilhada, superávit, modos, seleção de ano por hash, sem animação | `fase-3-linha-do-tempo` (PR #17), rebaseada na `main` depois da 3a | Vitest verde com a tabela de métricas por ano e a escala nova; Playwright com a fonte real em 2020, 2022 e 2025, desktop e celular, claro e escuro |
| **3c · Linha do tempo** | controle de ano, play, transição entre anos e entre modos | PR #17 | M1–M8 e o orçamento de desempenho verdes; quadros da transição 2019→2020 e 2021→2022 conferidos |
| **3d · Painel e pendências** | painel com subcontas e notas, pendências da fase 2 | PR #17 | testes do painel; pendências fechadas; revisão final; CI abaixo de 3 minutos |

Pontos de parada [decidido]: fim da 3a; fim da 3b (com a tabela de métricas por ano); fim da 3c (com quadros e métricas);
revisão final. Cada sub-fase começa com os testes que falham.

## 3a · Dados

### PIB do IBGE [decidido: fonte; minha decisão: formato]

- **Fonte:** IBGE, SIDRA, **tabela 1846** "Valores a preços correntes" (Contas Nacionais Trimestrais), variável 585, em milhões
  de reais, Brasil, classificação 11255 "Setores e subsetores", **categoria 90707 "PIB a preços de mercado"**, trimestres do
  1º de 2015 ao 4º de 2025. O PIB anual é a soma dos quatro trimestres.
- **Arquivo de entrada:** CSV baixado do SIDRA pelo Bruno e versionado em `entrada/` (como `tabela1737.csv` do IPCA). Nome:
  `tabela1846.csv`. O pipeline lê o CSV, confere que cada ano tem quatro trimestres e grava em cada `AAAA.json`
  `pib: { "valor_nominal": …, "fonte": "IBGE, Contas Nacionais Trimestrais, tabela 1846", "trimestres": 4, "ultimo_trimestre": … }`.
- **Medido em 22/10/2026 (API do SIDRA, só leitura):** a soma dos trimestres é igual ao PIB implícito no RTN nos 11 anos
  (diferença de 0,000%); déficit/PIB de 2025 = 0,484% pelas duas fontes.
- **Âncoras [minha decisão: tolerâncias]:** em cada um dos 11 anos, resultado primário / PIB do IBGE difere do % do PIB
  publicado na aba 2.2-A do RTN em no máximo **0,01 ponto percentual**; o PIB do IBGE difere do implícito no RTN em no máximo
  **0,5%** (folga para revisões do IBGE entre o boletim e a carga). A A3 (déficit de 2025 = 0,48%) continua.
- **Mutação:** trocar o PIB de um ano pelo do ano anterior derruba a âncora.

### Subcontas [decidido]

- **Regra:** as linhas filhas diretas (aba 1.2) de cada linha que forma o nó; uma linha sem filhas entra como ela mesma; as
  linhas de `subtrai` saem (no Fundeb, a 4.3.05). Grava-se a lista completa no JSON, com valor em R$ constantes e nominal; o
  site mostra **as 5 maiores do ano + "Demais (n linhas)"**, e, se n = 1, mostra a própria linha. [minha decisão: o JSON leva
  todas, o corte em 5 é do site]
- **Formato:** `subcontas: { "<id do nó>": [ { "codigo", "nome", "real", "nominal" }, … ] }`, só para nós com duas ou mais
  subcontas. Hoje são 9 dos 15 nós: Imposto de Renda (3), Contribuição ao INSS (2), Cofins e PIS (2), IOF/IPI/importação (7),
  Royalties, dividendos e outras (12), Repasse (6), Aposentadorias e pensões (2), Demais com controle de fluxo (3), Fundeb,
  seguro-desemprego e outras (19), Discricionárias (9). [minha decisão: todos os nós com subcontas, não só os dois prioritários]
- **Nomes:** os da aba 1.2, normalizados como as `linhas` (fase 2).
- **Teste:** a soma das subcontas fecha com o nó (0,01 milhão) nos 11 anos, em R$ constantes e em nominal; todo código existe
  na aba 1.2; nenhum código de `subtrai` aparece. **Mutação:** incluir a 4.3.05 no Fundeb derruba o teste.
- Medido (2020, R$ constantes de dez/2025): o Fundeb soma R$ 906,9 bi, dos quais R$ 591,9 bi em 4.3.07 Créditos
  Extraordinários e R$ 108,1 bi em 4.3.03 Apoio Fin. EE/MM.

### Notas [decidido]

- **Arquivo `notas.json`** (raiz do repositório, escrito à mão), com duas classes:
  - **`fatos`:** frases derivadas da série do RTN, com todos os valores por marcadores. Podem ser publicadas já.
  - **`contexto`:** afirmações tiradas de uma fonte do Tesouro, que exige publicação, página, endereço e data de verificação;
    sem isso o pipeline **falha**. Só são publicadas com a fonte verificada.
- **Marcadores [minha decisão: sintaxe]:** `{ano}`, `{linha:4.3.07}` (valor anual em R$ constantes), `{total:no}`,
  `{soma:4.4.1.2:04-08}` (soma de meses), `{mes:4.4.1.2:03}`, `{codigo:4.3.07}` e `{nome:4.3.07}`. O pipeline substitui e
  grava em `AAAA.json` `notas: [ { "no", "classe", "texto", "fonte": { … } } ]`.
- **Teste:** o texto de `notas.json` não tem dígitos fora dos marcadores (mutação: um número digitado derruba o teste); cada
  frase comparativa é avaliada contra os dados (por exemplo, a soma de abril a agosto é menor que março); toda linha citada
  por marcador aparece na fonte da nota; uma nota de `contexto` sem os quatro campos da fonte faz o pipeline falhar.
- **Notas iniciais (fatos, 2020):**
  - Fundeb, seguro-desemprego e outras: "Em {ano}, {linha:4.3.07} dos {total:no} deste grupo estão na linha {codigo:4.3.07}
    {nome:4.3.07}, e {linha:4.3.03} na linha {codigo:4.3.03} {nome:4.3.03}. Fundeb e seguro-desemprego, que dão nome ao grupo,
    somam {soma de 4.3.10 e 4.3.01}." Fonte: série histórica do RTN, aba 1.2, linhas 4.3.07, 4.3.03, 4.3.01 e 4.3.10.
  - Bolsa Família: "Em {ano}, a linha {codigo:4.4.1.2} somou {soma:4.4.1.2:04-08} entre abril e agosto, contra
    {mes:4.4.1.2:03} só em março." (R$ 0,6 bi contra R$ 3,6 bi.) Fonte: aba 1.2, linha 4.4.1.2, mensal.
- **Nota de contexto de 2020 (Auxílio Emergencial) [aberto]:** só depois que o Bruno informar o caminho do PDF do boletim do
  RTN de dezembro de 2020 (baixado no navegador, fora do repositório). Extrai-se o texto (pdftotext ou pypdf, fora do
  repositório) e procura-se "Auxílio Emergencial", "Bolsa Família" e "Créditos Extraordinários"; cada afirmação vem com página e
  trecho; o que o PDF não cobrir, a nota não diz. A série histórica não nomeia o Auxílio Emergencial em nenhuma das 27 abas; a
  aba 2.5 tem "m.2.8 Discricionárias – Assistência Social (Créditos Extraordinários)", R$ 295,9 bi correntes em 2020. Pistas
  que não são fonte do Tesouro: relatório do TCU de 2021 que cita o RTN de dez/2020; imprensa sobre os R$ 326 bi do auxílio e
  do BEm.

### Prova de escopo da 3a

JSON antigos e novos, sem as chaves `pib.fonte`/`pib.trimestres`/`pib.ultimo_trimestre`, `subcontas` e `notas`, idênticos
(o `pib.valor_nominal` não muda, como medido). Gerar duas vezes dá JSON idêntico.

## T1 · Escala compartilhada

- **Alinhamento A, topo fixo [decidido]:** o topo da terceira coluna (Repasse + Receita líquida + Déficit) fica numa linha
  fixa; o desenho cresce para baixo e o vazio dos anos menores fica embaixo. Medido: salto médio das bordas entre anos
  vizinhos de 19,7 px (desktop); maior salto de 124 px, na folha "Fundeb…" em 2019→2020, que vem do dado. Alternativas
  descartadas: centro fixo (20,8 px; a Receita total inteira salta 128 px em 2020→2021), base fixa (25,5 px; 177 px), topo da
  Receita líquida (17,3 px, mas 775 px de altura e até 205 px vazios).
- **Escala derivada dos dados a cada build [decidido]:** a menor, entre os anos e as colunas, de `(alturaBarras − vãos da
  coluna) / soma da coluna`. Hoje é ditada pelas origens de 2025. Um ano novo maior faz todos encolherem. A linha da âncora
  também é calculada (o quanto o conteúdo sobe acima do topo da terceira coluna no pior ano, mais a margem). [minha decisão:
  âncora calculada]
- **Altura do SVG, constante declarada e testada [decidido]: 752 px no desktop e 744 no celular** (pior modo + 10 px; ver T5).
  - O que passa por construção: as barras cabem em `alturaBarras`.
  - A guarda: a extensão do conteúdo de cada ano (barras, rótulos, alvos, guias, ano em destaque), nos 3 fatores e nos 3 modos,
    dentro de `[margem, alturaSvg − margem]`; a fila de rótulos lança erro se não couber; colisões.
  - Mutações: `alturaSvg` 20 px menor derruba; ano sintético 2025 × 1,3 encolhe todos e passa.
- **Espessura mínima visível [decidido]:** `ESPESSURA_MINIMA = 3` px para todo nó com valor positivo, nos layouts estáticos
  (não nos quadros da animação). Não é piso: é teste. Hoje o mais fino é Bolsa Família 2020 (4,69 px desktop, 4,24 celular, no
  modo R$). Mutações: ano sintético 2025 × 1,5 derruba (2,83 px no celular); 2025 × 1,3 passa.
- **Rótulo do modo R$ [decidido]:** "R$ constantes de dez/2025 (IPCA) · mesma escala para todos os anos", em `TEXTOS`, sem
  dígitos (o mês-base vem de `mes_base`). O "aviso de 2020" deixa de existir.

## T2 · Superávit primário

- **Posição A [decidido]:** o superávit é destino: sai da base da Receita líquida e termina num nó na quarta coluna, logo
  abaixo do Gasto total. O déficit continua origem, na terceira coluna, abaixo da Receita líquida. **Os dois nós existem em
  todos os anos**, cada um no seu lugar; o que não se aplica vale zero. Fluxos: Receita líquida → Gasto total =
  min(receita líquida, despesa total); Déficit → Gasto total = max(0, −resultado); Receita líquida → Superávit =
  max(0, resultado). A conservação por nó vale em todos os anos. Descartadas: B (fim da linha: fluxo mais longo para o menor
  valor; a fila da direita pula de 7 a 14 px por quadro) e C (parte da barra da Receita líquida sem fluxo: quebra a
  conservação).
- **Um nó lógico, duas posições [minha decisão, para conciliar "id neutro" com a posição A]:** o grafo continua com um só nó
  `resultado_primario` (magnitude; sinal em `Grafo.resultado`, como na fase 2). O layout tem duas posições fixas para ele: a do
  déficit (terceira coluna) e a do superávit (quarta coluna). Desenha a que se aplica; a outra fica com altura zero e segue a
  regra do "nó com valor zero". Durante a animação, as duas posições são calculadas em todo quadro a partir do resultado com
  sinal. Painel, Tab e tabela tratam o resultado como um só nó.
- **Rótulo A′ nos dois formatos [decidido]:** no lugar do rótulo do déficit, sob a Receita líquida (desktop à esquerda,
  celular abaixo). Um só lugar para o rótulo do resultado; o nó tem id neutro, só o texto e o sinal mudam.
  - **Guia por regra de distância:** a mais de 12 px do segmento onde o fluxo do superávit nasce, o rótulo ganha guia em L até
    o nó do superávit. Medido: 22,8 px (desktop) e 25,2 px (celular) → guia nos dois.
  - **Teste:** em 2022, 3 fatores × 2 formatos, o rótulo não colide com rótulo, guia, barra nem com o fluxo verde (faixa
    amostrada); nos outros anos o rótulo do déficit fica onde está. **Mutação:** o rótulo junto do nó, no celular, cai sobre o
    fluxo verde e derruba o teste.
- **Texto [decidido]:** "Superávit primário" (`TEXTOS.rotulos.superavit`), sem "financiado com dívida", com o valor e "não
  inclui juros". Guardas de texto continuam ("dívida nova", "gov.br", dígitos em `textos.ts`).
- **Cor e padrão [decidido]:**

| Papel | Claro | Escuro |
| --- | --- | --- |
| Superávit (pontos no nó e no fluxo) | `#a03c9a` | `#b04aa9` |
| Texto secundário **e guias** (token alterado) | `#4e4d4a` (era `#52514e`) | `#c3c2b7` |

Nó: cor cheia com pontos da cor do fundo; fluxo: a cor a 36% com pontos da cor cheia. O validador de cor passa nos dois temas,
todos os pares, sem aviso novo. Contrastes: barra × fundo 5,7:1 e 3,6:1; texto secundário × fluxo do superávit 4,74:1 e 6,5:1
(com o token antigo, 4,45:1); guia de 1,25 px × fundo 8,2:1 e 9,7:1. **O teste de contraste percorre a lista exata de cores de
série de `TEMAS`** (inclusive o superávit); mutação: uma cor de série com contraste baixo em `TEMAS` derruba.

- **Nó com valor zero [decidido]:** sem rótulo, guia, alvo de toque, parada no Tab, linha na tabela de valores, nem lugar na
  fila de rótulos. Teste por ano (2021, 2022, 2023, depois os 11), nos dois formatos; mutação: desenhar o rótulo do nó zero.

## T3 · Controle de ano e play

- **Barra acima do desenho, não fixa, com o ano em destaque [decidido].** Barra fixa (B) vetada; linha do tempo com o resultado
  de cada ano (C) para a fase 5.
- **Ano em destaque:** 56 px (desktop) e 44 px (celular), negrito, cor do texto, canto inferior esquerdo do desenho, no vão sob
  as origens; `aria-hidden`. Folga ≥ 8 px de barra, rótulo, guia e alvo nos 11 anos × 3 fatores × 2 formatos × 3 modos (menor
  medida: 41,5 px). Mutações: fonte 40 px maior; 60 px mais alto. Entra na trava do `gerar-og.mjs`.
- **Comportamento:**
  1. "Ano: 2020" em texto visível na barra.
  2. `#ano`: só anos de `dados/indice.json`; inválido volta ao último ano sem erro; `history.replaceState` ao trocar; `hashchange`
     tratado. O `?ano=` do build de teste sai (ajustar `conferir-bundle` e a sentinela).
  3. Play: nunca sozinho; para em 2025; em 2025 recomeça de 2015; interação manual pausa; pausa com a aba oculta; com
     `prefers-reduced-motion`, troca sem interpolar. Botão próprio de 44 px; barra de espaço só no botão focado; no deslizante,
     setas, Home/End e PageUp/PageDown.
  4. Painel aberto + troca de ano: mesmo nó, valores atualizados; se o nó passar a valer zero, o painel fecha e o foco volta ao
     deslizante.
  5. `aria-valuetext` com ano e resultado, do JSON ("Ano: 2020, déficit R$ 1.027,4 bi"); sem anúncio a cada passo do play.
  6. `h1` e `document.title` acompanham o ano.
- **Celular:** a barra tem play, "Ano", setas, o deslizante, o seletor de modo (T5) e uma frase curta; 201 px; 498 dos 744 px do
  desenho na primeira tela de 844 px. A legenda longa vai para baixo do desenho. [decidido: com a frase curta]

## T4 · Transição

- **Rótulos no modo (b) [decidido]:** acompanham a geometria, com a fila recalculada a cada quadro; o valor escrito é o do ano
  mais próximo (troca em t = 0,5), nunca um valor interpolado.
- **Movimento [decidido]:** 700 ms; suavização seno (sem ultrapassagem); 1,3 s de pausa por ano no play; interpolam-se os
  valores (o resultado **com sinal**) e o layout é recalculado em cada quadro, com escala e âncora fixas. A animação é **por
  tempo** (`performance.now()`), não por contagem de quadros.
- **Limite de 6 px por quadro (a 60 quadros/s) [decidido]:** pico de velocidade = (π/2) × deslocamento ÷ quadros; com 42
  quadros, cobre ~160 px em 700 ms; o maior deslocamento medido é ~124 px (4,64 px/quadro). Se um ano futuro exigir mais,
  **aumenta-se a duração, não o limite**.
- **Acessibilidade [decidido]:** o nome acessível dos nós e o `aria-valuetext` mudam uma vez, no início da transição, para o
  ano de destino; nenhum anúncio por quadro; o foco é preservado.
- **Histerese do rótulo do resultado [decidido]:** aparece com ≥ `ESPESSURA_MINIMA` (3 px) e some abaixo de
  `ESPESSURA_MINIMA − 1` (2 px); uma só constante para a regra estática e para a histerese.
- **Troca de modo:** a mesma transição, interpolando em pixels (valor × escala de cada modo).

### Métricas (10 pares × 2 formatos × 3 modos)

| Métrica | Critério | Medido no esboço (modo R$) |
| --- | --- | --- |
| M1 ancoragem fluxo–nó | ≤ 0,5 px em todo quadro | 2·10⁻⁷ px |
| M2(a) passo relativo | ≤ inclinação do trecho × passo da suavização | 1,000 |
| M2(b) passo absoluto | ≤ 6 px/quadro | 4,64 |
| M2(c) ultrapassagem | nenhuma coordenada fora do trecho | 0 |
| M3 ordem das faixas | igual à do quadro 0 | 0 |
| M4 bordas das barras | como M2 | 4,64; 0 |
| M5 déficit e superávit juntos | 0 quadros | 0 |
| M6 rótulos sem colisão | 0 quadros, 3 fatores | 0 de 2.580 |
| M7 extremos = estático | ≤ 0,01 px | 0 |
| M8 interrupção | ≤ 0,5 px | 0 |
| Movimento reduzido | troca sem interpolar | conferido |

- **M2 por trechos:** nos pares com troca de sinal (2021→2022, 2022→2023), o par é cortado onde o resultado vale zero (lá,
  max(0, ±r) e min(receita líquida, despesa) dobram); M2(a) e M2(c) valem em cada trecho. Sem o corte, 328 falhas falsas.
- **Mutações:** suavização que ultrapassa o destino (easeOutBack: 58.389 ultrapassagens, 13,46 px/quadro); interpolar déficit e
  superávit separadamente (derruba M5); fila de rótulos desligada nos quadros intermediários (colisão em 2.460 de 2.580).
- M2(a), M2(c) e M3 passam por construção com valores interpolados e layout recalculado; ficam como proteção contra troca da
  suavização, suavização diferente entre nó e fluxo e ordenação recalculada por quadro. M5–M8 não passam por construção.

### Orçamento de desempenho

Meta [decidido]: **p95 ≤ 8 ms por quadro** (cálculo + pintura) com CPU limitada em 4×; 6× reportado. A meta não é relaxada.

| Estratégia por quadro (esboço, 2019→2020) | 1× · p95 de CPU da thread (trace) | × 4 | 4× emulada · p50 / p95 de parede |
| --- | --- | --- | --- |
| Quadro vazio | 0,21 ms | 0,8 | 0,8 / 6,9–8,3 ms |
| SVG com atributos atualizados | 2,32 desktop · 2,74 celular | 9,3 · 11,0 | 11,6 / 39 · 11,9 / 55 |
| SVG com atributos, quadros pré-calculados | — | — | 10–11 / 29–31 |
| Canvas | 1,00 · 1,32 | 4,0 · 5,3 | 4,8 / 22 · 3,7 / 9 |
| Canvas, quadros pré-calculados | 0,74 · 0,70 | 3,0 · 2,8 | 3,5 / 22 · 2,8 / 17 |

- O cálculo não é o gargalo; o custo está em estilo, layout e pintura do SVG, e pré-calcular não basta no SVG.
- O p95 de parede com CPU emulada mede o emulador (quadro vazio: p95 de 6,9–8,3 ms com 0,35 ms de CPU).
- **[aberto, antes da 3c] Critério de medição:** proposta de p95 do tempo de CPU da thread principal por quadro (trace a 1×),
  multiplicado pela taxa, com o p50 de parede a 4× como conferência.
- **[aberto, antes da 3c] Estratégia:** proposta de desenhar os quadros intermediários num `<canvas>` sobreposto (`aria-hidden`,
  sem eventos de ponteiro, mesmas cores, padrões e rótulos), com os quadros calculados uma vez no início; o SVG do ano de
  partida fica no DOM por baixo (o foco não se perde) e é trocado pelo de destino no último quadro. A medir na 3c: densidade de
  pixels 2× e 3×, o quadro final de troca para o SVG e a fonte real no canvas.

## T5 · Modos percentuais

- **Bases [decidido]:** "% da despesa" sobre R$ constantes de dez/2025 (os números do painel; teste: rótulo × despesa total ≈
  valor em R$ constantes, 0,05 p.p., 11 anos × todos os nós; mutação nominal sobre nominal: 0,418 p.p.). "% do PIB" com valores
  correntes sobre o PIB corrente (âncora A3).
- **Escalas [decidido]:** fixas nos dois modos. Em "% da despesa", 100% tem a mesma altura em todos os anos (415 px desktop, 376
  celular). Em "% do PIB", a escala é a mesma entre anos (2020 aparece maior que 2025).
- **Altura do SVG:** 752/744 (o "% do PIB" com escala fixa precisa de 742/734). As colunas não mudam de lugar entre modos; a
  largura reservada aos rótulos laterais é a maior entre os três modos e os 11 anos.

| Modo (escala fixa) | Altura necessária (3 fatores) | Nó mais fino | Colisões | Folga do ano em destaque |
| --- | --- | --- | --- | --- |
| R$ constantes | 736 / 730 | 4,69 / 4,24 px | 0 | 47,1 / 112,3 px |
| % da despesa | 702 / 715 | 4,02 / 3,64 px | 0 | 47,1 / 106,1 px |
| % do PIB | 742 / 734 | 4,77 / 4,34 px | 0 | 137,8 / 193,0 px |

- **Rótulos [decidido]:** "% da despesa" com uma casa; "% do PIB" com duas (teste: déficit de 2025 = 0,48% e superávit de 2022
  = 0,46%, diferentes; mutação: uma casa). A frase "A receita total inclui o repasse a estados e municípios, que não é despesa
  do Governo Central; por isso pode passar do gasto total." vale nos dois modos percentuais (`TEXTOS`).
- **Seletor [decidido]:** três botões de rádio de 44 px depois dos controles de ano. Desktop: legenda longa na barra. Celular:
  seletor numa linha com os nomes completos (13 px, nenhum cortado; rótulos curtos só se a fonte ficasse abaixo de 11 px), frase
  curta na barra, legenda longa abaixo do desenho (12 px).
- **Painel nos modos:** valor em R$ constantes, participação no modo atual com a base escrita e participação padrão.

## T6 · Painel

- **Altura automática no desktop e no celular [decidido]. Revoga a altura reservada da fase 2 (18 rem).** O desenho fica acima
  e nunca se move; o rodapé desce depois de uma ação deliberada (clique, toque ou Enter). Estado vazio: só o convite (~56 px).
- **Desktop:** duas colunas, com resumo, participações, "↑ ver no desenho" e notas à esquerda, e subcontas e "Linhas do RTN" à
  direita. **Celular:** uma coluna, na mesma ordem, sem as minibarras. Medido (Fundeb 2020): 346 px no desktop e 763 no
  celular, com fonte a 100%; nenhuma rolagem interna a 100%, 125% e 200%.
- **"Linhas do RTN (n)" sempre visível**, com a operação ("menos 4.3.05 Benefícios de Prestação Continuada da LOAS/RMV"). Se
  algo recolher, chevron visível e foco por teclado.
- **Tabela de subcontas:** cabeçalho com "Código", "Linha do RTN", "Valor" e "% do nó"; a do Fundeb diz que exclui a 4.3.05;
  "Demais (n linhas)"; "Soma das subcontas … (fecha com o nó)". Ordem: valor decrescente no ano.
- **Testes:**
  - SVG e título parados (coordenadas da página) ao abrir, trocar de nó e fechar, nos 11 anos.
  - O painel nunca tem rolagem interna (`scrollHeight ≤ clientHeight`) com fonte a 100%, 125% e 200%.
  - Depois de abrir, o título e o valor do painel ficam dentro da janela a 1280 × 720 (`scrollIntoView({ block: 'nearest' })`).
  - Mutação: limitar a altura do painel derruba o teste.

## Pendências da fase 2 [decidido: entram na fase 3]

| Pendência | Sub-fase |
| --- | --- |
| Primeira parada do celular em 2020 com faixa vazia | 3b (escala compartilhada) e 3c (ano em destaque ocupa o vão) |
| `?ano=` do build de teste sai quando a linha do tempo existir; ajustar `conferir-bundle` e a sentinela | 3b (hash) |
| Reserva de 288 px do painel | 3d (revogada: altura automática) |
| "Ver os valores em tabela" sem chevron; foco por teclado | 3d |
| Foco perdido ao trocar de formato (mesmo invólucro nos dois formatos) | 3d |
| `quebrarPorLargura` perde o hífen de uma palavra que começa com hífen | 3b |
| Checagem de tipos em `web/e2e/` e `playwright.config.ts` | 3b |
| `PLAYWRIGHT_BASE_URL` para teste de fumaça contra a URL publicada | 3d |
| Estilo: `a =json.dumps` em `testes.py`; `.replace(/(/g, '(')` sem efeito em `painel-render.test.tsx` | 3a (Python) e 3d (web) |
| Rótulos sobre os 11 anos com a escala compartilhada (a prova passa a valer) | 3b |

## Mudanças na especificação e no CLAUDE.md

| Mudança | Onde | Commit |
| --- | --- | --- |
| A escala é a da maior coluna da série (hoje, as origens de 2025); remove "os fluxos de 2025 ficam finos perto do pico" e o "aviso na tela para 2020" | `docs/especificacao.md` (casos de borda e decisões), `CLAUDE.md` | o da mudança de escala (3b) |
| Escala fixa nos modos percentuais (remove "escala própria por ano nos modos percentuais"); bases dos percentuais | `docs/especificacao.md` (regras do frontend, modos de leitura) | o dos modos (3b) |
| PIB do IBGE carregado (tabela 1846); remove "Em aberto: carregar a série do PIB" | `docs/especificacao.md`, `CLAUDE.md` | o do PIB (3a) |
| Painel com altura automática no desktop (revoga a decisão da fase 2) | `docs/especificacao.md` (decisões, painel) | o do painel (3d) |
| Superávit: posição, rótulo, cor e padrão; token do texto secundário | `docs/especificacao.md` (casos de borda, temas) | o do superávit (3b) |
| Estado: fase 3 concluída | `CLAUDE.md` | fechamento (3d) |

## Decisões em aberto

1. **Antes da 3c:** critério de medição do orçamento de desempenho e canvas durante a transição (propostas acima).
2. **Na 3a ou depois:** nota de contexto de 2020, que depende do PDF do boletim de dez/2020 (caminho a informar pelo Bruno).
3. **Antes da 3a:** o CSV da tabela 1846 em `entrada/` (o Bruno baixa).

## Outras escolhas [minha decisão]

- **Padrões ao carregar:** último ano do índice e modo R$ constantes. O modo não vai para o endereço (só `#ano`).
- **Tabela de valores** (abaixo do cartão): valor em R$ constantes e a participação no modo atual, com a base escrita; o nó de
  valor zero não aparece.
- **Notas:** aparecem só no painel do nó e do ano a que se referem; o desenho não ganha marcador.
- **Imagem de compartilhamento (`gerar-og.mjs`):** último ano, modo R$, tema claro, com o ano em destaque dentro da trava.
- **Esboços como referência:** os números deste documento vêm dos esboços; os testes da implementação medem de novo e
  substituem estes números no relatório de cada sub-fase.

## O que fica para o implementador

Nomes internos de componentes e funções, a sintaxe exata dos marcadores das notas (dentro do que o teste prova), a tabela de
larguras por caractere, a redação do painel e das legendas (respeitando as regras acima), e a organização dos testes em
arquivos.
