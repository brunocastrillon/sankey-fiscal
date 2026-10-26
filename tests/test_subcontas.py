"""O AAAA.json grava as subcontas que montar_subcontas calcula, com valores de 3 casas."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402
import testes as T  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()


def test_subcontas_no_json():
    saida, _ = P.montar_anos(RTN, IPCA, PIB)
    esperado, _ = T._subcontas(T.contexto(RTN, IPCA), RTN)
    for ano, d in saida.items():
        assert d["subcontas"] == esperado[ano]
        assert list(d["subcontas"]) == list(T.SUBCONTAS_ESPERADAS)
        for itens in d["subcontas"].values():
            for i in itens:
                assert set(i) == {"codigo", "nome", "real", "nominal"}
                assert round(i["real"], 3) == i["real"] and round(i["nominal"], 3) == i["nominal"]


def test_subcontas_oraculo():
    """Cada subconta do dados/AAAA.json recalculada da aba 1.2 e do IPCA por funções próprias do teste."""
    ok, detalhe = T.t20_subcontas_oraculo(RTN, IPCA)
    assert ok, detalhe


def test_subcontas_boletim_dez_2020():
    """Valores nominais de 2020 publicados no boletim (referencias/boletim-dez-2020.json) contra o dados/2020.json."""
    ok, detalhe = T.t21_subcontas_boletim()
    assert ok, detalhe


def _contexto_com_residuo(codigo, mes, delta):
    """Contexto do T14 com um resíduo injetado na aba 1.2: a linha filha muda e o nó (linha-mãe) não."""
    mapa, M, nos, totais, ipca = T.contexto(RTN, IPCA)
    M = M.copy()
    M.loc[codigo, P.pd.Timestamp(mes)] += delta
    return mapa, M, nos, totais, ipca


@pytest.mark.parametrize("no,codigo,mes", [("aposentadorias_pensoes", "4.1.1", "2021-03-01"),
                                           ("imposto_renda", "1.1.03.1", "2016-08-01")])
def test_t14_folga_so_para_aposentadorias_em_2015_e_2016(monkeypatch, no, codigo, mes):
    # mesmo com o mês incluído na lista de resíduos conhecidos, a folga não vale fora de aposentadorias 2015 e 2016
    monkeypatch.setattr(T, "RESIDUOS_FONTE", T.RESIDUOS_FONTE | {(no, mes[:7])})
    ok, detalhe = T.t14_subcontas_fecham(_contexto_com_residuo(codigo, mes, 0.03), RTN)
    assert not ok, detalhe
    assert f"'{no} {mes[:4]} real: " in detalhe  # o motivo é a soma acima da folga naquele nó e ano
