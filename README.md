# Sankey fiscal do Governo Central

> **Visualização independente, baseada em dados do Tesouro Nacional.** Não é um produto oficial do governo.

Sankey interativo de como o Governo Central arrecada e gasta, de 2015 a 2025, com linha do tempo. Cada nó mostra de quais
linhas do RTN ele vem e quais metodologias foram usadas. Destino: `castrillon.dev/sankey-fiscal`.

**Estado:** fase 1 (dados) concluída. A fase 2 (o Sankey de 2025) é a próxima.

## Começando

```bash
pip install -r requirements.txt
python pipeline.py     # lê entrada/ e grava dados/AAAA.json
pytest -q              # 15 testes de validação
```

## O que há aqui

| Caminho | Conteúdo |
| --- | --- |
| `docs/especificacao.md` | Decisões de produto e metodologia (fonte de verdade) |
| `docs/como-conduzir.md` | Como conduzir o projeto com Claude Code e Superpowers |
| `CLAUDE.md` | Contexto e regras para o Claude Code |
| `mapeamento.json` | Linhas do RTN → nós do Sankey |
| `pipeline.py` | Leitura do RTN e do IPCA, mapeamento, deflação, JSON por ano |
| `testes.py`, `tests/` | Testes de validação (identidades contábeis, deflação, regressão contra o gráfico original) |
| `entrada/` | Arquivos públicos de entrada (RTN e IPCA) e a fonte de cada um |
| `dados/` | JSON gerados, um por ano, com valores nominais e em R$ constantes |

## Formato de cada AAAA.json

Um arquivo por ano em `dados/`, gerado pelo pipeline (não edite à mão), mais `dados/indice.json` com o intervalo de anos, o
mês-base e o último mês publicado.

| Campo | Conteúdo |
| --- | --- |
| `ano` | Ano do arquivo |
| `unidade` | Unidade dos valores (R$ milhões) |
| `mes_base` | Mês-base da deflação pelo IPCA (`AAAA-MM`) |
| `versao_dados` | Série histórica do RTN usada e último mês publicado |
| `mapeamento_versao` | Versão de `mapeamento.json` que gerou o arquivo |
| `rotulos` | Id do nó → rótulo exibido |
| `grupos_despesa` | Id do nó de despesa → `obrigatoria` ou `discricionaria` |
| `linhas` | Id do nó ou do total → linhas do RTN que o formam, na ordem do mapeamento |
| `estrutura` | Papéis e ordem de desenho: `receita` (origens), `repasse`, `obrigatorias` (ordem fixa de `mapeamento.json → desenho`) e `discricionarias` |
| `nominal`, `real` | Valores do ano em R$ correntes e em R$ constantes do mês-base: `nos`, `totais` e `financiamento` |
| `pib` | PIB nominal do ano e a fonte |

Cada item de `linhas` traz o código da aba 1.2 da série histórica, o nome oficial da linha (sem o código, sem marcadores de
nota) e se ela soma ou subtrai no nó:

```json
"fundeb_seguro_desemprego_outras": [
  {"codigo": "4.3", "nome": "Outras Despesas Obrigatórias", "operacao": "soma"},
  {"codigo": "4.3.05", "nome": "Benefícios de Prestação Continuada da LOAS/RMV", "operacao": "subtrai"}
]
```

## Resultado da fase 1

Em 2025, a preços de dez/2025, os valores calculados reproduzem o gráfico que motivou o projeto com diferença menor que
R$ 1 bi em todos os nós. As identidades contábeis fecham em todos os meses de 2015 a 2025, e a deflação coincide com a série de
valores constantes do próprio Tesouro.

## Fontes e licença

Dados: Secretaria do Tesouro Nacional (Resultado do Tesouro Nacional) e IBGE (IPCA, SIDRA 1737). Veja `entrada/LEIAME.md`.
Código: licença MIT (`LICENSE`).
