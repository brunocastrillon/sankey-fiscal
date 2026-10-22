# CLAUDE.md

Contexto do projeto para o Claude Code. Mantenha este arquivo curto; o detalhe está em `docs/especificacao.md`.

## O que é

Sankey interativo das contas do Governo Central do Brasil (dados do RTN, Tesouro Nacional), 2015–2025, com linha do tempo.
Será publicado em `castrillon.dev/sankey-fiscal`. É uma visualização **independente**, não um produto oficial.

**Fonte de verdade das decisões:** `docs/especificacao.md`. Se uma decisão mudar, atualize a especificação no mesmo commit.

## Estado

- Fase 1 e fase 2 concluídas (PR #1). Próximas: publicação na Vercel e depois a fase 3.
- Site em `web/` (React + layout próprio em SVG, sem d3-sankey). Design da fase 2:
  `docs/superpowers/specs/2026-10-21-fase-2-sankey-2025-design.md`; pendências da fase 3 no fim do plano da fase 2.
- Interação do site (fase 2): só clique, toque ou Enter abrem o painel; o foco no nó não abre o painel; o hover mostra apenas a
  dica. Esc e × fecham e devolvem o foco ao nó.
- Fases 3 e 4 (linha do tempo; módulo de financiamento) só começam depois do critério de saída da anterior.

## Comandos

```bash
pip install -r requirements.txt
python pipeline.py        # regenera dados/*.json a partir de entrada/
python testes.py          # bateria completa, com detalhes
pytest -q                 # mesma bateria sob o pytest

cd web
npm ci
npm run dev               # site em http://localhost:5173/sankey-fiscal/ (copia dados/ para public/dados/)
npm test                  # Vitest: grafo, regressão contra o original, layout nos 11 anos, temas
npm run e2e               # Playwright (build de teste com ?ano=); PW_CANAL=chrome usa o Chrome instalado
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
