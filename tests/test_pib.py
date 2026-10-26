"""Leitura do PIB do IBGE (SIDRA 1846): layout do CSV, anos incompletos e valores nulos não passam em silêncio."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()
FONTE = "IBGE, Contas Nacionais Trimestrais, tabela 1846"


def _copia(tmp_path, de, para):
    texto = Path(PIB).read_text(encoding="utf-8-sig")
    assert de in texto
    destino = tmp_path / "tabela1846.csv"
    destino.write_text(texto.replace(de, para), encoding="utf-8-sig")
    return str(destino)


def test_ano_incompleto_fica_fora_e_ultimo_trimestre_e_o_do_arquivo():
    anual, ultimo = P.ler_pib_ibge(PIB)
    tri = P.ler_pib_trimestral(PIB)
    ultimo_ano = tri.index.max().year
    assert ultimo == P.rotulo_trimestre(tri.index.max())
    completos = [a for a in sorted(set(tri.index.year)) if (tri.index.year == a).sum() == 4]
    assert list(anual.index) == completos
    if (tri.index.year == ultimo_ano).sum() < 4:
        assert ultimo_ano not in anual.index


def test_valor_nulo_tira_o_ano_e_o_pipeline_falha(tmp_path):
    tri = P.ler_pib_trimestral(PIB)
    valor = f'"{int(tri[P.pd.Period("2020Q4")])}"'
    csv = _copia(tmp_path, valor, '"..."')
    assert 2020 not in P.ler_pib_ibge(csv)[0].index
    with pytest.raises(ValueError, match="2020"):
        P.montar_anos(RTN, IPCA, csv)


def test_categoria_errada_levanta(tmp_path):
    csv = _copia(tmp_path, '"PIB a preços de mercado"', '"Agropecuária - total"')
    with pytest.raises(ValueError, match="PIB a preços de mercado"):
        P.ler_pib_trimestral(csv)


def test_bloco_pib_no_json_e_ultimo_trimestre_do_arquivo_no_indice():
    saida, indice = P.montar_anos(RTN, IPCA, PIB)
    anual, ultimo = P.ler_pib_ibge(PIB)
    tri = P.ler_pib_trimestral(PIB)
    for ano, d in saida.items():
        ultimo_do_ano = P.rotulo_trimestre(tri.index[tri.index.year == ano].max())
        assert d["pib"] == {"valor_nominal": round(float(anual[ano]), 1), "fonte": FONTE,
                            "trimestres": 4, "ultimo_trimestre": ultimo_do_ano}
        assert ultimo_do_ano == f"{ano}T4"
    assert indice["pib_ultimo_trimestre"] == ultimo == P.rotulo_trimestre(tri.index.max())


def test_trimestre_duplicado_levanta(tmp_path):
    csv = _copia(tmp_path, '"2º trimestre 2015"', '"1º trimestre 2015"')
    with pytest.raises(ValueError, match="duplicado"):
        P.ler_pib_trimestral(csv)


def _sem_trimestre(tmp_path, rotulo):
    """Cópia do CSV sem a coluna de um trimestre (cabeçalho, categoria e valor)."""
    linhas = Path(PIB).read_text(encoding="utf-8-sig").splitlines()
    i = next(k for k, l in enumerate(linhas) if f'"{rotulo}"' in l)
    col = linhas[i].split(";").index(f'"{rotulo}"')
    for k in (i, i + 1, i + 2):
        campos = linhas[k].split(";")
        linhas[k] = ";".join(campos[:col] + campos[col + 1:])
    destino = tmp_path / "tabela1846.csv"
    destino.write_text("\n".join(linhas) + "\n", encoding="utf-8-sig")
    return str(destino)


def test_a4_pulada_quando_o_t13_falha(tmp_path):
    import testes as T
    csv = _sem_trimestre(tmp_path, "3º trimestre 2020")
    ok13, det13 = T.t13_pib_ibge(csv)
    assert not ok13 and "2020: 3" in det13
    ok, detalhe = T.a4_pib_ancora(T.contexto(RTN, IPCA), RTN, csv)
    assert not ok and detalhe.startswith("pulado: T13 falhou")
