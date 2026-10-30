// Temas: contraste (WCAG 2.x) e distância de cor sob daltonismo. As séries vêm de TEMAS (a lista exata do que se desenha),
// nunca de uma lista à mão: uma série nova entra nos testes sozinha.
import { describe, expect, it } from 'vitest';
import { OPACIDADE_FLUXO } from '../src/layout/constantes';
import { contraste, misturar } from '../src/ui/cor';
import { cssDosTemas, TEMAS, type Paleta } from '../src/ui/tema';
import { ciede2000, deltaE, type TipoDaltonismo } from './apoio/daltonismo';

const TEMAS_LISTA = Object.entries(TEMAS) as [keyof typeof TEMAS, Paleta][];
const TIPOS: TipoDaltonismo[] = ['protanopia', 'deuteranopia', 'tritanopia'];
const series = (p: Paleta) => Object.entries(p.series) as [string, string][];

/**
 * Exceções conhecidas de contraste: cores aprovadas na fase 2 que ficam abaixo do limiar numa regra desta fase. Nenhuma cor
 * aprovada muda em silêncio; cada exceção diz por que o desenho continua legível. O teste confere que cada uma ainda está
 * abaixo do limiar (senão, sai da lista).
 */
const EXCECOES_CONTRASTE: Record<string, string> = {
  // o fluxo do déficit não é desenhado a 36%: é a hachura (cor cheia com listras) a 90%, e nenhum rótulo cai sobre ele
  // (provado em layout-anos.test.ts, "nenhum rótulo sobre a faixa do fluxo do déficit")
  'claro:deficit:secundario×fluxo': '4,31:1 (era 4,05:1 com o secundário antigo)',
  // no escuro o déficit tem contorno claro (#f2b8b5, testado abaixo) e a hachura
  'escuro:deficit:barra×fundo': '2,93:1',
};

describe('utilitários de cor', () => {
  it('contraste WCAG: preto × branco = 21 e cor × ela mesma = 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contraste('#2a78d6', '#2a78d6')).toBeCloseTo(1, 6);
  });
  it('misturar com alfa 0 devolve o fundo e com alfa 1 devolve a cor', () => {
    expect(misturar('#2a78d6', '#fcfcfb', 0)).toBe('#fcfcfb');
    expect(misturar('#2a78d6', '#fcfcfb', 1)).toBe('#2a78d6');
  });
  it('CIEDE2000 confere com os pares de referência de Sharma, Wu e Dalal (2005)', () => {
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(ciede2000([50, -1.3802, -84.2814], [50, 0, -82.7485])).toBeCloseTo(1.0, 4);
    expect(ciede2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
  });
});

