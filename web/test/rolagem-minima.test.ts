import { describe, expect, it } from 'vitest';
import { rolagemMinima } from '../src/ui/rolagemMinima';

// coordenadas da página; tela de 844 px; página com 3000 px de altura
const base = { alturaTela: 844, maxRolagem: 3000 - 844 };

describe('rolagemMinima', () => {
  it('não rola quando o nó e 120 px do painel já estão na tela', () => {
    expect(rolagemMinima({ ...base, atual: 100, no: { topo: 300, fundo: 400 }, painelTopo: 700 })).toBe(100);
  });

  it('rola o mínimo para 120 px do painel entrarem, mantendo o nó a 16 px do topo', () => {
    const r = rolagemMinima({ ...base, atual: 0, no: { topo: 300, fundo: 400 }, painelTopo: 1000 });
    expect(r).toBe(1000 + 120 - 844);
    expect(300 - r).toBeGreaterThanOrEqual(16);
  });

  it('quando as duas condições não cabem, o nó continua visível (prioridade)', () => {
    const r = rolagemMinima({ ...base, atual: 0, no: { topo: 200, fundo: 350 }, painelTopo: 1200 });
    expect(r).toBe(200 - 16);
  });

  it('rola para cima se o nó estiver acima da tela', () => {
    expect(rolagemMinima({ ...base, atual: 900, no: { topo: 500, fundo: 600 }, painelTopo: 1100 })).toBe(500 - 16);
  });

  it('rola para baixo o bastante para o nó inteiro aparecer', () => {
    const r = rolagemMinima({ ...base, atual: 0, no: { topo: 900, fundo: 1000 }, painelTopo: 1050 });
    expect(r).toBeGreaterThanOrEqual(1000 + 16 - 844);
    expect(900 - r).toBeGreaterThanOrEqual(16);
  });

  it('respeita os limites da página', () => {
    expect(rolagemMinima({ ...base, atual: 0, no: { topo: 5, fundo: 50 }, painelTopo: 2990 })).toBe(0);
    expect(rolagemMinima({ ...base, atual: 0, no: { topo: 2900, fundo: 2950 }, painelTopo: 2960 })).toBe(base.maxRolagem);
  });
});
