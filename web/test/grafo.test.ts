import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import type { Grafo } from '../src/grafo/tipos';
import { anos, lerAno } from './apoio/dados';

const TOL = 0.01; // R$ milhões: os JSON guardam 3 casas, a soma acumula arredondamento

const valor = (g: Grafo, id: string) => {
  const n = g.nos.find((x) => x.id === id);
  if (!n) throw new Error(`nó ${id} não existe`);
  return n.valor;
};
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe.each(anos())('grafo de %i', (ano) => {
  const d = lerAno(ano);
  const g = montarGrafo(d);

  it('identidades: receita total = origens = repasse + receita líquida; resultado fecha com a despesa', () => {
    const origens = g.nos.filter((n) => n.papel === 'origem');
    expect(origens.map((n) => n.id)).toEqual(d.estrutura.receita);
    expect(Math.abs(g.receitaTotal - soma(origens.map((n) => n.valor)))).toBeLessThan(TOL);
    expect(Math.abs(g.receitaTotal - (valor(g, d.estrutura.repasse) + valor(g, 'receita_liquida')))).toBeLessThan(TOL);
    const rl = valor(g, 'receita_liquida');
    const res = valor(g, 'resultado_primario');
    if (g.resultado === 'deficit') expect(Math.abs(rl + res - g.despesaTotal)).toBeLessThan(TOL);
    else expect(Math.abs(rl - (g.despesaTotal + res))).toBeLessThan(TOL);
  });

  it('conservação por nó: entradas = valor = saídas (fluxos de valor positivo)', () => {
    for (const n of g.nos) {
      // o fluxo do resultado que não se aplica no ano existe com valor 0 e não conta
      const entradas = g.fluxos.filter((f) => f.destino === n.id && f.valor > 0);
      const saidas = g.fluxos.filter((f) => f.origem === n.id && f.valor > 0);
      if (entradas.length) expect(Math.abs(soma(entradas.map((f) => f.valor)) - n.valor), `entradas de ${n.id}`).toBeLessThan(TOL);
      if (saidas.length) expect(Math.abs(soma(saidas.map((f) => f.valor)) - n.valor), `saídas de ${n.id}`).toBeLessThan(TOL);
      expect(entradas.length + saidas.length, `${n.id} isolado`).toBeGreaterThan(0);
    }
  });

  it('valores exatos do JSON; resultado com magnitude e sinal em Grafo.resultado', () => {
    for (const [id, v] of Object.entries(d.real.nos)) expect(valor(g, id)).toBe(v);
    expect(valor(g, 'receita_total')).toBe(d.real.totais.receita_total);
    expect(valor(g, 'receita_liquida')).toBe(d.real.totais.receita_liquida);
    expect(valor(g, 'despesa_total')).toBe(d.real.totais.despesa_total);
    expect(valor(g, 'resultado_primario')).toBe(Math.abs(d.real.totais.primario_acima));
    expect(g.resultado).toBe(d.real.totais.primario_acima < 0 ? 'deficit' : 'superavit');
    expect(valor(g, 'obrigatorias')).toBeCloseTo(soma(d.estrutura.obrigatorias.map((id) => d.real.nos[id])), 6);
  });

  it('nenhum valor negativo e coluna 5 na ordem fixa', () => {
    expect(g.nos.filter((n) => n.valor < 0)).toEqual([]);
    expect(g.fluxos.filter((f) => f.valor < 0)).toEqual([]);
    expect(g.nos.filter((n) => n.coluna === 5).map((n) => n.id)).toEqual([...d.estrutura.obrigatorias, d.estrutura.discricionarias]);
    expect(g.obrigatorias).toEqual(d.estrutura.obrigatorias);
  });

  it('linhas do RTN vêm do JSON (nó, totais e resultado)', () => {
    expect(g.nos.find((n) => n.id === 'csll')?.linhas ?? []).toEqual(d.linhas.csll ?? []);
    expect(g.nos.find((n) => n.id === 'resultado_primario')?.linhas).toEqual(d.linhas.primario_acima);
    expect(g.nos.find((n) => n.id === 'despesa_total')?.linhas).toEqual(d.linhas.despesa_total);
    expect(g.nos.find((n) => n.id === 'obrigatorias')?.linhas).toEqual([]);
  });
});

describe('superávit de 2022', () => {
  const g = montarGrafo(lerAno(2022));
  it('a receita líquida alimenta o resultado, que não alimenta nada', () => {
    expect(g.resultado).toBe('superavit');
    expect(g.fluxos.some((f) => f.origem === 'receita_liquida' && f.destino === 'resultado_primario')).toBe(true);
    expect(g.fluxos.filter((f) => f.origem === 'resultado_primario' && f.valor > 0)).toEqual([]);
    expect(g.nos.find((n) => n.id === 'resultado_primario')?.coluna).toBe(3);
  });
  it('o superávit tem a cor própria (ameixa); nos anos de déficit, a do déficit', () => {
    expect(g.nos.find((n) => n.id === 'resultado_primario')?.cor).toBe('superavit');
    expect(montarGrafo(lerAno(2025)).nos.find((n) => n.id === 'resultado_primario')?.cor).toBe('deficit');
  });
});

describe.each([2021, 2022])('fluxos do resultado em %i', (ano) => {
  const d = lerAno(ano);
  const g = montarGrafo(d);
  const fluxo = (o: string, de: string) => g.fluxos.filter((f) => f.origem === o && f.destino === de);
  it('os dois fluxos do resultado existem, um deles com valor 0; o resultado com sinal vem do JSON', () => {
    const [deficit] = fluxo('resultado_primario', 'despesa_total');
    const [superavit] = fluxo('receita_liquida', 'resultado_primario');
    expect(deficit).toBeDefined();
    expect(superavit).toBeDefined();
    const r = d.real.totais.primario_acima;
    expect(deficit.valor).toBe(Math.max(0, -r));
    expect(superavit.valor).toBe(Math.max(0, r));
    expect([deficit.valor, superavit.valor].filter((v) => v === 0)).toHaveLength(1);
    expect(fluxo('receita_liquida', 'despesa_total')[0].valor).toBe(Math.min(d.real.totais.receita_liquida, d.real.totais.despesa_total));
    expect(g.resultadoComSinal).toBe(r);
    if (ano === 2022) expect(g.resultadoComSinal).toBeGreaterThan(0);
  });
});

describe('rótulos', () => {
  const g = montarGrafo(lerAno(2025));
  it('déficit com o rótulo de textos.ts e folhas com o rótulo do JSON', () => {
    expect(g.nos.find((n) => n.id === 'resultado_primario')?.rotulo).toBe('Déficit primário (financiado com dívida)');
    expect(g.nos.find((n) => n.id === 'despesa_total')?.rotulo).toBe('Gasto total');
    expect(g.nos.find((n) => n.id === 'bpc')?.rotulo).toBe(lerAno(2025).rotulos.bpc);
  });
});
