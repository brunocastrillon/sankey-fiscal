// Escala compartilhada: a menor entre anos e colunas; um ano novo maior encolhe todos; a altura do SVG e a espessura mínima
// são guardas testadas, não pisos. As colunas ficam nas mesmas posições x nos três modos e nos 11 anos.
import { describe, expect, it } from 'vitest';
import type { DadosAno } from '../src/dados/tipos';
import { montarGrafo } from '../src/grafo/grafo';
import type { Modo } from '../src/grafo/tipos';
import { CELULAR, DESKTOP, ESPESSURA_MINIMA, LARGURA_MIN_DESKTOP, type ConfigFormato } from '../src/layout/constantes';
import { calcularEscalaCompartilhada, calcularReserva } from '../src/layout/escala';
import { calcularLayout } from '../src/layout/layout';
import { anoSintetico, dadosDosAnos, lerAno } from './apoio/dados';
import { colisoesDeRotulos, deslocamentoMaximo, extensao, noMaisFino } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const MARGEM = 12;
const FATORES = [0.85, 1, 1.25];
const MODOS: Modo[] = ['rs', 'desp', 'pib'];
const FORMATOS: { nome: string; cfg: ConfigFormato; opcoes: { largura?: number; larguraVisivel?: number } }[] = [
  { nome: 'desktop 1100', cfg: DESKTOP, opcoes: { largura: LARGURA_MIN_DESKTOP } },
  { nome: 'desktop 1200', cfg: DESKTOP, opcoes: { largura: 1200 } },
  { nome: 'celular 390', cfg: CELULAR, opcoes: { larguraVisivel: 390 } },
];
const grafosDe = (dados: DadosAno[], modo: Modo) => dados.map((d) => montarGrafo(d, modo));

/**
 * Problemas da série no formato: extensão (inclusive a fila de rótulos empurrada pelos limites do SVG), colisões, espessura
 * mínima, deslocamento de rótulo (se `deslocamento`), ou o erro da fila que não cabe. `maiores`, se dado, recebe o maior
 * deslocamento de rótulo por modo e fator (para a tabela).
 */
