import { useEffect, useState, type RefObject } from 'react';
import { criarMedidorNavegador, type MedirTexto } from '../layout/medir';

/**
 * Medidor de texto do navegador, criado depois de `document.fonts.ready`, com a família de fonte lida por
 * getComputedStyle do próprio texto do SVG (a pilha de fontes com fallback fica no CSS).
 */
export function useMedidor(amostra: RefObject<SVGTextElement | null>): MedirTexto | null {
  const [medidor, setMedidor] = useState<MedirTexto | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  useEffect(() => {
    let vivo = true;
    document.fonts.ready
      .then(() => {
        if (!vivo || !amostra.current) return;
        const familia = getComputedStyle(amostra.current).fontFamily;
        setMedidor(() => criarMedidorNavegador(familia));
      })
      .catch((e: unknown) => vivo && setErro(e));
    return () => {
      vivo = false;
    };
  }, [amostra]);
  // sem medidor (por exemplo, canvas indisponível) não há desenho: o erro sobe para a Protecao, que mostra a mensagem
  if (erro) throw erro;
  return medidor;
}
