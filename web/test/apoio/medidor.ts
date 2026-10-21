import type { MedirTexto } from '../../src/layout/medir';

/**
 * Medidor determinístico para os testes (o Vitest roda em Node, sem fonte real): largura por classe de caractere,
 * próxima de uma fonte sem serifa do sistema, multiplicada por `fator` para testar fontes mais estreitas ou mais largas.
 */
export function medidorDeterministico(fator = 1): MedirTexto {
  return (texto, { tamanho, negrito }) => {
    let em = 0;
    for (const ch of texto) {
      if (/[ilIj.,:;'|!()]/.test(ch)) em += 0.3;
      else if (/[mwMW]/.test(ch)) em += 0.86;
      else if (/[A-ZÀ-Ý0-9$%]/.test(ch)) em += 0.64;
      else if (ch === ' ') em += 0.28;
      else em += 0.54;
    }
    return em * tamanho * (negrito ? 1.07 : 1) * fator;
  };
}
