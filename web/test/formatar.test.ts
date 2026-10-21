import { describe, expect, it } from 'vitest';
import { formatarBi, formatarMesBase, formatarPct } from '../src/formatar';

describe('formatação em pt-BR', () => {
  it('R$ milhões viram R$ bilhões com uma casa decimal', () => {
    expect(formatarBi(1234567.8)).toBe('R$ 1.234,6 bi');
    expect(formatarBi(41253.47)).toBe('R$ 41,3 bi');
    expect(formatarBi(0)).toBe('R$ 0,0 bi');
  });

  it('fração vira porcentagem com uma casa decimal', () => {
    expect(formatarPct(0.0614)).toBe('6,1%');
    expect(formatarPct(1)).toBe('100,0%');
  });

  it('mês-base AAAA-MM vira mês abreviado/ano', () => {
    expect(formatarMesBase('2025-12')).toBe('dez/2025');
    expect(formatarMesBase('2019-01')).toBe('jan/2019');
  });
});
