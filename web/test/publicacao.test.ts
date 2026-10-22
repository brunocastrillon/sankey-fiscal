// Publicação na Vercel: vercel.json na raiz do repositório; canonical, metadados e imagem de compartilhamento no build.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatarMesBase } from '../src/formatar';
import { TEXTOS } from '../src/textos';

const PASTA_WEB = fileURLToPath(new URL('../', import.meta.url));
const VERCEL_JSON = fileURLToPath(new URL('../../vercel.json', import.meta.url));
const INDICE_JSON = fileURLToPath(new URL('../../dados/indice.json', import.meta.url));
const MES_BASE = (JSON.parse(readFileSync(INDICE_JSON, 'utf8')) as { mes_base: string }).mes_base;
const CANONICAL = '<link rel="canonical" href="https://castrillon.dev/sankey-fiscal/">';

interface Cabecalho {
  source: string;
  headers: { key: string; value: string }[];
}
interface ConfigVercel {
  framework?: string | null;
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

  it('fixa o preset "Other" (framework null), sem detecção automática', () => {
    // O requirements.txt e o pipeline.py na raiz fariam a Vercel detectar o projeto como Python.
    const config = lerConfig();
    expect(config).toHaveProperty('framework');
    expect(config.framework).toBeNull();
  });

  it('instala, constrói e publica a partir de web/', () => {
    const config = lerConfig();
    expect(config.installCommand).toBe('cd web && npm ci --prefer-offline');
    expect(config.buildCommand).toBe('cd web && npm run build');
    expect(config.outputDirectory).toBe('web/dist');
  });

  it('reescreve /sankey-fiscal/ para o index.html e /sankey-fiscal/* para a raiz do build, nessa ordem', () => {
    expect(lerConfig().rewrites).toEqual([
      { source: '/sankey-fiscal/', destination: '/index.html' },
      { source: '/sankey-fiscal/:path*', destination: '/:path*' },
    ]);
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

// As reescritas convertidas pelo mesmo conversor da Vercel; prova a regra, não o deploy.
describe('rotas do vercel.json', () => {
  const casaReescrita = (endereco: string): boolean => {
    const { routes, error } = getTransformedRoutes({ rewrites: lerConfig().rewrites });
    if (error || !routes) throw new Error(`vercel.json inválido para a Vercel: ${error?.message}`);
    const { pathname } = new URL(endereco, 'https://exemplo.invalid');
    return routes.some(
      (r) => 'src' in r && r.src !== undefined && r.dest !== undefined && new RegExp(r.src).test(pathname),
    );
  };

  it.each([
    '/sankey-fiscal/',
    '/sankey-fiscal',
    '/sankey-fiscal/dados/2025.json',
    '/sankey-fiscal/assets/x.js',
    '/sankey-fiscal/?ano=2020',
  ])('%s casa com uma reescrita', (endereco) => {
    expect(casaReescrita(endereco)).toBe(true);
  });

  it('/outra-coisa não casa com nenhuma reescrita', () => {
    expect(casaReescrita('/outra-coisa')).toBe(false);
  });
});

describe('build de produção', () => {
  let pasta = '';
  let html = '';
  const meta = (atributo: 'name' | 'property', chave: string) =>
    html.match(new RegExp(`<meta ${atributo}="${chave}" content="([^"]*)"`))?.[1];

  beforeAll(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'sankey-build-'));
    await build({
      root: PASTA_WEB,
      configFile: `${PASTA_WEB}vite.config.ts`,
      logLevel: 'silent',
      build: { outDir: pasta, emptyOutDir: true },
    });
    html = readFileSync(join(pasta, 'index.html'), 'utf8');
  }, 60_000);
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  it('aponta o canonical para castrillon.dev/sankey-fiscal/', () => {
    expect(html).toContain(CANONICAL);
  });

  it('declara a página em português do Brasil, com o charset antes do título e dos metadados', () => {
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html.indexOf('<meta charset="UTF-8"')).toBeGreaterThan(-1);
    expect(html.indexOf('<meta charset="UTF-8"')).toBeLessThan(html.indexOf('<title>'));
  });

  it('tem título e descrição montados de textos.ts e do mês-base dos dados', () => {
    const titulo = 'Receitas e despesas do Governo Central · Sankey fiscal';
    const descricao =
      'Visualização independente, baseada em dados do Tesouro Nacional: de onde vêm e para onde vão as receitas e ' +
      `despesas primárias do Governo Central, em R$ constantes de ${formatarMesBase(MES_BASE)}.`;
    expect(html.match(/<title>([^<]*)<\/title>/g)).toEqual([`<title>${titulo}</title>`]);
    expect(meta('name', 'description')).toBe(descricao);
    expect(meta('property', 'og:title')).toBe(titulo);
    expect(meta('property', 'og:description')).toBe(descricao);
  });

  it('tem o Open Graph e o cartão grande do Twitter', () => {
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:url')).toBe('https://castrillon.dev/sankey-fiscal/');
    expect(meta('property', 'og:locale')).toBe('pt_BR');
    expect(meta('property', 'og:image')).toBe('https://castrillon.dev/sankey-fiscal/og-image.png');
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toBe(TEXTOS.tituloSvg);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('publica og-image.png: PNG de exatamente 1200 × 630 e menos de 400 KB', () => {
    const arquivo = join(pasta, 'og-image.png');
    expect(existsSync(arquivo)).toBe(true);
    const png = readFileSync(arquivo);
    // Assinatura PNG; o primeiro bloco é o IHDR, com largura e altura em big-endian nos bytes 16–23.
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect({ largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) }).toEqual({ largura: 1200, altura: 630 });
    expect(statSync(arquivo).size).toBeLessThan(400 * 1024);
  });
});
