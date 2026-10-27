import { useCallback, useEffect, useState } from 'react';
import { anoSolicitado, SENTINELA } from './dados/anoDeTeste';
import { carregarIndice, carregarTodos } from './dados/carregar';
import type { DadosAno } from './dados/tipos';
import { TEXTOS } from './textos';
import { Cartao } from './ui/Cartao';
import { Protecao } from './ui/Protecao';

interface Carga {
  dados: DadosAno[];
  ano: number;
}

/** Os 11 anos (a escala compartilhada precisa de todos) e o ano a desenhar: o último do índice. */
async function carregar(): Promise<Carga> {
  const indice = await carregarIndice();
  const dados = await carregarTodos(indice);
  let ano = indice.anos[1];
  if (__PERMITIR_ANO__) {
    // só no build de teste (--mode teste); no de produção este bloco e o módulo somem do bundle
    const pedido = anoSolicitado(window.location.search);
    if (pedido && dados.some((d) => d.ano === pedido)) {
      ano = pedido;
      document.documentElement.dataset.sentinela = SENTINELA;
    }
  }
  return { dados, ano };
}

export function App() {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [erro, setErro] = useState(false);
  const tentar = useCallback(() => {
    setErro(false);
    carregar().then(setCarga, () => setErro(true));
  }, []);
  useEffect(tentar, [tentar]);

  return (
    <main className="pagina">
      <h1>
        {TEXTOS.titulo}
        {carga && <span className="ano"> · {carga.ano}</span>}
      </h1>
      {!carga && !erro && (
        <p className="carregando" data-testid="carregando" role="status">
          {TEXTOS.carregando}
        </p>
      )}
      {erro && (
        <div className="erro-carga">
          <p className="erro" data-testid="erro" role="alert">
            {TEXTOS.erroCarga}
          </p>
          <button type="button" onClick={tentar}>
            {TEXTOS.tentarDeNovo}
          </button>
        </div>
      )}
      {carga && (
        <Protecao>
          <Cartao dados={carga.dados} ano={carga.ano} />
        </Protecao>
      )}
    </main>
  );
}
