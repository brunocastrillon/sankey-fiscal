import { describe, expect, it } from 'vitest';
import { posicionarDica } from '../src/ui/posicionarDica';

const limites = { x0: 0, y0: 0, x1: 1000, y1: 700 };
const tamanho = { largura: 200, altura: 80 };
const dentro = (p: { x: number; y: number }) =>
  p.x >= limites.x0 && p.y >= limites.y0 && p.x + tamanho.largura <= limites.x1 && p.y + tamanho.altura <= limites.y1;

describe('posicionarDica', () => {
  it('à direita da barra, centrada na vertical, quando cabe', () => {
    const p = posicionarDica({ x0: 300, y0: 300, x1: 312, y1: 400 }, tamanho, limites);
    expect(p).toEqual({ x: 320, y: 310 });
  });

  it('com preferência à esquerda, abre à esquerda da barra quando cabe', () => {
    const p = posicionarDica({ x0: 600, y0: 300, x1: 612, y1: 400 }, tamanho, limites, 'esquerda');
    expect(p).toEqual({ x: 600 - 8 - 200, y: 310 });
  });

  it('com preferência à esquerda, inverte para a direita perto da borda esquerda', () => {
    const p = posicionarDica({ x0: 50, y0: 300, x1: 62, y1: 400 }, tamanho, limites, 'esquerda');
    expect(p.x).toBeGreaterThanOrEqual(62);
    expect(dentro(p)).toBe(true);
  });

  it('inverte para a esquerda perto da borda direita', () => {
    const p = posicionarDica({ x0: 900, y0: 300, x1: 912, y1: 400 }, tamanho, limites);
    expect(p.x + tamanho.largura).toBeLessThanOrEqual(900);
    expect(dentro(p)).toBe(true);
  });

  it('barra no topo ou no fundo: a dica fica dentro dos limites', () => {
    expect(dentro(posicionarDica({ x0: 300, y0: -50, x1: 312, y1: 10 }, tamanho, limites))).toBe(true);
    expect(dentro(posicionarDica({ x0: 300, y0: 680, x1: 312, y1: 760 }, tamanho, limites))).toBe(true);
  });

  it('barra larga encostada nas duas bordas: a dica é empurrada para dentro', () => {
    expect(dentro(posicionarDica({ x0: 5, y0: 300, x1: 995, y1: 320 }, tamanho, limites))).toBe(true);
  });
});
