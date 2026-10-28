// Superávit primário: um nó lógico, duas posições (déficit na terceira coluna, superávit na quarta, abaixo do Gasto total),
// rótulo no lugar do rótulo do déficit (A′) com guia em L quando fica longe do fluxo; o nó que vale zero não tem rótulo, guia,
// alvo de toque, parada no Tab nem linha na tabela.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DadosAno } from '../src/dados/tipos';
import { formatarValor } from '../src/formatar';
import { grafoDeValores, montarGrafo, valoresDoModo } from '../src/grafo/grafo';
import type { Grafo, Modo } from '../src/grafo/tipos';
import { CELULAR, DESKTOP, LIMIAR_GUIA_RESULTADO, type ConfigFormato } from '../src/layout/constantes';
import { calcularEscalaCompartilhada, calcularReserva } from '../src/layout/escala';
import { calcularLayout, type Caixa, type FluxoLayout, type Layout } from '../src/layout/layout';
import { TEXTOS } from '../src/textos';
import { Sankey } from '../src/ui/Sankey';
import { TabelaValores } from '../src/ui/TabelaValores';
import { anos, dadosDosAnos, lerAno } from './apoio/dados';
import { distanciaSegmentoCaixa, sobrepoe } from './apoio/geometria';
import { medidorDeterministico } from './apoio/medidor';

const FOLGA = 2;
const FATORES = [0.85, 1, 1.25];
const MODOS: Modo[] = ['rs', 'desp', 'pib'];
const FORMATOS: { nome: string; cfg: ConfigFormato; opcoes: { largura?: number; larguraVisivel?: number } }[] = [
  { nome: 'desktop 1200', cfg: DESKTOP, opcoes: { largura: 1200 } },
  { nome: 'celular 390', cfg: CELULAR, opcoes: { larguraVisivel: 390 } },
];
const DADOS = dadosDosAnos();
const nada = () => {};

/** Layout de um grafo com a escala, a âncora e a reserva da série no modo R$ (como no site). */
function layoutNaSerie(g: Grafo, cfg: ConfigFormato, opcoes: (typeof FORMATOS)[number]['opcoes'], fator: number): Layout {
  const medir = medidorDeterministico(fator);
  const reservaLargura = calcularReserva(MODOS.flatMap((m) => DADOS.map((d) => montarGrafo(d, m))), cfg, medir);
  const comp = calcularEscalaCompartilhada(DADOS.map((d) => montarGrafo(d, 'rs')), cfg, medir, { ...opcoes, reservaLargura });
  return calcularLayout(g, cfg, medir, { ...opcoes, ...comp });
}

/** O ano com o resultado zerado: as despesas escalonadas até a receita líquida (o grafo continua conservando). */
function comResultadoZero(d: DadosAno): Grafo {
  const v = valoresDoModo(d, 'rs');
  const k = v.totais.receita_liquida / v.totais.despesa_total;
  for (const id of [...d.estrutura.obrigatorias, d.estrutura.discricionarias]) v.nos[id] *= k;
  v.totais.despesa_total = v.totais.receita_liquida;
  v.totais.primario_acima = 0;
  return grafoDeValores(v, d);
}

/** O ano com a folha do BPC zerada (a despesa total e o resultado acompanham). */
function comFolhaZero(d: DadosAno): Grafo {
  const v = valoresDoModo(d, 'rs');
  v.totais.despesa_total -= v.nos.bpc;
  v.totais.primario_acima += v.nos.bpc;
  v.nos.bpc = 0;
  return grafoDeValores(v, d);
}

/** Pontos (x, topo, fundo) da faixa de um fluxo, amostrada em n pontos ao longo das curvas de Bézier. */
function amostrarFaixa(f: FluxoLayout, n = 201): [number, number, number][] {
  const xm = (f.x0 + f.x1) / 2;
  const bez = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const y = bez(t, f.ySaida, f.ySaida, f.yEntrada, f.yEntrada);
    return [bez(t, f.x0, xm, xm, f.x1), y, y + f.espessura];
  });
}
const caixaCruzaFaixa = (c: Caixa, f: FluxoLayout, folga: number) =>
  amostrarFaixa(f).some(([x, y0, y1]) => x >= c.x0 - folga && x <= c.x1 + folga && y0 < c.y1 + folga && c.y0 < y1 + folga);

const caixaDoNo = (L: Layout, id: string): Caixa => {
  const n = L.nos.find((x) => x.id === id)!;
  return { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 };
};

