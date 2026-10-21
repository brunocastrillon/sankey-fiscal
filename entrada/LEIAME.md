# Dados de entrada

Cópias dos arquivos públicos usados pelo pipeline, guardadas aqui para que os testes sejam reproduzíveis.

| Arquivo | Fonte | Conteúdo |
| --- | --- | --- |
| `seriehistoricajul26.xlsx` | Tesouro Nacional, Tesouro Transparente: *Resultado do Tesouro Nacional, séries históricas* (posição de jul/2026) | Receitas, despesas, resultado primário, juros e resultado nominal do Governo Central, mensal desde 1997 |
| `tabela1737.csv` | IBGE, SIDRA, tabela 1737 | IPCA, número-índice (dez/1993 = 100) |

**Fonte dos dados:** Secretaria do Tesouro Nacional (STN) e IBGE. O Resultado do Tesouro Nacional informa que a reprodução é
permitida desde que citada a fonte. Confira os termos de uso do Tesouro Transparente antes de redistribuir arquivos novos.

A série do Tesouro é revisada a cada boletim. Ao atualizar o arquivo, guarde o novo com o mês no nome
(`seriehistorica<mes><ano>.xlsx`); o pipeline usa o mais recente por ordem de nome, e `--rtn` força um arquivo específico.
Depois rode `python pipeline.py` e `pytest` e versione os JSON gerados em `dados/`.
