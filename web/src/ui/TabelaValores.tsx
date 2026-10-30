import { formatarBi, formatarPct } from '../formatar';
import { participacao } from '../grafo/participacao';
import type { Grafo } from '../grafo/tipos';
import { TEXTOS } from '../textos';

/** Os mesmos valores do desenho, em tabela recolhível (leitores de tela e quem prefere ler números). */
export function TabelaValores({ grafo }: { grafo: Grafo }) {
  return (
    <details className="tabela">
      <summary>{TEXTOS.tabela}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{TEXTOS.colunasTabela.no}</th>
            <th scope="col">{TEXTOS.colunasTabela.valor}</th>
            <th scope="col">{TEXTOS.colunasTabela.participacao}</th>
          </tr>
        </thead>
        <tbody>
          {/* nó com valor zero: sem linha */}
          {grafo.nos.filter((n) => n.valor > 0).map((n) => {
            const p = participacao(grafo, n.id);
            return (
              <tr key={n.id}>
                <th scope="row">{n.rotulo}</th>
                <td>{formatarBi(n.valor)}</td>
                <td>
                  {formatarPct(p.fracao)} {p.base === 'receita' ? TEXTOS.baseReceita : TEXTOS.baseDespesa}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
