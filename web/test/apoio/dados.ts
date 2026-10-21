// Leitura dos JSON do repositório para os testes (nada em src/ importa ../dados nem ../referencias).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DadosAno, Indice } from '../../src/dados/tipos';

export const PASTA_DADOS = fileURLToPath(new URL('../../../dados/', import.meta.url));
export const PASTA_REFERENCIAS = fileURLToPath(new URL('../../../referencias/', import.meta.url));

const lerJson = <T>(caminho: string): T => JSON.parse(readFileSync(caminho, 'utf8')) as T;

export function indice(): Indice {
  return lerJson<Indice>(PASTA_DADOS + 'indice.json');
}

/** Expande o intervalo [início, fim] de indice.json numa lista de anos. */
export function anos(): number[] {
  const [inicio, fim] = indice().anos;
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
}

export function lerAno(ano: number): DadosAno {
  return lerJson<DadosAno>(`${PASTA_DADOS}${ano}.json`);
}

export interface Referencia {
  ano: number;
  unidade: string;
  precos: string;
  fonte: string;
  tolerancia_por_no: number;
  nos: Record<string, number>;
  grupos: Record<string, { nos: string[]; valor: number }>;
  totais: Record<string, number>;
  deficit: number;
}

export function lerReferencia(): Referencia {
  return lerJson<Referencia>(PASTA_REFERENCIAS + 'original-2025.json');
}
