import { useCallback, useEffect, useState } from 'react';
import { carregarIndice, carregarTodos } from './dados/carregar';
import { lerHash, modoNaTela } from './dados/hash';
import type { DadosAno, Indice } from './dados/tipos';
import type { Modo } from './grafo/tipos';
import { TEXTOS } from './textos';
import { Cartao } from './ui/Cartao';
import { Protecao } from './ui/Protecao';

interface Carga {
  indice: Indice;
  dados: DadosAno[];
}

/** O índice e os 11 anos: a escala compartilhada precisa de todos. */
async function carregar(): Promise<Carga> {
  const indice = await carregarIndice();
  return { indice, dados: await carregarTodos(indice) };
}

/** O ano e o modo pedidos no endereço (#2020, #2020/despesa, #2020/pib); sem pedido válido, o último ano em R$. */
const escolhaDoEndereco = (indice: Indice): { ano: number; modo: Modo } =>
  lerHash(window.location.hash, indice.anos) ?? { ano: indice.anos[1], modo: 'rs' };

export function App() {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [erro, setErro] = useState(false);
  const [escolha, setEscolha] = useState<{ ano: number; modo: Modo } | null>(null);
  const tentar = useCallback(() => {
    setErro(false);
    carregar().then(
      (c) => {
        setCarga(c);
        setEscolha(escolhaDoEndereco(c.indice));
      },
      () => setErro(true),
    );
  }, []);
  useEffect(tentar, [tentar]);

  // o endereço muda (link, voltar, edição à mão): redesenha o ano e o modo pedidos
  useEffect(() => {
    if (!carga) return;
    const aoMudar = () => setEscolha(escolhaDoEndereco(carga.indice));
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, [carga]);

  useEffect(() => {
    if (escolha) document.title = `${TEXTOS.titulo} · ${escolha.ano} · ${TEXTOS.produto}`;
  }, [escolha]);

  return (
    <main className="pagina">
      <h1>
        {TEXTOS.titulo}
        {escolha && <span className="ano"> · {escolha.ano}</span>}
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
      {carga && escolha && (
        <Protecao>
          <Cartao dados={carga.dados} ano={escolha.ano} modo={modoNaTela(escolha.modo)} />
        </Protecao>
      )}
    </main>
  );
}
