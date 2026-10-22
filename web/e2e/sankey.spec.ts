// Testes no navegador real, contra o build de teste (?ano=). Medidas com getBBox e getBoundingClientRect reais.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { TEXTOS } from '../src/textos';

interface Caixa {
  id?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const TELAS = [
  { nome: '1024x768', viewport: { width: 1024, height: 768 }, toque: false },
  { nome: '1280x720', viewport: { width: 1280, height: 720 }, toque: false },
  { nome: '390x844', viewport: { width: 390, height: 844 }, toque: true },
];
const ESQUEMAS = ['light', 'dark'] as const;
const ANOS = [2025, 2020];
const FOLGA = 2;
const MARGEM = 12;

const sobrepoe = (a: Caixa, b: Caixa, folga = 0) =>
  a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;

async function abrir(page: Page, ano: number) {
  await page.goto(`./?ano=${ano}`);
  await expect(page.locator('h1 .ano')).toContainText(String(ano));
  await page.locator('svg.sankey').waitFor();
}

/** Caixas dos rótulos em coordenadas do SVG (getBBox) e o tamanho do viewBox. */
async function rotulosSvg(page: Page) {
  return page.locator('svg.sankey').evaluate((svg: SVGSVGElement) => ({
    largura: svg.viewBox.baseVal.width,
    altura: svg.viewBox.baseVal.height,
    rotulos: [...svg.querySelectorAll<SVGTextElement>('text.rotulo')].map((t) => {
      const b = t.getBBox();
      return { id: t.dataset.id, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    }),
  }));
}

/** Caixa em coordenadas do documento (não muda com a rolagem da janela). */
const caixaDoc = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x0: r.left + scrollX, y0: r.top + scrollY, x1: r.right + scrollX, y1: r.bottom + scrollY };
  });

const igual = (a: Caixa, b: Caixa, campos: (keyof Caixa)[] = ['x0', 'y0', 'x1', 'y1']) => {
  for (const c of campos) expect(Math.abs((a[c] as number) - (b[c] as number)), `${String(c)}: ${a[c]} × ${b[c]}`).toBeLessThan(0.5);
};

/** Clique (ou toque) no centro da barra do nó. */
async function acionar(page: Page, id: string, toque: boolean) {
  const g = page.locator(`g.no[data-id="${id}"]`);
  const barra = g.locator('rect.barra');
  await barra.scrollIntoViewIfNeeded();
  const bb = (await barra.boundingBox())!;
  const gb = (await g.boundingBox())!;
  const position = { x: bb.x + bb.width / 2 - gb.x, y: bb.y + bb.height / 2 - gb.y };
  if (toque) await g.tap({ position });
  else await g.click({ position });
}

async function esperarRolagemParar(page: Page) {
  let anterior = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => scrollY);
    if (y === anterior) return;
    anterior = y;
    await page.waitForTimeout(100);
  }
}

/** Caixas da barra e do rótulo do nó na tela (coordenadas da janela). */
const caixasNaTela = (page: Page, id: string) =>
  page.locator(`g.no[data-id="${id}"]`).evaluate((g) =>
    [g.querySelector('rect.barra')!, g.querySelector('text.rotulo')!].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }),
  );

async function idsDosNos(page: Page) {
  return page.locator('g.no').evaluateAll((gs) => gs.map((g) => (g as SVGGElement).dataset.id!));
}

