import type { Caixa } from '../../src/layout/layout';

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
