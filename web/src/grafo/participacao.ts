import type { Grafo } from './tipos';

/** Participação do nó: lado da receita sobre a receita total; lado da despesa (e o resultado) sobre a despesa total. */
export function participacao(g: Grafo, id: string): { fracao: number; base: 'receita' | 'despesa' } {
  const n = g.nos.find((x) => x.id === id);
  if (!n) throw new Error(`nó ${id} não existe`);
  const total = n.base === 'receita' ? g.receitaTotal : g.despesaTotal;
  return { base: n.base, fracao: n.valor / total };
}
