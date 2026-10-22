import { defineConfig } from '@playwright/test';

// Testes de navegador contra o build de teste (`--mode teste`, que aceita ?ano=), servido em /sankey-fiscal/.
// No CI usa o Chromium do Playwright; localmente, PW_CANAL=chrome usa o Chrome instalado.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/sankey-fiscal/',
    browserName: 'chromium',
    ...(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {}),
  },
  webServer: {
    command: 'npm run build:teste && npx vite preview --outDir dist-teste --port 4173 --strictPort',
    url: 'http://localhost:4173/sankey-fiscal/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
