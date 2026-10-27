import type { Bloco, DadosAno } from '../dados/tipos';
import { TEXTOS } from '../textos';
import type { Cor, Coluna, Fluxo, Grafo, Modo, No, Papel, ValoresModo } from './tipos';

const BASE_RECEITA: ReadonlySet<Papel> = new Set(['origem', 'receita_total', 'repasse', 'receita_liquida']);

const multiplicar = (b: Bloco, k: number): Pick<ValoresModo, 'nos' | 'totais'> => ({
  nos: Object.fromEntries(Object.entries(b.nos).map(([id, v]) => [id, v * k])),
  totais: {
    receita_total: b.totais.receita_total * k,
    transferencias: b.totais.transferencias * k,
    receita_liquida: b.totais.receita_liquida * k,
    despesa_total: b.totais.despesa_total * k,
    primario_acima: b.totais.primario_acima * k,
  },
});

/**
 * A grandeza desenhada no modo: `rs` = bloco `real`; `desp` = `real` × 100 / despesa total real; `pib` = `nominal` × 100 /
 * PIB corrente do IBGE. O resultado mantém o sinal.
 */
export function valoresDoModo(d: DadosAno, modo: Modo): ValoresModo {
  const k = modo === 'rs' ? 1 : modo === 'desp' ? 100 / d.real.totais.despesa_total : 100 / d.pib.valor_nominal;
  return { ano: d.ano, modo, ...multiplicar(modo === 'pib' ? d.nominal : d.real, k) };
}

/**
 * Valores de um modo → nós e fluxos do Sankey. Papéis, ordem, rótulos e linhas vêm de `d`; os totais vêm do pipeline e não
 * são recalculados. O resultado primário carrega a magnitude (sinal em `resultado` e `resultadoComSinal`), e os dois fluxos
 * dele existem sempre: o que não se aplica no ano vale 0.
 */
export function grafoDeValores(valores: ValoresModo, d: DadosAno): Grafo {
  const { nos: v, totais } = valores;
  const e = d.estrutura;
  const r = totais.primario_acima;
  const resultado = r < 0 ? 'deficit' : 'superavit';
  const magnitude = Math.abs(r);
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
  fluxo('receita_liquida', 'despesa_total', Math.min(totais.receita_liquida, totais.despesa_total));
  fluxo('resultado_primario', 'despesa_total', Math.max(0, -r));
  fluxo('receita_liquida', 'resultado_primario', Math.max(0, r));
  fluxo('despesa_total', 'obrigatorias', obrigatorias);
  fluxo('despesa_total', e.discricionarias, v[e.discricionarias]);
  for (const id of e.obrigatorias) fluxo('obrigatorias', id, v[id]);

  return {
    ano: valores.ano,
    modo: valores.modo,
    mesBase: d.mes_base,
    versaoDados: d.versao_dados,
    nos,
    fluxos,
    receitaTotal: totais.receita_total,
    despesaTotal: totais.despesa_total,
    resultado,
    resultadoComSinal: r,
    obrigatorias: [...e.obrigatorias],
  };
}

/** Dados de um ano → grafo no modo (padrão: R$ constantes). */
export function montarGrafo(d: DadosAno, modo: Modo = 'rs'): Grafo {
  return grafoDeValores(valoresDoModo(d, modo), d);
}
