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
pytest -q              # 18 testes de validação
```

O site (Node 24):

```bash
cd web
npm ci
npm run dev            # http://localhost:5173/sankey-fiscal/
npm test               # Vitest
npm run e2e            # Playwright
```

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
| `pipeline.py` | Leitura do RTN e do IPCA, mapeamento, deflação, JSON por ano |
| `testes.py`, `tests/` | Testes de validação (identidades contábeis, deflação, regressão contra o gráfico original) |
| `referencias/` | Valores impressos no gráfico original (2025), usados pelos testes do pipeline e do site |
| `entrada/` | Arquivos públicos de entrada (RTN e IPCA) e a fonte de cada um |
| `dados/` | JSON gerados, um por ano, com valores nominais e em R$ constantes |
| `web/` | O site: grafo, layout próprio em SVG e interface React, com testes (Vitest e Playwright) |
| `vercel.json` | Publicação na Vercel: comandos de build, reescrita do subcaminho e cache |

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
