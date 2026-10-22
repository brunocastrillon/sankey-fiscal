import { describe, expect, it } from 'vitest';
import { OPACIDADE_FLUXO } from '../src/layout/constantes';
import { contraste, misturar } from '../src/ui/cor';
import { cssDosTemas, TEMAS, type Paleta } from '../src/ui/tema';

describe('utilitários de cor', () => {
  it('contraste WCAG: preto × branco = 21 e cor × ela mesma = 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contraste('#2a78d6', '#2a78d6')).toBeCloseTo(1, 6);
  });
  it('misturar com alfa 0 devolve o fundo e com alfa 1 devolve a cor', () => {
    expect(misturar('#2a78d6', '#fcfcfb', 0)).toBe('#fcfcfb');
    expect(misturar('#2a78d6', '#fcfcfb', 1)).toBe('#2a78d6');
  });
});

describe.each(Object.entries(TEMAS) as [string, Paleta][])('tema %s', (_, p) => {
  const fundos = {
    fundo: p.fundo,
    receitas: misturar(p.receita, p.fundo, OPACIDADE_FLUXO),
    gastos: misturar(p.gasto, p.fundo, OPACIDADE_FLUXO),
    repasse: misturar(p.repasse, p.fundo, OPACIDADE_FLUXO),
    discricionarias: misturar(p.discricionaria, p.fundo, OPACIDADE_FLUXO),
  };

  it.each(Object.entries(fundos))('texto e texto secundário a pelo menos 4,5:1 sobre %s', (_, f) => {
    expect(contraste(p.texto, f)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(p.secundario, f)).toBeGreaterThanOrEqual(4.5);
  });

  it('guias a pelo menos 3:1 contra o fundo', () => {
    expect(contraste(p.secundario, p.fundo)).toBeGreaterThanOrEqual(3);
  });

  it('déficit visível: a cor ou o contorno a pelo menos 3:1 contra o fundo', () => {
    const melhor = Math.max(contraste(p.deficit, p.fundo), p.contornoDeficit ? contraste(p.contornoDeficit, p.fundo) : 0);
    expect(melhor).toBeGreaterThanOrEqual(3);
  });
});

describe('CSS dos temas', () => {
  const css = cssDosTemas();
  it('tem o tema escuro por prefers-color-scheme e uma variável para cada papel', () => {
    expect(css).toContain('prefers-color-scheme: dark');
    for (const chave of Object.keys(TEMAS.claro)) expect(css).toContain(`--${chave}:`);
  });
  it('o contorno do déficit só existe no escuro', () => {
    expect(TEMAS.claro.contornoDeficit).toBeNull();
    expect(TEMAS.escuro.contornoDeficit).toBe('#f2b8b5');
  });
});
