# Dados de entrada

Cópias dos arquivos públicos usados pelo pipeline, guardadas aqui para que os testes sejam reproduzíveis.

| Arquivo | Fonte | Conteúdo | Download |
| --- | --- | --- | --- |
| `seriehistoricajul26.xlsx` | Tesouro Nacional, Tesouro Transparente: *Resultado do Tesouro Nacional, séries históricas* (posição de jul/2026) | Receitas, despesas, resultado primário, juros e resultado nominal do Governo Central, mensal desde 1997 | não informada |
| `tabela1737.csv` | IBGE, SIDRA, tabela 1737 | IPCA, número-índice (dez/1993 = 100), mensal | não informada |
| `tabela1846.csv` | IBGE, SIDRA, tabela 1846 (Contas Nacionais Trimestrais) | PIB a preços de mercado (variável 585, categoria 90707), valores correntes em R$ milhões, Brasil, trimestral, do 1º trimestre de 2015 ao 2º de 2026 | 22/10/2026 |

**Fonte dos dados:** Secretaria do Tesouro Nacional (STN) e IBGE. O Resultado do Tesouro Nacional informa que a reprodução é permitida desde que citada a fonte. Confira os termos de uso do Tesouro Transparente antes de redistribuir arquivos novos.

A série do Tesouro é revisada a cada boletim. Ao atualizar o arquivo, guarde o novo com o mês no nome (`seriehistorica<mes><ano>.xlsx`);
o pipeline usa o mais recente por ordem de nome, e `--rtn` força um arquivo específico.
Depois rode `python pipeline.py` e `pytest` e versione os JSON gerados em `dados/`.

**PIB.** O IBGE revisa a série do PIB: a cada divulgação das Contas Nacionais Trimestrais, trimestres já publicados podem mudar.
O arquivo atual vai até o 2º trimestre de 2026, portanto inclui a divulgação desse trimestre (a mais recente incluída). O pipeline
soma os quatro trimestres de cada ano, ignora um ano com menos de quatro (o de 2026, por ora) e grava em `dados/indice.json` o
último trimestre do arquivo (`pib_ultimo_trimestre`), que identifica a versão da série. Ao atualizar, baixe de novo o período
inteiro, não só o trimestre novo, anote aqui a data do download e rode `python pipeline.py` e `pytest` (a âncora A4 confere o PIB
contra o implícito no RTN).
