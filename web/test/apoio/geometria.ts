import type { Grafo } from '../../src/grafo/tipos';
import type { Caixa, Layout } from '../../src/layout/layout';

/** Extremos verticais de tudo o que se desenha: barras, rótulos, alvos de toque e guias. */
export function extensao(L: Layout): { topo: number; fundo: number } {
  const ys = [
    ...L.nos.flatMap((n) => [n.y0, n.y1]),
    ...L.rotulos.flatMap((r) => [r.caixa.y0, r.caixa.y1]),
    ...L.alvos.flatMap((a) => [a.caixa.y0, a.caixa.y1]),
    ...L.guias.flatMap((g) => g.pontos.map(([, y]) => y)),
  ];
  return { topo: Math.min(...ys), fundo: Math.max(...ys) };
}

/** Pares de rótulos a menos de `folga` px um do outro. */
export function colisoesDeRotulos(L: Layout, folga: number): string[] {
  const colisoes: string[] = [];
  for (let i = 0; i < L.rotulos.length; i++)
    for (let j = i + 1; j < L.rotulos.length; j++)
      if (sobrepoe(L.rotulos[i].caixa, L.rotulos[j].caixa, folga)) colisoes.push(`${L.rotulos[i].id} × ${L.rotulos[j].id}`);
  return colisoes;
}

/** Maior distância vertical entre o centro de um rótulo lateral e o centro da barra do nó. */
export function deslocamentoMaximo(L: Layout): number {
  return Math.max(
    0,
    ...L.rotulos
      .filter((r) => r.lado !== 'meio')
      .map((r) => {
        const n = L.nos.find((x) => x.id === r.id)!;
        return Math.abs((r.caixa.y0 + r.caixa.y1) / 2 - (n.y0 + n.y1) / 2);
      }),
  );
}

/** Barra mais fina entre os nós com valor positivo no grafo. */
export function noMaisFino(L: Layout, g: Grafo): { id: string; px: number } {
  const positivos = new Set(g.nos.filter((n) => n.valor > 0).map((n) => n.id));
  return L.nos
    .filter((n) => positivos.has(n.id))
    .map((n) => ({ id: n.id, px: n.y1 - n.y0 }))
    .reduce((a, b) => (b.px < a.px ? b : a));
}

/** Lê o `d` de uma faixa no formato de caminhoFaixa e devolve a espessura nas duas pontas. */
export function espessurasDaFaixa(d: string): { saida: number; entrada: number; fechado: boolean } {
  const n = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
  // M x0 ySaida C xm ySaida xm yEntrada x1 yEntrada L x1 yEntrada2 C xm yEntrada2 xm ySaida2 x0 ySaida2 Z
  const ySaida = n[1];
  const yEntrada = n[7];
  const yEntrada2 = n[9];
  const ySaida2 = n[15];
  return { saida: ySaida2 - ySaida, entrada: yEntrada2 - yEntrada, fechado: d.trim().endsWith('Z') };
}

export const sobrepoe = (a: Caixa, b: Caixa, folga = 0) =>
  a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;

/** Distância entre um segmento alinhado aos eixos e uma caixa (0 se cruza). */
export function distanciaSegmentoCaixa([ax, ay]: [number, number], [bx, by]: [number, number], c: Caixa): number {
  const s = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
  const dx = Math.max(0, c.x0 - s.x1, s.x0 - c.x1);
  const dy = Math.max(0, c.y0 - s.y1, s.y0 - c.y1);
  return Math.hypot(dx, dy);
}
