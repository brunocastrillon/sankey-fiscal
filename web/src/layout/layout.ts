import { formatarBi } from '../formatar';
import type { Grafo, No } from '../grafo/tipos';
import { TEXTOS } from '../textos';
import { ALTURA_LINHA, ASCENDENTE, DESCENDENTE, FOLGA_ROTULOS, LARGURA_MAX_DESKTOP, type ConfigFormato, type IdMeio, type PosicaoMeio } from './constantes';
import type { EstiloTexto, MedirTexto } from './medir';
import { quebrarPorLargura, resolverFila } from './rotulos';

export interface NoLayout {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface FluxoLayout {
  origem: string;
  destino: string;
  valor: number;
  espessura: number;
  x0: number;
  x1: number;
  ySaida: number;
  yEntrada: number;
}
export interface LinhaRotulo {
  texto: string;
  negrito: boolean;
  secundario: boolean;
}
export interface Caixa {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface RotuloLayout {
  id: string;
  linhas: LinhaRotulo[];
  x: number;
  ancora: 'start' | 'end' | 'middle';
  topo: number;
  alturaLinha: number;
  caixa: Caixa;
  lado: 'esquerda' | 'direita' | 'meio';
  deslocado: boolean;
}
export interface GuiaLayout {
  id: string;
  pontos: [number, number][];
}
export interface AlvoLayout {
  id: string;
  caixa: Caixa;
}
export interface Layout {
  largura: number;
  /** Tamanho da fonte dos rótulos (px). */
  fonte: number;
  altura: number;
  /** px por R$ milhão. */
  escala: number;
  nos: NoLayout[];
  fluxos: FluxoLayout[];
  rotulos: RotuloLayout[];
  guias: GuiaLayout[];
  alvos: AlvoLayout[];
  paradas: { bordas: [number, number]; viavel: boolean } | null;
}

const ID_MEIO: Record<string, IdMeio> = {
  receita_total: 'receita_total',
  repasse: 'repasse',
  receita_liquida: 'receita_liquida',
  despesa_total: 'despesa_total',
  obrigatorias: 'obrigatorias',
  resultado: 'resultado_primario',
};

/** Vãos iguais quando todos cabem; senão, os que precisam de mais ficam no mínimo e os outros dividem o resto. */
function distribuirVaos(total: number, minimos: number[]): number[] {
  const vaos = new Array<number>(minimos.length).fill(0);
  let livres = minimos.map((_, i) => i);
  let resto = total;
  while (livres.length) {
    const igual = resto / livres.length;
    const presos = livres.filter((i) => minimos[i] > igual);
    if (!presos.length) {
      for (const i of livres) vaos[i] = igual;
      break;
    }
    for (const i of presos) {
      vaos[i] = minimos[i];
      resto -= minimos[i];
    }
    livres = livres.filter((i) => !presos.includes(i));
  }
  return vaos;
}

interface GuiaPendente {
  id: string;
  /** x da borda da barra (1 px fora) e x onde a guia chega ao rótulo. */
  xa: number;
  xFim: number;
  /** y do centro da barra e do centro do rótulo. */
  cn: number;
  cl: number;
}

const FOLGA_GUIAS = 3;

/**
 * Guias em cotovelo, cada uma na sua faixa vertical quando as alturas se sobrepõem. Entre guias que descem, a de baixo
 * fica mais perto da barra; entre as que sobem, a de cima. Assim guias vizinhas nunca se cruzam nem se tocam.
 */
function tracarGuias(pendentes: GuiaPendente[], s: 1 | -1): GuiaLayout[] {
  const faixa = new Map<string, number>();
  const vao = (p: GuiaPendente) => [Math.min(p.cn, p.cl), Math.max(p.cn, p.cl)] as const;
  const interagem = (a: GuiaPendente, b: GuiaPendente) => {
    const [a0, a1] = vao(a);
    const [b0, b1] = vao(b);
    return a0 < b1 + FOLGA_GUIAS && b0 < a1 + FOLGA_GUIAS;
  };
  const descem = pendentes.filter((p) => p.cl > p.cn).sort((a, b) => b.cn - a.cn);
  const sobem = pendentes.filter((p) => p.cl <= p.cn).sort((a, b) => a.cn - b.cn);
  for (const grupo of [descem, sobem]) {
    const feitas: GuiaPendente[] = [];
    for (const p of grupo) {
      const anteriores = feitas.filter((q) => interagem(p, q)).map((q) => faixa.get(q.id)!);
      faixa.set(p.id, anteriores.length ? Math.max(...anteriores) + 1 : 0);
      feitas.push(p);
    }
  }
  const nFaixas = Math.max(0, ...faixa.values()) + 1;
  const alcance = pendentes.length ? Math.min(...pendentes.map((p) => Math.abs(p.xFim - p.xa))) - 2 : 0;
  let inicio = 5;
  let passo = nFaixas > 1 ? Math.min(5, (alcance - inicio) / (nFaixas - 1)) : 0;
  if (nFaixas > 1 && passo < FOLGA_GUIAS) {
    inicio = 2;
    passo = Math.max(FOLGA_GUIAS, (alcance - inicio) / (nFaixas - 1));
  }
  return pendentes.map((p) => {
    const xm = p.xa + s * (inicio + faixa.get(p.id)! * passo);
    return { id: p.id, pontos: [[p.xa, p.cn], [xm, p.cn], [xm, p.cl], [p.xFim, p.cl]] };
  });
}

const colidem = (a: Caixa, b: Caixa, folga: number) =>
  a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;

interface Texto {
  linhas: LinhaRotulo[];
  largura: number;
  altura: number;
  lado: RotuloLayout['lado'];
  posicao: PosicaoMeio | null;
}

/**
 * Grafo + formato + medidor de texto → geometria do Sankey. Colunas fixas; Receita total centrada em repasse +
 * receita líquida; Gasto total e Obrigatórias alinhados ao topo da receita líquida; folhas centradas em Obrigatórias;
 * rótulos laterais em fila sem colisão, com guia em cotovelo quando saem do lugar.
 */
export function calcularLayout(
  g: Grafo,
  cfg: ConfigFormato,
  medir: MedirTexto,
  opcoes: { largura?: number; larguraVisivel?: number } = {},
): Layout {
  const nw = cfg.larguraNo;
  const pad = cfg.espacoEntreNos;
  const alturaLinha = Math.round(cfg.fonte * ALTURA_LINHA);
  const normal: EstiloTexto = { tamanho: cfg.fonte, negrito: false };
  const negrito: EstiloTexto = { tamanho: cfg.fonte, negrito: true };
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const colunas: No[][] = [0, 1, 2, 3, 4, 5].map((c) => g.nos.filter((n) => n.coluna === c));

  // textos dos rótulos
  const textos = new Map<string, Texto>();
  for (const n of g.nos) {
    const lado = n.coluna === 0 ? 'esquerda' : n.coluna === 5 ? 'direita' : 'meio';
    const posicao = lado === 'meio' ? cfg.posicaoMeio[ID_MEIO[n.papel]] : null;
    const deficit = n.papel === 'resultado' && g.resultado === 'deficit';
    const max = lado !== 'meio' ? cfg.larguraMaxRotulo.lado : n.papel === 'resultado' ? cfg.larguraMaxRotulo.deficit : cfg.larguraMaxRotulo.meio;
    const linhas: LinhaRotulo[] = [
      ...quebrarPorLargura(n.rotulo, max, normal, medir).map((texto) => ({ texto, negrito: false, secundario: false })),
      { texto: formatarBi(n.valor), negrito: true, secundario: false },
      ...(deficit ? [{ texto: TEXTOS.naoIncluiJuros, negrito: false, secundario: true }] : []),
    ];
    const largura = Math.max(...linhas.map((l) => medir(l.texto, l.negrito ? negrito : normal)));
    // altura da caixa real do texto: da ascendente da primeira linha à descendente da última
    const altura = (linhas.length - 1) * alturaLinha + (ASCENDENTE + DESCENDENTE) * cfg.fonte;
    textos.set(n.id, { linhas, largura, altura, lado, posicao });
  }
  const maiorLargura = (c: No[]) => Math.max(0, ...c.map((n) => textos.get(n.id)!.largura));

  // posições x
  // arredondadas para cima, com 1 px de folga, para o texto nunca ficar a menos de `margem` da borda
  const mE = Math.ceil(cfg.margem + cfg.guiaDx + maiorLargura(colunas[0])) + 1;
  const mD = Math.ceil(cfg.margem + cfg.guiaDx + maiorLargura(colunas[5])) + 1;
  // vão mínimo depois de cada coluna: o rótulo à direita da barra não pode chegar à barra da coluna seguinte
  const vaoMinimo = [0, 1, 2, 3, 4].map((c) => {
    const larguras = colunas[c].filter((n) => textos.get(n.id)!.posicao === 'direita').map((n) => textos.get(n.id)!.largura);
    return larguras.length ? 6 + Math.max(...larguras) + FOLGA_ROTULOS + 1 : 0;
  });
  const vaos = cfg.vaos
    ? cfg.vaos.map((v, c) => Math.max(v, vaoMinimo[c]))
    : distribuirVaos((opcoes.largura ?? LARGURA_MAX_DESKTOP) - mE - mD - 6 * nw, vaoMinimo);
  const xs: number[] = [];
  for (let c = 0, x = mE; c < 6; c++) {
    xs.push(x);
    x += nw + (vaos[c] ?? 0);
  }
  // rótulos acima da barra só encontram a coluna das folhas (cujas barras sobem acima do topo de Obrigatórias)
  for (const n of g.nos) {
    const t = textos.get(n.id)!;
    if (n.coluna === 5 || !t.posicao?.startsWith('acima')) continue;
    const direita = t.posicao === 'acimaInicio' ? xs[n.coluna] + t.largura : xs[n.coluna] + nw / 2 + t.largura / 2;
    xs[5] = Math.max(xs[5], direita + FOLGA_ROTULOS + 1);
  }
  let paradas: Layout['paradas'] = null;
  if (cfg.vaos && opcoes.larguraVisivel && xs[5] + nw + mD > opcoes.larguraVisivel) {
    // duas paradas: as bordas [V, largura − V] caem no vão entre o rótulo de Receita total e a coluna 2
    const V = opcoes.larguraVisivel;
    const fimRT = xs[1] + nw + 6 + textos.get('receita_total')!.largura;
    const span2 = xs[5] - xs[2] + nw + cfg.guiaDx + maiorLargura(colunas[5]) + cfg.margem + 6;
    const x2 = Math.max(V + 6, fimRT + 10 + V - span2, xs[1] + nw + 30);
    const dx = x2 - xs[2];
    for (let c = 2; c < 6; c++) xs[c] += dx;
    const largura = xs[5] + nw + mD;
    if (largura > V) paradas = { bordas: [V, largura - V], viavel: fimRT + 4 <= V && span2 <= V - 6 };
  }
  const largura = xs[5] + nw + mD;

  // escala e posições y das barras (coordenadas locais; deslocadas no fim)
  const soma = (c: No[]) => c.reduce((s, n) => s + n.valor, 0);
  // índice da coluna (não da lista filtrada): a coluna das folhas tem um espaço extra antes da discricionária
  const escala = Math.min(
    ...colunas
      .map((c, coluna) => ({ c, coluna }))
      .filter(({ c }) => soma(c) > 0)
      .map(({ c, coluna }) => (cfg.alturaBarras - (c.length - 1) * pad - (coluna === 5 ? pad : 0)) / soma(c)),
  );
  const nos = new Map<string, NoLayout>();
  for (const n of g.nos) nos.set(n.id, { id: n.id, x0: xs[n.coluna], x1: xs[n.coluna] + nw, y0: 0, y1: 0 });
  const pos = (id: string, y0: number) => {
    const nl = nos.get(id)!;
    nl.y0 = y0;
    nl.y1 = y0 + porId.get(id)!.valor * escala;
    return nl.y1;
  };
  const empilhar = (ids: string[], topo: number) => ids.reduce((y, id) => pos(id, y) + pad, topo);
  const alturaPilha = (ids: string[]) => ids.reduce((s, id) => s + porId.get(id)!.valor * escala, 0) + (ids.length - 1) * pad;

  const repasse = colunas[2].find((n) => n.papel === 'repasse')!.id;
  empilhar(colunas[2].map((n) => n.id), 0);
  const rt = nos.get(repasse)!;
  const rl = nos.get('receita_liquida')!;
  pos('receita_total', (rt.y0 + rl.y1) / 2 - (porId.get('receita_total')!.valor * escala) / 2);
  const rtc = (nos.get('receita_total')!.y0 + nos.get('receita_total')!.y1) / 2;
  const origens = colunas[0].map((n) => n.id);
  empilhar(origens, rtc - alturaPilha(origens) / 2);
  empilhar(colunas[3].map((n) => n.id), rl.y0);
  pos('obrigatorias', rl.y0);
  const ob = nos.get('obrigatorias')!;
  const folhas = g.obrigatorias;
  const fimFolhas = empilhar(folhas, (ob.y0 + ob.y1) / 2 - alturaPilha(folhas) / 2);
  const discr = colunas[5].filter((n) => !folhas.includes(n.id)).map((n) => n.id);
  empilhar(discr, fimFolhas + pad);

  // fluxos: saídas e entradas de cada nó ordenadas pela posição vertical do outro nó
  const fluxos: FluxoLayout[] = g.fluxos.map((f) => ({
    origem: f.origem,
    destino: f.destino,
    valor: f.valor,
    espessura: f.valor * escala,
    x0: nos.get(f.origem)!.x1,
    x1: nos.get(f.destino)!.x0,
    ySaida: 0,
    yEntrada: 0,
  }));
  for (const nl of nos.values()) {
    let y = nl.y0;
    for (const f of fluxos.filter((x) => x.origem === nl.id).sort((a, b) => nos.get(a.destino)!.y0 - nos.get(b.destino)!.y0)) {
      f.ySaida = y;
      y += f.espessura;
    }
    y = nl.y0;
    for (const f of fluxos.filter((x) => x.destino === nl.id).sort((a, b) => nos.get(a.origem)!.y0 - nos.get(b.origem)!.y0)) {
      f.yEntrada = y;
      y += f.espessura;
    }
  }

  // rótulos do meio (posição fixa em relação à barra)
  const rotulos: RotuloLayout[] = [];
  const caixaDe = (x: number, ancora: RotuloLayout['ancora'], topo: number, t: Texto): Caixa => {
    const x0 = ancora === 'start' ? x : ancora === 'end' ? x - t.largura : x - t.largura / 2;
    return { x0, x1: x0 + t.largura, y0: topo, y1: topo + t.altura };
  };
  const novoRotulo = (id: string, x: number, ancora: RotuloLayout['ancora'], topo: number, deslocado = false) => {
    const t = textos.get(id)!;
    rotulos.push({ id, linhas: t.linhas, x, ancora, topo, alturaLinha, caixa: caixaDe(x, ancora, topo, t), lado: t.lado, deslocado });
  };
  for (const n of g.nos.filter((x) => textos.get(x.id)!.lado === 'meio')) {
    const t = textos.get(n.id)!;
    const nl = nos.get(n.id)!;
    const cy = (nl.y0 + nl.y1) / 2;
    switch (t.posicao) {
      case 'direita': novoRotulo(n.id, nl.x1 + 6, 'start', cy - t.altura / 2); break;
      case 'esquerda': novoRotulo(n.id, nl.x0 - 6, 'end', nl.y0); break;
      case 'acima': novoRotulo(n.id, (nl.x0 + nl.x1) / 2, 'middle', nl.y0 - 4 - t.altura); break;
      case 'acimaInicio': novoRotulo(n.id, nl.x0, 'start', nl.y0 - 4 - t.altura); break;
      // um nível acima do rótulo de baixo e do alvo de toque dele (que cresce para cima até alvoToque)
      case 'acima2': novoRotulo(n.id, (nl.x0 + nl.x1) / 2, 'middle', nl.y0 - 8 - Math.max(t.altura, cfg.alvoToque) - t.altura); break;
      case 'abaixo': novoRotulo(n.id, nl.x0, 'start', nl.y1 + 4); break;
    }
    // vãos estreitos ou fonte larga: um rótulo do meio que encosta num anterior desce (ou sobe, se fica acima da barra)
    const r = rotulos[rotulos.length - 1];
    const sobe = t.posicao?.startsWith('acima') ?? false;
    for (let tentativa = 0; tentativa < rotulos.length; tentativa++) {
      const outro = rotulos.slice(0, -1).find((o) => colidem(o.caixa, r.caixa, FOLGA_ROTULOS));
      if (!outro) break;
      const novoTopo = sobe ? outro.caixa.y0 - FOLGA_ROTULOS - t.altura : outro.caixa.y1 + FOLGA_ROTULOS;
      r.caixa.y0 += novoTopo - r.topo;
      r.caixa.y1 += novoTopo - r.topo;
      r.topo = novoTopo;
    }
  }

  // rótulos laterais: fila sem colisão (faixa ≥ alvo de toque); primeiro sem limites, para achar o deslocamento vertical
  const filas = (['esquerda', 'direita'] as const).map((lado) => ({
    lado,
    itens: g.nos
      .filter((n) => textos.get(n.id)!.lado === lado)
      .map((n) => ({ id: n.id, centro: (nos.get(n.id)!.y0 + nos.get(n.id)!.y1) / 2, altura: Math.max(textos.get(n.id)!.altura, cfg.alvoToque) })),
  }));
  const semLimites = { min: -1e9, max: 1e9 };
  const topos0 = filas.flatMap((f) => [...resolverFila(f.itens, FOLGA_ROTULOS, semLimites).values()]);
  const minY = Math.min(...[...nos.values()].map((n) => n.y0), ...rotulos.map((r) => r.caixa.y0), ...topos0);
  const dy = cfg.margem + 4 - minY;
  for (const nl of nos.values()) {
    nl.y0 += dy;
    nl.y1 += dy;
  }
  for (const f of fluxos) {
    f.ySaida += dy;
    f.yEntrada += dy;
  }
  for (const r of rotulos) {
    r.topo += dy;
    r.caixa.y0 += dy;
    r.caixa.y1 += dy;
  }
  const guias: GuiaLayout[] = [];
  const alvos: AlvoLayout[] = [];
  const limites = { min: cfg.margem + 4, max: cfg.alturaSvg - cfg.margem - 4 };
  for (const fila of filas) {
    const pendentes: GuiaPendente[] = [];
    for (const item of fila.itens) item.centro += dy;
    const topos = resolverFila(fila.itens, FOLGA_ROTULOS, limites);
    for (const item of fila.itens) {
      const t = textos.get(item.id)!;
      const nl = nos.get(item.id)!;
      const faixaTopo = topos.get(item.id)!;
      const topo = faixaTopo + (item.altura - t.altura) / 2;
      const cn = (nl.y0 + nl.y1) / 2;
      const cl = topo + t.altura / 2;
      const deslocado = Math.abs(cl - cn) > 1.5;
      const direita = fila.lado === 'direita';
      const x = direita ? nl.x1 + cfg.guiaDx : nl.x0 - cfg.guiaDx;
      novoRotulo(item.id, x, direita ? 'start' : 'end', topo, deslocado);
      if (deslocado) pendentes.push({ id: item.id, xa: direita ? nl.x1 + 1 : nl.x0 - 1, xFim: direita ? x - 3 : x + 3, cn, cl });
      if (cfg.alvoToque > 0) {
        const caixa = rotulos[rotulos.length - 1].caixa;
        alvos.push({
          id: item.id,
          // do início da guia ao fim do texto: o rótulo é o alvo; a coluna de barras fica de fora
          caixa: direita
            ? { x0: nl.x1 + 1, x1: caixa.x1 + 2, y0: faixaTopo, y1: faixaTopo + item.altura }
            : { x0: caixa.x0 - 2, x1: nl.x0 - 1, y0: faixaTopo, y1: faixaTopo + item.altura },
        });
      }
    }
    guias.push(...tracarGuias(pendentes, fila.lado === 'direita' ? 1 : -1));
  }
  if (cfg.alvoToque > 0) {
    // nós do meio: o rótulo, ampliado até o mínimo do alvo de toque (a barra continua tocável por si)
    for (const r of rotulos.filter((x) => x.lado === 'meio')) {
      const c = r.caixa;
      const cx = (c.x0 + c.x1) / 2;
      const cy = (c.y0 + c.y1) / 2;
      const w = Math.max(cfg.alvoToque, c.x1 - c.x0);
      const h = Math.max(cfg.alvoToque, c.y1 - c.y0);
      // cresce para longe da barra: para cima nos rótulos acima dela, para baixo nos de baixo
      const posicao = textos.get(r.id)!.posicao;
      const y0 = posicao?.startsWith('acima') ? c.y1 - h : posicao === 'abaixo' ? c.y0 : cy - h / 2;
      alvos.push({ id: r.id, caixa: { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h } });
    }
  }

  return {
    largura,
    fonte: cfg.fonte,
    altura: cfg.alturaSvg,
    escala,
    nos: g.nos.map((n) => nos.get(n.id)!),
    fluxos,
    rotulos,
    guias,
    alvos,
    paradas,
  };
}
