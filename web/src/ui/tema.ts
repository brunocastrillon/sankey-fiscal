// Paletas dos temas claro e escuro (contraste e daltonismo testados em tema.test.ts; ver os designs das fases 2 e 3).
// O texto nunca usa a cor da série; o déficit tem hachura nos dois temas e contorno claro no escuro; o superávit, pontos.
import type { Cor } from '../grafo/tipos';

export interface Paleta {
  fundo: string;
  texto: string;
  /** Texto secundário e guias. */
  secundario: string;
  /** Cores de série: uma por cor de nó do grafo (os testes de contraste e daltonismo percorrem esta lista). */
  series: Record<Cor, string>;
  contornoDeficit: string | null;
  borda: string;
  painel: string;
}

export const TEMAS: { claro: Paleta; escuro: Paleta } = {
  claro: {
    fundo: '#fcfcfb',
    texto: '#0b0b0b',
    secundario: '#4e4d4a',
    series: {
      receita: '#2a78d6',
      repasse: '#8b8a85',
      gasto: '#eb6834',
      // fase 3b: #1baf7a (2,74:1 contra o fundo) escurecido no mesmo matiz (V × 0,82) para a barra passar de 3:1
      discricionaria: '#169064',
      deficit: '#b91c1c',
      superavit: '#a03c9a',
    },
    contornoDeficit: null,
    borda: '#d6d5d0',
    painel: '#ffffff',
  },
  escuro: {
    fundo: '#1a1a19',
    texto: '#f0efec',
    secundario: '#c3c2b7',
    series: {
      receita: '#3987e5',
      repasse: '#8b8a85',
      gasto: '#e0702e',
      discricionaria: '#199e70',
      deficit: '#b8322f',
      superavit: '#b04aa9',
    },
    contornoDeficit: '#f2b8b5',
    borda: '#3a3a37',
    painel: '#242423',
  },
};

// uma variável por papel e por série (--fundo, --receita, --superavit…)
const variaveis = ({ series, ...papeis }: Paleta) =>
  Object.entries({ ...papeis, ...series })
    .map(([k, v]) => `--${k}: ${v ?? 'none'};`)
    .join(' ');

/** Variáveis CSS dos dois temas: claro por padrão, escuro por `prefers-color-scheme`. */
export function cssDosTemas(): string {
  return `:root { color-scheme: light dark; ${variaveis(TEMAS.claro)} }\n` +
    `@media (prefers-color-scheme: dark) { :root { ${variaveis(TEMAS.escuro)} } }\n`;
}
