import type { DadosAno, Indice } from './tipos';

// Caminhos relativos ao subcaminho do site (castrillon.dev/sankey-fiscal/), nunca à raiz do domínio.
const url = (arquivo: string) => `${import.meta.env.BASE_URL}dados/${arquivo}`;

async function buscar<T>(arquivo: string): Promise<T> {
  const resposta = await fetch(url(arquivo));
  if (!resposta.ok) throw new Error(`${arquivo}: HTTP ${resposta.status}`);
  return (await resposta.json()) as T;
}

export const carregarIndice = () => buscar<Indice>('indice.json');
export const carregarAno = (ano: number) => buscar<DadosAno>(`${ano}.json`);
