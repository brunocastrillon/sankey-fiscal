// Critério de saída da fase 2: o grafo de 2025 bate com o gráfico original (até a tolerância por nó da referência).
import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { lerAno, lerReferencia } from './apoio/dados';

const N_VALORES = 18; // 12 nós + 1 grupo + 4 totais + déficit
const MI_POR_BI = 1000;

describe('grafo de 2025 contra o gráfico original', () => {
  const ref = lerReferencia();
  const g = montarGrafo(lerAno(ref.ano));
  const bi = (id: string) => {
    const n = g.nos.find((x) => x.id === id);
    if (!n) throw new Error(`nó ${id} da referência não existe no grafo`);
    return n.valor / MI_POR_BI;
  };

  const comparados: { chave: string; calculado: number; original: number }[] = [];
  for (const [id, v] of Object.entries(ref.nos)) comparados.push({ chave: id, calculado: bi(id), original: v });
  for (const [k, grupo] of Object.entries(ref.grupos))
    comparados.push({ chave: k, calculado: grupo.nos.reduce((s, id) => s + bi(id), 0), original: grupo.valor });
  for (const [id, v] of Object.entries(ref.totais)) comparados.push({ chave: id, calculado: bi(id), original: v });
  comparados.push({ chave: 'deficit', calculado: bi('resultado_primario'), original: ref.deficit });

  it('compara exatamente 18 valores, com referência não vazia', () => {
    expect(Object.keys(ref.nos).length).toBeGreaterThan(0);
    expect(comparados).toHaveLength(N_VALORES);
  });

  it.each(comparados)('$chave fica a até a tolerância do original', ({ calculado, original }) => {
    expect(Math.abs(calculado - original)).toBeLessThanOrEqual(ref.tolerancia_por_no);
  });

  it('o grupo aberto Bolsa Família + Saúde + Demais soma cerca de 374', () => {
    const grupo = ref.grupos.bolsa_familia_saude_outros;
    expect(Math.abs(grupo.nos.reduce((s, id) => s + bi(id), 0) - grupo.valor)).toBeLessThanOrEqual(ref.tolerancia_por_no);
  });

  it('todo nó do grafo está na referência, num grupo ou é o resultado', () => {
    const cobertos = new Set([
      ...Object.keys(ref.nos),
      ...Object.keys(ref.totais),
      ...Object.values(ref.grupos).flatMap((x) => x.nos),
      'resultado_primario',
    ]);
    expect(g.nos.map((n) => n.id).filter((id) => !cobertos.has(id))).toEqual([]);
  });
});