describe.each(FORMATOS)('2022, superávit ($nome)', ({ cfg, opcoes }) => {
  const d = lerAno(2022);
  const g = montarGrafo(d);
  describe.each(FATORES)('medidor ×%s', (fator) => {
    const L = layoutNaSerie(g, cfg, opcoes, fator);
    const { deficit: def, superavit: sup } = L.posicoesResultado;
    const r = L.rotulos.filter((x) => x.id === 'resultado_primario');
    const rotulo = r[0];
    const fluxo = (o: string, de: string) => L.fluxos.find((f) => f.origem === o && f.destino === de)!;

    it('posição A: o superávit abaixo do Gasto total, na quarta coluna; a posição do déficit com altura 0', () => {
      const dt = caixaDoNo(L, 'despesa_total');
      expect(sup.x0).toBe(dt.x0);
      expect(sup.y0).toBeCloseTo(dt.y1 + cfg.espacoEntreNos, 6);
      expect(sup.y1 - sup.y0).toBeCloseTo(g.resultadoComSinal * L.escala, 6);
      expect(def.y1 - def.y0).toBe(0);
      expect(caixaDoNo(L, 'resultado_primario')).toEqual({ x0: sup.x0, x1: sup.x1, y0: sup.y0, y1: sup.y1 });
      const rl = fluxo('receita_liquida', 'resultado_primario');
      expect([rl.x1, rl.yEntrada]).toEqual([sup.x0, sup.y0]);
      expect(fluxo('resultado_primario', 'despesa_total').x0).toBe(def.x1);
    });

    it('rótulo A′: no lugar do rótulo do déficit, com "Superávit primário", o valor e "não inclui juros"', () => {
      expect(r).toHaveLength(1);
      if (cfg.nome === 'desktop') {
        expect(rotulo.caixa.x1).toBeCloseTo(def.x0 - 6, 6);
        expect(rotulo.caixa.y0).toBeCloseTo(def.y0, 6);
      } else {
        expect(rotulo.caixa.x0).toBeCloseTo(def.x0, 6);
        expect(rotulo.caixa.y0).toBeCloseTo(def.y1 + 4, 6);
      }
      const textos = rotulo.linhas.map((l) => l.texto);
      expect(textos.filter((t) => !t.includes('R$') && t !== TEXTOS.naoIncluiJuros).join(' ')).toBe(TEXTOS.rotulos.superavit);
      expect(textos).toContain(formatarValor(g.resultadoComSinal, 'rs'));
      expect(textos).toContain(TEXTOS.naoIncluiJuros);
      expect(textos.join(' ')).not.toMatch(/financiado com dívida/);
    });

    it('o rótulo não colide com outro rótulo, outra guia, outra barra nem com a faixa do fluxo Gasto total → discricionárias', () => {
      const problemas: string[] = [];
      for (const o of L.rotulos) if (o.id !== rotulo.id && sobrepoe(o.caixa, rotulo.caixa, FOLGA)) problemas.push(`rótulo ${o.id}`);
      for (const n of L.nos) if (n.id !== rotulo.id && sobrepoe(caixaDoNo(L, n.id), rotulo.caixa, FOLGA)) problemas.push(`barra ${n.id}`);
      for (const gd of L.guias.filter((x) => x.id !== rotulo.id))
        for (let i = 1; i < gd.pontos.length; i++)
          if (distanciaSegmentoCaixa(gd.pontos[i - 1], gd.pontos[i], rotulo.caixa) === 0) problemas.push(`guia ${gd.id}`);
      if (caixaCruzaFaixa(rotulo.caixa, fluxo('despesa_total', d.estrutura.discricionarias), FOLGA)) problemas.push('faixa do fluxo verde');
      expect(problemas).toEqual([]);
    });

    it(`a mais de ${LIMIAR_GUIA_RESULTADO} px do segmento onde nasce o fluxo do superávit, o rótulo ganha guia em L até o nó`, () => {
      const f = fluxo('receita_liquida', 'resultado_primario');
      const distancia = distanciaSegmentoCaixa([f.x0, f.ySaida], [f.x0, f.ySaida + f.espessura], rotulo.caixa);
      expect(distancia).toBeGreaterThan(LIMIAR_GUIA_RESULTADO);
      const guias = L.guias.filter((x) => x.id === 'resultado_primario');
      expect(guias).toHaveLength(1);
      const p = guias[0].pontos;
      // começa embaixo do nó do superávit, no meio da barra, e termina encostada no rótulo (a 3 px)
      expect(p[0]).toEqual([(sup.x0 + sup.x1) / 2, sup.y1 + 1]);
      expect(distanciaSegmentoCaixa(p[p.length - 2], p[p.length - 1], rotulo.caixa)).toBeLessThanOrEqual(3 + 1e-9);
      // em L: cada trecho é horizontal ou vertical, e não cruza outra barra nem outro rótulo
      for (let i = 1; i < p.length; i++) {
        expect(p[i][0] === p[i - 1][0] || p[i][1] === p[i - 1][1]).toBe(true);
        for (const n of L.nos.filter((x) => x.id !== 'resultado_primario'))
          expect(distanciaSegmentoCaixa(p[i - 1], p[i], caixaDoNo(L, n.id)), `guia × barra ${n.id}`).toBeGreaterThan(0);
        for (const o of L.rotulos.filter((x) => x.id !== 'resultado_primario'))
          expect(distanciaSegmentoCaixa(p[i - 1], p[i], o.caixa), `guia × rótulo ${o.id}`).toBeGreaterThan(0);
      }
    });
  });
});

