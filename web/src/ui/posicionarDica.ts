export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const AFASTAMENTO = 8;

/**
 * Posição (canto superior esquerdo) da dica de hover: do lado preferido da barra (o oposto ao do rótulo, sobre os
 * fluxos), centrada na vertical; se não couber, do outro lado; e sempre empurrada para dentro dos limites (a interseção
 * do cartão com a área visível da janela).
 */
export function posicionarDica(
  alvo: Retangulo,
  tamanho: { largura: number; altura: number },
  limites: Retangulo,
  preferencia: 'direita' | 'esquerda' = 'direita',
): { x: number; y: number } {
  const prender = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  const aDireita = alvo.x1 + AFASTAMENTO;
  const aEsquerda = alvo.x0 - AFASTAMENTO - tamanho.largura;
  let x = preferencia === 'direita' ? aDireita : aEsquerda;
  if (preferencia === 'direita' && x + tamanho.largura > limites.x1) x = aEsquerda;
  if (preferencia === 'esquerda' && x < limites.x0) x = aDireita;
  x = prender(x, limites.x0, limites.x1 - tamanho.largura);
  const y = prender((alvo.y0 + alvo.y1) / 2 - tamanho.altura / 2, limites.y0, limites.y1 - tamanho.altura);
  return { x, y };
}