function problemas(
  dados: DadosAno[],
  cfg: ConfigFormato,
  opcoes: { largura?: number; larguraVisivel?: number },
  { deslocamento = true, maiores }: { deslocamento?: boolean; maiores?: Record<string, string> } = {},
): string[] {
  const achados: string[] = [];
  for (const fator of FATORES) {
    const medir = medidorDeterministico(fator);
    const reservaLargura = calcularReserva(MODOS.flatMap((m) => grafosDe(dados, m)), cfg, medir);
    for (const modo of MODOS) {
      try {
        const grafos = grafosDe(dados, modo);
        const comp = calcularEscalaCompartilhada(grafos, cfg, medir, { ...opcoes, reservaLargura });
        for (const g of grafos) {
          const L = calcularLayout(g, cfg, medir, { ...opcoes, ...comp });
          const onde = `${modo} ×${fator} ${g.ano}`;
          const { topo, fundo } = extensao(L);
          if (topo < MARGEM || fundo > cfg.alturaSvg - MARGEM) achados.push(`${onde}: extensão [${topo.toFixed(1)}, ${fundo.toFixed(1)}]`);
          if (L.filaApertada) achados.push(`${onde}: extensão: a fila de rótulos encostou no limite do SVG`);
          for (const c of colisoesDeRotulos(L, 2)) achados.push(`${onde}: colisão ${c}`);
          const fino = noMaisFino(L, g);
          if (fino.px < ESPESSURA_MINIMA) achados.push(`${onde}: espessura ${fino.px.toFixed(2)} px em ${fino.id}`);
          const desloc = deslocamentoMaximo(L);
          if (deslocamento && desloc > cfg.deslocamentoMax) achados.push(`${onde}: deslocamento de rótulo ${desloc.toFixed(1)} px`);
          const chave = `${cfg.nome} ${modo} ×${fator}`;
          if (maiores && desloc > Number.parseFloat(maiores[chave] ?? '0')) maiores[chave] = `${desloc.toFixed(1)} (${g.ano})`;
        }
      } catch (e) {
        achados.push(`${modo} ×${fator}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return achados;
}

const SERIE = dadosDosAnos();
const comSintetico = (k: number) => [...SERIE, anoSintetico(lerAno(2025), k, 2026)];

describe('escala compartilhada', () => {
  it.each(FORMATOS)('$nome: a menor entre anos e colunas (a escala própria de cada ano, da fase 2)', ({ cfg, opcoes }) => {
    const medir = medidorDeterministico(1);
    for (const modo of MODOS) {
      const grafos = grafosDe(SERIE, modo);
      const { escala } = calcularEscalaCompartilhada(grafos, cfg, medir, opcoes);
      expect(escala).toBe(Math.min(...grafos.map((g) => calcularLayout(g, cfg, medir, opcoes).escala)));
    }
  });

  it.each(FORMATOS)('$nome: a âncora é a do ano mais alto (a maior das âncoras próprias, com a escala e a reserva comuns)', ({ cfg, opcoes }) => {
    const medir = medidorDeterministico(1);
    const reservaLargura = calcularReserva(MODOS.flatMap((m) => grafosDe(SERIE, m)), cfg, medir);
    for (const modo of MODOS) {
      const grafos = grafosDe(SERIE, modo);
      const comp = calcularEscalaCompartilhada(grafos, cfg, medir, { ...opcoes, reservaLargura });
      const proprias = grafos.map((g) => calcularLayout(g, cfg, medir, { ...opcoes, escala: comp.escala, reservaLargura }).ancoraY);
      expect(comp.ancoraY).toBe(Math.max(...proprias));
    }
  });

  it.each(FORMATOS)('$nome: colunas nas mesmas posições x nos três modos e nos 11 anos', ({ cfg, opcoes }) => {
    for (const fator of FATORES) {
      const medir = medidorDeterministico(fator);
      const reservaLargura = calcularReserva(MODOS.flatMap((m) => grafosDe(SERIE, m)), cfg, medir);
      const posicoes = new Set<string>();
      for (const modo of MODOS) {
        const grafos = grafosDe(SERIE, modo);
        const comp = calcularEscalaCompartilhada(grafos, cfg, medir, { ...opcoes, reservaLargura });
        for (const g of grafos) {
          const L = calcularLayout(g, cfg, medir, { ...opcoes, ...comp });
          const porColuna = [0, 1, 2, 3, 4, 5].map((c) => [...new Set(g.nos.filter((n) => n.coluna === c && n.papel !== 'resultado').map((n) => L.nos.find((x) => x.id === n.id)!.x0))]);
          posicoes.add(JSON.stringify({ porColuna, largura: L.largura }));
        }
      }
      expect([...posicoes], `fator ${fator}`).toHaveLength(1);
    }
  });
});

describe('ano novo maior que todos (2025 sintético, como 2026)', () => {
  // no ano sintético o deslocamento de rótulo entra só na tabela (o design pede extensão, colisões e espessura)
  it('× 1,3: a escala encolhe e tudo passa (extensão, colisões, espessura mínima) nos dois formatos e nos três modos', () => {
    const medir = medidorDeterministico(1);
    const antes = calcularEscalaCompartilhada(grafosDe(SERIE, 'rs'), DESKTOP, medir, { largura: 1200 }).escala;
    const depois = calcularEscalaCompartilhada(grafosDe(comSintetico(1.3), 'rs'), DESKTOP, medir, { largura: 1200 }).escala;
    expect(depois).toBeLessThan(antes);
    const maiores: Record<string, string> = {};
    for (const { cfg, opcoes } of FORMATOS) expect(problemas(comSintetico(1.3), cfg, opcoes, { deslocamento: false, maiores })).toEqual([]);
    console.log('\nAno sintético 2025 × 1,3: maior deslocamento de rótulo (px, ano) por formato, modo e fator');
    console.table(maiores);
  });

  it(`× 1,5: a espessura mínima (${ESPESSURA_MINIMA} px) falha no celular`, () => {
    const achados = problemas(comSintetico(1.5), CELULAR, { larguraVisivel: 390 }, { deslocamento: false });
    expect(achados.some((a) => /espessura/.test(a))).toBe(true);
  });
});

describe('altura do SVG', () => {
  it.each(FORMATOS)('$nome: a série de hoje cabe na altura declarada', ({ cfg, opcoes }) => {
    expect(problemas(SERIE, cfg, opcoes)).toEqual([]);
  });

  it.each(FORMATOS)('$nome: com a altura 20 px menor, a extensão falha', ({ cfg, opcoes }) => {
    const menor = { ...cfg, alturaSvg: cfg.alturaSvg - 20 };
    expect(problemas(SERIE, menor, opcoes).filter((a) => /extensão|não cabe/.test(a)).length).toBeGreaterThan(0);
  });

  it('constantes da fase 3: 752 no desktop, 744 no celular, espessura mínima de 3 px', () => {
    expect(DESKTOP.alturaSvg).toBe(752);
    expect(CELULAR.alturaSvg).toBe(744);
    expect(ESPESSURA_MINIMA).toBe(3);
  });
});