describe.each(TEMAS_LISTA)('contraste, tema %s', (tema, p) => {
  const abaixo = (chave: string, valor: number, limiar: number) => valor < limiar && !(`${tema}:${chave}` in EXCECOES_CONTRASTE);

  it('as séries vêm de TEMAS e incluem o superávit (ameixa)', () => {
    expect(series(p).length).toBeGreaterThanOrEqual(6);
    expect(series(p).map(([s]) => s)).toContain('superavit');
    expect(p.series.superavit).toBe(tema === 'claro' ? '#a03c9a' : '#b04aa9');
  });

  it('texto e texto secundário a pelo menos 4,5:1 contra o fundo', () => {
    expect(contraste(p.texto, p.fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p.secundario, p.fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(series(p))('texto e texto secundário a pelo menos 4,5:1 contra o fluxo de %s (a cor a 36% sobre o fundo)', (s, cor) => {
    const fluxo = misturar(cor, p.fundo, OPACIDADE_FLUXO);
    expect(contraste(p.texto, fluxo)).toBeGreaterThanOrEqual(4.5);
    expect(abaixo(`${s}:secundario×fluxo`, contraste(p.secundario, fluxo), 4.5), `secundário × fluxo ${s}`).toBe(false);
  });

  it.each(series(p))('barra de %s a pelo menos 3:1 contra o fundo', (s, cor) => {
    expect(abaixo(`${s}:barra×fundo`, contraste(cor, p.fundo), 3), `barra ${s}: ${contraste(cor, p.fundo).toFixed(2)}:1`).toBe(false);
  });

  it('guias (texto secundário) a pelo menos 3:1 contra o fundo; a barra do superávit a pelo menos 3:1', () => {
    expect(contraste(p.secundario, p.fundo)).toBeGreaterThanOrEqual(3);
    expect(contraste(p.series.superavit, p.fundo)).toBeGreaterThanOrEqual(3);
  });

  it('déficit visível: a cor ou o contorno a pelo menos 3:1 contra o fundo', () => {
    const melhor = Math.max(contraste(p.series.deficit, p.fundo), p.contornoDeficit ? contraste(p.contornoDeficit, p.fundo) : 0);
    expect(melhor).toBeGreaterThanOrEqual(3);
  });

  it('cada exceção conhecida do tema ainda está abaixo do limiar (senão, sai da lista)', () => {
    for (const chave of Object.keys(EXCECOES_CONTRASTE).filter((k) => k.startsWith(`${tema}:`))) {
      const [, s, regra] = chave.split(':');
      const cor = p.series[s as keyof Paleta['series']];
      const valor = regra === 'barra×fundo' ? contraste(cor, p.fundo) : contraste(p.secundario, misturar(cor, p.fundo, OPACIDADE_FLUXO));
      expect(valor, chave).toBeLessThan(regra === 'barra×fundo' ? 3 : 4.5);
    }
  });
});

/**
 * Daltonismo (APROXIMAÇÃO): cada cor é simulada com as matrizes de Machado et al. (2009), severidade 1,0, em RGB linear, e a
 * distância entre duas séries é o ΔE00 (CIEDE2000) entre as cores simuladas. Limiar para pares de séries: ΔE00 ≥ 8.
 */
const LIMIAR_DELTA_E = 8;
/** Pares aprovados na fase 2 que ficam abaixo do limiar; o padrão (hachura, pontos) e os rótulos distinguem os nós. */
const EXCECOES_DALTONISMO: Record<string, string> = {
  // repasse (cinza) × discricionária (verde): colunas e posições diferentes, cada um com o seu rótulo
  'escuro:deuteranopia:repasse×discricionaria': 'ΔE00 6,6',
};

describe.each(TEMAS_LISTA)('daltonismo, tema %s', (tema, p) => {
  const pares = series(p).flatMap(([a], i) => series(p).slice(i + 1).map(([b]) => [a, b] as const));
  const tabela: Record<string, Record<string, string>> = {};
  for (const tipo of TIPOS)
    tabela[tipo] = Object.fromEntries(
      series(p).filter(([s]) => s !== 'superavit').map(([s, cor]) => [s, deltaE(cor, p.series.superavit, tipo).toFixed(1)]),
    );

  it.each(TIPOS)('%s: todo par de séries a ΔE00 ≥ 8 (fora as exceções conhecidas)', (tipo) => {
    const abaixo = pares
      .map(([a, b]) => ({ chave: `${tema}:${tipo}:${a}×${b}`, d: deltaE(p.series[a as keyof Paleta['series']], p.series[b as keyof Paleta['series']], tipo) }))
      .filter(({ chave, d }) => d < LIMIAR_DELTA_E && !(chave in EXCECOES_DALTONISMO))
      .map(({ chave, d }) => `${chave}: ${d.toFixed(1)}`);
    expect(abaixo).toEqual([]);
  });

  it.each(TIPOS)('%s: a ameixa (superávit) longe do vermelho do déficit, do azul da receita e do laranja do gasto', (tipo) => {
    for (const s of ['deficit', 'receita', 'gasto'] as const)
      expect(deltaE(p.series.superavit, p.series[s], tipo), `superavit × ${s}`).toBeGreaterThanOrEqual(LIMIAR_DELTA_E);
  });

  it('cada exceção conhecida do tema ainda está abaixo do limiar, e nenhuma envolve a ameixa', () => {
    for (const chave of Object.keys(EXCECOES_DALTONISMO).filter((k) => k.startsWith(`${tema}:`))) {
      const [, tipo, par] = chave.split(':');
      const [a, b] = par.split('×') as (keyof Paleta['series'])[];
      expect(par).not.toMatch(/superavit/);
      expect(deltaE(p.series[a], p.series[b], tipo as TipoDaltonismo), chave).toBeLessThan(LIMIAR_DELTA_E);
    }
    console.log(`\nΔE00 de cada série contra a ameixa (superávit), tema ${tema} (simulação de Machado et al. 2009):`);
    console.table(tabela);
  });
});

describe('CSS dos temas', () => {
  const css = cssDosTemas();
  it('tem o tema escuro por prefers-color-scheme e uma variável para cada papel e cada série', () => {
    expect(css).toContain('prefers-color-scheme: dark');
    const { series: s, ...papeis } = TEMAS.claro;
    for (const chave of [...Object.keys(papeis), ...Object.keys(s)]) expect(css).toContain(`--${chave}:`);
  });
  it('o contorno do déficit só existe no escuro; o texto secundário claro é #4e4d4a', () => {
    expect(TEMAS.claro.contornoDeficit).toBeNull();
    expect(TEMAS.escuro.contornoDeficit).toBe('#f2b8b5');
    expect(TEMAS.claro.secundario).toBe('#4e4d4a');
  });
});
