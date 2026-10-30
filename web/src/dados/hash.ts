import type { Modo } from '../grafo/tipos';

// Ano e modo pelo endereço: #2020 (R$ constantes), #2020/despesa e #2020/pib. Lido por expressão regular (o hash não é query string).
const SUFIXOS: Record<string, Modo> = { despesa: 'desp', pib: 'pib' };
const SUFIXO_DO_MODO: Record<Modo, string> = { rs: '', desp: '/despesa', pib: '/pib' };

/** O ano (dentro do intervalo do índice) e o modo pedidos no hash; null para qualquer outra coisa (vale o padrão). */
export function lerHash(hash: string, anos: [number, number]): { ano: number; modo: Modo } | null {
  const m = /^#(\d{4})(?:\/(despesa|pib))?$/.exec(hash);
  if (!m) return null;
  const ano = Number(m[1]);
  if (ano < anos[0] || ano > anos[1]) return null;
  return { ano, modo: m[2] ? SUFIXOS[m[2]] : 'rs' };
}

/** Escreve o ano e o modo no hash sem criar entrada no histórico; R$ não leva sufixo. */
export function escreverHash(ano: number, modo: Modo): void {
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${ano}${SUFIXO_DO_MODO[modo]}`);
}

/**
 * TRANSITÓRIO (sai na C2): os modos em % só aparecem na tela com o seletor e as legendas da 3c. Até lá o hash lê o modo, mas a
 * tela desenha em R$.
 */
export const MODOS_NA_TELA: readonly Modo[] = ['rs'];
export const modoNaTela = (modo: Modo): Modo => (MODOS_NA_TELA.includes(modo) ? modo : 'rs');
