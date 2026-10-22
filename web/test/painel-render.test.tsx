import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { montarGrafo } from '../src/grafo/grafo';
import { formatarMesBase } from '../src/formatar';
import { TEXTOS } from '../src/textos';
import { Painel } from '../src/ui/Painel';
import { lerAno } from './apoio/dados';

const nada = () => {};

describe('painel de detalhes (2025)', () => {
  const g = montarGrafo(lerAno(2025));
  const render = (id: string | null) =>
    renderToStaticMarkup(<Painel grafo={g} no={id ? g.nos.find((n) => n.id === id)! : null} aoFechar={nada} />);

  it('linhas que subtraem aparecem com "menos" imediatamente antes do código', () => {
    const html = render('fundeb_seguro_desemprego_outras');
    expect(html).toMatch(new RegExp(`${TEXTOS.menos}\\s*(<[^>]+>\\s*)*4\\.3\\.05`));
    expect(html).toContain('Benefícios de Prestação Continuada da LOAS/RMV');
  });

  it('nenhum nó só com linhas de soma mostra "menos"', () => {
    const soSoma = g.nos.filter((n) => n.linhas.length > 0 && n.linhas.every((l) => l.operacao === 'soma'));
    expect(soSoma.length).toBeGreaterThan(10);
    for (const n of soSoma) expect(render(n.id), n.id).not.toContain(`>${TEXTOS.menos}<`);
  });

  it('participação com a base escrita', () => {
    expect(render('csll')).toContain(TEXTOS.baseReceita);
    expect(render('bpc')).toContain(TEXTOS.baseDespesa);
    expect(render('resultado_primario')).toContain(TEXTOS.baseDespesa);
  });

  it('déficit com "não inclui juros"; Obrigatórias com a soma das folhas; vazio com o convite', () => {
    expect(render('resultado_primario')).toContain(TEXTOS.naoIncluiJuros);
    const obrig = render('obrigatorias');
    expect(obrig).toContain(TEXTOS.obrigatoriasDescricao);
    for (const id of g.obrigatorias) expect(obrig).toContain(g.nos.find((n) => n.id === id)!.rotulo.replace(/\(/g, '('));
    expect(render(null)).toContain(TEXTOS.convitePainel);
  });

  it('todo nó mostra o boletim de origem (versao_dados) e o mês-base', () => {
    for (const n of g.nos) {
      const html = render(n.id);
      expect(html, n.id).toContain(g.versaoDados);
      expect(html, n.id).toContain(formatarMesBase(g.mesBase));
    }
  });

  it('o painel não é região aria-live (ele recebe foco; anunciar duas vezes atrapalha)', () => {
    expect(render(null)).not.toContain('aria-live');
    expect(render('csll')).not.toContain('aria-live');
  });

  it('o botão de fechar tem nome acessível', () => {
    expect(render('csll')).toContain(`aria-label="${TEXTOS.fechar}"`);
  });
});
