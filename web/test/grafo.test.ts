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

  it('conservação por nó: entradas = valor = saídas', () => {
    for (const n of g.nos) {
      const entradas = g.fluxos.filter((f) => f.destino === n.id);
      const saidas = g.fluxos.filter((f) => f.origem === n.id);
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
    expect(g.fluxos.filter((f) => f.origem === 'resultado_primario')).toEqual([]);
    expect(g.nos.find((n) => n.id === 'resultado_primario')?.coluna).toBe(3);
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
