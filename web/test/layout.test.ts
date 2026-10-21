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
      const ent = L.fluxos.filter((f) => f.destino === n.id).reduce((s, f) => s + f.espessura, 0);
      const sai = L.fluxos.filter((f) => f.origem === n.id).reduce((s, f) => s + f.espessura, 0);
      if (L.fluxos.some((f) => f.destino === n.id)) expect(Math.abs(ent - h), `entradas de ${n.id}`).toBeLessThan(0.01);
      if (L.fluxos.some((f) => f.origem === n.id)) expect(Math.abs(sai - h), `saídas de ${n.id}`).toBeLessThan(0.01);
    }
  });

  it('fluxos iguais aos do grafo: mesmo valor e espessura = valor do grafo × escala', () => {
    expect(L.fluxos).toHaveLength(g.fluxos.length);
    for (const f of g.fluxos) {
      const lf = L.fluxos.filter((x) => x.origem === f.origem && x.destino === f.destino);
      expect(lf, `${f.origem}→${f.destino}`).toHaveLength(1);
      expect(lf[0].valor).toBe(f.valor);
      expect(Math.abs(lf[0].espessura / (f.valor * L.escala) - 1)).toBeLessThan(0.01);
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
      expect(f.x0).toBe(no(f.origem).x1);
      expect(f.x1).toBe(no(f.destino).x0);
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

describe('folha zerada', () => {
  it('não produz NaN nem espessura negativa, e a folha ainda tem rótulo', () => {
    const g: Grafo = structuredClone(montarGrafo(lerAno(2025)));
    g.nos.find((n) => n.id === 'bpc')!.valor = 0;
    g.fluxos.find((f) => f.destino === 'bpc')!.valor = 0;
    for (const { cfg, opcoes } of formatos) {
      const L = calcularLayout(g, cfg, medir, opcoes);
      const naoFinitos: string[] = [];
      const percorrer = (v: unknown, caminho: string): void => {
        if (typeof v === 'number' && !Number.isFinite(v)) naoFinitos.push(caminho);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) percorrer(x, `${caminho}.${k}`);
      };
      percorrer(L, 'layout');
      expect(naoFinitos).toEqual([]);
      expect(L.fluxos.filter((f) => f.espessura < 0)).toEqual([]);
      expect(L.rotulos.some((r) => r.id === 'bpc')).toBe(true);
    }
  });
});
