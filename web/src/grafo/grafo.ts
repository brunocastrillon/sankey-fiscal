import type { DadosAno } from '../dados/tipos';
import { TEXTOS } from '../textos';
import type { Cor, Coluna, Fluxo, Grafo, No, Papel } from './tipos';

const BASE_RECEITA: ReadonlySet<Papel> = new Set(['origem', 'receita_total', 'repasse', 'receita_liquida']);

/**
 * Dados de um ano → nós e fluxos do Sankey, em R$ constantes (bloco `real`).
 * Papéis e ordem vêm de `estrutura`; os totais vêm do pipeline e não são recalculados.
 * O resultado primário carrega a magnitude; o sinal fica em `resultado`.
 */
export function montarGrafo(d: DadosAno): Grafo {
  const { nos: v, totais } = d.real;
  const e = d.estrutura;
  const resultado = totais.primario_acima < 0 ? 'deficit' : 'superavit';
  const magnitude = Math.abs(totais.primario_acima);
  const obrigatorias = e.obrigatorias.reduce((s, id) => s + v[id], 0);

  const nos: No[] = [];
  const no = (id: string, rotulo: string, valor: number, papel: Papel, coluna: Coluna, cor: Cor, linhas = d.linhas[id] ?? []) =>
    nos.push({ id, rotulo, valor, papel, coluna, cor, linhas, base: BASE_RECEITA.has(papel) ? 'receita' : 'despesa' });

  for (const id of e.receita) no(id, d.rotulos[id], v[id], 'origem', 0, 'receita');
  no('receita_total', TEXTOS.rotulos.receita_total, totais.receita_total, 'receita_total', 1, 'receita');
  no(e.repasse, d.rotulos[e.repasse], v[e.repasse], 'repasse', 2, 'repasse');
  no('receita_liquida', TEXTOS.rotulos.receita_liquida, totais.receita_liquida, 'receita_liquida', 2, 'receita');
  const noResultado = () =>
    no('resultado_primario', TEXTOS.rotulos[resultado], magnitude, 'resultado', resultado === 'deficit' ? 2 : 3,
      resultado === 'deficit' ? 'deficit' : 'receita', d.linhas.primario_acima ?? []);
  if (resultado === 'deficit') noResultado();
  no('despesa_total', TEXTOS.rotulos.despesa_total, totais.despesa_total, 'despesa_total', 3, 'gasto');
  if (resultado === 'superavit') noResultado();
  no('obrigatorias', TEXTOS.rotulos.obrigatorias, obrigatorias, 'obrigatorias', 4, 'gasto', []);
  for (const id of e.obrigatorias) no(id, d.rotulos[id], v[id], 'obrigatoria', 5, 'gasto');
  no(e.discricionarias, d.rotulos[e.discricionarias], v[e.discricionarias], 'discricionaria', 5, 'discricionaria');

  const fluxos: Fluxo[] = [];
  const fluxo = (origem: string, destino: string, valor: number) => fluxos.push({ origem, destino, valor });
  for (const id of e.receita) fluxo(id, 'receita_total', v[id]);
  fluxo('receita_total', e.repasse, v[e.repasse]);
  fluxo('receita_total', 'receita_liquida', totais.receita_liquida);
  if (resultado === 'deficit') {
    fluxo('receita_liquida', 'despesa_total', totais.receita_liquida);
    fluxo('resultado_primario', 'despesa_total', magnitude);
  } else {
    fluxo('receita_liquida', 'despesa_total', totais.despesa_total);
    fluxo('receita_liquida', 'resultado_primario', magnitude);
  }
  fluxo('despesa_total', 'obrigatorias', obrigatorias);
  fluxo('despesa_total', e.discricionarias, v[e.discricionarias]);
  for (const id of e.obrigatorias) fluxo('obrigatorias', id, v[id]);

  return {
    ano: d.ano,
    mesBase: d.mes_base,
    versaoDados: d.versao_dados,
    nos,
    fluxos,
    receitaTotal: totais.receita_total,
    despesaTotal: totais.despesa_total,
    resultado,
    obrigatorias: [...e.obrigatorias],
  };
}
