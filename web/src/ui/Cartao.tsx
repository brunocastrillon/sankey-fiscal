import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatarMesBase } from '../formatar';
import type { Grafo } from '../grafo/tipos';
import { LARGURA_MAX_DESKTOP } from '../layout/constantes';
import { calcularLayout } from '../layout/layout';
import { TEXTOS } from '../textos';
import { Dica } from './Dica';
import { escolherFormato } from './formato';
import { Painel } from './Painel';
import { Rolagem } from './Rolagem';
import { rolagemMinima } from './rolagemMinima';
import { Sankey } from './Sankey';
import { TabelaValores } from './TabelaValores';
import { useMedidor } from './useMedidor';

/**
 * Rola o mínimo para o nó ficar inteiro na tela, a 16 px do topo, e (se dado) o começo do painel entrar; no celular,
 * também rola o contêiner na horizontal até a barra (o scroll-snap leva à parada que a contém).
 */
function rolarAte(g: SVGGElement, painelTopo: number | null) {
  const barra = g.querySelector('rect.barra');
  const rolagem = g.closest('.rolagem');
  if (barra && rolagem) {
    const b = barra.getBoundingClientRect();
    const r = rolagem.getBoundingClientRect();
    if (b.left < r.left || b.right > r.right) rolagem.scrollTo({ left: rolagem.scrollLeft + b.left - r.left - 16, behavior: 'smooth' });
  }
  const caixas = [barra, g.querySelector('text.rotulo')].filter((x): x is Element => !!x).map((el) => el.getBoundingClientRect());
  if (!caixas.length) return;
  const topo = window.scrollY;
  const no = { topo: Math.min(...caixas.map((c) => c.top)) + topo, fundo: Math.max(...caixas.map((c) => c.bottom)) + topo };
  const alvo = rolagemMinima({
    atual: topo,
    alturaTela: window.innerHeight,
    maxRolagem: document.documentElement.scrollHeight - window.innerHeight,
    no,
    painelTopo: painelTopo ?? no.topo,
  });
  if (Math.abs(alvo - topo) > 0.5) window.scrollTo({ top: alvo, behavior: 'smooth' });
}

export function Cartao({ grafo }: { grafo: Grafo }) {
  const idSvg = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const refArea = useRef<HTMLDivElement>(null);
  const refAmostra = useRef<SVGTextElement>(null);
  const refPainel = useRef<HTMLElement>(null);
  const refCartao = useRef<HTMLElement>(null);
  const medidor = useMedidor(refAmostra);
  const [largura, setLargura] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [dica, setDica] = useState<{ id: string; barra: Element } | null>(null);

  useEffect(() => {
    const area = refArea.current;
    if (!area) return;
    const observador = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    observador.observe(area);
    return () => observador.disconnect();
  }, []);

  const formato = escolherFormato(largura || LARGURA_MAX_DESKTOP);
  const layout = useMemo(() => {
    if (!medidor || !largura) return null;
    return formato.vaos
      ? calcularLayout(grafo, formato, medidor, { larguraVisivel: largura })
      : calcularLayout(grafo, formato, medidor, { largura: Math.min(largura, LARGURA_MAX_DESKTOP) });
  }, [grafo, formato, medidor, largura]);

  const noNoDesenho = (id: string) => refArea.current?.querySelector<SVGGElement>(`g.no[data-id="${id}"]`) ?? null;
  const focarNo = (id: string) => noNoDesenho(id)?.focus();
  const escolher = useCallback((id: string) => {
    setEscolhido(id);
    setDica(null);
    requestAnimationFrame(() => {
      // rola o mínimo: o nó continua na tela e o começo do painel entra; o desenho não se move
      const g = noNoDesenho(id);
      const painel = refPainel.current;
      if (g && painel) rolarAte(g, painel.getBoundingClientRect().top + window.scrollY);
      painel?.focus({ preventScroll: true });
    });
  }, []);
  const fechar = useCallback(() => {
    const origem = escolhido;
    setEscolhido(null);
    if (origem) requestAnimationFrame(() => focarNo(origem));
  }, [escolhido]);
  const verNoDesenho = useCallback(() => {
    const g = escolhido ? noNoDesenho(escolhido) : null;
    if (!g) return;
    g.focus({ preventScroll: true });
    rolarAte(g, null);
  }, [escolhido]);
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && escolhido) {
      e.preventDefault();
      fechar();
    }
  };

  const noVisivel = escolhido ? grafo.nos.find((n) => n.id === escolhido) ?? null : null;
  const sankey = layout && (
    <Sankey
      grafo={grafo}
      layout={layout}
      idSvg={idSvg}
      aoPassarMouse={(id, barra) => setDica({ id, barra })}
      aoEscolher={escolher}
      aoSair={() => setDica(null)}
    />
  );

  return (
    <article className={`cartao formato-${formato.nome}`} data-testid="cartao" onKeyDown={teclas} ref={refCartao}>
      <p className="aviso">{TEXTOS.aviso}</p>
      <svg className="amostra" aria-hidden="true" width="0" height="0">
        <text ref={refAmostra} className="rotulo">
          {TEXTOS.titulo}
        </text>
      </svg>
      <div className="area" ref={refArea} style={{ minHeight: formato.alturaSvg }}>
        {layout && (formato.vaos ? <Rolagem layout={layout}>{sankey}</Rolagem> : sankey)}
      </div>
      <Painel grafo={grafo} no={noVisivel} aoFechar={fechar} aoVerNoDesenho={verNoDesenho} ref={refPainel} />
      <footer className="rodape" data-testid="rodape">
        <span>{TEXTOS.rodape}</span> <span>{TEXTOS.fonte} ({grafo.versaoDados}).</span>{' '}
        <span>
          {TEXTOS.precos} {formatarMesBase(grafo.mesBase)} {TEXTOS.deflator}.
        </span>
      </footer>
      <TabelaValores grafo={grafo} />
      {dica && refCartao.current && (
        <Dica grafo={grafo} no={grafo.nos.find((n) => n.id === dica.id)!} barra={dica.barra} cartao={refCartao.current} />
      )}
    </article>
  );
}
