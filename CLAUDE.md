# CLAUDE.md

Contexto do projeto para o Claude Code. Mantenha este arquivo curto; o detalhe está em `docs/especificacao.md`.

## O que é

Sankey interativo das contas do Governo Central do Brasil (dados do RTN, Tesouro Nacional), 2015–2025, com linha do tempo.
Será publicado em `castrillon.dev/sankey-fiscal`. É uma visualização **independente**, não um produto oficial.

**Fonte de verdade das decisões:** `docs/especificacao.md`. Se uma decisão mudar, atualize a especificação no mesmo commit.

## Estado

- Fase 1 (dados): concluída. `pipeline.py` gera `dados/AAAA.json`; `testes.py` e `pytest` validam (18 testes).
- Próxima: fase 2, Sankey de um ano (2025) com d3-sankey, lendo `dados/2025.json`. Critério de saída: bater com o gráfico
  original (até R$ 2 bi por nó). Os dados já batem (maior diferença R$ 0,6 bi); falta o desenho.
- Fases 3 e 4 (linha do tempo; módulo de financiamento) só começam depois do critério de saída da anterior.

## Comandos

```bash
pip install -r requirements.txt
python pipeline.py        # regenera dados/*.json a partir de entrada/
python testes.py          # bateria completa, com detalhes
pytest -q                 # mesma bateria sob o pytest
```

## Decisões fechadas (não reabrir sem perguntar)

- Escopo: Governo Central. Resultado primário "acima da linha" no desenho; "abaixo da linha" e deduções só no tooltip/módulo de financiamento.
- Valores em R$ constantes por IPCA, deflacionados mês a mês, mês-base dez/2025. Modos: R$ constantes, % da despesa, % do PIB.
- Escala compartilhada entre anos no modo R$ (aviso na tela para 2020).
- "Bolsa Família, saúde e outros" aparece aberto: Bolsa Família, Saúde e Demais.
- Rótulo do déficit: "Déficit primário (financiado com dívida)", nunca "dívida nova". Juros ficam no módulo de financiamento.
- Sem marca ou título que sugiram origem oficial (nada de "gov.br").
- Nome do produto: `sankey-fiscal` (repositório e URL).
- O site roda em subcaminho (`/sankey-fiscal/`): configure o `base` do bundler para esse subcaminho e não use caminhos absolutos a partir da raiz do domínio.
- PIB: fonte é o IBGE. Enquanto a série não é carregada, o pipeline usa o PIB implícito nas abas anuais do RTN.

## Em aberto

- Carregar a série do PIB do IBGE no pipeline.

## Regras de trabalho

1. **Nenhum número fiscal escrito à mão** no código ou na interface. Tudo vem de `dados/*.json`, gerados pelo pipeline.
2. Mudou `mapeamento.json` ou o pipeline: rode `pytest` e regenere `dados/`. Teste primeiro, código depois.
3. Dado não verificado é dito como não verificado, com fonte e data. Se uma fonte não abre, peça o arquivo em vez de estimar.
4. Os JSON em `dados/` são versionados e o CI confere que correspondem ao pipeline; não os edite à mão.
5. Valores negativos mensais existem (royalties/outras em nov/2017; Bolsa Família em jun/2020). O Sankey anual não é afetado; a visão mensal terá de tratá-los.
6. Texto de interface e documentação em português do Brasil. Identificadores de domínio em português, como já está no código.
7. Commits pequenos, uma mudança lógica por commit, mensagem em português no imperativo (`feat:`, `fix:`, `docs:`, `test:`).
8. Nunca versionar segredos ou `.env`.

## Fluxo com Superpowers

Uma branch e um PR por fase. Em cada fase: brainstorming antes de escrever código (uma pergunta por vez), plano em tarefas pequenas,
teste antes do código, revisão antes do merge. Detalhes em `docs/como-conduzir.md`.
