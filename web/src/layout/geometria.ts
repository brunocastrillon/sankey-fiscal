import type { FluxoLayout } from './layout';

/** Faixa preenchida (duas curvas de Bézier fechadas): a espessura nas duas pontas é exatamente `f.espessura`. */
export function caminhoFaixa(f: FluxoLayout): string {
  const xm = (f.x0 + f.x1) / 2;
  const s2 = f.ySaida + f.espessura;
  const e2 = f.yEntrada + f.espessura;
  return (
    `M${f.x0} ${f.ySaida}C${xm} ${f.ySaida} ${xm} ${f.yEntrada} ${f.x1} ${f.yEntrada}` +
    `L${f.x1} ${e2}C${xm} ${e2} ${xm} ${s2} ${f.x0} ${s2}Z`
  );
}
