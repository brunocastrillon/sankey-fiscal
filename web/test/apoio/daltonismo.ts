// Simulação de daltonismo e diferença de cor, só para os testes de tema. É uma APROXIMAÇÃO: a simulação de Machado et al.
// (2009) modela o dicromata médio; pessoas reais variam. Serve para comparar cores entre si, não para garantir leitura.

export type TipoDaltonismo = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Matrizes de Machado, Oliveira e Fernandes (2009), severidade 1,0, aplicadas em RGB linear. */
export const MACHADO_2009: Record<TipoDaltonismo, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgbLinear = (hex: string) => [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));

/** Cor #rrggbb vista com o tipo de daltonismo: RGB linear (sRGB, D65), limitado a [0, 1]. Sem tipo, a cor original. */
export function simular(hex: string, tipo?: TipoDaltonismo): number[] {
  const v = rgbLinear(hex);
  if (!tipo) return v;
  return MACHADO_2009[tipo].map((linha) => Math.min(1, Math.max(0, linha[0] * v[0] + linha[1] * v[1] + linha[2] * v[2])));
}

/** RGB linear → CIELAB (D65). */
export function lab([r, g, b]: number[]): [number, number, number] {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const rad = (g: number) => (g * Math.PI) / 180;
const graus = (r: number) => (((r * 180) / Math.PI) % 360 + 360) % 360;

/** ΔE00 (CIEDE2000; Sharma, Wu e Dalal, 2005) entre duas cores em CIELAB. */
export function ciede2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : graus(Math.atan2(b1, a1p));
  const h2p = C2p === 0 ? 0 : graus(Math.atan2(b2, a2p));
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) dh = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** ΔE00 entre duas cores #rrggbb como o tipo de daltonismo as vê (sem tipo, visão comum). */
export const deltaE = (a: string, b: string, tipo?: TipoDaltonismo) => ciede2000(lab(simular(a, tipo)), lab(simular(b, tipo)));
