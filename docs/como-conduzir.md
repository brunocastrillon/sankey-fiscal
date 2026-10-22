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

- Qualquer mudança em `mapeamento.json` ou `pipeline.py`: todos os testes verdes e a diferença nos JSON de `dados/`.
- Rótulos e textos de metodologia na tela: "não oficial", "Déficit primário (financiado com dívida)", "não inclui juros".
- Que nenhum número fiscal apareça digitado no código do site (`git grep` por valores como `2902` ou `867` em `web/src`). Os valores de referência do gráfico original ficam em `referencias/`, fora do site.
- Que o site funcione em subcaminho (`/sankey-fiscal/`) e não use caminhos absolutos.

## 7. Checklist do repositório público

- [x] `LICENSE` (MIT) para o código.
- [x] `entrada/LEIAME.md` com a fonte dos dados (Tesouro Nacional e IBGE); confira os termos de uso do Tesouro Transparente antes de redistribuir arquivos novos.
- [x] `.gitignore` cobre `.env` e arquivos locais do Claude Code (`CLAUDE.local.md`).
- [x] Descrição do repositório e tópicos (`sankey`, `svg`, `data-visualization`, `fiscal`, `brasil`, `dados-abertos`).
- [x] Aviso "visualização independente, baseada em dados do Tesouro Nacional" no topo do README.
- [x] Aviso também na página (`web/src/textos.ts`), publicada em `castrillon.dev/sankey-fiscal`.
- [x] URL do site (`https://castrillon.dev/sankey-fiscal`) no campo *Website* do repositório e no README.

## 8. Publicação na Vercel

O site é publicado por um **projeto próprio na Vercel** (`sankey-fiscal`), ligado a este repositório pelo GitHub, com a raiz
do repositório como *Root Directory*. Tudo o que o build precisa está no `vercel.json` da raiz:

- `installCommand` e `buildCommand` entram em `web/` e rodam `npm ci` e `npm run build`; o `prebuild` copia `dados/` para
  `web/public/dados/`, então os JSON publicados são os versionados no repositório.
- `outputDirectory` é `web/dist`.
- `framework` é `null` (preset *Other*): o `requirements.txt` e o `pipeline.py` na raiz fariam a Vercel detectar o projeto
  como Python.
- O build usa `base: '/sankey-fiscal/'`, mas os arquivos ficam na raiz de `web/dist`; duas reescritas ligam uma coisa à
  outra: `/sankey-fiscal/` → `/index.html` (a regra com `:path*` não casa com a barra final sozinha) e
  `/sankey-fiscal/:path*` → `/:path*`. O teste de `web/test/publicacao.test.ts` confere isso com o conversor da Vercel.
- Cache: `assets/` (nomes com hash) é imutável por um ano; `dados/` é sempre revalidado pelo navegador e guardado 5 minutos na
  CDN; a página é sempre revalidada.
- Título, descrição e Open Graph entram no `index.html` pelo plugin `sankey-metadados` do `vite.config.ts` (textos de
  `src/textos.ts`, mês-base de `dados/indice.json`). A imagem `web/public/og-image.png` (1200 × 630, menos de 400 KB) é um print
  do nosso gráfico: `npm run gerar-og` a regenera (tema claro, último ano, desktop); versione o PNG quando o desenho mudar. O
  script escala a página para o título, o aviso e o desenho inteiro caberem com 24 px de margem, e sai com erro, sem gravar,
  se alguma caixa ficar fora (`OG_ESCALA=1.3` força a escala para testar a trava).
- O job `site` do CI roda `npm audit --omit=dev --audit-level=high`: só as dependências de produção barram o merge.

**Node.** O CI usa o Node 24 e `web/package.json` declara `"engines": { "node": "24.x" }`. A Vercel lê o `engines` do
`package.json` da *Root Directory*, e a raiz deste repositório não tem `package.json`; por isso a versão também fica fixada em
*Settings → Build and Deployment → Node.js Version* (24.x).

**Reescrita pela landing.** O endereço público é `castrillon.dev/sankey-fiscal`. O projeto da landing (`castrillon.dev`) tem
uma reescrita de `/sankey-fiscal/:path*` para `https://<domínio de produção do sankey-fiscal>/sankey-fiscal/:path*`. O navegador
continua vendo `castrillon.dev`; o `<link rel="canonical">` do `index.html` aponta para `https://castrillon.dev/sankey-fiscal/`.

**Domínio de produção.** Cada merge na `main` gera um deploy de produção, servido no domínio de produção do projeto (o
`*.vercel.app` que a Vercel atribui, ou um domínio próprio). É esse domínio que a reescrita da landing usa, e ele precisa
responder sem login.

**Prévias.** Cada PR gera uma prévia com URL própria, protegida por login na Vercel (*Deployment Protection → Vercel
Authentication*). O site da prévia fica em `https://<prévia>.vercel.app/sankey-fiscal/`.

O CI do GitHub continua sendo a barreira: só se faz merge na `main` com os três jobs verdes.

## 9. Publicação

- O Sankey é um projeto Vercel próprio (<https://sankey-fiscal.vercel.app>), publicado pelo merge na `main`.
- A landing (repositório `protocolo-genesis`, `clientes/bruno-castrillon-landing/site/vercel.json`) o serve em
  `castrillon.dev/sankey-fiscal` por reescrita.
- A landing **não** tem integração com o Git: todo deploy dela sai de `site/` com `vercel --prod` e deve ser seguido de
  `curl.exe -sI https://castrillon.dev/sankey-fiscal/` (esperado: 200, `text/html`).
- Atenção: se a landing ganhar uma CSP, ela vale para este caminho e precisa permitir os estilos inline do Sankey.

## 10. Manutenção

- **Dependabot** (`.github/dependabot.yml`): `npm` em `web/`, `pip` e `github-actions`, uma vez por mês, um PR agrupado por
  ecossistema (no máximo 3 abertos cada), commits com `chore(deps):`. As atualizações de versão só consideram versões
  publicadas há 14 dias ou mais (`cooldown`). As atualizações de **segurança** ignoram o cooldown e o mês: saem assim que o
  alerta aparece. Cada PR passa pelos três checks como qualquer outro.
- **Playwright** fica fora do Dependabot (`@playwright/test`, `playwright` e `playwright-core` no `ignore`, que vale também
  para as atualizações de segurança): o pacote e a imagem do job `site-navegador` sobem juntos, à mão, no mesmo PR.
  1. `cd web && npm install -D --save-exact @playwright/test@<versão>`.
  2. No `.github/workflows/testes.yml`, `image: mcr.microsoft.com/playwright:v<versão>-noble`, a mesma versão.
  3. `npm run e2e` local e os três checks no PR. Com versões diferentes, o Playwright não encontra o navegador da imagem.
