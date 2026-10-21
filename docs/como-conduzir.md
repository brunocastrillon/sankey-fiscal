# Como conduzir o projeto no VS Code com Claude Code e Superpowers

## 1. Pré-requisitos

- VS Code 1.98 ou superior e a extensão **Claude Code** (`anthropic.claude-code`), com login na sua conta.
  Guia oficial: <https://code.claude.com/docs/en/vs-code>.
- Para rodar `claude` no terminal integrado do VS Code, instale também a CLI autônoma (instruções na documentação acima).
- Git, GitHub CLI (`gh auth login`), Python 3.11+ e, a partir da fase 2, uma versão LTS recente do Node.

## 2. Criar o repositório público

Na pasta do projeto:

```bash
git init -b main
git add .
git commit -m "feat: pipeline de dados do RTN e especificação (fase 1)"
gh repo create brunocastrillon/sankey-fiscal --public --source=. --remote=origin --push
```

Sem o `gh`: crie o repositório vazio em github.com e rode `git remote add origin <url>` e `git push -u origin main`.
`sankey-fiscal` é o nome do repositório, do produto e da URL (`castrillon.dev/sankey-fiscal`).

Depois do primeiro push, confira na aba *Actions* que o workflow `testes` ficou verde.

## 3. Abrir no VS Code e instalar o Superpowers

```bash
code .
```

No Claude Code (painel da extensão ou `claude` no terminal), instale o plugin pelo marketplace oficial:

```
/plugin install superpowers@claude-plugins-official
```

Alternativa, pelo marketplace do autor:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

O painel de personalização da extensão também dá acesso a plugins. Para atualizar as skills: `/plugin update superpowers`.
Se as skills não aparecerem na primeira sessão, abra uma sessão nova. Repositório do plugin: <https://github.com/obra/superpowers>.

Na primeira sessão, o Claude Code lê o `CLAUDE.md` da raiz sozinho.

## 4. Primeira sessão (fase 2)

Cole este prompt:

> Leia o CLAUDE.md e o docs/especificacao.md. Vamos começar a fase 2: o Sankey de 2025 lendo dados/2025.json, com d3-sankey,
> reproduzindo o gráfico original (seção "Mapeamento" da especificação). Use o brainstorming antes de escrever código: faça uma
> pergunta por vez sobre o que a especificação não define (stack do frontend, estilo, estrutura de pastas), proponha 2 ou 3
> abordagens com prós e contras e só então escreva o plano. Nenhum número fiscal pode ser escrito à mão: tudo vem de dados/*.json.

## 5. Ritmo por fase

| Fase | Critério de saída | Branch sugerida |
| --- | --- | --- |
| 1. Dados | Testes passam em 2015–2025 (feito) | `main` |
| 2. Sankey de um ano | 2025 bate com o original (até R$ 2 bi por nó) | `fase-2-sankey-2025` |
| 3. Linha do tempo | Animação sem saltos; superávit (2022) e 2020 tratados | `fase-3-linha-do-tempo` |
| 4. Financiamento | Ponte do primário ao nominal fecha | `fase-4-financiamento` |

Em cada fase: branch própria, brainstorming, plano em tarefas pequenas, teste antes do código, revisão, PR com o CI verde, merge.
Não comece a fase seguinte antes do critério de saída da anterior.

## 6. O que você revisa sempre

- Qualquer mudança em `mapeamento.json` ou `pipeline.py`: os 11 testes verdes e a diferença nos JSON de `dados/`.
- Rótulos e textos de metodologia na tela: "não oficial", "Déficit primário (financiado com dívida)", "não inclui juros".
- Que nenhum número fiscal apareça digitado no código do site (`git grep` por valores como `2902` ou `867`).
- Que o site funcione em subcaminho (`/sankey-fiscal/`) e não use caminhos absolutos.

## 7. Checklist do repositório público

- [x] `LICENSE` (MIT) para o código.
- [x] `entrada/LEIAME.md` com a fonte dos dados (Tesouro Nacional e IBGE); confira os termos de uso do Tesouro Transparente antes de redistribuir arquivos novos.
- [x] `.gitignore` cobre `.env` e arquivos locais do Claude Code (`CLAUDE.local.md`).
- [x] Descrição do repositório e tópicos (`sankey`, `d3`, `fiscal`, `brasil`, `dados-abertos`).
- [x] Aviso "visualização independente, baseada em dados do Tesouro Nacional" no topo do README.
- [ ] Aviso também na página, quando o site existir.
- [ ] Quando o site existir: URL do site (`castrillon.dev/sankey-fiscal`) no campo *Website* do repositório e no README.