for (const tela of TELAS)
  for (const esquema of ESQUEMAS)
    for (const ano of ANOS)
      test.describe(`${ano} · ${tela.nome} · ${esquema}`, () => {
        test.use({ viewport: tela.viewport, colorScheme: esquema, hasTouch: tela.toque, isMobile: tela.toque });

        test('rótulos reais sem sobreposição e a pelo menos 12 px da borda do SVG', async ({ page }) => {
          await abrir(page, ano);
          const { largura, altura, rotulos } = await rotulosSvg(page);
          const colisoes: string[] = [];
          for (let i = 0; i < rotulos.length; i++)
            for (let j = i + 1; j < rotulos.length; j++)
              if (sobrepoe(rotulos[i], rotulos[j], FOLGA)) colisoes.push(`${rotulos[i].id} × ${rotulos[j].id}`);
          expect(colisoes).toEqual([]);
          const fora = rotulos.filter((r) => r.x0 < MARGEM || r.y0 < MARGEM || r.x1 > largura - MARGEM || r.y1 > altura - MARGEM);
          expect(fora.map((r) => r.id)).toEqual([]);
        });

        test('painel: sem pulo ao abrir, trocar e fechar; sem transbordar; sem cobrir texto', async ({ page }) => {
          await abrir(page, ano);
          const svg = page.getByTestId('svg-sankey');
          const rodape = page.getByTestId('rodape');
          const painel = page.getByTestId('painel');
          // no desenho do celular o painel tem altura automática: só o SVG fica parado; no desktop, também o rodapé
          const celular = await page.getByTestId('cartao').evaluate((el) => el.classList.contains('formato-celular'));
          const antes = { svg: await caixaDoc(svg), rodape: await caixaDoc(rodape) };
          for (const id of await idsDosNos(page)) {
            await acionar(page, id, tela.toque);
            await expect(painel.locator('.painel-titulo')).toBeVisible();
            igual(await caixaDoc(svg), antes.svg, ['y0', 'y1']);
            if (!celular) igual(await caixaDoc(rodape), antes.rodape);
            expect(await painel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), `painel de ${id} transborda`).toBe(true);
            const caixaPainel = await caixaDoc(painel);
            const textos = await page.locator('svg.sankey text.rotulo').evaluateAll((ts) =>
              ts.map((t) => {
                const r = t.getBoundingClientRect();
                return { x0: r.left + scrollX, y0: r.top + scrollY, x1: r.right + scrollX, y1: r.bottom + scrollY };
              }),
            );
            expect(textos.filter((t) => sobrepoe(t, caixaPainel)).length, `painel de ${id} cobre rótulo`).toBe(0);
          }
          await page.getByRole('button', { name: TEXTOS.fechar }).click();
          await expect(painel.locator('.convite')).toBeVisible();
          igual(await caixaDoc(svg), antes.svg, ['y0', 'y1']);
          igual(await caixaDoc(rodape), antes.rodape);
        });

        if (tela.toque)
          test('toque: o nó continua na tela, 120 px do painel entram, o SVG não se move; "ver no desenho" volta ao nó', async ({ page }) => {
            await abrir(page, ano);
            const svg = page.getByTestId('svg-sankey');
            const painel = page.getByTestId('painel');
            for (const id of ['imposto_renda', 'discricionarias']) {
              await page.evaluate(() => scrollTo(0, 0));
              const svgAntes = await caixaDoc(svg);
              await acionar(page, id, true);
              await expect(painel.locator('.painel-titulo')).toBeVisible();
              await esperarRolagemParar(page);
              const altura = tela.viewport.height;
              for (const c of await caixasNaTela(page, id)) {
                expect(c.top, `${id}: topo na tela`).toBeGreaterThanOrEqual(0);
                expect(c.bottom, `${id}: fundo na tela`).toBeLessThanOrEqual(altura);
              }
              // regra: nó a ≥ 16 px do topo e ≥ 120 px do painel; se não cabem juntos, o nó vence e o painel mostra o máximo possível
              const p = (await painel.boundingBox())!;
              const [barraAberta, rotuloAberto] = await caixasNaTela(page, id);
              const topoNo = Math.min(barraAberta.top, rotuloAberto.top);
              const cabemJuntos = p.y - topoNo <= altura - 120 - 16;
              const visivel = Math.min(p.y + p.height, altura) - Math.max(p.y, 0);
              if (cabemJuntos) expect(visivel, `${id}: painel visível`).toBeGreaterThanOrEqual(120);
              else {
                expect(topoNo, `${id}: nó a 16 px do topo (prioridade)`).toBeCloseTo(16, 0);
                test.info().annotations.push({ type: `${ano} ${id}`, description: `não cabem juntos: ${(p.y - topoNo).toFixed(0)} px entre nó e painel; painel visível ${visivel.toFixed(0)} px` });
              }
              igual(await caixaDoc(svg), svgAntes, ['y0', 'y1']);
              await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
              await page.getByRole('button', { name: TEXTOS.verNoDesenho }).tap();
              await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id)).toBe(id);
              await esperarRolagemParar(page);
              const [barra] = await caixasNaTela(page, id);
              expect(barra.top).toBeGreaterThanOrEqual(0);
              expect(barra.bottom).toBeLessThanOrEqual(altura);
              expect(barra.left).toBeGreaterThanOrEqual(0);
              expect(barra.right).toBeLessThanOrEqual(tela.viewport.width);
            }
          });

        if (tela.toque)
          test('paradas: rolagem encaixa nas duas paradas e nenhum rótulo é cortado nas bordas', async ({ page }) => {
            await abrir(page, ano);
            const rolagem = page.getByTestId('rolagem');
            const bordas = (await rolagem.getAttribute('data-parada'))!.split(',').map(Number);
            const paradas = [0, bordas[1]];
            const { rotulos } = await rotulosSvg(page);
            for (const p of paradas) {
              await rolagem.evaluate((el, x) => el.scrollTo({ left: x, behavior: 'instant' }), p);
              const { esq, larg } = await rolagem.evaluate((el) => ({ esq: el.scrollLeft, larg: el.clientWidth }));
              const cortados = rotulos.filter((r) => [esq, esq + larg].some((b) => r.x0 < b && r.x1 > b));
              expect(cortados.map((r) => r.id), `parada em ${p}`).toEqual([]);
            }
            await rolagem.evaluate((el, x) => el.scrollTo({ left: x, behavior: 'instant' }), bordas[1] / 2 + 10);
            await page.waitForTimeout(400);
            const final = await rolagem.evaluate((el) => el.scrollLeft);
            expect(paradas.some((p) => Math.abs(final - p) <= 1), `encaixou em ${final}`).toBe(true);
          });

        if (ano === 2025)
          test('foco: hover não move; clique, toque ou Enter levam ao painel; × e Esc devolvem ao nó', async ({ page }) => {
            await abrir(page, ano);
            const id = 'csll';
            const ativo = () => page.evaluate(() => {
              const el = document.activeElement as HTMLElement | null;
              return el?.dataset.testid ?? el?.dataset.id ?? el?.tagName ?? '';
            });
            if (!tela.toque) {
              await page.locator(`g.no[data-id="${id}"] rect.barra`).hover();
              await expect(page.getByTestId('tooltip')).toBeVisible();
              expect(await ativo()).toBe('BODY');
            }
            await acionar(page, id, tela.toque);
            await expect.poll(ativo).toBe('painel');
            await page.keyboard.press('Escape');
            await expect.poll(ativo).toBe(id);
            await acionar(page, id, tela.toque);
            await expect.poll(ativo).toBe('painel');
            await page.getByRole('button', { name: TEXTOS.fechar }).click();
            await expect.poll(ativo).toBe(id);
            await page.locator(`g.no[data-id="${id}"]`).focus();
            await page.keyboard.press('Enter');
            await expect.poll(ativo).toBe('painel');
          });

        if (tela.nome === '1280x720')
          test('dica de hover: nó mais alto e mais baixo, dentro da janela e do cartão, sem mexer no layout', async ({ page }) => {
            await abrir(page, ano);
            const svg = page.getByTestId('svg-sankey');
            const rodape = page.getByTestId('rodape');
            const antes = { svg: await caixaDoc(svg), rodape: await caixaDoc(rodape) };
            for (const id of ['imposto_renda', 'discricionarias']) {
              await page.locator(`g.no[data-id="${id}"] rect.barra`).hover();
              const dica = page.getByTestId('tooltip');
              await expect(dica).toBeVisible();
              await expect(dica).toHaveAttribute('aria-hidden', 'true');
              const d = (await dica.boundingBox())!;
              const c = (await page.getByTestId('cartao').boundingBox())!;
              expect(d.x).toBeGreaterThanOrEqual(0);
              expect(d.y).toBeGreaterThanOrEqual(0);
              expect(d.x + d.width).toBeLessThanOrEqual(tela.viewport.width);
              expect(d.y + d.height).toBeLessThanOrEqual(tela.viewport.height);
              expect(d.x).toBeGreaterThanOrEqual(c.x);
              expect(d.y).toBeGreaterThanOrEqual(c.y);
              expect(d.x + d.width).toBeLessThanOrEqual(c.x + c.width);
              expect(d.y + d.height).toBeLessThanOrEqual(c.y + c.height);
              igual(await caixaDoc(svg), antes.svg);
              igual(await caixaDoc(rodape), antes.rodape);
            }
          });
      });

