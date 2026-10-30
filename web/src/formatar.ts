import type { Modo } from './grafo/tipos';
import { TEXTOS } from './textos';

const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const duasCasas = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MILHOES_POR_BILHAO = 1000;

/** Valor em R$ milhões → "R$ 1.234,6 bi". */
export function formatarBi(valorMi: number): string {
  return `R$ ${umaCasa.format(valorMi / MILHOES_POR_BILHAO)} bi`;
}

/** Fração → "6,1%". */
export function formatarPct(fracao: number): string {
  return `${umaCasa.format(fracao * 100)}%`;
}

/** Valor na unidade do modo → texto do rótulo: "R$ 1.234,6 bi"; "48,3%" (% da despesa); "0,48%" (% do PIB). */
export function formatarValor(v: number, modo: Modo): string {
  if (modo === 'rs') return formatarBi(v);
  return `${(modo === 'desp' ? umaCasa : duasCasas).format(v)}%`;
}

/** "2025-12" → "dez/2025". */
export function formatarMesBase(mesBase: string): string {
  const [ano, mes] = mesBase.split('-');
  return `${TEXTOS.meses[Number(mes) - 1]}/${ano}`;
}
