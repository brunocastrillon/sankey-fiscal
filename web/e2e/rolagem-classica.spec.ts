// Barra de rolagem clássica (Windows): o Playwright esconde as barras por padrão; aqui elas aparecem e ocupam ~15 px.
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] }, viewport: { width: 1140, height: 1000 } });

test('perto de 1100 px, com barra de rolagem, o formato não oscila', async ({ page }) => {
  await page.goto('./#2025');
  await page.locator('svg.sankey').waitFor();
  const classes: string[] = [];
  for (let i = 0; i < 20; i++) {
    classes.push((await page.getByTestId('cartao').getAttribute('class')) ?? '');
    await page.waitForTimeout(50);
  }
  expect(new Set(classes).size, classes.join(' | ')).toBe(1);
});