describe('anos de déficit: a caixa do rótulo do resultado é a de antes do superávit (referência de 4d30c16)', () => {
  const referencia = JSON.parse(
    readFileSync(new URL('./referencias/rotulo-resultado-deficit.json', import.meta.url), 'utf8'),
  ) as Record<string, number[]>;
  for (const { nome, cfg, opcoes } of FORMATOS)
    for (const fator of FATORES)
      for (const d of DADOS.filter((x) => x.real.totais.primario_acima < 0))
        it(`${nome} ×${fator} ${d.ano}`, () => {
          const rotulo = layoutNaSerie(montarGrafo(d), cfg, opcoes, fator).rotulos.find((x) => x.id === 'resultado_primario')!;
          const esperado = referencia[`${nome} ×${fator} ${d.ano}`];
          const obtido = [rotulo.caixa.x0, rotulo.caixa.y0, rotulo.caixa.x1, rotulo.caixa.y1];
          for (let i = 0; i < 4; i++) expect(Math.abs(obtido[i] - esperado[i]), `coordenada ${i}`).toBeLessThanOrEqual(0.01);
        });
});

/** O que o nó tem no desenho e na tabela: rótulo, guia, alvo, g.no focável e linha da tabela. */
function presenca(g: Grafo, L: Layout, id: string) {
  const html = renderToStaticMarkup(<Sankey grafo={g} layout={L} idSvg="t" aoPassarMouse={nada} aoEscolher={nada} aoSair={nada} />);
  const tabela = renderToStaticMarkup(<TabelaValores grafo={g} />);
  const rotuloDoNo = g.nos.find((n) => n.id === id)!.rotulo;
  return {
    rotulo: L.rotulos.some((x) => x.id === id),
    guia: L.guias.some((x) => x.id === id),
    alvo: L.alvos.some((x) => x.id === id),
    noFocavel: html.includes(`class="no" data-id="${id}"`),
    linhaNaTabela: tabela.includes(`<th scope="row">${rotuloDoNo}</th>`),
  };
}
const AUSENTE = { rotulo: false, guia: false, alvo: false, noFocavel: false, linhaNaTabela: false };

describe.each([2021, 2022, 2023, ...anos().filter((a) => ![2021, 2022, 2023].includes(a))])('nó zero em %i', (ano) => {
  const d = lerAno(ano);
  describe.each(FORMATOS)('$nome', ({ cfg, opcoes }) => {
    it('a posição do resultado que não se aplica tem altura 0 e nada preso a ela', () => {
      const g = montarGrafo(d);
      const L = layoutNaSerie(g, cfg, opcoes, 1);
      const naoSeAplica = L.posicoesResultado[g.resultado === 'deficit' ? 'superavit' : 'deficit'];
      expect(naoSeAplica.y1 - naoSeAplica.y0).toBe(0);
      expect(L.rotulos.filter((x) => x.id === 'resultado_primario')).toHaveLength(1);
      if (g.resultado === 'deficit') expect(L.guias.some((x) => x.id === 'resultado_primario')).toBe(false);
      const p = presenca(g, L, 'resultado_primario');
      expect(p.noFocavel && p.linhaNaTabela).toBe(true);
      const html = renderToStaticMarkup(<Sankey grafo={g} layout={L} idSvg="t" aoPassarMouse={nada} aoEscolher={nada} aoSair={nada} />);
      expect(html.split('class="no" data-id="resultado_primario"')).toHaveLength(2);
    });

    it('resultado zerado: sem rótulo, guia, alvo, parada no Tab nem linha na tabela; as duas posições com altura 0', () => {
      const g = comResultadoZero(d);
      const L = layoutNaSerie(g, cfg, opcoes, 1);
      expect(L.posicoesResultado.deficit.y1 - L.posicoesResultado.deficit.y0).toBe(0);
      expect(L.posicoesResultado.superavit.y1 - L.posicoesResultado.superavit.y0).toBe(0);
      expect(presenca(g, L, 'resultado_primario')).toEqual(AUSENTE);
    });

    it('folha zerada (BPC): sem rótulo, guia, alvo, parada no Tab nem linha na tabela', () => {
      const g = comFolhaZero(d);
      const L = layoutNaSerie(g, cfg, opcoes, 1);
      expect(presenca(g, L, 'bpc')).toEqual(AUSENTE);
    });
  });
});
