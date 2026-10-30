import { describe, expect, it } from 'vitest';
import { escolherFormato } from '../src/ui/formato';

describe('formato pela largura do contêiner', () => {
  it('abaixo de 1100 px usa o desenho do celular; a partir de 1100, o do desktop', () => {
    expect(escolherFormato(1099).nome).toBe('celular');
    expect(escolherFormato(1100).nome).toBe('desktop');
    expect(escolherFormato(390).nome).toBe('celular');
  });
});
