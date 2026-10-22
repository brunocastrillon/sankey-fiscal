import { useEffect, useState } from 'react';
import { anoSolicitado, SENTINELA } from './dados/anoDeTeste';
import { carregarAno, carregarIndice } from './dados/carregar';
import { montarGrafo } from './grafo/grafo';
import type { Grafo } from './grafo/tipos';
import { TEXTOS } from './textos';
import { Cartao } from './ui/Cartao';
import { Protecao } from './ui/Protecao';

async function carregarGrafo(): Promise<Grafo> {
  const indice = await carregarIndice();
  let ano = indice.anos[1];
  if (__PERMITIR_ANO__) {
    // só no build de teste (--mode teste); no de produção este bloco e o módulo somem do bundle
    const pedido = anoSolicitado(window.location.search);
    if (pedido) {
      ano = pedido;
      document.documentElement.dataset.sentinela = SENTINELA;
    }
  }
  return montarGrafo(await carregarAno(ano));
}

export function App() {
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    carregarGrafo().then(setGrafo, () => setErro(true));
  }, []);

  return (
    <main className="pagina">
      <h1>
        {TEXTOS.titulo}
        {grafo && <span className="ano"> · {grafo.ano}</span>}
      </h1>
      {erro && (
        <p className="erro" data-testid="erro" role="alert">
          {TEXTOS.erroCarga}
        </p>
      )}
      {grafo && (
        <Protecao>
          <Cartao grafo={grafo} />
        </Protecao>
      )}
    </main>
  );
}
