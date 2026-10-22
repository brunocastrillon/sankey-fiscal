// Rótulos, guias, alvos e paradas sobre os 11 anos, desktop e celular, com fontes 15% mais estreitas e 25% mais largas.
//
// TESTE DE FUMAÇA: nesta fase a escala é de cada ano (cada ano preenche a mesma área de barras), então os anos diferem
// pouco entre si. Na fase 3, com a escala compartilhada entre anos no modo R$, estes mesmos testes rodam de novo e só
// então a prova vale de verdade.
import { afterAll, describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { CELULAR, DESKTOP, LARGURA_MIN_DESKTOP, type ConfigFormato } from '../src/layout/constantes';
import { calcularLayout, type Layout } from '../src/layout/layout';
import { anos, lerAno } from './apoio/dados';
import { distanciaSegmentoCaixa, sobrepoe } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const MARGEM = 12;
const FOLGA = 2;
const FATORES = [0.85, 1, 1.25];
const FORMATOS: { nome: string; cfg: ConfigFormato; opcoes: { largura?: number; larguraVisivel?: number } }[] = [
  { nome: 'desktop 1100', cfg: DESKTOP, opcoes: { largura: LARGURA_MIN_DESKTOP } },
  { nome: 'desktop 1200', cfg: DESKTOP, opcoes: { largura: 1200 } },
  { nome: 'celular 390', cfg: CELULAR, opcoes: { larguraVisivel: 390 } },
  { nome: 'celular 768 (sem rolagem)', cfg: CELULAR, opcoes: { larguraVisivel: 768 } },
  { nome: 'celular 990 (sem rolagem)', cfg: CELULAR, opcoes: { larguraVisivel: 990 } },
];

const lateral = (L: Layout) => L.rotulos.filter((r) => r.lado !== 'meio');
const centroNo = (L: Layout, id: string) => {
  const n = L.nos.find((x) => x.id === id)!;
  return (n.y0 + n.y1) / 2;
};
const deslocamentoMax = (L: Layout) =>
  Math.max(0, ...lateral(L).map((r) => Math.abs((r.caixa.y0 + r.caixa.y1) / 2 - centroNo(L, r.id))));
/**
 * Menor distância de uma guia a obstáculos que não são do próprio nó (outras barras e caixas de outros rótulos).
 * `mesmaColuna`: barras da coluna do nó e rótulos do mesmo lado — a distância a eles é fixa por construção (o trecho
 * horizontal da guia termina a `min(10, guiaDx/2)` px da barra, e a coluna de rótulos começa a `guiaDx` px).
 * `outrasColunas`: barras e rótulos de outras colunas — é aí que um rótulo do meio pode invadir o corredor das guias.
 */
function menorDistanciaGuia(L: Layout, quais: 'todas' | 'mesmaColuna' | 'outrasColunas' = 'todas'): number {
  let menor = Infinity;
  for (const gd of L.guias) {
    const proprio = L.nos.find((n) => n.id === gd.id)!;
    const ladoProprio = L.rotulos.find((r) => r.id === gd.id)!.lado;
    const obstaculos = [
      ...L.nos.filter((n) => n.id !== gd.id).map((n) => ({ mesma: n.x0 === proprio.x0, c: { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 } })),
      ...L.rotulos.filter((r) => r.id !== gd.id).map((r) => ({ mesma: r.lado === ladoProprio, c: r.caixa })),
    ].filter((o) => quais === 'todas' || (quais === 'mesmaColuna') === o.mesma);
    for (let i = 1; i < gd.pontos.length; i++)
      for (const o of obstaculos) menor = Math.min(menor, distanciaSegmentoCaixa(gd.pontos[i - 1], gd.pontos[i], o.c));
  }
  return menor;
}
/** Menor distância entre segmentos de guias de nós diferentes (Infinity se há menos de duas guias). */
function distanciaEntreGuias(L: Layout): number {
  let menor = Infinity;
  const segmentos = L.guias.flatMap((g) => g.pontos.slice(1).map((p, i) => ({ id: g.id, a: g.pontos[i], b: p })));
  for (const s1 of segmentos)
    for (const s2 of segmentos) {
      if (s1.id >= s2.id) continue;
      const caixa = { x0: Math.min(s2.a[0], s2.b[0]), x1: Math.max(s2.a[0], s2.b[0]), y0: Math.min(s2.a[1], s2.b[1]), y1: Math.max(s2.a[1], s2.b[1]) };
      menor = Math.min(menor, distanciaSegmentoCaixa(s1.a, s1.b, caixa));
    }
  return menor;
}
const cortes = (L: Layout) =>
  L.paradas ? L.rotulos.filter((r) => L.paradas!.bordas.some((b) => r.caixa.x0 < b && r.caixa.x1 > b)).length : 0;

const relato: Record<string, unknown>[] = [];
afterAll(() => {
  console.log('\nRelatório por ano (medidor ×1,00):');
  console.table(relato);
});

describe.each(anos())('%i', (ano) => {
  const g = montarGrafo(lerAno(ano));

  for (const { nome, cfg, opcoes } of FORMATOS) {
    describe.each(FATORES)(`${nome}, medidor ×%s`, (fator) => {
      const L = calcularLayout(g, cfg, medidorDeterministico(fator), opcoes);

      it('nenhum par de rótulos a menos de 2 px', () => {
        const colisoes: string[] = [];
        for (let i = 0; i < L.rotulos.length; i++)
          for (let j = i + 1; j < L.rotulos.length; j++)
            if (sobrepoe(L.rotulos[i].caixa, L.rotulos[j].caixa, FOLGA)) colisoes.push(`${L.rotulos[i].id} × ${L.rotulos[j].id}`);
        expect(colisoes).toEqual([]);
      });

      it('nenhum rótulo sobre a barra de outro nó', () => {
        const sobre: string[] = [];
        for (const r of L.rotulos)
          for (const n of L.nos)
            if (n.id !== r.id && sobrepoe(r.caixa, { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 }, FOLGA)) sobre.push(`${r.id} sobre ${n.id}`);
        expect(sobre).toEqual([]);
      });

      it('o desenho não passa da largura pedida', () => {
        if (opcoes.largura) expect(L.largura).toBeLessThanOrEqual(opcoes.largura + 1e-9);
        if (opcoes.larguraVisivel && !L.paradas) expect(L.largura).toBeLessThanOrEqual(opcoes.larguraVisivel);
      });

      it('todo rótulo a pelo menos 12 px da borda do SVG, e a altura é a constante', () => {
        expect(L.altura).toBe(cfg.alturaSvg);
        const fora = L.rotulos.filter(
          (r) => r.caixa.x0 < MARGEM || r.caixa.x1 > L.largura - MARGEM || r.caixa.y0 < MARGEM || r.caixa.y1 > L.altura - MARGEM,
        );
        expect(fora.map((r) => r.id)).toEqual([]);
        const fundoBarras = Math.max(...L.nos.map((n) => n.y1));
        expect(fundoBarras).toBeLessThanOrEqual(L.altura - MARGEM);
      });

      it('guias ligam a barra ao rótulo do mesmo nó e não cruzam outra barra nem outro rótulo', () => {
        for (const gd of L.guias) {
          const n = L.nos.find((x) => x.id === gd.id)!;
          const r = L.rotulos.find((x) => x.id === gd.id)!;
          const [px, py] = gd.pontos[0];
          expect(px === n.x1 + 1 || px === n.x0 - 1, `${gd.id}: início na borda`).toBe(true);
          expect(py).toBeCloseTo((n.y0 + n.y1) / 2, 6);
          const [, uy] = gd.pontos[gd.pontos.length - 1];
          expect(uy >= r.caixa.y0 && uy <= r.caixa.y1, `${gd.id}: fim na altura do próprio rótulo`).toBe(true);
          expect(r.deslocado).toBe(true);
        }
        expect(lateral(L).filter((r) => r.deslocado && !L.guias.some((gd) => gd.id === r.id))).toEqual([]);
        expect(menorDistanciaGuia(L)).toBeGreaterThan(0);
      });

      it('guias de nós diferentes a pelo menos 3 px uma da outra', () => {
        expect(distanciaEntreGuias(L)).toBeGreaterThanOrEqual(3);
      });

      it('deslocamento máximo do rótulo dentro do limite declarado', () => {
        expect(deslocamentoMax(L)).toBeLessThanOrEqual(cfg.deslocamentoMax);
      });

      if (cfg.alvoToque > 0) {
        it('alvos de toque de pelo menos 44 px, sem sobreposição entre vizinhos do mesmo lado', () => {
          for (const a of L.alvos) {
            expect(a.caixa.x1 - a.caixa.x0, a.id).toBeGreaterThanOrEqual(cfg.alvoToque - 1e-9);
            expect(a.caixa.y1 - a.caixa.y0, a.id).toBeGreaterThanOrEqual(cfg.alvoToque - 1e-9);
          }
          for (const lado of ['esquerda', 'direita'] as const) {
            const ids = L.rotulos.filter((r) => r.lado === lado).map((r) => r.id);
            const caixas = L.alvos.filter((a) => ids.includes(a.id)).sort((a, b) => a.caixa.y0 - b.caixa.y0);
            expect(caixas).toHaveLength(ids.length);
            for (let i = 1; i < caixas.length; i++) expect(caixas[i].caixa.y0).toBeGreaterThanOrEqual(caixas[i - 1].caixa.y1);
          }
        });

        it('nenhum alvo de toque cobre a barra de outro nó', () => {
          const cobre: string[] = [];
          for (const al of L.alvos)
            for (const n of L.nos)
              if (n.id !== al.id && sobrepoe(al.caixa, { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 })) cobre.push(`${al.id} cobre ${n.id}`);
          expect(cobre).toEqual([]);
        });

        it('nenhum alvo de toque cobre o alvo ou o rótulo de outro nó', () => {
          const cobre: string[] = [];
          for (const a of L.alvos) {
            for (const b of L.alvos) if (a.id < b.id && sobrepoe(a.caixa, b.caixa)) cobre.push(`alvo ${a.id} × alvo ${b.id}`);
            for (const r of L.rotulos) if (r.id !== a.id && sobrepoe(a.caixa, r.caixa)) cobre.push(`alvo ${a.id} × rótulo ${r.id}`);
          }
          expect(cobre).toEqual([]);
        });

        if (opcoes.larguraVisivel === 390) it('paradas a 390 px: viável e nenhum rótulo atravessa as bordas', () => {
          expect(L.paradas?.viavel).toBe(true);
          expect(cortes(L)).toBe(0);
        });
      }

      if (fator === 1 && !nome.includes('sem rolagem')) {
        it('relato', () => {
          const linha: Record<string, unknown> = {
            ano,
            formato: nome,
            'desloc. máx (px)': Number(deslocamentoMax(L).toFixed(1)),
            'guia–outras colunas (px)': L.guias.length ? Number(menorDistanciaGuia(L, 'outrasColunas').toFixed(1)) : '—',
            'guia–mesma coluna (px, fixa)': L.guias.length ? Number(menorDistanciaGuia(L, 'mesmaColuna').toFixed(1)) : '—',
            'guia–guia (px)': L.guias.length > 1 ? Number(distanciaEntreGuias(L).toFixed(1)) : '—',
          };
          if (cfg.alvoToque > 0) {
            linha.viavel = L.paradas?.viavel;
            for (const v of [360, 768]) {
              const Lv = calcularLayout(g, cfg, medidorDeterministico(1), { larguraVisivel: v });
              linha[`cortes ${v}`] = Lv.paradas ? `${cortes(Lv)}${Lv.paradas.viavel ? '' : ' (inviável)'}` : 'sem rolagem';
            }
          }
          relato.push(linha);
        });
      }
    });
  }
});
