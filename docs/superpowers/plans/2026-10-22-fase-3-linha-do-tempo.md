# Fase 3: linha do tempo — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIO: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans,
> tarefa por tarefa. Passos com caixas (`- [ ]`) para acompanhar.

**Objetivo:** Sankey do Governo Central de 2015 a 2025 com escala compartilhada, superávit de 2022, três modos de leitura,
controle de ano com transição animada e painel com subcontas e notas.

**Arquitetura:** o pipeline em Python ganha PIB do IBGE, subcontas e notas no `AAAA.json` (3a, PR próprio). O site carrega os
11 anos no início, calcula uma escala e uma âncora por modo e formato (funções puras em `web/src/layout/`), desenha um ano por
vez com o layout da fase 2 estendido (3b) e anima as trocas interpolando os valores e recalculando o layout a cada quadro
(`web/src/animacao/`, 3c). O painel passa a ter altura automática (3d).

**Pilha:** Python 3.12 + pandas + pytest; Vite 8 + React 19 + TypeScript 7; Vitest 5; Playwright 1.64.

**Especificação:** `docs/superpowers/specs/2026-10-22-fase-3-linha-do-tempo-design.md` (o design) e `docs/especificacao.md`.
Quem executa lê os dois. Números citados aqui (alturas, folgas, medidas) vêm do design.

## Restrições globais

