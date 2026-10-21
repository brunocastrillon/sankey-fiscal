import type { Ref } from 'react';
import { formatarBi, formatarMesBase, formatarPct } from '../formatar';
import { participacao } from '../grafo/participacao';
import type { Grafo, No } from '../grafo/tipos';
import { TEXTOS } from '../textos';

interface Props {
  grafo: Grafo;
  no: No | null;
  aoFechar: () => void;
  ref?: Ref<HTMLElement>;
}

const LISTA_LONGA = 3;

/** Painel de detalhes com altura reservada: vazio, mostra o convite; nunca muda a posição do desenho. */
export function Painel({ grafo, no, aoFechar, ref }: Props) {
  if (!no) {
    return (
      <section className="painel" data-testid="painel" ref={ref} tabIndex={-1} aria-live="polite">
        <p className="convite">{TEXTOS.convitePainel}</p>
      </section>
    );
  }
  const p = participacao(grafo, no.id);
  const deficit = no.papel === 'resultado' && grafo.resultado === 'deficit';
  const folhas = grafo.obrigatorias.map((id) => grafo.nos.find((n) => n.id === id)!);
  const itens = no.papel === 'obrigatorias' ? folhas.length : no.linhas.length;
  return (
    <section className="painel" data-testid="painel" ref={ref} tabIndex={-1} aria-live="polite">
      <button type="button" className="fechar" aria-label={TEXTOS.fechar} onClick={aoFechar}>
        ×
      </button>
      <h2 className="painel-titulo">{no.rotulo}</h2>
      <p className="painel-valor">
        <strong>{formatarBi(no.valor)}</strong>
        {deficit && <span className="secundario"> · {TEXTOS.naoIncluiJuros}</span>}
        <span className="secundario">
          {' '}
          · {formatarPct(p.fracao)} {p.base === 'receita' ? TEXTOS.baseReceita : TEXTOS.baseDespesa}
        </span>
      </p>
      <h3 className="painel-sub">{no.papel === 'obrigatorias' ? TEXTOS.obrigatoriasDescricao : TEXTOS.linhasDoRtn}</h3>
      <ul className={itens > LISTA_LONGA ? 'linhas duas-colunas' : 'linhas'}>
        {no.papel === 'obrigatorias'
          ? folhas.map((f) => <li key={f.id}>{f.rotulo}</li>)
          : no.linhas.map((l) => (
              <li key={`${l.operacao}${l.codigo}`}>
                {l.operacao === 'subtrai' && <span className="menos">{TEXTOS.menos}</span>}
                {l.operacao === 'subtrai' && ' '}
                <code>{l.codigo}</code> {l.nome}
              </li>
            ))}
      </ul>
      <p className="secundario painel-nota">
        {TEXTOS.registro} {TEXTOS.precos} {formatarMesBase(grafo.mesBase)} {TEXTOS.deflator}.
      </p>
    </section>
  );
}
