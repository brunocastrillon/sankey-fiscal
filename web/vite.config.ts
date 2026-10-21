import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// O site vive em castrillon.dev/sankey-fiscal/; nenhum caminho parte da raiz do domínio.
// `vite build --mode teste` liga o parâmetro ?ano= (só para o Playwright); o build normal não o contém.
export default defineConfig(({ mode }) => ({
  base: '/sankey-fiscal/',
  plugins: [react()],
  define: { __PERMITIR_ANO__: JSON.stringify(mode === 'teste') },
  test: { environment: 'node', include: ['test/**/*.test.{ts,tsx}'] },
}));
