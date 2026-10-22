// Gera public/og-image.png (1200 × 630), a imagem de compartilhamento, a partir do NOSSO gráfico: build de produção servido
// pelo vite preview, tema claro, último ano do índice, formato desktop. O título, o aviso e o desenho inteiro (com todos os
// rótulos) cabem no recorte com MARGEM px de cada lado; senão o script sai com erro e não grava o arquivo.
// Uso: npm run gerar-og (constrói antes). PW_CANAL=chrome usa o Chrome instalado. OG_ESCALA=1.3 força a escala (para testar
// a trava); sem ela, a escala é calculada para caber.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { TEXTOS } from '../src/textos.ts';

const PASTA_WEB = fileURLToPath(new URL('../', import.meta.url));
const SAIDA = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const RECORTE = { width: 1200, height: 630 };
const MARGEM = 24;
// Janela larga e alta: o desenho sai no formato desktop e inteiro antes de ser escalado (transform não muda o layout).
const JANELA = { width: 1280, height: 1600 };
const LIMITE_BYTES = 400 * 1024;
const { anos } = JSON.parse(readFileSync(new URL('../../dados/indice.json', import.meta.url), 'utf8'));
const ano = anos[1];
const escalaForcada = process.env.OG_ESCALA ? Number(process.env.OG_ESCALA) : null;

/** Caixas (getBoundingClientRect) do título, do aviso, do svg e de cada rótulo, na página. */
const medir = (pagina) =>
  pagina.evaluate(() => {
    const caixa = (nome, el) => {
      const r = el.getBoundingClientRect();
      return { nome, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    };
    return [
      caixa('título', document.querySelector('h1')),
      caixa('aviso', document.querySelector('.aviso')),
      caixa('svg', document.querySelector('svg.sankey')),
      ...[...document.querySelectorAll('svg.sankey text.rotulo')].map((t) => caixa(`rótulo "${t.textContent}"`, t)),
    ];
  });

const servidor = await preview({ root: PASTA_WEB, logLevel: 'silent', preview: { port: 4175, strictPort: true } });
const navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {});
try {
  const pagina = await navegador.newPage({ viewport: JANELA, deviceScaleFactor: 1, colorScheme: 'light' });
  await pagina.goto(servidor.resolvedUrls.local[0]);
  await pagina.locator('h1 .ano').filter({ hasText: String(ano) }).waitFor();
  await pagina.locator('svg.sankey').waitFor();
  await pagina.evaluate(() => document.fonts.ready);
  if ((await pagina.locator('.aviso').textContent()) !== TEXTOS.aviso) throw new Error('aviso diferente de textos.ts');

  // Escala e deslocamento que centralizam o conjunto (título, aviso e svg) no recorte, com a margem.
  const antes = await medir(pagina);
  const x0 = Math.min(...antes.map((c) => c.x0));
  const y0 = Math.min(...antes.map((c) => c.y0));
  const x1 = Math.max(...antes.map((c) => c.x1));
  const y1 = Math.max(...antes.map((c) => c.y1));
  const escala =
    escalaForcada ?? Math.min((RECORTE.width - 2 * MARGEM) / (x1 - x0), (RECORTE.height - 2 * MARGEM) / (y1 - y0), 1);
  const dx = (RECORTE.width - (x1 - x0) * escala) / 2 - x0 * escala;
  const dy = (RECORTE.height - (y1 - y0) * escala) / 2 - y0 * escala;
  await pagina.evaluate(
    ({ escala, dx, dy }) => {
      const pagina = document.querySelector('main.pagina');
      pagina.style.transformOrigin = '0 0';
      pagina.style.transform = `translate(${dx}px, ${dy}px) scale(${escala})`;
    },
    { escala, dx, dy },
  );

  // Trava: depois de escalar, tudo dentro do recorte com a margem; senão sai sem gravar.
  const fora = (await medir(pagina)).filter(
    (c) => c.x0 < MARGEM || c.y0 < MARGEM || c.x1 > RECORTE.width - MARGEM || c.y1 > RECORTE.height - MARGEM,
  );
  if (fora.length) {
    const linhas = fora.map((c) => `  ${c.nome}: x ${c.x0.toFixed(1)}–${c.x1.toFixed(1)}, y ${c.y0.toFixed(1)}–${c.y1.toFixed(1)}`);
    throw new Error(
      `escala ${escala.toFixed(3)}: ${fora.length} caixa(s) fora de ${RECORTE.width} × ${RECORTE.height} com margem de ` +
        `${MARGEM} px; og-image.png não foi gravado\n${linhas.join('\n')}`,
    );
  }

  await pagina.screenshot({ path: SAIDA, type: 'png', clip: { x: 0, y: 0, ...RECORTE } });
  console.log(`escala ${escala.toFixed(3)}; conjunto ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} px antes de escalar`);
} finally {
  await navegador.close();
  await new Promise((resolver) => servidor.httpServer.close(resolver));
}

const bytes = statSync(SAIDA).size;
if (bytes >= LIMITE_BYTES) throw new Error(`og-image.png com ${bytes} bytes (limite ${LIMITE_BYTES})`);
console.log(`ok: ${SAIDA} (${RECORTE.width} × ${RECORTE.height}, ${ano}, tema claro, ${Math.round(bytes / 1024)} KB)`);
