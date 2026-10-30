import type { KeyboardEvent } from 'react';
import { formatarBi } from '../formatar';
import type { Grafo } from '../grafo/tipos';
import { ASCENDENTE, OPACIDADE_FLUXO } from '../layout/constantes';
import { caminhoFaixa } from '../layout/geometria';
import type { Layout } from '../layout/layout';
import { TEXTOS } from '../textos';

interface Props {
  grafo: Grafo;
  layout: Layout;
  /** Prefixo único dos ids internos do SVG (hachura e pontos). */
  idSvg: string;
  /** Mouse sobre o nó (só pointerType 'mouse'): dica flutuante perto da barra, sem mover o foco. */
  aoPassarMouse: (id: string, barra: Element) => void;
  /** Clique, toque ou Enter: mostra o painel e leva o foco a ele. */
  aoEscolher: (id: string) => void;
  aoSair: () => void;
}

/** Desenha a geometria já calculada. Sem estado: tudo vem do layout e do grafo. */
export function Sankey({ grafo, layout: L, idSvg, aoPassarMouse, aoEscolher, aoSair }: Props) {
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const hachura = `${idSvg}-hachura`;
  const pontosNo = `${idSvg}-pontos-no`;
  const pontosFluxo = `${idSvg}-pontos-fluxo`;
  const ehDeficit = (id: string) => porId.get(id)?.cor === 'deficit';
  const ehSuperavit = (id: string) => porId.get(id)?.cor === 'superavit';
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
      // nome acessível por aria-label, não por um elemento title do SVG: ele viraria dica nativa do navegador sobre o desenho
      aria-label={`${TEXTOS.tituloSvg}, ${grafo.ano}`}
      onPointerLeave={aoSair}
    >
      <defs>
        <pattern id={hachura} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="hachura-fundo" width="6" height="6" />
          <rect className="hachura-listra" width="2" height="6" />
        </pattern>
        {/* superávit: a cor nunca é o único sinal — nó com a cor cheia e pontos da cor do fundo; fluxo com a cor a 36% e
            pontos da cor cheia */}
        <pattern id={pontosNo} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect className="pontos-no-fundo" width="5" height="5" />
          <circle className="pontos-no-ponto" cx="2.5" cy="2.5" r="1" />
        </pattern>
        <pattern id={pontosFluxo} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect className="pontos-fluxo-fundo" width="5" height="5" fillOpacity={OPACIDADE_FLUXO} />
          <circle className="pontos-fluxo-ponto" cx="2.5" cy="2.5" r="1" />
        </pattern>
      </defs>
      <g className="fluxos">
        {L.fluxos
          .filter((f) => f.valor > 0)
          .map((f) => {
            const deficit = ehDeficit(f.origem);
            const superavit = ehSuperavit(f.destino);
            return (
              <path
                key={`${f.origem}>${f.destino}`}
                className="fluxo"
                data-origem={f.origem}
                data-destino={f.destino}
                data-deficit={deficit || undefined}
                data-superavit={superavit || undefined}
                d={caminhoFaixa(f)}
                fill={deficit ? `url(#${hachura})` : superavit ? `url(#${pontosFluxo})` : `var(--${porId.get(f.destino)!.cor})`}
                fillOpacity={deficit ? 0.9 : superavit ? 1 : OPACIDADE_FLUXO}
              />
            );
          })}
      </g>
      {/* nó com valor zero: nem barra, nem parada no Tab */}
      {L.nos.filter((nl) => porId.get(nl.id)!.valor > 0).map((nl) => {
        const n = porId.get(nl.id)!;
        const r = L.rotulos.find((x) => x.id === nl.id);
        const guia = L.guias.find((x) => x.id === nl.id);
        const alvo = L.alvos.find((x) => x.id === nl.id);
        const deficit = n.cor === 'deficit';
        const superavit = n.cor === 'superavit';
        return (
          <g
            key={nl.id}
            className="no"
            data-id={nl.id}
            role="button"
            tabIndex={0}
            aria-label={`${n.rotulo}: ${formatarBi(n.valor)}${n.papel === 'resultado' ? `, ${TEXTOS.naoIncluiJuros}` : ''}`}
            onPointerEnter={(e) => {
              const barra = e.currentTarget.querySelector('rect.barra');
              if (e.pointerType === 'mouse' && barra) aoPassarMouse(nl.id, barra);
            }}
            onPointerLeave={(e) => e.pointerType === 'mouse' && aoSair()}
            onClick={() => aoEscolher(nl.id)}
            onKeyDown={teclado(nl.id)}
          >
            <rect
              className="barra"
              data-deficit={deficit || undefined}
              data-superavit={superavit || undefined}
              x={nl.x0}
              y={nl.y0}
              width={nl.x1 - nl.x0}
              height={Math.max(nl.y1 - nl.y0, 1)}
              rx={2}
              fill={deficit ? `url(#${hachura})` : superavit ? `url(#${pontosNo})` : `var(--${n.cor})`}
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
                    y={r.topo + ASCENDENTE * L.fonte + r.alturaLinha * i}
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
