// Contra o erro da tela 1 dos esboços: a espessura desenhada de cada fluxo é o valor DO GRAFO × escala.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { CELULAR, DESKTOP } from '../src/layout/constantes';
import { calcularLayout } from '../src/layout/layout';
import { Sankey } from '../src/ui/Sankey';
import { lerAno } from './apoio/dados';
import { espessurasDaFaixa } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const nada = () => {};

describe.each([
  ['desktop', DESKTOP, { largura: 1200 }],
  ['celular', CELULAR, { larguraVisivel: 390 }],
] as const)('Sankey de 2025 renderizado (%s)', (_, cfg, opcoes) => {
  const g = montarGrafo(lerAno(2025));
  const L = calcularLayout(g, cfg, medidorDeterministico(), opcoes);
  const html = renderToStaticMarkup(
    <Sankey grafo={g} layout={L} idSvg="t" aoApontar={nada} aoEscolher={nada} aoSair={nada} />,
  );
  const fluxos = [...html.matchAll(/<path[^>]*class="fluxo"[^>]*>/g)].map((m) => m[0]);
  const attr = (tag: string, nome: string) => tag.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? '';

  it('desenha um path.fluxo por fluxo do grafo com valor > 0', () => {
    expect(fluxos).toHaveLength(g.fluxos.filter((f) => f.valor > 0).length);
  });

  it('a espessura no atributo d, nas duas pontas, é o valor do grafo × escala', () => {
    for (const tag of fluxos) {
      const f = g.fluxos.find((x) => x.origem === attr(tag, 'data-origem') && x.destino === attr(tag, 'data-destino'))!;
      expect(f, tag).toBeDefined();
      const e = espessurasDaFaixa(attr(tag, 'd'));
      const esperada = f.valor * L.escala;
      expect(Math.abs(e.saida / esperada - 1)).toBeLessThan(0.01);
      expect(Math.abs(e.entrada / esperada - 1)).toBeLessThan(0.01);
    }
  });

  it('cada nó é um botão acessível com rótulo e valor', () => {
    const botoes = [...html.matchAll(/<g[^>]*class="no"[^>]*>/g)].map((m) => m[0]);
    expect(botoes).toHaveLength(g.nos.length);
    for (const b of botoes) {
      expect(b).toContain('role="button"');
      expect(b).toContain('tabindex="0"');
      expect(attr(b, 'aria-label')).toMatch(/: R\$ /);
    }
  });
});
