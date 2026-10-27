import type { Bloco, LinhaRtn } from '../dados/tipos';

/** Modo de leitura: R$ constantes, % da despesa total (sobre R$ constantes) ou % do PIB (correntes sobre o PIB corrente). */
export type Modo = 'rs' | 'desp' | 'pib';

/**
 * A grandeza desenhada de um ano num modo: valores dos nós e totais já na unidade do modo, com `primario_acima` com sinal.
 * É o que a animação interpola (nunca os blocos `real`/`nominal`/`pib`).
 */
export interface ValoresModo {
  ano: number;
  modo: Modo;
  nos: Record<string, number>;
  totais: Bloco['totais'];
}

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
  /** Na unidade do modo (R$ milhões constantes do mês-base ou pontos percentuais); sempre ≥ 0 (o resultado carrega a magnitude). */
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
  modo: Modo;
  mesBase: string;
  versaoDados: string;
  /** Ordem de desenho: por coluna, e dentro dela de cima para baixo. */
  nos: No[];
  fluxos: Fluxo[];
  receitaTotal: number;
  despesaTotal: number;
  resultado: 'deficit' | 'superavit';
  /** Resultado primário acima da linha com sinal, na unidade do modo (negativo = déficit). */
  resultadoComSinal: number;
  /** Folhas obrigatórias na ordem fixa de estrutura.obrigatorias. */
  obrigatorias: string[];
}
