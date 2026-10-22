import type { KeyboardEvent } from 'react';
import { formatarBi } from '../formatar';
import type { Grafo } from '../grafo/tipos';
import { OPACIDADE_FLUXO } from '../layout/constantes';
import { caminhoFaixa } from '../layout/geometria';
import type { Layout } from '../layout/layout';
import { TEXTOS } from '../textos';

interface Props {
  grafo: Grafo;
  layout: Layout;
  /** Prefixo único dos ids internos do SVG (título e hachura). */
  idSvg: string;
  /** Mouse sobre o nó (só pointerType 'mouse'): dica flutuante perto da barra, sem mover o foco. */
  aoPassarMouse: (id: string, barra: Element) => void;
  /** Foco por teclado: mostra o nó no painel sem mover o foco. */
  aoFocar: (id: string) => void;
  /** Clique, toque ou Enter: mostra o painel e leva o foco a ele. */
  aoEscolher: (id: string) => void;
  aoSair: () => void;
}

/** Desenha a geometria já calculada. Sem estado: tudo vem do layout e do grafo. */
export function Sankey({ grafo, layout: L, idSvg, aoPassarMouse, aoFocar, aoEscolher, aoSair }: Props) {
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const hachura = `${idSvg}-hachura`;
  const ehDeficit = (id: string) => porId.get(id)?.cor === 'deficit';
  const teclado = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      aoEscolher(id);
    }
  };

  return (
    <svg
      className="sankey"
      data-testid="svg-sankey"
      width={L.largura}
      height={L.altura}
      viewBox={`0 0 ${L.largura} ${L.altura}`}
      role="group"
      aria-labelledby={`${idSvg}-titulo`}
      onPointerLeave={aoSair}
    >
      <title id={`${idSvg}-titulo`}>{`${TEXTOS.tituloSvg}, ${grafo.ano}`}</title>
      <defs>
        <pattern id={hachura} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="hachura-fundo" width="6" height="6" />
          <rect className="hachura-listra" width="2" height="6" />
        </pattern>
      </defs>
      <g className="fluxos">
        {L.fluxos
          .filter((f) => f.valor > 0)
          .map((f) => {
            const deficit = ehDeficit(f.origem);
            return (
              <path
                key={`${f.origem}>${f.destino}`}
                className="fluxo"
                data-origem={f.origem}
                data-destino={f.destino}
                data-deficit={deficit || undefined}
                d={caminhoFaixa(f)}
                fill={deficit ? `url(#${hachura})` : `var(--${porId.get(f.destino)!.cor})`}
                fillOpacity={deficit ? 0.9 : OPACIDADE_FLUXO}
              />
            );
          })}
      </g>
      {L.nos.map((nl) => {
        const n = porId.get(nl.id)!;
        const r = L.rotulos.find((x) => x.id === nl.id);
        const guia = L.guias.find((x) => x.id === nl.id);
        const alvo = L.alvos.find((x) => x.id === nl.id);
        const deficit = n.cor === 'deficit';
        return (
          <g
            key={nl.id}
            className="no"
            data-id={nl.id}
            role="button"
            tabIndex={0}
            aria-label={`${n.rotulo}: ${formatarBi(n.valor)}`}
            onPointerEnter={(e) => {
              const barra = e.currentTarget.querySelector('rect.barra');
              if (e.pointerType === 'mouse' && barra) aoPassarMouse(nl.id, barra);
            }}
            onPointerLeave={(e) => e.pointerType === 'mouse' && aoSair()}
            onFocus={() => aoFocar(nl.id)}
            onClick={() => aoEscolher(nl.id)}
            onKeyDown={teclado(nl.id)}
          >
            <rect
              className="barra"
              data-deficit={deficit || undefined}
              x={nl.x0}
              y={nl.y0}
              width={nl.x1 - nl.x0}
              height={Math.max(nl.y1 - nl.y0, 1)}
              rx={2}
              fill={deficit ? `url(#${hachura})` : `var(--${n.cor})`}
            />
            {guia && <path className="guia" data-id={nl.id} d={`M${guia.pontos.map(([x, y]) => `${x} ${y}`).join('L')}`} />}
            {r && (
              <text
                className={r.lado === 'meio' ? 'rotulo rotulo-meio' : 'rotulo'}
                data-id={nl.id}
                x={r.x}
                textAnchor={r.ancora}
                fontSize={L.fonte}
              >
                {r.linhas.map((l, i) => (
                  <tspan
                    key={i}
                    x={r.x}
                    y={r.topo + r.alturaLinha * (i + 0.8)}
                    className={l.negrito ? 'valor' : l.secundario ? 'secundario' : undefined}
                  >
                    {l.texto}
                  </tspan>
                ))}
              </text>
            )}
            {alvo && (
              <rect
                className="alvo"
                data-id={nl.id}
                x={alvo.caixa.x0}
                y={alvo.caixa.y0}
                width={alvo.caixa.x1 - alvo.caixa.x0}
                height={alvo.caixa.y1 - alvo.caixa.y0}
                fill="transparent"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
