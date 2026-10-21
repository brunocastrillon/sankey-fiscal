const canais = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG 2.x entre duas cores #rrggbb. */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Cor resultante de `cor` com opacidade `alfa` sobre `fundo`. */
export function misturar(cor: string, fundo: string, alfa: number): string {
  const c = canais(cor);
  const f = canais(fundo);
  return '#' + c.map((v, i) => Math.round(alfa * v + (1 - alfa) * f[i]).toString(16).padStart(2, '0')).join('');
}
