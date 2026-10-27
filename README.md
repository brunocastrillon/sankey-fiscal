# Sankey fiscal do Governo Central

> **Visualização independente, baseada em dados do Tesouro Nacional.** Não é um produto oficial do governo.

Sankey interativo de como o Governo Central arrecada e gasta, de 2015 a 2025, com linha do tempo. Cada nó mostra de quais
linhas do RTN ele vem e quais metodologias foram usadas.

**Site:** <https://castrillon.dev/sankey-fiscal/>

**Estado:** fase 1 (dados) e fase 2 (o Sankey de 2025, em `web/`: React + layout próprio em SVG) concluídas e publicadas em
<https://castrillon.dev/sankey-fiscal/>. Próxima: a fase 3 (linha do tempo).

## Começando

```bash
pip install -r requirements.txt
python pipeline.py     # lê entrada/ e grava dados/AAAA.json
pytest -q              # testes de validação
```

**Notas de contexto:** antes de qualquer merge que toque em notas de contexto (`notas.json`, classe `contexto`), confira os
trechos citados contra o PDF da publicação, que não é versionado (ver `entrada/LEIAME.md`):

```bash
python verificar_trechos.py --pdf C:/caminho/RTN_Boletim_2020_12.pdf
```

O script confere que o PDF é o citado (SHA256 igual a `arquivo_sha256`), que cada `trecho` aparece na página citada
(espaços e hifenização de fim de linha normalizados) e que tem menos de 15 palavras; sai com código 1 se algo não conferir.
Precisa do `pdftotext` (do xpdf ou do Poppler) no PATH. Fica fora do CI porque o PDF não está no repositório.

O site (Node 24):

```bash
cd web
npm ci
npm run dev            # http://localhost:5173/sankey-fiscal/
npm test               # Vitest
npm run e2e            # Playwright
npm run gerar-og       # regenera public/og-image.png (imagem de compartilhamento, 1200 × 630); PW_CANAL=chrome usa o Chrome
```

A imagem de compartilhamento (`web/public/og-image.png`) é um print do nosso gráfico, gerado por `web/scripts/gerar-og.mjs`;
regenere e versione quando o desenho mudar. O CI roda `npm audit --omit=dev --audit-level=high` no job `site`.

No site, clique, toque ou Enter num nó abrem o painel de detalhes (valor, participação, linhas do RTN e boletim de origem); o
foco no nó não abre o painel, e passar o mouse mostra apenas uma dica curta.

## Publicação

O site é um projeto próprio na Vercel, ligado a este repositório e configurado pelo `vercel.json` da raiz: instala e constrói
em `web/` e publica `web/dist`. O endereço público é `castrillon.dev/sankey-fiscal`: a landing de `castrillon.dev` reescreve
esse subcaminho para o domínio de produção deste projeto, e o `vercel.json` daqui reescreve `/sankey-fiscal/*` para a raiz do
build. Cada merge na `main` vira produção; cada PR ganha uma prévia, protegida por login na Vercel. Detalhes em
`docs/como-conduzir.md`.

## O que há aqui

| Caminho | Conteúdo |
| --- | --- |
| `docs/especificacao.md` | Decisões de produto e metodologia (fonte de verdade) |
| `docs/como-conduzir.md` | Como conduzir o projeto com Claude Code e Superpowers |
| `CLAUDE.md` | Contexto e regras para o Claude Code |
| `mapeamento.json` | Linhas do RTN → nós do Sankey |
| `notas.json` | Notas por ano e nó, escritas à mão sem números: os valores entram por marcadores calculados sobre a série |
| `pipeline.py` | Leitura do RTN e do IPCA, mapeamento, deflação, JSON por ano |
| `testes.py`, `tests/` | Testes de validação (identidades contábeis, deflação, regressão contra o gráfico original) |
| `verificar_trechos.py` | Confere os trechos das notas de contexto contra o PDF citado (fora do CI) |
| `referencias/` | Valores impressos no gráfico original (2025), usados pelos testes do pipeline e do site, e valores nominais de 2020 do boletim do RTN de dez/2020 (`boletim-dez-2020.json`, com página e SHA256 do PDF), que conferem as subcontas (T21) |
| `entrada/` | Arquivos públicos de entrada (RTN, IPCA e PIB) e a fonte de cada um |
| `dados/` | JSON gerados, um por ano, com valores nominais e em R$ constantes |
| `web/` | O site: grafo, layout próprio em SVG e interface React, com testes (Vitest e Playwright) |
| `vercel.json` | Publicação na Vercel: comandos de build, reescrita do subcaminho e cache |

## Formato de cada AAAA.json

Um arquivo por ano em `dados/`, gerado pelo pipeline (não edite à mão), mais `dados/indice.json` com o intervalo de anos, o
mês-base, o último mês publicado e o último trimestre do CSV do PIB (`pib_ultimo_trimestre`, que identifica a versão da série do IBGE).

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
| `pib` | PIB nominal do ano (R$ milhões correntes, soma dos 4 trimestres do IBGE): `valor_nominal`, `fonte`, `trimestres` e `ultimo_trimestre` (o último trimestre somado no ano, por exemplo `2025T4`) |
| `subcontas` | Id do nó → linhas filhas diretas (aba 1.2) das linhas que o formam, menos as que subtraem, na ordem da aba: `codigo`, `nome`, `real` e `nominal` (R$ milhões); só nós com duas ou mais |
| `notas` | Notas do ano (lista vazia se não há), cada uma com `no`, `classe` (`fatos`, derivada da série do RTN; `contexto`, de uma publicação do Tesouro), `texto` com os marcadores de `notas.json` já substituídos (valores em R$ constantes, "R$ x,y bi"), `observacao` (texto ou `null`, uma vez por nota), `base_precos` ("R$ constantes de dez/2025 (IPCA)", montada do `mes_base`, nas notas que escrevem valores; `null` nas outras) e `fonte`, **sempre uma lista de citações**. Cada citação tem `tipo` e os campos do tipo, mais `nota` e `nota_na_tabela` (texto ou `null`): `serie` (notas de fatos) tem `titulo` e `linhas`; `boletim` (notas de contexto) tem `publicacao`, `boletim`, `base_precos` (o boletim publica a preços correntes, outra base que a nossa), `pagina`, `nota` (a numeração do texto das Notas Explicativas), `nota_na_tabela` (a numeração da tabela, que é outra), `endereco`, `verificado_em`, `arquivo_sha256` (SHA256 do PDF conferido), `trecho` (menos de 15 palavras), `linha_rtn` (o código da linha na série histórica, aba 1.2, da conta de que a nota do boletim trata; não é a numeração do boletim) e `menciona` (a linha do RTN de que a citação fala). Regra de linhas (T17): marcadores e `menciona` ficam nas linhas de soma do nó e suas descendentes, fora das de subtrai e dos totais; `linha_rtn` também pode ser a mãe direta de uma linha de soma. O T22 confere o esquema |

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

Dados: Secretaria do Tesouro Nacional (Resultado do Tesouro Nacional) e IBGE (IPCA, SIDRA 1737; PIB, SIDRA 1846). Veja `entrada/LEIAME.md`.
Código: licença MIT (`LICENSE`).
