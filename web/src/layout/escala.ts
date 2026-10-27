import type { Grafo } from '../grafo/tipos';
import type { ConfigFormato } from './constantes';
import { calcularLayout, escalaDoAno, reservaDosGrafos, type ReservaLargura } from './layout';
import type { MedirTexto } from './medir';

/** A maior largura de rótulo entre os grafos dados (no site, os 11 anos nos três modos): as colunas não mudam de lugar. */
export const calcularReserva = reservaDosGrafos;

/**
 * Escala, âncora e reserva de largura comuns aos anos de um modo, num formato:
 * - escala: a menor, entre os anos e as colunas, de (alturaBarras − espaços da coluna) / soma da coluna (a maior coluna da
 *   série manda; um ano novo maior encolhe todos);
 * - âncora: o y do topo da terceira coluna tal que o conteúdo do ano mais alto encoste em `margem + 4` (o vazio dos anos
 *   menores fica embaixo);
 * - reserva: a dada (a dos três modos, no site) ou a destes grafos.
 */
export function calcularEscalaCompartilhada(
  grafos: Grafo[],
  cfg: ConfigFormato,
  medir: MedirTexto,
  op: { largura?: number; larguraVisivel?: number; reservaLargura?: ReservaLargura },
): { escala: number; ancoraY: number; reservaLargura: ReservaLargura } {
  const reservaLargura = op.reservaLargura ?? reservaDosGrafos(grafos, cfg, medir);
  const escala = Math.min(...grafos.map((g) => escalaDoAno(g, cfg)));
  const ancoraY = Math.max(...grafos.map((g) => calcularLayout(g, cfg, medir, { ...op, escala, reservaLargura }).ancoraY));
  return { escala, ancoraY, reservaLargura };
}
