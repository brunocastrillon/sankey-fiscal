// Modos de leitura: R$ constantes, % da despesa (sobre R$ constantes) e % do PIB (correntes sobre o PIB corrente).
import { describe, expect, it } from 'vitest';
import { formatarValor } from '../src/formatar';
import { grafoDeValores, montarGrafo, valoresDoModo } from '../src/grafo/grafo';
import type { Grafo, Modo } from '../src/grafo/tipos';
import { anos, lerAno } from './apoio/dados';

const MODOS: Modo[] = ['rs', 'desp', 'pib'];
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** "48,3%" → 48.3 */
const lerPct = (rotulo: string) => {
  expect(rotulo).toMatch(/^-?[\d.]+,\d+%$/);
  return Number(rotulo.replace('%', '').replace(/\./g, '').replace(',', '.'));
};
const valor = (g: Grafo, id: string) => g.nos.find((n) => n.id === id)!.valor;

describe.each(anos())('modos de %i', (ano) => {
  const d = lerAno(ano);

  it('% da despesa: o rótulo × despesa total real / 100 volta ao valor real (≤ 0,05 p.p.)', () => {
    const rs = montarGrafo(d, 'rs');
    const desp = montarGrafo(d, 'desp');
    const dt = d.real.totais.despesa_total;
    const erros: string[] = [];
    for (const n of desp.nos) {
      const lido = lerPct(formatarValor(n.valor, 'desp'));
      const desvio = Math.abs(lido - (valor(rs, n.id) * 100) / dt);
      if (desvio > 0.05 + 1e-9) erros.push(`${n.id}: ${desvio.toFixed(3)} p.p.`);
    }
    expect(erros).toEqual([]);
  });

  it.each(MODOS)('conservação por nó no modo %s (fluxos de valor positivo)', (modo) => {
    const g = montarGrafo(d, modo);
    // tolerância de 0,01 R$ mi (os JSON guardam 3 casas), levada à unidade do modo
    const tol = modo === 'rs' ? 0.01 : modo === 'desp' ? (0.01 * 100) / d.real.totais.despesa_total : (0.01 * 100) / d.pib.valor_nominal;
    for (const n of g.nos) {
      const entradas = g.fluxos.filter((f) => f.destino === n.id && f.valor > 0);
      const saidas = g.fluxos.filter((f) => f.origem === n.id && f.valor > 0);
      if (entradas.length) expect(Math.abs(soma(entradas.map((f) => f.valor)) - n.valor), `entradas de ${n.id}`).toBeLessThan(tol);
      if (saidas.length) expect(Math.abs(soma(saidas.map((f) => f.valor)) - n.valor), `saídas de ${n.id}`).toBeLessThan(tol);
    }
    expect(g.modo).toBe(modo);
  });

  it('grafoDeValores(valoresDoModo) é o montarGrafo; o resultado leva o sinal nos três modos', () => {
    for (const modo of MODOS) {
      const v = valoresDoModo(d, modo);
      expect(v.ano).toBe(ano);
      expect(v.modo).toBe(modo);
      expect(grafoDeValores(v, d)).toEqual(montarGrafo(d, modo));
      expect(Math.sign(montarGrafo(d, modo).resultadoComSinal)).toBe(Math.sign(d.real.totais.primario_acima));
    }
  });
});

describe('% do PIB com duas casas', () => {
  it('déficit de 2025 = 0,48% e superávit de 2022 = 0,46%, diferentes', () => {
    const def = formatarValor(valor(montarGrafo(lerAno(2025), 'pib'), 'resultado_primario'), 'pib');
    const sup = formatarValor(valor(montarGrafo(lerAno(2022), 'pib'), 'resultado_primario'), 'pib');
    expect(def).toBe('0,48%');
    expect(sup).toBe('0,46%');
    expect(def).not.toBe(sup);
  });
});

describe('formatarValor', () => {
  it('R$ em bilhões; % da despesa com uma casa; % do PIB com duas', () => {
    expect(formatarValor(1234567.8, 'rs')).toBe('R$ 1.234,6 bi');
    expect(formatarValor(48.3456, 'desp')).toBe('48,3%');
    expect(formatarValor(0.4836, 'pib')).toBe('0,48%');
  });
});
