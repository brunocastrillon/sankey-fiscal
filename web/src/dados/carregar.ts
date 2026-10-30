import type { DadosAno, Indice } from './tipos';

// Caminhos relativos ao subcaminho do site (castrillon.dev/sankey-fiscal/), nunca à raiz do domínio.
const url = (arquivo: string) => `${import.meta.env.BASE_URL}dados/${arquivo}`;

async function buscar<T>(arquivo: string): Promise<T> {
  try {
    const resposta = await fetch(url(arquivo));
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return (await resposta.json()) as T;
  } catch (e) {
    // falha de rede ou JSON inválido também dizem qual arquivo
    throw new Error(`${arquivo}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const carregarIndice = () => buscar<Indice>('indice.json');
export const carregarAno = (ano: number) => buscar<DadosAno>(`${ano}.json`);

/** Todos os anos do índice, em ordem. A escala compartilhada só existe com todos: um arquivo que falha rejeita a carga. */
export function carregarTodos(indice: Indice): Promise<DadosAno[]> {
  const [inicio, fim] = indice.anos;
  return Promise.all(Array.from({ length: fim - inicio + 1 }, (_, i) => carregarAno(inicio + i)));
}
