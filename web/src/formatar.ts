import { TEXTOS } from './textos';

const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MILHOES_POR_BILHAO = 1000;

/** Valor em R$ milhões → "R$ 1.234,6 bi". */
export function formatarBi(valorMi: number): string {
  return `R$ ${umaCasa.format(valorMi / MILHOES_POR_BILHAO)} bi`;
}

/** Fração → "6,1%". */
export function formatarPct(fracao: number): string {
  return `${umaCasa.format(fracao * 100)}%`;
}

/** "2025-12" → "dez/2025". */
export function formatarMesBase(mesBase: string): string {
  const [ano, mes] = mesBase.split('-');
  return `${TEXTOS.meses[Number(mes) - 1]}/${ano}`;
}
