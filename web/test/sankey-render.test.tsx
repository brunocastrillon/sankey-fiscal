// Contra o erro da tela 1 dos esboços: a espessura desenhada de cada fluxo é o valor DO GRAFO × escala.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { ASCENDENTE, CELULAR, DESKTOP, DESCENDENTE } from '../src/layout/constantes';
import { calcularLayout } from '../src/layout/layout';
import { TEXTOS } from '../src/textos';
import { Sankey } from '../src/ui/Sankey';
import { lerAno } from './apoio/dados';
import { espessurasDaFaixa } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const nada = () => {};

describe('superávit de 2022 renderizado', () => {
  const g = montarGrafo(lerAno(2022));
  const L = calcularLayout(g, DESKTOP, medidorDeterministico(), { largura: 1200 });
  const html = renderToStaticMarkup(<Sankey grafo={g} layout={L} idSvg="t" aoPassarMouse={nada} aoEscolher={nada} aoSair={nada} />);
  const tag = (re: RegExp) => html.match(re)?.[0] ?? '';

  it('nó com a cor cheia e pontos da cor do fundo; fluxo com a cor a 36% e pontos da cor cheia (cor nunca é o único sinal)', () => {
    const no = html.match(/<pattern id="t-pontos-no"[\s\S]*?<\/pattern>/)?.[0] ?? '';
    const fluxo = html.match(/<pattern id="t-pontos-fluxo"[\s\S]*?<\/pattern>/)?.[0] ?? '';
    expect(no).toMatch(/class="pontos-no-fundo"/);
    expect(no).toMatch(/<circle[^>]*class="pontos-no-ponto"/);
    expect(fluxo).toMatch(/class="pontos-fluxo-fundo"/);
    expect(fluxo).toMatch(/<circle[^>]*class="pontos-fluxo-ponto"/);
    const barra = tag(/<g class="no" data-id="resultado_primario"[\s\S]*?<rect class="barra"[^>]*>/).match(/<rect class="barra"[^>]*>/)?.[0] ?? '';
    expect(barra).toMatch(/fill="url\(#t-pontos-no\)"/);
    expect(barra).toMatch(/data-superavit="true"/);
    const f = tag(/<path class="fluxo" data-origem="receita_liquida" data-destino="resultado_primario"[^>]*>/);
    expect(f).toMatch(/fill="url\(#t-pontos-fluxo\)"/);
    expect(f).toMatch(/data-superavit="true"/);
  });

  it('nenhum outro nó ou fluxo usa os pontos', () => {
    expect(html.match(/url\(#t-pontos-no\)/g)).toHaveLength(1);
    expect(html.match(/url\(#t-pontos-fluxo\)/g)).toHaveLength(1);
  });
});

describe.each([
  ['desktop', DESKTOP, { largura: 1200 }],
  ['celular', CELULAR, { larguraVisivel: 390 }],
  ['celular 2020', CELULAR, { larguraVisivel: 390 }],
] as const)('Sankey renderizado (%s)', (nome, cfg, opcoes) => {
  const g = montarGrafo(lerAno(nome.includes('2020') ? 2020 : 2025));
  const L = calcularLayout(g, cfg, medidorDeterministico(), opcoes);
  const html = renderToStaticMarkup(
    <Sankey grafo={g} layout={L} idSvg="t" aoPassarMouse={nada} aoEscolher={nada} aoSair={nada} />,
  );
  const fluxos = [...html.matchAll(/<path[^>]*class="fluxo"[^>]*>/g)].map((m) => m[0]);
  const attr = (tag: string, nome: string) => tag.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? '';

  it('sem <title> no SVG (dica nativa); o nome acessível é o aria-label, com o ano', () => {
    expect(html).not.toMatch(/<title\b/);
    const svg = html.match(/<svg[^>]*class="sankey"[^>]*>/)![0];
    expect(attr(svg, 'aria-label')).toBe(`${TEXTOS.tituloSvg}, ${g.ano}`);
    expect(attr(svg, 'aria-labelledby')).toBe('');
  });

  it('o <svg> é um grupo (nunca role="img", que esconderia os nós focáveis) com um botão por nó de valor positivo', () => {
    const svg = html.match(/<svg[^>]*class="sankey"[^>]*>/)![0];
    expect(attr(svg, 'role')).toBe('group');
    const botoes = [...html.matchAll(/<g class="no" data-id="([^"]+)" role="button" tabindex="0"/g)].map((m) => m[1]);
    expect(botoes).toEqual(g.nos.filter((n) => n.valor > 0).map((n) => n.id));
  });

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

  it('cada rótulo é desenhado dentro da caixa que o layout testou', () => {
    const textos = [...html.matchAll(/<text[^>]*class="rotulo[^"]*"[^>]*data-id="([^"]+)"[^>]*>(.*?)<\/text>/g)];
    expect(textos).toHaveLength(L.rotulos.length);
    for (const [, id, corpo] of textos) {
      const r = L.rotulos.find((x) => x.id === id)!;
      const ys = [...corpo.matchAll(/<tspan[^>]* y="([^"]+)"/g)].map((m) => Number(m[1]));
      expect(ys).toHaveLength(r.linhas.length);
      expect(ys[0] - ASCENDENTE * L.fonte, `${id}: topo da primeira linha`).toBeCloseTo(r.caixa.y0, 6);
      expect(ys[ys.length - 1] + DESCENDENTE * L.fonte, `${id}: fundo da última linha`).toBeCloseTo(r.caixa.y1, 6);
    }
  });

  it('o botão do déficit anuncia "não inclui juros" junto ao valor', () => {
    const deficit = html.match(/<g[^>]*class="no"[^>]*data-id="resultado_primario"[^>]*>/)?.[0] ?? '';
    expect(attr(deficit, 'aria-label')).toContain(TEXTOS.naoIncluiJuros);
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
