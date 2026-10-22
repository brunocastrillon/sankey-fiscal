export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const AFASTAMENTO = 8;

/**
 * Posição (canto superior esquerdo) da dica de hover: à direita da barra, centrada na vertical; se não couber, à
 * esquerda; e sempre empurrada para dentro dos limites (a interseção do cartão com a área visível da janela).
 */
export function posicionarDica(
  alvo: Retangulo,
  tamanho: { largura: number; altura: number },
  limites: Retangulo,
): { x: number; y: number } {
  const prender = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  let x = alvo.x1 + AFASTAMENTO;
  if (x + tamanho.largura > limites.x1) x = alvo.x0 - AFASTAMENTO - tamanho.largura;
  x = prender(x, limites.x0, limites.x1 - tamanho.largura);
  const y = prender((alvo.y0 + alvo.y1) / 2 - tamanho.altura / 2, limites.y0, limites.y1 - tamanho.altura);
  return { x, y };
}
