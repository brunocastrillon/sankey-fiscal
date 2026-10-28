import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import type { Grafo } from '../src/grafo/tipos';
import { CELULAR, DESKTOP, LARGURA_MAX_DESKTOP } from '../src/layout/constantes';
import { caminhoFaixa } from '../src/layout/geometria';
import { calcularLayout } from '../src/layout/layout';
import { lerAno } from './apoio/dados';
import { espessurasDaFaixa } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const medir = medidorDeterministico();
const formatos = [
  { nome: 'desktop', cfg: DESKTOP, opcoes: { largura: LARGURA_MAX_DESKTOP } },
  { nome: 'celular', cfg: CELULAR, opcoes: { larguraVisivel: 390 } },
] as const;

describe.each(formatos)('geometria de 2025 ($nome)', ({ cfg, opcoes }) => {
  const g = montarGrafo(lerAno(2025));
  const L = calcularLayout(g, cfg, medir, opcoes);
  const no = (id: string) => L.nos.find((n) => n.id === id)!;

  it('conservação na geometria: entradas = saídas = altura da barra', () => {
    for (const n of L.nos) {
      const h = n.y1 - n.y0;
      // o fluxo do resultado que não se aplica no ano tem valor 0 e não conta
      const ent = L.fluxos.filter((f) => f.destino === n.id).reduce((s, f) => s + f.espessura, 0);
      const sai = L.fluxos.filter((f) => f.origem === n.id).reduce((s, f) => s + f.espessura, 0);
      if (L.fluxos.some((f) => f.destino === n.id && f.valor > 0)) expect(Math.abs(ent - h), `entradas de ${n.id}`).toBeLessThan(0.01);
      if (L.fluxos.some((f) => f.origem === n.id && f.valor > 0)) expect(Math.abs(sai - h), `saídas de ${n.id}`).toBeLessThan(0.01);
    }
  });

  it('fluxos iguais aos do grafo: mesmo valor e espessura = valor do grafo × escala', () => {
    expect(L.fluxos).toHaveLength(g.fluxos.length);
    for (const f of g.fluxos) {
      const lf = L.fluxos.filter((x) => x.origem === f.origem && x.destino === f.destino);
      expect(lf, `${f.origem}→${f.destino}`).toHaveLength(1);
      expect(lf[0].valor).toBe(f.valor);
      expect(Math.abs(lf[0].espessura - f.valor * L.escala)).toBeLessThan(0.01);
    }
  });

  it('escala única em todo fluxo de valor > 0', () => {
    for (const f of L.fluxos.filter((x) => x.valor > 0)) expect(Math.abs(f.espessura / f.valor / L.escala - 1)).toBeLessThan(0.01);
  });

  it('faixa preenchida: espessura medida no caminho nas duas pontas', () => {
    for (const f of L.fluxos) {
      const e = espessurasDaFaixa(caminhoFaixa(f));
      expect(e.fechado).toBe(true);
      expect(Math.abs(e.saida - f.espessura)).toBeLessThan(0.01);
      expect(Math.abs(e.entrada - f.espessura)).toBeLessThan(0.01);
      // o resultado sai da posição do déficit e chega à do superávit
      expect(f.x0).toBe(f.origem === 'resultado_primario' ? L.posicoesResultado.deficit.x1 : no(f.origem).x1);
      expect(f.x1).toBe(f.destino === 'resultado_primario' ? L.posicoesResultado.superavit.x0 : no(f.destino).x0);
    }
  });
});

describe('celular em tela que cabe o desenho inteiro', () => {
  it('a 768 px não há rolagem: sem paradas e sem alargar o desenho', () => {
    const g = montarGrafo(lerAno(2025));
    const natural = calcularLayout(g, CELULAR, medir, {});
    const L = calcularLayout(g, CELULAR, medir, { larguraVisivel: 768 });
    expect(natural.largura).toBeLessThanOrEqual(768);
    expect(L.paradas).toBeNull();
    expect(L.largura).toBe(natural.largura);
  });
});