- Nenhum número fiscal digitado no código, na interface ou nas notas; valores vêm de `dados/*.json`. `textos.ts` sem dígitos.
- "Déficit primário (financiado com dívida)"; nunca "dívida nova"; nada de "gov.br".
- Caminhos sob `/sankey-fiscal/` (`import.meta.env.BASE_URL`), nunca da raiz do domínio.
- Mudou o pipeline: `pytest -q` e `python pipeline.py` no mesmo commit; os JSON de `dados/` nunca à mão (o CI compara).
- Texto de interface, documentação e identificadores de domínio em português do Brasil.
- Commits pequenos, mensagem em português no imperativo (`feat:`, `fix:`, `docs:`, `test:`), e-mail noreply do Bruno, com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `main` protegida: tudo por PR, com `validacoes`, `site` e `site-navegador` verdes. 3a em `fase-3a-dados` (PR próprio);
  3b–3d em `fase-3-linha-do-tempo` (PR #17), rebaseada na `main` depois da 3a.
- Teste antes do código; cada teste novo com uma mutação que o derruba, mostrada no relatório da tarefa.
- Medidor injetado; fatores 0,85/1,00/1,25; Playwright com a fonte real; CI abaixo de 3 minutos (reportar se passar).
- Cor nunca é o único sinal; texto ≥ 4,5:1 contra todos os fundos, nos dois temas.
- Alturas do SVG: `DESKTOP.alturaSvg = 752`, `CELULAR.alturaSvg = 744`. `ESPESSURA_MINIMA = 3`. Limite de 6 px/quadro.
  Duração 700 ms; pausa do play 1,3 s.

## Foco de revisão

Entradas que o design implica e que nenhum teste de tarefa cobriria sozinho; cada uma ganhou um teste na tarefa dona.

1. **`#ano` malformado** (`#1999`, `#abc`, `#2020x`, `#` vazio, `#02020`): abre o último ano, sem erro no console (Tarefa B5).
2. **Troca de ano rápida e repetida** (Home, End, setas seguidas durante o play ou no meio de uma transição): uma só animação
   por vez, e o estado final é o último ano pedido (Tarefa C5).
3. **Ano novo maior que todos** (um 2026 sintético): a escala encolhe, nada sai da margem, a espessura mínima avisa quando cair
   abaixo de 3 px (Tarefa B2).
4. **Formato trocado (cruzar 1100 px) com painel aberto ou no meio de uma transição:** o foco e o nó escolhido sobrevivem, a
   transição termina no ano pedido (Tarefa D3).
5. **Nó de resultado que vale zero alcançado pelo teclado** (Tab em 2022, onde o déficit vale zero): não existe parada; a tabela
   não tem a linha (Tarefa B3).

---

## 3a · Dados (branch `fase-3a-dados`, PR próprio a partir da `main`)

Pré-requisito: o Bruno coloca `entrada/tabela1846.csv` (SIDRA, tabela 1846, variável 585, Brasil, categoria 90707 "PIB a
preços de mercado", trimestres 1º/2015 a 4º/2025, CSV) — ver o design, "PIB do IBGE".

### Tarefa A1: PIB do IBGE

**Arquivos:**
- Modificar: `pipeline.py` (`entradas_padrao`, `montar_anos`, novo `ler_pib_ibge`; `--pib` no `argparse`)
- Modificar: `testes.py` (`a3_pib`, novos `t13_pib_ibge`, `a4_pib_ancora`, `lista_testes`; estilo `a =json.dumps` → `a = json.dumps`)
- Modificar: `entrada/LEIAME.md`, `README.md` (formato do `AAAA.json`), `docs/especificacao.md` e `CLAUDE.md` (o "Em aberto" do PIB sai)
- Regenerar: `dados/*.json`

**Interfaces:**
- Produz: `ler_pib_ibge(csv: str) -> tuple[pd.Series, str]` (PIB anual em R$ milhões indexado por ano, soma de 4 trimestres;
  e o último trimestre do arquivo, `"2025T4"`); `entradas_padrao() -> tuple[str | None, str, str]` (rtn, ipca, pib).
- `AAAA.json` → `pib: { valor_nominal, fonte: "IBGE, Contas Nacionais Trimestrais, tabela 1846", trimestres: 4, ultimo_trimestre }`.

- [ ] **Passo 1: Testes que falham.** Em `testes.py`:
  - `t13_pib_ibge(pib_csv)`: cada ano de 2015 a 2025 tem 4 trimestres; nenhum valor nulo; ok se os 11 anos estão completos.
  - `a4_pib_ancora(c, rtn, pib_csv)`: para cada ano, |primário/PIB IBGE × 100 − aba 2.2-A linha 5| ≤ 0,01 p.p. e
    |PIB IBGE / PIB implícito − 1| ≤ 0,005; o detalhe imprime a maior diferença de cada um.
  - `a3_pib` passa a usar o PIB do IBGE (déficit de 2025 arredondado = 0,48%).
- [ ] **Passo 2:** `pytest -q -k "T13 or A4"` → FALHA (`ler_pib_ibge` não existe).
- [ ] **Passo 3:** implementar `ler_pib_ibge` (CSV do SIDRA com `;`, como o do IPCA; agrupar por ano; exigir 4 trimestres) e
  gravar o bloco `pib` novo em `montar_anos`. `pib_implicito` continua para a âncora.
- [ ] **Passo 4:** `pytest -q` → todos passam; mutação: trocar o PIB de 2020 pelo de 2019 dentro de `a4_pib_ancora` (localmente,
  sem commit) → A4 FALHA; desfazer.
- [ ] **Passo 5: Prova de escopo.** `python pipeline.py --saida /tmp/novos`; script de uma linha que compara `dados/` e
  `/tmp/novos/` sem `pib.fonte`, `pib.trimestres` e `pib.ultimo_trimestre` → idênticos (inclusive `pib.valor_nominal`).
- [ ] **Passo 6:** `python pipeline.py`; `pytest -q`; commit `feat: carrega o PIB do IBGE (SIDRA 1846) no pipeline`.

### Tarefa A2: Subcontas

**Arquivos:**
- Modificar: `pipeline.py` (novo `montar_subcontas`; `montar_anos` grava `subcontas`)
- Modificar: `testes.py` (`t14_subcontas_fecham`, `t15_subcontas_codigos`)
- Modificar: `README.md` (formato)
- Regenerar: `dados/*.json`

**Interfaces:**
- Consome: `ler_rtn_mensal`, `ler_nomes_linhas`, o fator de deflação já calculado em `montar_anos`.
- Produz: `montar_subcontas(mapa: dict, M: pd.DataFrame, fator: pd.Series, nomes: dict) -> dict[int, dict[str, list[dict]]]`
  (ano → id do nó → `[{codigo, nome, real, nominal}]`, valores em R$ milhões, 3 casas). Regra: filhas diretas (aba 1.2) de
  cada linha de `soma` do nó; linha sem filhas entra como ela mesma; códigos de `subtrai` saem; só nós com ≥ 2 subcontas;
  ordem: a da aba 1.2.
- `AAAA.json` → `subcontas: { "<id>": [ … ] }`.

- [ ] **Passo 1: Testes que falham.**
  - `t14_subcontas_fecham(c, rtn, ipca)`: para os 11 anos, cada nó com subcontas, |Σ real − nó real| ≤ 0,01 e |Σ nominal − nó
    nominal| ≤ 0,01; o Fundeb tem 19 subcontas e não contém `4.3.05`; 10 nós têm subcontas (lista no design).
  - `t15_subcontas_codigos(c, rtn)`: todo código existe na aba 1.2 com nome não vazio; nenhum é de `subtrai`.
- [ ] **Passo 2:** `pytest -q -k "T14 or T15"` → FALHA.
- [ ] **Passo 3:** implementar `montar_subcontas` e gravar.
- [ ] **Passo 4:** `pytest -q` → passa; mutação: não tirar os códigos de `subtrai` → T14 e T15 FALHAM; desfazer.
- [ ] **Passo 5:** prova de escopo (sem `subcontas`, idênticos); `python pipeline.py`; commit
  `feat: grava as subcontas do RTN por nó`.

### Tarefa A3: Notas (fatos)

**Arquivos:**
- Criar: `notas.json` (raiz)
- Modificar: `pipeline.py` (novos `carregar_notas`, `aplicar_notas`; `montar_anos` grava `notas`)
- Modificar: `testes.py` (`t16_notas_sem_digitos`, `t17_notas_comparacoes`, `t18_notas_fontes`)
- Modificar: `README.md`
- Regenerar: `dados/*.json`

**Interfaces:**
- `notas.json`: `[{ "ano", "no", "classe": "fatos" | "contexto", "texto", "comparacoes": [["<marcador>", "<", "<marcador>"]],
  "fonte": { "titulo", "linhas": [...] } | { "publicacao", "pagina", "endereco", "verificado_em" } }]`. Marcadores do design:
  `{ano}`, `{linha:COD}`, `{total:no}`, `{soma:COD:MM-MM}`, `{mes:COD:MM}`, `{codigo:COD}`, `{nome:COD}`, e
  `{soma:COD+COD}` (soma de linhas no ano). Os valores escritos usam a formatação "R$ x,y bi" em R$ constantes.
- Produz: `aplicar_notas(notas: list, ano: int, R: pd.DataFrame, nomes: dict, nos_reais: dict) -> list[dict]` (`{no, classe,
  texto, fonte}` com o texto já substituído); levanta `ValueError` se uma nota de `contexto` não tem os quatro campos da fonte.
- `AAAA.json` → `notas: [...]` (lista vazia nos anos sem nota).

- [ ] **Passo 1: Testes que falham.**
  - `t16_notas_sem_digitos()`: em cada `texto` de `notas.json`, depois de remover os marcadores, `re.search(r"\d", …)` é `None`.
  - `t17_notas_comparacoes(c, rtn, ipca)`: cada par de `comparacoes` é verdadeiro nos dados (na nota do Bolsa Família de 2020,
    `{soma:4.4.1.2:04-08}` < `{mes:4.4.1.2:03}`); toda linha citada por marcador está em `fonte.linhas`.
  - `t18_notas_fontes()`: uma nota de `contexto` sem `pagina` faz `aplicar_notas` levantar `ValueError` (caso montado no
    próprio teste); as notas de `notas.json` hoje são todas `fatos`.
  - Conteúdo esperado de 2020, depois da substituição: a nota do Fundeb contém "R$ 591,9 bi", "4.3.07" e "Créditos
    Extraordinários"; a do Bolsa Família contém "R$ 0,6 bi" e "R$ 3,6 bi".
- [ ] **Passo 2:** `pytest -q -k "T16 or T17 or T18"` → FALHA.
- [ ] **Passo 3:** escrever `notas.json` com as duas notas de fatos do design (Fundeb e Bolsa Família, 2020; fonte do Fundeb
  com as linhas 4.3.07, 4.3.03, 4.3.01 e 4.3.10) e implementar `carregar_notas`/`aplicar_notas`.
- [ ] **Passo 4:** `pytest -q` → passa. Mutações: um "2020" digitado no texto → T16 FALHA; inverter a comparação → T17 FALHA.
- [ ] **Passo 5:** prova de escopo (sem `notas`, idênticos); `python pipeline.py`; commit `feat: notas de fatos por ano e nó`.

A nota de **contexto** de 2020 (Auxílio Emergencial) não entra nesta tarefa: espera o caminho do PDF do boletim de dez/2020
(design, "Notas"). Quando chegar, uma tarefa curta acrescenta a nota a `notas.json`, com publicação, página, endereço e data de
verificação, e só as afirmações que o PDF cobre.

### Tarefa A4: Fechamento da 3a

- [ ] **Passo 1:** `python testes.py` (relatório completo) e `pytest -q` → verdes; `git diff --stat main` só com os arquivos das
  tarefas A1–A3.
- [ ] **Passo 2:** empurrar a branch; PR "Fase 3a: PIB do IBGE, subcontas e notas" com o relatório dos testes, as provas de
  escopo e as mutações.
- [ ] **Passo 3: PARAR** e mostrar ao Bruno (ponto de parada da 3a). Mesclar só com a aprovação dele e os três checks verdes.

---

## 3b · Layout (PR #17, rebaseado na `main` depois da 3a)

### Tarefa B1: Tipos, carga dos 11 anos, modos no grafo

**Arquivos:**
- Modificar: `web/src/dados/tipos.ts` (`Subconta`, `Nota`, `pib` novo, `subcontas?`, `notas?`)
- Modificar: `web/src/dados/carregar.ts` (novo `carregarTodos`)
- Modificar: `web/src/grafo/grafo.ts`, `web/src/grafo/tipos.ts`, `web/src/formatar.ts`, `web/src/textos.ts`
- Teste: `web/test/grafo.test.ts`, `web/test/formatar.test.ts`, `web/test/modos.test.ts` (novo)

**Interfaces:**
- Produz: `type Modo = 'rs' | 'desp' | 'pib'` (em `grafo/tipos.ts`); `carregarTodos(indice: Indice): Promise<DadosAno[]>`;
  `montarGrafo(d: DadosAno, modo: Modo = 'rs'): Grafo`, com `Grafo.modo` e `Grafo.resultadoComSinal` (no modo);
  `formatarValor(v: number, modo: Modo): string` (`rs` → `formatarBi`; `desp` → 1 casa + "%"; `pib` → 2 casas + "%").
- Regras do modo: `desp` = valores de `real` × 100 / `real.totais.despesa_total`; `pib` = valores de `nominal` × 100 /
  `pib.valor_nominal`. `montarGrafo` emite sempre os dois fluxos do resultado: `resultado_primario → despesa_total` com
  max(0, −r) e `receita_liquida → resultado_primario` com max(0, r); `receita_liquida → despesa_total` com
  min(receita líquida, despesa total).
- `TEXTOS` ganha: `modos` (`rs`, `desp`, `pib`: nomes do seletor), `legendas` (curta e longa por modo, sem dígitos; o mês-base é
  inserido pelo componente) e `receitaAcimaDoGasto` (frase do design).

- [ ] **Passo 1: Testes que falham.**
  - `modos.test.ts`: (a) 11 anos × todos os nós, `desp`: |rótulo lido de `formatarValor` × despesa total real / 100 − valor
    real| ≤ 0,05 p.p.; (b) `pib`: rótulo do déficit de 2025 = "0,48%", do superávit de 2022 = "0,46%", diferentes; (c)
    conservação por nó nos 3 modos, 11 anos, inclusive 2022.
  - `grafo.test.ts`: 2021 e 2022 têm os dois fluxos do resultado, um deles com valor 0; `resultadoComSinal` de 2022 > 0.
- [ ] **Passo 2:** `npm test` → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test` → passa. Mutações: `desp` sobre `nominal` → (a) FALHA (0,418 p.p.); `pib` com 1 casa → (b) FALHA.
- [ ] **Passo 5:** commit `feat: modos de leitura e fluxos do resultado com sinal no grafo`.

### Tarefa B2: Escala compartilhada, âncora e altura

**Arquivos:**
- Criar: `web/src/layout/escala.ts`
- Modificar: `web/src/layout/constantes.ts` (752/744; `ESPESSURA_MINIMA = 3`), `web/src/layout/layout.ts` (opções `escala`,
  `ancoraY`, `reservaLargura`; formatação por `formatarValor(v, g.modo)`)
- Modificar: `web/src/ui/Cartao.tsx`, `web/src/App.tsx` (carrega os 11 anos; passa escala e âncora)
- Modificar: `docs/especificacao.md` (casos de borda "Escala em 2020", decisões, regras do frontend: escala da maior coluna;
  escala fixa nos modos percentuais; modos de leitura: bases dos percentuais), `CLAUDE.md` (sem "aviso na tela para 2020")
- Teste: `web/test/layout-anos.test.ts` (reescrito), `web/test/escala.test.ts` (novo)

**Interfaces:**
- Produz: `calcularEscalaCompartilhada(grafos: Grafo[], cfg: ConfigFormato, medir: MedirTexto, op: { largura?: number;
  larguraVisivel?: number }):
  { escala: number; ancoraY: number; reservaLargura: { esquerda: number; direita: number } }`. Escala = mínimo entre anos e
  colunas de `(alturaBarras − vãos) / soma`; âncora = topo da terceira coluna (alinhamento A) tal que o conteúdo mais alto
  dos anos fique a `margem + 4` do topo; reserva = maior largura de rótulo lateral entre os 3 modos e os anos.
- `calcularLayout(g, cfg, medir, { …, escala?, ancoraY?, reservaLargura? })` — sem as opções, comportamento da fase 2.

- [ ] **Passo 1: Testes que falham.** Em `layout-anos.test.ts` (11 anos × 3 fatores × 2 formatos × 3 modos, escala e âncora
  compartilhadas):
  - extensão de barras, rótulos, alvos e guias dentro de `[12, alturaSvg − 12]`; nenhuma colisão de rótulos (folga 2);
  - espessura de todo nó com valor > 0 ≥ `ESPESSURA_MINIMA`;
  - o relatório imprime, por ano e formato: coluna do meio (px), resultado (px), folha mais fina, vazio abaixo, deslocamento
    máximo de rótulo, folga até a altura.
  - `escala.test.ts`: ano sintético 2025 × 1,3 → escala menor e tudo passa; 2025 × 1,5 → a espessura mínima falha no celular;
    `alturaSvg` 20 px menor → a extensão falha; topo da terceira coluna igual (±0,01 px) em todos os anos; posições x das
    colunas iguais nos três modos e nos 11 anos.
- [ ] **Passo 2:** `npm test` → FALHA.
- [ ] **Passo 3:** implementar `escala.ts` e as opções de `calcularLayout`; o `Cartao` calcula a escala uma vez por modo e
  formato (`useMemo` sobre os 11 grafos).
- [ ] **Passo 4:** `npm test` → passa; colar a tabela por ano no relatório da tarefa. Corrigir a especificação e o `CLAUDE.md`
  **neste mesmo commit** (texto do design, "Correção da especificação").
- [ ] **Passo 5:** commit `feat: escala compartilhada entre anos, com âncora no topo e altura de 752/744`.

### Tarefa B3: Superávit (duas posições, rótulo A′, nó zero)

**Arquivos:**
- Modificar: `web/src/layout/layout.ts`, `web/src/layout/constantes.ts` (`posicaoMeio` do resultado), `web/src/ui/Sankey.tsx`,
  `web/src/ui/TabelaValores.tsx`, `docs/especificacao.md` (casos de borda: anos de superávit, com a posição A e o rótulo A′)
- Teste: `web/test/superavit.test.ts` (novo), `web/test/layout.test.ts`

**Interfaces:**
- Produz: `Layout.posicoesResultado: { deficit: NoLayout; superavit: NoLayout }` (sempre as duas; a que não se aplica tem
  altura 0); em `Layout.nos`, `resultado_primario` é a posição que se aplica. O fluxo `resultado_primario → despesa_total`
  sai da posição do déficit; `receita_liquida → resultado_primario` chega à do superávit (quarta coluna, abaixo do Gasto
  total). Rótulo do resultado na posição A′ (a do déficit, nos dois formatos). Guia em L até a posição do superávit quando o
  rótulo fica a mais de `LIMIAR_GUIA_RESULTADO = 12` px do segmento de saída do fluxo.
- Nó com valor 0: sem `RotuloLayout`, `GuiaLayout`, `AlvoLayout`; `Sankey` não o renderiza como `g.no` focável;
  `TabelaValores` não tem a linha.

- [ ] **Passo 1: Testes que falham** (`superavit.test.ts`, 3 fatores × 2 formatos):
  - 2022: rótulo do resultado não colide com rótulo, guia, barra nem com a faixa do fluxo `despesa_total → discricionarias`
    (amostrar a curva em 201 pontos); distância ao segmento de saída > 12 → guia existe, com id `resultado_primario`;
  - nos anos de déficit, a caixa do rótulo do resultado é a mesma de antes desta tarefa (comparar com o layout sem a mudança,
    guardado como referência no teste);
  - 2022: o rótulo diz `TEXTOS.rotulos.superavit`, o valor e `TEXTOS.naoIncluiJuros`, e não contém "financiado com dívida";
  - 2021, 2022 e 2023, depois os 11: nó com valor 0 sem rótulo, guia e alvo; render (`renderToStaticMarkup`) sem `g.no`
    com `data-id` do nó zero; tabela sem a linha.
- [ ] **Passo 2:** `npm test` → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test` → passa. Mutação: rótulo junto do nó do superávit no celular → colisão com o fluxo verde FALHA.
- [ ] **Passo 5:** commit `feat: superávit primário com posição própria e rótulo no lugar do déficit`.

### Tarefa B4: Cor e padrão do superávit; token do texto secundário

**Arquivos:**
- Modificar: `web/src/ui/tema.ts` (`superavit`: `#a03c9a` / `#b04aa9`; `secundario` claro `#4e4d4a`), `web/src/ui/Sankey.tsx`
  (padrão de pontos no nó e no fluxo), `web/src/ui/estilos.css`, `docs/especificacao.md` (temas)
- Teste: `web/test/tema.test.ts`

- [ ] **Passo 1: Testes que falham** (`tema.test.ts`): percorrer as cores de série lidas de `TEMAS` (receita, repasse, gasto,
  discricionaria, deficit, superavit), não uma lista à mão; texto e texto secundário ≥ 4,5:1 contra o fundo e contra cada série
  misturada a 36%; guia (secundário) ≥ 3:1 contra o fundo; barra do superávit ≥ 3:1 contra o fundo; nos dois temas.
- [ ] **Passo 2:** `npm test` → FALHA (sem `superavit`; secundário antigo dá 4,45:1).
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test` → passa. Mutação: acrescentar a `TEMAS` uma série `#e8e8e8` → FALHA.
- [ ] **Passo 5:** commit `feat: cor e padrão do superávit; texto secundário mais escuro no tema claro`.

### Tarefa B5: Seleção de ano por `#ano`

**Arquivos:**
- Criar: `web/src/dados/hash.ts`
- Remover: `web/src/dados/anoDeTeste.ts`; a opção `__PERMITIR_ANO__` do `vite.config.ts` e de `globais.d.ts`
- Modificar: `web/src/App.tsx` (`h1` e `document.title` com o ano), `web/scripts/conferir-bundle.mjs` (sem sentinela),
  `.github/workflows/testes.yml` (sem o passo do build de teste com sentinela; o Playwright usa o build normal),
  `web/package.json` (`build:teste` sai), `web/playwright.config.ts`, `web/e2e/*.spec.ts` (`./#2020` no lugar de `./?ano=`)
- Teste: `web/test/hash.test.ts`, `web/e2e/sankey.spec.ts`

**Interfaces:**
- Produz: `anoDoHash(hash: string, anos: [number, number]): number | null` (só `#AAAA` dentro do intervalo do índice);
  `escreverHash(ano: number): void` (`history.replaceState`).

- [ ] **Passo 1: Testes que falham.** `hash.test.ts`: `#2020` → 2020; `#1999`, `#2026`, `#abc`, `#2020x`, `#`, `#02020`,
  `""` → `null`. Em `sankey.spec.ts`: abrir `./#2020` mostra 2020 no `h1` e no `title`; abrir `./#1999` mostra o último ano e o
  console não tem erro; trocar o hash (`location.hash = '#2022'`) redesenha 2022.
- [ ] **Passo 2:** `npm test` e `npm run e2e` → FALHAM.
- [ ] **Passo 3:** implementar; ajustar `conferir-bundle` (continua conferindo os caminhos sob `/sankey-fiscal/`).
- [ ] **Passo 4:** `npm test`, `npm run build && node scripts/conferir-bundle.mjs dist`, `npm run e2e` → passam.
- [ ] **Passo 5:** commit `feat: ano escolhido por #ano; sai o parâmetro de teste ?ano=`.

### Tarefa B6: Pendências da fase 2 ligadas ao layout

**Arquivos:**
- Modificar: `web/src/layout/rotulos.ts` (`quebrarPorLargura`), `web/tsconfig.test.json` ou novo `web/tsconfig.e2e.json`
  (inclui `e2e/` e `playwright.config.ts`), `web/package.json` (`tsc -b` cobre o e2e)
- Teste: `web/test/rotulos.test.ts`

- [ ] **Passo 1:** teste: `quebrarPorLargura('-abc def', …)` preserva o hífen inicial; `tsc -b` falha com um erro de tipo
  proposital num spec de e2e (conferir localmente e desfazer).
- [ ] **Passo 2:** implementar; `npm test` e `npm run build` → passam.
- [ ] **Passo 3:** commit `fix: hífen inicial na quebra de rótulos; checagem de tipos no e2e`.

### Tarefa B7: Fechamento da 3b

- [ ] **Passo 1:** Playwright com a fonte real: 2020, 2022 e 2025 × desktop (1280 × 720) e celular (390 × 844) × claro e escuro:
  rótulos sem sobreposição, ≥ 12 px da borda, sem corte nas paradas; o rótulo do superávit de 2022 e a guia visíveis.
- [ ] **Passo 2:** `npm test`, `npm run e2e`, `pytest -q` verdes; empurrar; tempo do CI anotado.
- [ ] **Passo 3: PARAR** e mostrar ao Bruno a tabela de métricas por ano com a escala nova (ponto de parada da 3b).

---

## 3c · Linha do tempo e animação (PR #17)

Pré-requisito: o Bruno decide o critério de medição do orçamento e a estratégia (canvas) — design, "Orçamento de desempenho".
As tarefas C1–C4 não dependem dessa decisão; C5 e C6 dependem.

### Tarefa C1: Barra de controle (sem animação)

**Arquivos:**
- Criar: `web/src/ui/BarraAno.tsx`
- Modificar: `web/src/ui/Cartao.tsx`, `web/src/ui/estilos.css`, `web/src/textos.ts` (rótulos dos botões e do deslizante)
- Teste: `web/test/barra-ano.test.tsx`, `web/e2e/controle.spec.ts` (novo)

**Interfaces:**
- Produz: `<BarraAno ano anos modo resultadoTexto aoMudarAno aoMudarModo tocando aoTocar />`. Deslizante nativo
  (`input type=range`, passo 1, `aria-valuetext` "Ano: 2020, déficit R$ 1.027,4 bi" montado de `TEXTOS` + JSON); "Ano: 2020" em
  texto visível; setas de ano anterior/próximo; botão play/pausa de 44 px; seletor de modo como grupo de rádio.

- [ ] **Passo 1: Testes que falham.** Render: alvos ≥ 44 px (CSS); `aria-valuetext` com ano e resultado; texto "Ano:". E2E:
  setas, Home/End, PageUp/PageDown no deslizante; barra de espaço só aciona o play com o botão focado; play nunca começa ao
  carregar; em 2025 o play recomeça de 2015 e para em 2025; qualquer interação manual pausa; `visibilitychange` pausa; Home e
  End repetidos durante o play terminam no último ano pedido (Foco de revisão 2).
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar (troca de ano instantânea nesta tarefa). **Passo 4:** passa.
- [ ] **Passo 5:** commit `feat: barra de ano com deslizante, setas, play e seletor de modo`.

### Tarefa C2: Modos na tela e legendas

**Arquivos:**
- Modificar: `web/src/ui/BarraAno.tsx`, `web/src/ui/Cartao.tsx` (no celular, frase curta na barra e legenda longa abaixo do
  desenho)
- Teste: `web/e2e/controle.spec.ts`

- [ ] **Passo 1:** E2E: trocar para "% da despesa" mostra rótulos em %, a legenda com a base e `receitaAcimaDoGasto`; "% do PIB"
  mostra duas casas; no celular, a frase curta na barra, a legenda longa abaixo do desenho, os nomes completos do seletor sem
  corte (`scrollWidth ≤ clientWidth`), fontes da frase e da legenda ≥ 11 px, altura da barra medida e reportada.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** passa.
- [ ] **Passo 5:** commit `feat: modos % da despesa e % do PIB na tela, com legendas`.

### Tarefa C3: Ano em destaque e a trava da imagem de compartilhamento

**Arquivos:**
- Modificar: `web/src/layout/layout.ts` (`Layout.anoDestaque: Caixa`), `web/src/layout/constantes.ts`
  (`TAMANHO_ANO_DESTAQUE = { desktop: 56, celular: 44 }`), `web/src/ui/Sankey.tsx` (`<text aria-hidden>`),
  `web/scripts/gerar-og.mjs`
- Teste: `web/test/layout-anos.test.ts`

- [ ] **Passo 1:** teste: folga ≥ 8 px entre `anoDestaque` e barras, rótulos, guias e alvos, 11 anos × 3 fatores × 2 formatos ×
  3 modos. Mutações: fonte 40 px maior; 60 px mais alto → FALHAM.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar; `gerar-og.mjs` mede o destaque e aplica a mesma folga (sai com erro se não).
- [ ] **Passo 4:** `npm test`; `npm run gerar-og` (com `OG_ESCALA=1.3` falha, sem ele grava).
- [ ] **Passo 5:** commit `feat: ano em destaque sob as origens`.

### Tarefa C4: Núcleo da transição e métricas M1–M8

**Arquivos:**
- Criar: `web/src/animacao/interpolar.ts`, `web/src/animacao/rotulagem.ts`
- Teste: `web/test/transicao.test.ts`, `web/test/apoio/metricas.ts`

**Interfaces:**
- Produz: `suave(t: number): number` (seno, sem ultrapassagem); `interpolarDados(a: DadosAno, b: DadosAno, p: number):
  DadosAno` (blocos `real`, `nominal`, `pib` lineares, resultado com sinal); `cortesDoPar(a, b, modo): number[]` (progresso onde
  o resultado vale zero); `rotulosDoQuadro(t, La, Lb, Lt, visiveis: Set<string>): { rotulos, guias }` (modo b: fila de `Lt`,
  valor do ano mais próximo, histerese `ESPESSURA_MINIMA` / `ESPESSURA_MINIMA − 1`); `DURACAO_MS = 700`, `PAUSA_MS = 1300`,
  `PASSO_MAX_PX = 6`.

- [ ] **Passo 1: Testes que falham** (10 pares × 2 formatos × 3 modos, 43 quadros): M1 ≤ 0,5 px; M2(a) ≤ 1 por trecho; M2(b)
  ≤ 6 px/quadro; M2(c) zero ultrapassagens; M3 ordem igual; M4; M5 zero quadros com déficit e superávit; M6 zero colisões, 3
  fatores; M7 ≤ 0,01 px; M8 ≤ 0,5 px (interromper no quadro 21 rumo a outro ano); histerese: uma troca por rótulo por transição.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** passa.
- [ ] **Passo 5:** mutações mostradas (localmente, desfeitas): easeOutBack → M2(b)/(c) FALHAM; déficit e superávit
  interpolados separadamente → M5 FALHA; fila desligada nos quadros intermediários → M6 FALHA.
- [ ] **Passo 6:** commit `feat: núcleo da transição entre anos com as métricas M1–M8`.

### Tarefa C5: Animação na tela

**Arquivos:**
- Criar: `web/src/animacao/useTransicao.ts`, e, se a decisão for canvas, `web/src/ui/QuadroCanvas.tsx`
- Modificar: `web/src/ui/Cartao.tsx`, `web/src/ui/Sankey.tsx`
- Teste: `web/e2e/transicao.spec.ts` (novo)

**Interfaces:**
- Consome: C4. Produz: `useTransicao(destino: { ano: number; modo: Modo }): { quadro: QuadroDesenhado; emTransicao: boolean }`
  — animação por tempo (`performance.now()`); uma só animação viva (uma nova parte do quadro desenhado); com
  `prefers-reduced-motion`, quadro final direto.

- [ ] **Passo 1: Testes que falham** (e2e): com `reducedMotion: 'reduce'`, a troca desenha direto o ano pedido no quadro
  seguinte; sem ela, no meio da transição a altura do déficit está entre a de 2019 e a de 2020; a interrupção parte do desenhado;
  o foco num nó continua nele durante e depois da transição; o nome acessível e o `aria-valuetext` mudam uma vez (contar
  mutações de atributo); a troca de modo também anima.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar conforme a estratégia decidida. **Passo 4:** passa.
- [ ] **Passo 5:** commit `feat: transição animada entre anos e entre modos`.

### Tarefa C6: Orçamento de desempenho

**Arquivos:**
- Criar: `web/scripts/medir-quadros.mjs` (Playwright + trace do Chrome, conforme o critério decidido)
- Modificar: `web/package.json` (`medir-quadros`), `.github/workflows/testes.yml` (só se o Bruno quiser no CI)

- [ ] **Passo 1:** o script roda a transição 2019→2020 no build de produção, desktop e celular, e imprime a tabela do design
  (CPU por quadro a 1× × taxa; p50/p95 de parede a 4× e 6×); sai com código 1 se a meta não for cumprida.
- [ ] **Passo 2:** rodar; colar a tabela. Se estourar, quadros pré-calculados uma vez por transição; a meta não é relaxada.
- [ ] **Passo 3:** commit `test: medição do orçamento por quadro da transição`.

### Tarefa C7: Fechamento da 3c

- [ ] **Passo 1:** capturas dos quadros t = 0; 0,33; 0,66; 1 de 2019→2020 e 2021→2022, desktop e celular, claro e escuro; tabela
  M1–M8 por par; tabela de desempenho.
- [ ] **Passo 2:** CI verde; tempo anotado. **Passo 3: PARAR** e mostrar ao Bruno (ponto de parada da 3c).

---

## 3d · Painel e pendências (PR #17)

### Tarefa D1: Painel de altura automática, com subcontas e notas

**Arquivos:**
- Modificar: `web/src/ui/Painel.tsx`, `web/src/ui/estilos.css` (sai `--painel-altura`), `web/src/textos.ts` (cabeçalhos
  "Código", "Linha do RTN", "Valor", "% do nó", "Demais", "Exclui", "Soma das subcontas", "Nota sobre"),
  `docs/especificacao.md` (painel: altura automática no desktop)
- Criar: `web/src/ui/Subcontas.tsx`
- Teste: `web/test/painel-render.test.tsx`, `web/e2e/painel.spec.ts` (novo)

**Interfaces:**
- Produz: `subcontasDoAno(d: DadosAno, id: string, modo: Modo): { maiores: Subconta[]; demais: { valor: number; n: number;
  unica?: Subconta }; total: number } | null` (5 maiores por valor no ano; se n = 1, `unica` é a própria linha).

- [ ] **Passo 1: Testes que falham.**
  - Render: duas colunas no desktop; "Linhas do RTN (n)" sempre visível com "menos 4.3.05 …" no Fundeb; a tabela do Fundeb diz
    "Exclui 4.3.05"; cabeçalho "% do nó"; soma das subcontas = valor do nó (0,01 mi); a nota de 2020 do Fundeb aparece só em
    2020; a nota é texto do JSON (sem número montado no componente); valor em R$ constantes, participação no modo e padrão.
  - E2E: SVG e `h1` parados (coordenadas da página, ±0,5 px) ao abrir, trocar de nó e fechar, nos 11 anos; `scrollHeight ≤
    clientHeight` no painel com fonte a 100%, 125% e 200%; depois de abrir, título e valor do painel dentro da janela a 1280 × 720.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** passa. Mutação: `max-height: 18rem` no painel → FALHA.
- [ ] **Passo 5:** commit `feat: painel de altura automática com subcontas e notas`.

### Tarefa D2: Painel, tabela e troca de ano

**Arquivos:**
- Modificar: `web/src/ui/Cartao.tsx`, `web/src/ui/TabelaValores.tsx` (chevron no `summary`; modo atual; sem o nó zero)
- Teste: `web/e2e/painel.spec.ts`, `web/test/tabela.test.tsx` (novo)

- [ ] **Passo 1:** testes: painel aberto + troca de ano → mesmo nó, valores do ano novo; resultado aberto em 2021 → trocar para
  2022 fecha o painel e o foco vai ao deslizante; "Ver os valores em tabela" tem chevron visível e abre com Enter e Espaço.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** passa.
- [ ] **Passo 5:** commit `feat: painel acompanha a troca de ano; tabela com chevron e modo atual`.

### Tarefa D3: Pendências restantes e fechamento da fase

**Arquivos:**
- Modificar: `web/src/ui/Cartao.tsx` (mesmo invólucro nos dois formatos), `web/playwright.config.ts`
  (`PLAYWRIGHT_BASE_URL`), `web/test/painel-render.test.tsx` (`.replace(/(/g, '(')` sai), `CLAUDE.md` (estado: fase 3
  concluída), `docs/especificacao.md` (estado)
- Teste: `web/e2e/sankey.spec.ts`

- [ ] **Passo 1:** testes: cruzar 1100 px com um nó focado mantém o foco no mesmo nó; cruzar no meio de uma transição termina no
  ano pedido (Foco de revisão 4); `PLAYWRIGHT_BASE_URL=https://castrillon.dev/sankey-fiscal/ npx playwright test -g fumaça`
  roda contra a URL publicada (teste de fumaça só de leitura).
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** passa.
- [ ] **Passo 5:** `npm test`, `npm run e2e`, `pytest -q`; CI verde e abaixo de 3 minutos (senão, reportar com as opções).
- [ ] **Passo 6:** commit `fix: foco preservado ao trocar de formato; fumaça contra a URL publicada`; atualizar `CLAUDE.md` e
  a especificação (commit `docs: fase 3 concluída`).
- [ ] **Passo 7: PARAR** para a revisão final (superpowers:requesting-code-review) antes de tirar o PR do rascunho.
