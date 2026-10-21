import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { participacao } from '../src/grafo/participacao';
import { lerAno } from './apoio/dados';

describe('participação com a base escrita', () => {
  const d = lerAno(2025);
  const g = montarGrafo(d);

  it('origens e repasse sobre a receita total', () => {
    expect(participacao(g, 'csll')).toEqual({ base: 'receita', fracao: d.real.nos.csll / d.real.totais.receita_total });
    expect(participacao(g, d.estrutura.repasse).base).toBe('receita');
    expect(participacao(g, 'receita_liquida').base).toBe('receita');
  });

  it('despesas e resultado sobre a despesa total', () => {
    expect(participacao(g, 'bpc')).toEqual({ base: 'despesa', fracao: d.real.nos.bpc / d.real.totais.despesa_total });
    expect(participacao(g, 'resultado_primario')).toEqual({
      base: 'despesa',
      fracao: Math.abs(d.real.totais.primario_acima) / d.real.totais.despesa_total,
    });
    expect(participacao(g, 'obrigatorias').base).toBe('despesa');
  });
});
