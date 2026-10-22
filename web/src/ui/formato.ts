import { CELULAR, DESKTOP, LARGURA_MIN_DESKTOP, type ConfigFormato } from '../layout/constantes';

/** Desenho do desktop a partir de LARGURA_MIN_DESKTOP de contêiner; abaixo, o desenho do celular (com rolagem se preciso). */
export function escolherFormato(larguraConteiner: number): ConfigFormato {
  return larguraConteiner >= LARGURA_MIN_DESKTOP ? DESKTOP : CELULAR;
}
