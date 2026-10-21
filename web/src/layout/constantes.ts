// Constantes de layout (px). Não são dados fiscais: definem o desenho e são provadas pelos testes de layout.

export type PosicaoMeio = 'direita' | 'esquerda' | 'acima' | 'acimaInicio' | 'acima2' | 'abaixo';
export type IdMeio = 'receita_total' | 'repasse' | 'receita_liquida' | 'despesa_total' | 'obrigatorias' | 'resultado_primario';

export interface ConfigFormato {
  nome: 'desktop' | 'celular';
  fonte: number;
  /** Altura única do SVG, igual em todos os anos. */
  alturaSvg: number;
  /** Altura disponível para a coluna mais alta de barras (define a escala de cada ano). */
  alturaBarras: number;
  larguraNo: number;
  espacoEntreNos: number;
  guiaDx: number;
  margem: number;
  larguraMaxRotulo: { lado: number; meio: number; deficit: number };
  posicaoMeio: Record<IdMeio, PosicaoMeio>;
  /** Vãos fixos entre as 6 colunas; null = vãos iguais na largura dada. */
  vaos: [number, number, number, number, number] | null;
  /** Altura e largura mínimas do alvo de toque; 0 = sem alvos (desktop). */
  alvoToque: number;
  /** Limite do deslocamento vertical de um rótulo lateral em relação ao centro da sua barra. */
  deslocamentoMax: number;
}

export const DESKTOP: ConfigFormato = {
  nome: 'desktop',
  fonte: 13,
  alturaSvg: 723,
  alturaBarras: 600,
  larguraNo: 12,
  espacoEntreNos: 14,
  guiaDx: 30,
  margem: 12,
  larguraMaxRotulo: { lado: 200, meio: 240, deficit: 170 },
  posicaoMeio: {
    receita_total: 'direita',
    repasse: 'direita',
    receita_liquida: 'direita',
    despesa_total: 'direita',
    obrigatorias: 'direita',
    resultado_primario: 'esquerda',
  },
  vaos: null,
  alvoToque: 0,
  deslocamentoMax: 48,
};

export const CELULAR: ConfigFormato = {
  nome: 'celular',
  fonte: 11,
  alturaSvg: 712,
  alturaBarras: 540,
  larguraNo: 10,
  espacoEntreNos: 12,
  guiaDx: 22,
  margem: 12,
  larguraMaxRotulo: { lado: 100, meio: 90, deficit: 120 },
  posicaoMeio: {
    receita_total: 'direita',
    repasse: 'direita',
    receita_liquida: 'direita',
    despesa_total: 'acimaInicio',
    obrigatorias: 'acima2',
    resultado_primario: 'abaixo',
  },
  vaos: [100, 60, 80, 44, 44],
  alvoToque: 44,
  deslocamentoMax: 90,
};

export const LARGURA_MIN_DESKTOP = 1100;
export const LARGURA_MAX_DESKTOP = 1200;
export const FOLGA_ROTULOS = 3;
export const OPACIDADE_FLUXO = 0.36;
export const ALTURA_LINHA = 1.27; // em múltiplos do tamanho da fonte