describe('escala com uma coluna somando zero', () => {
  it('o espaço extra da coluna das folhas continua na coluna das folhas (índice da coluna, não do filtro)', () => {
    const g: Grafo = structuredClone(montarGrafo(lerAno(2025)));
    // coluna 4 (Obrigatórias) com soma zero e a coluna 5 como a que limita a escala
    g.nos.find((n) => n.id === 'obrigatorias')!.valor = 0;
    g.nos.find((n) => n.id === 'aposentadorias_pensoes')!.valor *= 4;
    const L = calcularLayout(g, DESKTOP, medir, { largura: LARGURA_MAX_DESKTOP });
    const esperada = Math.min(
      ...[0, 1, 2, 3, 4, 5]
        .map((c) => ({ c, nos: g.nos.filter((n) => n.coluna === c) }))
        .filter(({ nos }) => nos.reduce((s, n) => s + n.valor, 0) > 0)
        .map(({ c, nos }) =>
          (DESKTOP.alturaBarras - (nos.length - 1) * DESKTOP.espacoEntreNos - (c === 5 ? DESKTOP.espacoEntreNos : 0)) /
          nos.reduce((s, n) => s + n.valor, 0),
        ),
    );
    expect(L.escala).toBeCloseTo(esperada, 12);
  });
});

describe('folha zerada', () => {
  // grafo consistente: zera o BPC no próprio JSON e recalcula a despesa total e o resultado primário
  const d = structuredClone(lerAno(2025));
  const bpc = d.real.nos.bpc;
  d.real.nos.bpc = 0;
  d.real.totais.despesa_total -= bpc;
  d.real.totais.primario_acima = d.real.totais.receita_liquida - d.real.totais.despesa_total;
  const g = montarGrafo(d);

  it('o grafo continua conservando em todo nó', () => {
    for (const n of g.nos) {
      const ent = g.fluxos.filter((f) => f.destino === n.id).reduce((s, f) => s + f.valor, 0);
      const sai = g.fluxos.filter((f) => f.origem === n.id).reduce((s, f) => s + f.valor, 0);
      if (g.fluxos.some((f) => f.destino === n.id && f.valor > 0)) expect(Math.abs(ent - n.valor), `entradas de ${n.id}`).toBeLessThan(0.01);
      if (g.fluxos.some((f) => f.origem === n.id && f.valor > 0)) expect(Math.abs(sai - n.valor), `saídas de ${n.id}`).toBeLessThan(0.01);
    }
  });

  it.each(formatos)('$nome: sem NaN, sem espessura negativa, conservação na geometria e sem rótulo da folha zerada', ({ cfg, opcoes }) => {
    const L = calcularLayout(g, cfg, medir, opcoes);
    const naoFinitos: string[] = [];
    const percorrer = (v: unknown, caminho: string): void => {
      if (typeof v === 'number' && !Number.isFinite(v)) naoFinitos.push(caminho);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) percorrer(x, `${caminho}.${k}`);
    };
    percorrer(L, 'layout');
    expect(naoFinitos).toEqual([]);
    expect(L.fluxos.filter((f) => f.espessura < 0)).toEqual([]);
    expect(L.fluxos.find((f) => f.destino === 'bpc')!.espessura).toBe(0);
    for (const n of L.nos) {
      const h = n.y1 - n.y0;
      const ent = L.fluxos.filter((f) => f.destino === n.id).reduce((s, f) => s + f.espessura, 0);
      const sai = L.fluxos.filter((f) => f.origem === n.id).reduce((s, f) => s + f.espessura, 0);
      if (L.fluxos.some((f) => f.destino === n.id && f.valor > 0)) expect(Math.abs(ent - h), `entradas de ${n.id}`).toBeLessThan(0.01);
      if (L.fluxos.some((f) => f.origem === n.id && f.valor > 0)) expect(Math.abs(sai - h), `saídas de ${n.id}`).toBeLessThan(0.01);
    }
    // nó com valor zero: sem rótulo, guia nem alvo de toque (design da fase 3, T2)
    expect(L.rotulos.some((r) => r.id === 'bpc')).toBe(false);
    expect(L.guias.some((r) => r.id === 'bpc')).toBe(false);
    expect(L.alvos.some((r) => r.id === 'bpc')).toBe(false);
  });
});

