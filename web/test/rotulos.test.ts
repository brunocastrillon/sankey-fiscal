import { describe, expect, it } from 'vitest';
import { quebrarPorLargura, resolverFila, type ItemFila } from '../src/layout/rotulos';
import { medidorDeterministico } from './apoio/medidor';

const medir = medidorDeterministico();
const estilo = { tamanho: 13, negrito: false };

describe('quebrarPorLargura', () => {
  const textos = [
    'Fundeb, seguro-desemprego e outras obrigatórias',
    'Despesas discricionárias (custeio e investimentos)',
    'Déficit primário (financiado com dívida)',
    'CSLL',
  ];

  const juntar = (linhas: string[]) => linhas.join(' ').replace(/- /g, '-');

  it.each(textos)('nenhuma linha passa do limite e o texto volta inteiro: %s', (texto) => {
    const linhas = quebrarPorLargura(texto, 140, estilo, medir);
    for (const l of linhas) expect(medir(l, estilo)).toBeLessThanOrEqual(140);
    expect(juntar(linhas)).toBe(texto);
  });

  it('palavra com hífen maior que o limite quebra depois do hífen', () => {
    const linhas = quebrarPorLargura('Fundeb, seguro-desemprego e outras', 90, estilo, medir);
    expect(linhas).toContain('seguro-');
    for (const l of linhas) expect(medir(l, estilo)).toBeLessThanOrEqual(90);
    expect(juntar(linhas)).toBe('Fundeb, seguro-desemprego e outras');
  });

  it('palavra que começa com hífen preserva o hífen (com e sem quebra)', () => {
    expect(quebrarPorLargura('-abc def', 500, estilo, medir)).toEqual(['-abc def']);
    expect(quebrarPorLargura('-abc def', 30, estilo, medir)).toEqual(['-abc', 'def']);
    expect(quebrarPorLargura('x -abc-def', 500, estilo, medir)).toEqual(['x -abc-def']);
  });

  it('palavra sem hífen maior que o limite fica sozinha na linha', () => {
    const linhas = quebrarPorLargura('a discricionárias b', 40, estilo, medir);
    expect(linhas).toEqual(['a', 'discricionárias', 'b']);
  });
});

const topoDe = (r: Map<string, number>, id: string) => r.get(id)!;
const sem = { min: -1e9, max: 1e9 };

function conferir(itens: ItemFila[], r: Map<string, number>, folga: number, limites = sem) {
  const ordem = [...itens].sort((a, b) => a.centro - b.centro);
  for (let i = 0; i < ordem.length; i++) {
    const t = topoDe(r, ordem[i].id);
    expect(t).toBeGreaterThanOrEqual(limites.min - 1e-9);
    expect(t + ordem[i].altura).toBeLessThanOrEqual(limites.max + 1e-9);
    if (i > 0) {
      const anterior = ordem[i - 1];
      expect(t - (topoDe(r, anterior.id) + anterior.altura)).toBeGreaterThanOrEqual(folga - 1e-9);
    }
  }
}

describe('resolverFila', () => {
  it('item isolado fica centrado no desejado', () => {
    const r = resolverFila([{ id: 'a', centro: 100, altura: 20 }], 3, sem);
    expect(topoDe(r, 'a')).toBe(90);
  });

  it('dois itens que colidem ficam com a folga exata, centrados na média dos desejados', () => {
    const r = resolverFila([{ id: 'a', centro: 100, altura: 20 }, { id: 'b', centro: 105, altura: 20 }], 3, sem);
    expect(topoDe(r, 'b') - (topoDe(r, 'a') + 20)).toBeCloseTo(3, 9);
    expect((topoDe(r, 'a') + topoDe(r, 'b') + 20) / 2).toBeCloseTo(102.5, 9);
  });

  it('50 itens aleatórios: ordem preservada e folga mínima respeitada', () => {
    let semente = 7;
    const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    const itens = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, centro: aleatorio() * 600, altura: 10 + aleatorio() * 40 }));
    conferir(itens, resolverFila(itens, 3, sem), 3);
  });

  it('pilha longa no fim da coluna não passa do limite máximo', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, centro: 590 + i, altura: 30 }));
    const limites = { min: 0, max: 600 };
    conferir(itens, resolverFila(itens, 3, limites), 3, limites);
  });

  it('pilha longa no começo da coluna não passa do limite mínimo', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, centro: 5 + i, altura: 30 }));
    const limites = { min: 0, max: 600 };
    conferir(itens, resolverFila(itens, 3, limites), 3, limites);
  });

  it('pilha maior que o intervalo lança erro', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, centro: 50, altura: 30 }));
    expect(() => resolverFila(itens, 3, { min: 0, max: 200 })).toThrow();
  });
});
