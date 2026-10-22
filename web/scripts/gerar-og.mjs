// Gera public/og-image.png (1200 × 630), a imagem de compartilhamento, a partir do NOSSO gráfico: build de produção servido
// pelo vite preview, tema claro, último ano do índice, formato desktop, com o título e o aviso visíveis.
// Uso: npm run gerar-og (constrói antes). PW_CANAL=chrome usa o Chrome instalado.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { TEXTOS } from '../src/textos.ts';

const PASTA_WEB = fileURLToPath(new URL('../', import.meta.url));
const SAIDA = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const TELA = { width: 1200, height: 630 };
const LIMITE_BYTES = 400 * 1024;
const { anos } = JSON.parse(readFileSync(new URL('../../dados/indice.json', import.meta.url), 'utf8'));
const ano = anos[1];

const servidor = await preview({ root: PASTA_WEB, logLevel: 'silent', preview: { port: 4175, strictPort: true } });
const navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {});
try {
  const pagina = await navegador.newPage({ viewport: TELA, deviceScaleFactor: 1, colorScheme: 'light' });
  await pagina.goto(servidor.resolvedUrls.local[0]);
  await pagina.locator('h1 .ano').filter({ hasText: String(ano) }).waitFor();
  await pagina.locator('svg.sankey').waitFor();
  await pagina.evaluate(() => document.fonts.ready);

  for (const [nome, local] of [
    ['título', pagina.locator('h1')],
    ['aviso', pagina.locator('.aviso')],
  ]) {
    const caixa = await local.boundingBox();
    if (!caixa || caixa.y < 0 || caixa.y + caixa.height > TELA.height || caixa.x + caixa.width > TELA.width) {
      throw new Error(`${nome} fora da imagem: ${JSON.stringify(caixa)}`);
    }
  }
  if ((await pagina.locator('.aviso').textContent()) !== TEXTOS.aviso) throw new Error('aviso diferente de textos.ts');

  await pagina.screenshot({ path: SAIDA, type: 'png' });
} finally {
  await navegador.close();
  await new Promise((resolver) => servidor.httpServer.close(resolver));
}

const bytes = statSync(SAIDA).size;
if (bytes >= LIMITE_BYTES) throw new Error(`og-image.png com ${bytes} bytes (limite ${LIMITE_BYTES})`);
console.log(`ok: ${SAIDA} (${TELA.width} × ${TELA.height}, ${ano}, tema claro, ${Math.round(bytes / 1024)} KB)`);
