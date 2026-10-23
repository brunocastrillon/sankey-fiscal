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

## Métricas da animação (proposta; duração e N fecham na T4)

Sobre os quadros de cada transição: 10 pares de anos vizinhos, dois formatos, três modos.

- **M1 · Ancoragem fluxo–nó, em todo quadro.** Em cada nó, as faixas de saída cobrem a barra de ponta a ponta, contíguas, sem
  vão nem sobreposição: |Σ espessuras − altura da barra| ≤ 0,5 px, e cada faixa começa onde a anterior termina (±0,5 px). O
  mesmo vale para as entradas.
- **M2 · Continuidade dos fluxos entre quadros.** Para cada fluxo, cada um dos quatro cantos (saída topo e base, entrada topo e
  base): (a) o deslocamento entre quadros consecutivos é ≤ (deslocamento total do canto no par) / N × (1 + ε); (b) é ≤ um limite
  em px por quadro, a 60 quadros/s, com a duração definida na T4; (c) não há ultrapassagem: o canto nunca sai do intervalo entre
  o valor inicial e o final.
- **M3 · Ordem estável.** A ordem das faixas em cada lado de cada nó é a mesma em todos os quadros (nenhum fluxo cruza outro do
  mesmo nó).
- **M4 · Bordas das barras.** O mesmo critério de M2 para y0 e y1 de cada barra.
- **M5 · Troca déficit ↔ superávit (2021→2022→2023).** O fluxo do déficit e o do superávit nunca têm espessura > 0 no mesmo
  quadro; a espessura de cada um vai monotonicamente até zero e a partir de zero.
- **M6 · Rótulos.** Nenhuma colisão em nenhum quadro (depende da alternativa escolhida na T4).
- **M7 · Extremos iguais ao estático.** O quadro 0 e o quadro final de cada transição são idênticos ao layout estático de cada
  ano (erro ≤ 0,01 px em toda coordenada).
- **M8 · Interrupção.** Ao trocar de ano no meio de uma transição, o primeiro quadro novo coincide com o último desenhado
  (erro ≤ 0,5 px).
- **Movimento reduzido.** Com `prefers-reduced-motion: reduce`, nenhuma interpolação: a troca de ano desenha direto o layout do
  ano novo. Há teste para isso.

**Por que M2 e M3 ficam, embora passem por construção.** Com interpolação linear da geometria, a ordem de empilhamento é a
mesma nos dois anos e cada coordenada anda em linha reta. Então M2(a), M2(c) e M3 passam por construção. Elas continuam para
proteger contra uma troca futura da função de suavização (por exemplo, uma que ultrapassa o destino e volta), contra easing
diferente entre nó e fluxo, e contra ordenação recalculada por quadro. Cada métrica tem uma mutação que a derruba. M5, M7 e M8
não passam por construção.

## Em aberto

- T2: superávit de 2022 (posição, rótulo, cor e padrão, transição).
- T3: controle de ano e play, em desktop e celular; primeira parada do celular.
- T4: transição 2019→2020, rótulos durante a animação, duração e N.
- T5: modos percentuais.
- T6: painel com subcontas e a nota de 2020.
- Dados (3a): PIB do IBGE, subcontas, notas de contexto.
- Sub-fases, critérios de saída e plano.
