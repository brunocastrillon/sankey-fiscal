// Ano e modo pelo endereço: #AAAA (R$), #AAAA/despesa e #AAAA/pib, com o ano dentro do índice; o resto volta ao padrão.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escreverHash, lerHash, MODOS_NA_TELA, modoNaTela } from '../src/dados/hash';
import { indice } from './apoio/dados';

const ANOS = indice().anos;
const [PRIMEIRO, ULTIMO] = ANOS;

afterEach(() => vi.unstubAllGlobals());

describe('lerHash', () => {
  it('aceita #AAAA (R$ constantes), #AAAA/despesa e #AAAA/pib', () => {
    expect(lerHash('#2020', ANOS)).toEqual({ ano: 2020, modo: 'rs' });
    expect(lerHash('#2020/despesa', ANOS)).toEqual({ ano: 2020, modo: 'desp' });
    expect(lerHash('#2020/pib', ANOS)).toEqual({ ano: 2020, modo: 'pib' });
    expect(lerHash(`#${PRIMEIRO}`, ANOS)).toEqual({ ano: PRIMEIRO, modo: 'rs' });
    expect(lerHash(`#${ULTIMO}`, ANOS)).toEqual({ ano: ULTIMO, modo: 'rs' });
  });

  it.each(['#1999', `#${PRIMEIRO - 1}`, `#${ULTIMO + 1}`, '#abc', '#2020x', '#', '#02020', '#2020/', '#2020/xyz', '#2020/PIB', '#/pib', '', '#2020/rs', '#2020?ano=2021'])(
    '%j → null (padrão)',
    (hash) => {
      expect(lerHash(hash, ANOS)).toBeNull();
    },
  );

  it('lido com expressão regular, sem URLSearchParams (nem no App)', () => {
    for (const arquivo of ['../src/dados/hash.ts', '../src/App.tsx'])
      expect(readFileSync(new URL(arquivo, import.meta.url), 'utf8'), arquivo).not.toMatch(/URLSearchParams/);
  });
});

describe('escreverHash', () => {
  it('troca o hash por history.replaceState, sem sufixo no modo R$', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState, state: null });
    vi.stubGlobal('location', { pathname: '/sankey-fiscal/', search: '' });
    escreverHash(2022, 'pib');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/sankey-fiscal/#2022/pib');
    escreverHash(2022, 'desp');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/sankey-fiscal/#2022/despesa');
    escreverHash(2015, 'rs');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/sankey-fiscal/#2015');
  });
});

describe('modo na tela (transitório da 3b; a C2 tira)', () => {
  it('só R$ aparece na tela na 3b: o modo lido do hash fora de MODOS_NA_TELA vira R$', () => {
    expect(MODOS_NA_TELA).toEqual(['rs']);
    expect(modoNaTela('rs')).toBe('rs');
    expect(modoNaTela('desp')).toBe('rs');
    expect(modoNaTela('pib')).toBe('rs');
  });
});
