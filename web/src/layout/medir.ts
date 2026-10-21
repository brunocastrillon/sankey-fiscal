export interface EstiloTexto {
  tamanho: number;
  negrito: boolean;
}

/** Largura em px de um texto num estilo; injetada no layout (navegador em produção, tabela determinística nos testes). */
export type MedirTexto = (texto: string, estilo: EstiloTexto) => number;

/**
 * Medidor do navegador, por canvas. Chamar depois de `document.fonts.ready`, com a família lida por
 * `getComputedStyle` do próprio texto do SVG, nunca um nome fixo.
 */
export function criarMedidorNavegador(familia: string): MedirTexto {
  const contexto = document.createElement('canvas').getContext('2d');
  if (!contexto) throw new Error('canvas 2d indisponível para medir texto');
  const cache = new Map<string, number>();
  return (texto, { tamanho, negrito }) => {
    const chave = `${negrito ? 'b' : 'n'}${tamanho}|${texto}`;
    let largura = cache.get(chave);
    if (largura === undefined) {
      contexto.font = `${negrito ? 'bold ' : ''}${tamanho}px ${familia}`;
      largura = contexto.measureText(texto).width;
      cache.set(chave, largura);
    }
    return largura;
  };
}
