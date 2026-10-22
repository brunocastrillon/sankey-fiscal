import { describe, expect, it } from 'vitest';
import { anoSolicitado, SENTINELA } from '../src/dados/anoDeTeste';
import { escolherFormato } from '../src/ui/formato';

describe('formato pela largura do contêiner', () => {
  it('abaixo de 1100 px usa o desenho do celular; a partir de 1100, o do desktop', () => {
    expect(escolherFormato(1099).nome).toBe('celular');
    expect(escolherFormato(1100).nome).toBe('desktop');
    expect(escolherFormato(390).nome).toBe('celular');
  });
});

describe('parâmetro ?ano= do build de teste', () => {
  it('lê um ano válido e ignora o resto', () => {
    expect(anoSolicitado('?ano=2020')).toBe(2020);
    expect(anoSolicitado('')).toBeNull();
    expect(anoSolicitado('?ano=abc')).toBeNull();
  });
  it('carrega a sentinela que a conferência do bundle procura', () => {
    expect(SENTINELA).toBe('PARAM_ANO_SO_TESTE');
  });
});
