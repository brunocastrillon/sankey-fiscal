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
    expect(TEXTOS.convitePainel).toBe('Clique ou toque num nó para ver os detalhes.');
  });

  it('modos de leitura, legendas (curta e longa, o mês-base vem do componente) e a frase da receita acima do gasto', () => {
    expect(TEXTOS.modos).toEqual({ rs: 'R$ constantes', desp: '% da despesa', pib: '% do PIB' });
    for (const modo of ['rs', 'desp', 'pib'] as const) {
      expect(TEXTOS.legendas[modo].curta.length).toBeGreaterThan(0);
      expect(TEXTOS.legendas[modo].longa.length).toBeGreaterThan(TEXTOS.legendas[modo].curta.length);
    }
    expect(TEXTOS.legendas.rs.longa).toContain('mesma escala para todos os anos');
    expect(TEXTOS.receitaAcimaDoGasto).toBe(
      'A receita total inclui o repasse a estados e municípios, que não é despesa do Governo Central; por isso pode passar do gasto total.',
    );
  });

  it('carregamento e erro de carga com "Tentar de novo"', () => {
    expect(TEXTOS.carregando.length).toBeGreaterThan(0);
    expect(TEXTOS.erroCarga).toBe('Não foi possível carregar os dados.');
    expect(TEXTOS.tentarDeNovo).toBe('Tentar de novo');
  });

  it('textos.ts não tem dígitos (nenhum número fiscal escrito à mão)', () => {
    const fonte = readFileSync(new URL('../src/textos.ts', import.meta.url), 'utf8');
    expect(fonte.match(/\d/g) ?? []).toEqual([]);
  });
});
