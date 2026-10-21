import type { EstiloTexto, MedirTexto } from './medir';

/** Quebra o texto em linhas de até `larguraMax` px (uma palavra maior que o limite fica sozinha na linha). */
export function quebrarPorLargura(texto: string, larguraMax: number, estilo: EstiloTexto, medir: MedirTexto): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && medir(tentativa, estilo) > larguraMax) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export interface ItemFila {
  id: string;
  centro: number;
  altura: number;
}

interface Grupo {
  itens: ItemFila[];
  topo: number;
  altura: number;
}

/**
 * Posiciona itens numa fila vertical sem sobreposição (folga mínima entre vizinhos), com o menor deslocamento:
 * os que colidem formam um grupo centrado na média dos topos desejados. Depois, grupos fora de [min, max] são
 * empurrados para dentro, arrastando os vizinhos. Devolve id → topo.
 */
export function resolverFila(itens: ItemFila[], folga: number, limites: { min: number; max: number }): Map<string, number> {
  const ordem = [...itens].sort((a, b) => a.centro - b.centro);
  const total = ordem.reduce((s, i) => s + i.altura, 0) + folga * Math.max(0, ordem.length - 1);
  if (total > limites.max - limites.min + 1e-9) {
    throw new Error(`fila de ${total.toFixed(1)} px não cabe em [${limites.min}, ${limites.max}]`);
  }

  const recalcular = (g: Grupo) => {
    let deslocamento = 0;
    let somaTopos = 0;
    for (const item of g.itens) {
      somaTopos += item.centro - item.altura / 2 - deslocamento;
      deslocamento += item.altura + folga;
    }
    g.altura = deslocamento - folga;
    g.topo = somaTopos / g.itens.length;
  };

  const grupos: Grupo[] = [];
  for (const item of ordem) {
    const g: Grupo = { itens: [item], topo: 0, altura: 0 };
    recalcular(g);
    grupos.push(g);
    while (grupos.length > 1) {
      const [a, b] = grupos.slice(-2);
      if (a.topo + a.altura + folga <= b.topo) break;
      grupos.pop();
      a.itens.push(...b.itens);
      recalcular(a);
    }
  }

  // dentro dos limites: de cima para baixo respeita o mínimo, de baixo para cima respeita o máximo
  for (let i = 0; i < grupos.length; i++) {
    const piso = i === 0 ? limites.min : grupos[i - 1].topo + grupos[i - 1].altura + folga;
    grupos[i].topo = Math.max(grupos[i].topo, piso);
  }
  for (let i = grupos.length - 1; i >= 0; i--) {
    const teto = i === grupos.length - 1 ? limites.max : grupos[i + 1].topo - folga;
    grupos[i].topo = Math.min(grupos[i].topo, teto - grupos[i].altura);
  }

  const topos = new Map<string, number>();
  for (const g of grupos) {
    let y = g.topo;
    for (const item of g.itens) {
      topos.set(item.id, y);
      y += item.altura + folga;
    }
  }
  return topos;
}
