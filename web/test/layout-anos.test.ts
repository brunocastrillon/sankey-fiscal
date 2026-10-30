// Rótulos, guias, alvos e paradas sobre os 11 anos e os 3 modos, desktop e celular, com fontes 15% mais estreitas e 25% mais
// largas, com a escala e a âncora compartilhadas entre os anos (uma por modo e formato, como no site) e a largura reservada
// aos rótulos igual nos três modos. Com METRICAS_ESCALA=<arquivo>, grava a tabela de métricas por ano em Markdown.
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import type { Grafo, Modo } from '../src/grafo/tipos';
import { CELULAR, DESKTOP, ESPESSURA_MINIMA, LARGURA_MIN_DESKTOP, type ConfigFormato } from '../src/layout/constantes';
import { calcularEscalaCompartilhada, calcularReserva } from '../src/layout/escala';
import { calcularLayout, type Layout } from '../src/layout/layout';
import { dadosDosAnos } from './apoio/dados';
import { colisoesDeRotulos, distanciaSegmentoCaixa, emendas, extensao, noMaisFino, sobrepoe } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const MARGEM = 12;
const FOLGA = 2;
const FATORES = [0.85, 1, 1.25];
const MODOS: Modo[] = ['rs', 'desp', 'pib'];
const FORMATOS: { nome: string; cfg: ConfigFormato; opcoes: { largura?: number; larguraVisivel?: number }; tabela?: boolean }[] = [
  { nome: 'desktop 1100', cfg: DESKTOP, opcoes: { largura: LARGURA_MIN_DESKTOP } },
  { nome: 'desktop 1200', cfg: DESKTOP, opcoes: { largura: 1200 }, tabela: true },
  { nome: 'celular 390', cfg: CELULAR, opcoes: { larguraVisivel: 390 }, tabela: true },
  { nome: 'celular 768 (sem rolagem)', cfg: CELULAR, opcoes: { larguraVisivel: 768 } },
  { nome: 'celular 990 (sem rolagem)', cfg: CELULAR, opcoes: { larguraVisivel: 990 } },
];
const DADOS = dadosDosAnos();
const GRAFOS = Object.fromEntries(MODOS.map((m) => [m, DADOS.map((d) => montarGrafo(d, m))])) as Record<Modo, Grafo[]>;

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
/** Altura da terceira coluna (repasse + receita líquida + déficit, com os espaços), do topo da primeira barra ao fundo da última. */
function colunaDoMeio(L: Layout, g: Grafo): number {
  const x = L.nos.find((n) => n.id === g.nos.find((m) => m.papel === 'repasse')!.id)!.x0;
  const nos = L.nos.filter((n) => n.x0 === x);
  return Math.max(...nos.map((n) => n.y1)) - Math.min(...nos.map((n) => n.y0));
}

const tabela: string[] = [];
const resumo: Record<string, unknown>[] = [];
afterAll(() => {
  console.log('\nRelatório por ano (modo R$, medidor ×1,00; a tabela completa sai com METRICAS_ESCALA=<arquivo>):');
  console.table(resumo);
  if (process.env.METRICAS_ESCALA) {
    const cab =
      '| Modo | Formato | Fator | Ano | Coluna do meio (px) | Resultado (px) | Folha mais fina (px) | Vazio abaixo (px) | ' +
      'Desloc. máx. de rótulo (px) | Folga até a altura (px) | Emendas (informativo) |\n' +
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
    writeFileSync(process.env.METRICAS_ESCALA, `${cab}\n${tabela.join('\n')}\n`, 'utf8');
  }
});

describe.each(MODOS)('modo %s', (modo) => {
  for (const { nome, cfg, opcoes, tabela: naTabela } of FORMATOS) {
    describe.each(FATORES)(`${nome}, medidor ×%s`, (fator) => {
      const medir = medidorDeterministico(fator);
      const reservaLargura = calcularReserva(MODOS.flatMap((m) => GRAFOS[m]), cfg, medir);
      const comp = calcularEscalaCompartilhada(GRAFOS[modo], cfg, medir, { ...opcoes, reservaLargura });

      describe.each(GRAFOS[modo].map((g) => [g.ano, g] as const))('%i', (ano, g) => {
        const L = calcularLayout(g, cfg, medir, { ...opcoes, ...comp });

        it('escala e âncora compartilhadas: a do modo e o topo da terceira coluna na âncora', () => {
          expect(L.escala).toBe(comp.escala);
          const repasse = L.nos.find((n) => n.id === g.nos.find((m) => m.papel === 'repasse')!.id)!;
          expect(Math.abs(repasse.y0 - comp.ancoraY)).toBeLessThanOrEqual(0.01);
        });

        it('nenhum par de rótulos a menos de 2 px', () => {
          expect(colisoesDeRotulos(L, FOLGA)).toEqual([]);
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

        it('barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante', () => {
          expect(L.altura).toBe(cfg.alturaSvg);
          expect(L.filaApertada, 'a fila de rótulos laterais encostou no limite do SVG').toBe(false);
          const { topo, fundo } = extensao(L);
          expect(topo).toBeGreaterThanOrEqual(MARGEM);
          expect(fundo).toBeLessThanOrEqual(L.altura - MARGEM);
          const fora = L.rotulos.filter((r) => r.caixa.x0 < MARGEM || r.caixa.x1 > L.largura - MARGEM);
          expect(fora.map((r) => r.id)).toEqual([]);
        });

        it(`todo nó com valor positivo tem pelo menos ${ESPESSURA_MINIMA} px`, () => {
          expect(noMaisFino(L, g).px).toBeGreaterThanOrEqual(ESPESSURA_MINIMA);
        });

        it('guias laterais ligam a barra ao rótulo do mesmo nó e não cruzam outra barra nem outro rótulo', () => {
          // a guia em L do superávit (de baixo do nó até o rótulo em A′) é provada em superavit.test.tsx
          for (const gd of L.guias.filter((x) => x.id !== 'resultado_primario')) {
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

          if (opcoes.larguraVisivel === 390)
            it('paradas a 390 px: viável e nenhum rótulo atravessa as bordas', () => {
              expect(L.paradas?.viavel).toBe(true);
              expect(cortes(L)).toBe(0);
            });
        }

        if (naTabela)
          it('relato', () => {
            const fino = noMaisFino(L, g);
            const res = L.nos.find((n) => n.id === 'resultado_primario')!;
            const fundoBarras = Math.max(...L.nos.map((n) => n.y1));
            const linha = {
              colunaDoMeio: colunaDoMeio(L, g).toFixed(1),
              resultado: (res.y1 - res.y0).toFixed(2),
              fino: `${fino.px.toFixed(2)} (${fino.id})`,
              vazio: (L.altura - fundoBarras).toFixed(1),
              desloc: deslocamentoMax(L).toFixed(1),
              folga: (L.altura - MARGEM - extensao(L).fundo).toFixed(1),
              // informativo (não falha): guias de faixas vizinhas que terminam e começam a menos de 8 px no eixo y
              emendas: ((e) => `${e.length}${e.includes('demais_controle_fluxo × discricionarias') ? ' (Demais × Discricionárias)' : ''}`)(emendas(L)),
            };
            tabela.push(`| ${modo} | ${nome} | ${fator} | ${ano} | ${Object.values(linha).join(' | ')} |`);
            if (modo === 'rs' && fator === 1) resumo.push({ ano, formato: nome, ...linha });
          });
      });
    });
  }
});
