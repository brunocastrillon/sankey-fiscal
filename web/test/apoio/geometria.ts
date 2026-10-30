import type { Grafo } from '../../src/grafo/tipos';
import type { Caixa, FluxoLayout, Layout } from '../../src/layout/layout';

/** Pontos (x, topo, fundo) da faixa de um fluxo, amostrada em n pontos ao longo das curvas de Bézier de caminhoFaixa. */
export function amostrarFaixa(f: FluxoLayout, n = 201): [number, number, number][] {
  const xm = (f.x0 + f.x1) / 2;
  const bez = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const y = bez(t, f.ySaida, f.ySaida, f.yEntrada, f.yEntrada);
    return [bez(t, f.x0, xm, xm, f.x1), y, y + f.espessura];
  });
}

/** A caixa encosta na faixa do fluxo (a menos de `folga` px) em algum dos 201 pontos amostrados. */
export const caixaCruzaFaixa = (c: Caixa, f: FluxoLayout, folga: number) =>
  amostrarFaixa(f).some(([x, y0, y1]) => x >= c.x0 - folga && x <= c.x1 + folga && y0 < c.y1 + folga && c.y0 < y1 + folga);

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

/**
 * Emendas (INFORMATIVO, não é regra): pares de segmentos verticais de guias de nós diferentes, em faixas vizinhas do mesmo
 * feixe (guias que saem da mesma borda de coluna), cujos intervalos no eixo y terminam e começam a menos de `limiar` px
 * um do outro (sobreposição ou vão menor que o limiar). De longe, duas guias assim parecem uma linha só com um degrau.
 */
export function emendas(L: Layout, limiar = 8): string[] {
  const verticais = L.guias.flatMap((g) =>
    g.pontos.slice(1).flatMap((p, i) => {
      const a = g.pontos[i];
      return a[0] === p[0] && a[1] !== p[1] ? [{ id: g.id, feixe: g.pontos[0][0], x: a[0], y0: Math.min(a[1], p[1]), y1: Math.max(a[1], p[1]) }] : [];
    }),
  );
  const pares: string[] = [];
  for (const feixe of new Set(verticais.map((v) => v.feixe))) {
    const doFeixe = verticais.filter((v) => v.feixe === feixe);
    const xs = [...new Set(doFeixe.map((v) => v.x))].sort((a, b) => a - b);
    for (const s of doFeixe)
      for (const t of doFeixe) {
        if (s.id >= t.id || Math.abs(xs.indexOf(s.x) - xs.indexOf(t.x)) !== 1) continue;
        const sobreposicao = Math.min(s.y1, t.y1) - Math.max(s.y0, t.y0);
        if (sobreposicao > -limiar && sobreposicao < limiar) pares.push(`${s.id} × ${t.id}`);
      }
  }
  return pares;
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
