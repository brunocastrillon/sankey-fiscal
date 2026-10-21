// Paletas dos temas claro e escuro (validadas para daltonismo e contraste; ver o design da fase 2).
// O texto nunca usa a cor da série; o déficit tem hachura nos dois temas e contorno claro no escuro.

export interface Paleta {
  fundo: string;
  texto: string;
  secundario: string;
  receita: string;
  repasse: string;
  gasto: string;
  discricionaria: string;
  deficit: string;
  contornoDeficit: string | null;
  borda: string;
  painel: string;
}

export const TEMAS: { claro: Paleta; escuro: Paleta } = {
  claro: {
    fundo: '#fcfcfb',
    texto: '#0b0b0b',
    secundario: '#52514e',
    receita: '#2a78d6',
    repasse: '#8b8a85',
    gasto: '#eb6834',
    discricionaria: '#1baf7a',
    deficit: '#b91c1c',
    contornoDeficit: null,
    borda: '#d6d5d0',
    painel: '#ffffff',
  },
  escuro: {
    fundo: '#1a1a19',
    texto: '#f0efec',
    secundario: '#c3c2b7',
    receita: '#3987e5',
    repasse: '#8b8a85',
    gasto: '#e0702e',
    discricionaria: '#199e70',
    deficit: '#b8322f',
    contornoDeficit: '#f2b8b5',
    borda: '#3a3a37',
    painel: '#242423',
  },
};

const variaveis = (p: Paleta) =>
  Object.entries(p)
    .map(([k, v]) => `--${k}: ${v ?? 'none'};`)
    .join(' ');

/** Variáveis CSS dos dois temas: claro por padrão, escuro por `prefers-color-scheme`. */
export function cssDosTemas(): string {
  return `:root { color-scheme: light dark; ${variaveis(TEMAS.claro)} }\n` +
    `@media (prefers-color-scheme: dark) { :root { ${variaveis(TEMAS.escuro)} } }\n`;
}
