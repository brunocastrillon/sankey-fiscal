// Publicação na Vercel: vercel.json na raiz do repositório e o canonical no index.html construído.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const PASTA_WEB = fileURLToPath(new URL('../', import.meta.url));
const VERCEL_JSON = fileURLToPath(new URL('../../vercel.json', import.meta.url));
const CANONICAL = '<link rel="canonical" href="https://castrillon.dev/sankey-fiscal/">';

interface Cabecalho {
  source: string;
  headers: { key: string; value: string }[];
}
interface ConfigVercel {
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: Cabecalho[];
}

const lerConfig = (): ConfigVercel => JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as ConfigVercel;

describe('vercel.json', () => {
  it('existe na raiz do repositório e é JSON válido', () => {
    expect(existsSync(VERCEL_JSON)).toBe(true);
    expect(() => lerConfig()).not.toThrow();
  });

  it('instala, constrói e publica a partir de web/', () => {
    const config = lerConfig();
    expect(config.installCommand).toBe('cd web && npm ci --prefer-offline');
    expect(config.buildCommand).toBe('cd web && npm run build');
    expect(config.outputDirectory).toBe('web/dist');
  });

  it('reescreve /sankey-fiscal/* para a raiz do build', () => {
    expect(lerConfig().rewrites).toContainEqual({ source: '/sankey-fiscal/:path*', destination: '/:path*' });
  });

  it('define o cache dos arquivos com hash, dos dados e da página', () => {
    const cacheDe = (source: string) =>
      lerConfig()
        .headers.find((h) => h.source === source)
        ?.headers.find((h) => h.key === 'Cache-Control')?.value;
    expect(lerConfig().headers).toHaveLength(3);
    expect(cacheDe('/sankey-fiscal/assets/(.*)')).toBe('public, max-age=31536000, immutable');
    expect(cacheDe('/sankey-fiscal/dados/(.*)')).toBe('public, max-age=0, s-maxage=300, must-revalidate');
    expect(cacheDe('/sankey-fiscal/')).toBe('public, max-age=0, must-revalidate');
  });
});

describe('index.html construído', () => {
  it('aponta o canonical para castrillon.dev/sankey-fiscal/', { timeout: 60_000 }, async () => {
    const saida = (await build({
      root: PASTA_WEB,
      configFile: `${PASTA_WEB}vite.config.ts`,
      logLevel: 'silent',
      build: { write: false, copyPublicDir: false },
    })) as Rollup.RollupOutput;
    const html = saida.output.find((o) => o.fileName === 'index.html');
    expect(html?.type).toBe('asset');
    expect(String((html as Rollup.OutputAsset).source)).toContain(CANONICAL);
  });
});
