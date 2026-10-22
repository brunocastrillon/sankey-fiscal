import type { LinhaRtn } from '../dados/tipos';

export type Cor = 'receita' | 'repasse' | 'gasto' | 'discricionaria' | 'deficit';
export type Papel =
  | 'origem'
  | 'receita_total'
  | 'repasse'
  | 'receita_liquida'
  | 'resultado'
  | 'despesa_total'
  | 'obrigatorias'
  | 'obrigatoria'
  | 'discricionaria';
export type Coluna = 0 | 1 | 2 | 3 | 4 | 5;

export interface No {
  id: string;
  rotulo: string;
  /** R$ milhões constantes do mês-base; sempre ≥ 0 (o resultado carrega a magnitude). */
  valor: number;
  papel: Papel;
  coluna: Coluna;
  cor: Cor;
  linhas: LinhaRtn[];
  base: 'receita' | 'despesa';
}

export interface Fluxo {
  origem: string;
  destino: string;
  valor: number;
}

export interface Grafo {
  ano: number;
  mesBase: string;
  versaoDados: string;
  /** Ordem de desenho: por coluna, e dentro dela de cima para baixo. */
  nos: No[];
  fluxos: Fluxo[];
  receitaTotal: number;
  despesaTotal: number;
  resultado: 'deficit' | 'superavit';
  /** Folhas obrigatórias na ordem fixa de estrutura.obrigatorias. */
  obrigatorias: string[];
}
