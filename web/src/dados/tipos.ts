// Formato de dados/AAAA.json e dados/indice.json, gerados pelo pipeline (ver README, "Formato de cada AAAA.json").

export interface LinhaRtn {
  codigo: string;
  nome: string;
  operacao: 'soma' | 'subtrai';
}

export interface Estrutura {
  receita: string[];
  repasse: string;
  obrigatorias: string[];
  discricionarias: string;
}

export interface Bloco {
  nos: Record<string, number>;
  totais: {
    receita_total: number;
    transferencias: number;
    receita_liquida: number;
    despesa_total: number;
    primario_acima: number;
  };
  financiamento: Record<string, number>;
}

export interface DadosAno {
  ano: number;
  unidade: string;
  mes_base: string;
  versao_dados: string;
  mapeamento_versao: number;
  rotulos: Record<string, string>;
  grupos_despesa: Record<string, 'obrigatoria' | 'discricionaria'>;
  linhas: Record<string, LinhaRtn[]>;
  estrutura: Estrutura;
  nominal: Bloco;
  real: Bloco;
  pib: { valor_nominal: number; fonte: string };
}

export interface Indice {
  ultimo_mes_publicado: string;
  mes_base: string;
  anos: [number, number];
}
