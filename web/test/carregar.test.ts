// Carga dos 11 anos: a escala compartilhada só existe com todos; um arquivo que falha derruba a carga inteira.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { carregarTodos } from '../src/dados/carregar';
import type { Indice } from '../src/dados/tipos';
import { indice, lerAno } from './apoio/dados';

/** fetch falso que serve os JSON do repositório; `falha` responde 404 para um arquivo. */
function fetchFalso(falha?: string) {
  return vi.fn(async (url: string) => {
    const arquivo = url.split('/').pop()!;
    if (arquivo === falha) return new Response('', { status: 404 });
    return Response.json(lerAno(Number(arquivo.replace('.json', ''))));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('carregarTodos', () => {
  const ind: Indice = indice();

  it('devolve todos os anos do índice, em ordem, de caminhos sob o BASE_URL', async () => {
    const f = fetchFalso();
    vi.stubGlobal('fetch', f);
    const dados = await carregarTodos(ind);
    const [inicio, fim] = ind.anos;
    expect(dados.map((d) => d.ano)).toEqual(Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i));
    // o BASE_URL é '/sankey-fiscal/' no build e '/' no Vitest
    for (const [url] of f.mock.calls) expect(url).toMatch(new RegExp(`^${import.meta.env.BASE_URL}dados/\\d{4}\\.json$`));
  });

  it('um arquivo com 404 rejeita a carga, com o nome do arquivo', async () => {
    const falha = `${ind.anos[0] + 2}.json`;
    vi.stubGlobal('fetch', fetchFalso(falha));
    await expect(carregarTodos(ind)).rejects.toThrow(falha);
  });
});
