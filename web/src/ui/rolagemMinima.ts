const FOLGA_TOPO = 16;
const PAINEL_VISIVEL = 120;

/**
 * Rolagem vertical da página (coordenadas da página) ao abrir o painel: a menor mudança que deixa o nó tocado a pelo
 * menos 16 px do topo da tela, inteiro, e ao menos 120 px do painel visíveis. Se não couber tudo, o nó continua
 * visível e a página rola até onde puder em direção ao painel (o resto se lê rolando).
 */
export function rolagemMinima(p: {
  atual: number;
  alturaTela: number;
  maxRolagem: number;
  no: { topo: number; fundo: number };
  painelTopo: number;
}): number {
  const teto = p.no.topo - FOLGA_TOPO;
  const pisoNo = p.no.fundo + FOLGA_TOPO - p.alturaTela;
  const piso = Math.max(pisoNo, p.painelTopo + PAINEL_VISIVEL - p.alturaTela);
  const alvo = piso <= teto ? Math.min(Math.max(p.atual, piso), teto) : teto;
  return Math.min(Math.max(alvo, 0), p.maxRolagem);
}
