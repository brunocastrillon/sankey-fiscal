# Dados de entrada

Cópias dos arquivos públicos usados pelo pipeline, guardadas aqui para que os testes sejam reproduzíveis.

| Arquivo | Fonte | Conteúdo | Download |
| --- | --- | --- | --- |
| `seriehistoricajul26.xlsx` | Tesouro Nacional, Tesouro Transparente: *Resultado do Tesouro Nacional, séries históricas* (posição de jul/2026) | Receitas, despesas, resultado primário, juros e resultado nominal do Governo Central, mensal desde 1997 | não informada |
| `tabela1737.csv` | IBGE, SIDRA, tabela 1737 | IPCA, número-índice (dez/1993 = 100), mensal | não informada |
| `tabela1846.csv` | IBGE, SIDRA, tabela 1846 (Contas Nacionais Trimestrais) | PIB a preços de mercado (variável 585, categoria 90707), valores correntes em R$ milhões, Brasil, trimestral, do 1º trimestre de 2015 ao 2º de 2026 | 22/10/2026 |

**Fonte dos dados:** Secretaria do Tesouro Nacional (STN) e IBGE. O Resultado do Tesouro Nacional informa que a reprodução é permitida desde que citada a fonte. Confira os termos de uso do Tesouro Transparente antes de redistribuir arquivos novos.

A série do Tesouro é revisada a cada boletim. Ao atualizar o arquivo, guarde o novo com o mês no nome (`seriehistorica<mes><ano>.xlsx`);
o pipeline usa o mais recente pela data do nome (`jul26` = jul/2026, `ago26` = ago/2026), nunca pela ordem alfabética, e
`--rtn` força um arquivo específico. Com mais de um arquivo, um nome fora do padrão exige `--rtn`.
Depois rode `python pipeline.py` e `pytest` e versione os JSON gerados em `dados/`.

**PIB.** O IBGE revisa a série do PIB: a cada divulgação das Contas Nacionais Trimestrais, trimestres já publicados podem mudar.
O arquivo atual vai até o 2º trimestre de 2026, portanto inclui a divulgação desse trimestre (a mais recente incluída). O pipeline
soma os quatro trimestres de cada ano, ignora um ano com menos de quatro (o de 2026, por ora) e grava em `dados/indice.json` o
último trimestre do arquivo (`pib_ultimo_trimestre`), que identifica a versão da série. Ao atualizar, baixe de novo o período
inteiro, não só o trimestre novo, anote aqui a data do download e rode `python pipeline.py` e `pytest` (a âncora A4 confere o PIB
contra o implícito no RTN).

**Boletim do RTN de dezembro de 2020 (fora do repositório).** As notas de contexto de 2020 (`notas.json`) e os valores de
`referencias/boletim-dez-2020.json` vêm do PDF *Resultado do Tesouro Nacional, dezembro de 2020* (v. 26, n. 12), baixado
pelo Bruno a partir de <https://www.tesourotransparente.gov.br/publicacoes/boletim-resultado-do-tesouro-nacional-rtn/2020/12>.
O PDF não é versionado. SHA256 do arquivo conferido (`Get-FileHash`):
`1417803c9eddbca4ece724d264138a2d0c44d1b8c0a024699d763c0fcda423ef`. Texto conferido em 26/10/2026 (data do download não
registrada). Páginas usadas: 7 (tabela do resultado acumulado), 9 (texto das Notas Explicativas) e 15 (Tabela 2.3). A
numeração das notas segue o texto da p. 9; a tabela da p. 7 numera diferente: a Nota 16 do texto é a 15 da tabela, a 18 é a
17 e a 21 é a 20. Em `notas.json`, cada citação do boletim guarda as duas, como texto (`nota`, a do texto, e
`nota_na_tabela`, a da tabela), e a observação sobre isso fica uma vez por nota. Para conferir os trechos citados: `python verificar_trechos.py --pdf <caminho do PDF>`.
