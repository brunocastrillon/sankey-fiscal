# Sankey fiscal do Governo Central

> **Visualização independente, baseada em dados do Tesouro Nacional.** Não é um produto oficial do governo.

Sankey interativo de como o Governo Central arrecada e gasta, de 2015 a 2025, com linha do tempo. Cada nó mostra de quais
linhas do RTN ele vem e quais metodologias foram usadas. Destino: `castrillon.dev/sankey-fiscal`.

**Estado:** fase 1 (dados) concluída. A fase 2 (o Sankey de 2025) é a próxima.

## Começando

```bash
pip install -r requirements.txt
python pipeline.py     # lê entrada/ e grava dados/AAAA.json
pytest -q              # 11 testes de validação
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

## Resultado da fase 1

Em 2025, a preços de dez/2025, os valores calculados reproduzem o gráfico que motivou o projeto com diferença menor que
R$ 1 bi em todos os nós. As identidades contábeis fecham em todos os meses de 2015 a 2025, e a deflação coincide com a série de
valores constantes do próprio Tesouro.

## Fontes e licença

Dados: Secretaria do Tesouro Nacional (Resultado do Tesouro Nacional) e IBGE (IPCA, SIDRA 1737). Veja `entrada/LEIAME.md`.
Código: licença MIT (`LICENSE`).
