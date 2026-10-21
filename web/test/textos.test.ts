import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEXTOS } from '../src/textos';
import { anos, lerAno } from './apoio/dados';

const textosPlanos = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(textosPlanos) : v && typeof v === 'object' ? Object.values(v).flatMap(textosPlanos) : [];

describe('guardas de texto', () => {
  const todos = [...textosPlanos(TEXTOS), ...anos().flatMap((a) => Object.values(lerAno(a).rotulos))];

  it('nenhum rótulo diz "dívida nova" nem "gov.br"', () => {
    expect(todos.length).toBeGreaterThan(20);
    expect(todos.filter((t) => /dívida nova/i.test(t))).toEqual([]);
    expect(todos.filter((t) => /gov\.br/i.test(t))).toEqual([]);
  });

  it('exporta a nota sobre juros e o aviso de independência', () => {
    expect(TEXTOS.naoIncluiJuros).toBe('não inclui juros');
    expect(TEXTOS.aviso).toBe('Visualização independente, baseada em dados do Tesouro Nacional.');
    expect(TEXTOS.rotulos.deficit).toBe('Déficit primário (financiado com dívida)');
    expect(TEXTOS.menos).toBe('menos');
  });

  it('textos.ts não tem dígitos (nenhum número fiscal escrito à mão)', () => {
    const fonte = readFileSync(new URL('../src/textos.ts', import.meta.url), 'utf8');
    expect(fonte.match(/\d/g) ?? []).toEqual([]);
  });
});