test.describe('foco da revisão', () => {
  test('erro de carga: mensagem em texto, não página em branco', async ({ page }) => {
    await page.route('**/dados/2025.json', (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('./?ano=2025');
    await expect(page.getByTestId('erro')).toHaveText(TEXTOS.erroCarga);
  });

  test('320 px: só o contêiner rola; a página não ganha rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await abrir(page, 2025);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('redimensionar atravessando 1100 px troca o formato sem sobreposição', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrir(page, 2025);
    for (const largura of [800, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await expect(page.getByTestId('cartao')).toHaveClass(largura >= 1100 ? /formato-desktop/ : /formato-celular/);
      const { rotulos } = await rotulosSvg(page);
      for (let i = 0; i < rotulos.length; i++)
        for (let j = i + 1; j < rotulos.length; j++) expect(sobrepoe(rotulos[i], rotulos[j], FOLGA)).toBe(false);
    }
  });

  test('teclado: Tab chega aos nós em ordem de leitura; no celular, primeiro à rolagem', async ({ page }) => {
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await abrir(page, 2025);
      const ordem = await idsDosNos(page);
      const visitados: string[] = [];
      for (let i = 0; i < ordem.length + 1; i++) {
        await page.keyboard.press('Tab');
        visitados.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id ?? (document.activeElement as HTMLElement | null)?.dataset.testid ?? ''));
      }
      const esperado = largura < 1100 ? ['rolagem', ...ordem] : ordem;
      expect(visitados.slice(0, esperado.length)).toEqual(esperado);
    }
  });

  test('relato: rótulos cortados nas bordas das paradas a 360 e 768 px (não falha)', async ({ page }) => {
    for (const largura of [360, 768]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await abrir(page, 2025);
      const rolagem = page.getByTestId('rolagem');
      const parada = await rolagem.getAttribute('data-parada');
      if (!parada) {
        test.info().annotations.push({ type: `${largura} px`, description: 'sem rolagem' });
        continue;
      }
      const bordas = parada.split(',').map(Number);
      const { rotulos } = await rotulosSvg(page);
      let cortes = 0;
      for (const p of [0, bordas[1]]) {
        await rolagem.evaluate((el, x) => el.scrollTo({ left: x, behavior: 'instant' }), p);
        const { esq, larg } = await rolagem.evaluate((el) => ({ esq: el.scrollLeft, larg: el.clientWidth }));
        cortes += rotulos.filter((r) => [esq, esq + larg].some((b) => r.x0 < b && r.x1 > b)).length;
      }
      test.info().annotations.push({ type: `${largura} px`, description: `${cortes} rótulos cortados` });
    }
  });
});
