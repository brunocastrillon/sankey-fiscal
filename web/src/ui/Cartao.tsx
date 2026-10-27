import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DadosAno } from '../dados/tipos';
import { formatarMesBase } from '../formatar';
import { montarGrafo } from '../grafo/grafo';
import type { Grafo, Modo } from '../grafo/tipos';
import { LARGURA_MAX_DESKTOP } from '../layout/constantes';
import { calcularEscalaCompartilhada, calcularReserva } from '../layout/escala';
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

const MODOS: Modo[] = ['rs', 'desp', 'pib'];

/** Os 11 anos chegam juntos: a escala de cada modo é comum a todos. O modo na tela só muda na 3c; aqui é sempre R$. */
export function Cartao({ dados, ano, modo = 'rs' }: { dados: DadosAno[]; ano: number; modo?: Modo }) {
  // montados aqui, dentro da Protecao: dados corrompidos viram a mensagem de erro do desenho
  const grafosPorModo = useMemo(
    () => Object.fromEntries(MODOS.map((m) => [m, dados.map((d) => montarGrafo(d, m))])) as Record<Modo, Grafo[]>,
    [dados],
  );
  const grafo = grafosPorModo[modo].find((g) => g.ano === ano)!;
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
  // largura reservada aos rótulos: a maior entre os anos e os três modos (as colunas não mudam de lugar)
  const reservaLargura = useMemo(
    () => (medidor ? calcularReserva(MODOS.flatMap((m) => grafosPorModo[m]), formato, medidor) : null),
    [grafosPorModo, formato, medidor],
  );
  // escala e âncora comuns aos anos do modo, calculadas uma vez por modo, formato e largura
  const compartilhada = useMemo(() => {
    if (!medidor || !largura || !reservaLargura) return null;
    const opcoes = formato.vaos ? { larguraVisivel: largura } : { largura: Math.min(largura, LARGURA_MAX_DESKTOP) };
    return { ...opcoes, ...calcularEscalaCompartilhada(grafosPorModo[modo], formato, medidor, { ...opcoes, reservaLargura }) };
  }, [grafosPorModo, modo, formato, medidor, largura, reservaLargura]);
  const layout = useMemo(
    () => (medidor && compartilhada ? calcularLayout(grafo, formato, medidor, compartilhada) : null),
    [grafo, formato, medidor, compartilhada],
  );

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
        <Dica
          grafo={grafo}
          no={grafo.nos.find((n) => n.id === dica.id)!}
          barra={dica.barra}
          cartao={refCartao.current}
          // rótulo à direita da barra (âncora start) → dica à esquerda; rótulo à esquerda ou acima → dica à direita
          lado={layout?.rotulos.find((r) => r.id === dica.id)?.ancora === 'start' ? 'esquerda' : 'direita'}
        />
      )}
    </article>
  );
}
