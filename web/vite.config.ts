import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { TEXTOS } from './src/textos.ts';

const ENDERECO = 'https://castrillon.dev/sankey-fiscal/';
const IMAGEM = { arquivo: 'og-image.png', largura: 1200, altura: 630 };

/** Título, descrição e Open Graph do index.html, com os textos de textos.ts e o mês-base de dados/indice.json. */
function metadados(): Plugin {
  const { mes_base } = JSON.parse(readFileSync(new URL('../dados/indice.json', import.meta.url), 'utf8')) as {
    mes_base: string;
  };
  const [ano, mes] = mes_base.split('-');
  const titulo = `${TEXTOS.titulo} · ${TEXTOS.produto}`;
  const descricao = `${TEXTOS.aviso.replace(/\.$/, '')}: ${TEXTOS.descricao}, em ${TEXTOS.precos} ${TEXTOS.meses[Number(mes) - 1]}/${ano}.`;
  // injectTo 'head' (no fim): o <meta charset> do index.html precisa vir antes do título acentuado.
  const nome = (name: string, content: string): HtmlTagDescriptor => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
  const og = (property: string, content: string): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs: { property, content },
    injectTo: 'head',
  });
  return {
    name: 'sankey-metadados',
    transformIndexHtml: () => [
      { tag: 'title', children: titulo, injectTo: 'head' },
      nome('description', descricao),
      og('og:type', 'website'),
      og('og:title', titulo),
      og('og:description', descricao),
      og('og:url', ENDERECO),
      og('og:locale', 'pt_BR'),
      og('og:image', `${ENDERECO}${IMAGEM.arquivo}`),
      og('og:image:width', String(IMAGEM.largura)),
      og('og:image:height', String(IMAGEM.altura)),
      og('og:image:alt', TEXTOS.tituloSvg),
      nome('twitter:card', 'summary_large_image'),
    ],
  };
}

// O site vive em castrillon.dev/sankey-fiscal/; nenhum caminho parte da raiz do domínio.
export default defineConfig({
  base: '/sankey-fiscal/',
  plugins: [react(), metadados()],
  test: { environment: 'node', include: ['test/**/*.test.{ts,tsx}'] },
});
