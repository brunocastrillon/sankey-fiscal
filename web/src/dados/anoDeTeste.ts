// Só entra no build de teste (`vite build --mode teste`): o Playwright escolhe o ano por `?ano=`.
// A sentinela permite à conferência do bundle provar que o build de produção não contém este código.
export const SENTINELA = 'PARAM_ANO_SO_TESTE';

export function anoSolicitado(search: string): number | null {
  const valor = new URLSearchParams(search).get('ano');
  return valor && /^\d{4}$/.test(valor) ? Number(valor) : null;
}
