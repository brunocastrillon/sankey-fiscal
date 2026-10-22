import { useLayoutEffect, useRef, useState } from 'react';
import { formatarBi, formatarPct } from '../formatar';
import { participacao } from '../grafo/participacao';
import type { Grafo, No } from '../grafo/tipos';
import { TEXTOS } from '../textos';
import { posicionarDica } from './posicionarDica';

const MARGEM = 8;

/**
 * Dica de hover do desktop: curta, flutuante, dentro do cartão e da janela. Não muda o layout, não move o foco e fica
 * fora da árvore de acessibilidade (o caminho acessível é o botão do nó e o painel).
 */
export function Dica({
  grafo,
  no,
  barra,
  cartao,
  lado,
}: {
  grafo: Grafo;
  no: No;
  barra: Element;
  cartao: HTMLElement;
  /** Lado da barra onde a dica abre: o oposto ao do rótulo, sobre os fluxos. */
  lado: 'direita' | 'esquerda';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = cartao.getBoundingClientRect();
    const b = barra.getBoundingClientRect();
    const limites = {
      x0: Math.max(0, -c.left) + MARGEM,
      y0: Math.max(0, -c.top) + MARGEM,
      x1: Math.min(c.width, window.innerWidth - c.left) - MARGEM,
      y1: Math.min(c.height, window.innerHeight - c.top) - MARGEM,
    };
    const alvo = { x0: b.left - c.left, y0: b.top - c.top, x1: b.right - c.left, y1: b.bottom - c.top };
    setPosicao(posicionarDica(alvo, { largura: el.offsetWidth, altura: el.offsetHeight }, limites, lado));
  }, [no, barra, cartao, lado]);

  const p = participacao(grafo, no.id);
  const deficit = no.papel === 'resultado' && grafo.resultado === 'deficit';
  return (
    <div
      ref={ref}
      className="dica-no"
      data-testid="tooltip"
      aria-hidden="true"
      style={{ left: posicao?.x ?? 0, top: posicao?.y ?? 0, visibility: posicao ? 'visible' : 'hidden' }}
    >
      <strong>{no.rotulo}</strong>
      <span className="dica-valor">
        {formatarBi(no.valor)}
        {deficit && <span className="secundario"> · {TEXTOS.naoIncluiJuros}</span>}
      </span>
      <span className="secundario">
        {formatarPct(p.fracao)} {p.base === 'receita' ? TEXTOS.baseReceita : TEXTOS.baseDespesa}
      </span>
    </div>
  );
}
