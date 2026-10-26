"""Notas por ano e nó: texto substituído pelos valores da série e gravado no AAAA.json."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402
import testes as T  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()
SAIDA, _ = P.montar_anos(RTN, IPCA, PIB)


def _nota(ano, no, classe="fatos"):
    (n,) = [n for n in SAIDA[ano]["notas"] if n["no"] == no and n["classe"] == classe]
    return n


def test_notas_de_2020_com_os_valores_da_serie():
    fundeb = _nota(2020, "fundeb_seguro_desemprego_outras")["texto"]
    for trecho in ("R$ 591,9 bi", "R$ 906,9 bi", "R$ 108,1 bi", "4.3.07", "Créditos Extraordinários", "4.3.03"):
        assert trecho in fundeb
    bolsa = _nota(2020, "bolsa_familia")["texto"]
    for trecho in ("R$ 0,6 bi", "R$ 3,6 bi", "4.4.1.2"):
        assert trecho in bolsa
    assert "{" not in fundeb + bolsa


def test_notas_no_json_e_lista_vazia_nos_outros_anos():
    for ano, d in SAIDA.items():
        assert isinstance(d["notas"], list)
        for n in d["notas"]:
            assert set(n) == {"no", "classe", "texto", "fonte"}
    assert {ano for ano, d in SAIDA.items() if d["notas"]} == {n["ano"] for n in P.carregar_notas()}


def test_marcador_desconhecido_levanta():
    nota = {"ano": 2020, "no": "bpc", "classe": "fatos", "texto": "{xyz:4.3.05}", "fonte": {"titulo": "t", "linhas": []}}
    with pytest.raises(ValueError, match="xyz"):
        P.aplicar_notas([nota], 2020, P.pd.DataFrame(), {}, {})


def test_formato_bi():
    assert P.formatar_bi(1027412.3) == "R$ 1.027,4 bi"
    assert P.formatar_bi(591910.668) == "R$ 591,9 bi"
    assert P.formatar_bi(-61694.3) == "R$ -61,7 bi"


def test_termos_com_digito_e_lista_fechada_so_com_covid():
    assert T.TERMOS_COM_DIGITO == ("Covid-19",)
    ok, detalhe = T.t16_notas_sem_digitos()
    assert ok and "lista fechada: True" in detalhe


@pytest.mark.parametrize("marcador", ["{mes:4.4.1.2:13}", "{mes:4.4.1.2:00}", "{mes:4.4.1.2:3}",
                                      "{soma:4.4.1.2:08-04}", "{soma:4.4.1.2:00-03}", "{soma:4.4.1.2:04-13}"])
def test_mes_ou_intervalo_invalido_levanta(marcador):
    with pytest.raises(ValueError, match="mês"):
        P.valor_marcador(marcador, 2020, P.pd.DataFrame(), {})
