"""Notas por ano e nó: texto substituído pelos valores da série e gravado no AAAA.json."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402
import testes as T  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()


@pytest.fixture(scope="module")
def saida():
    return P.montar_anos(RTN, IPCA, PIB)[0]


def _nota(saida, ano, no, classe="fatos"):
    (n,) = [n for n in saida[ano]["notas"] if n["no"] == no and n["classe"] == classe]
    return n


def test_notas_de_2020_com_os_valores_da_serie(saida):
    fundeb = _nota(saida, 2020, "fundeb_seguro_desemprego_outras")["texto"]
    for trecho in ("R$ 591,9 bi", "R$ 906,9 bi", "R$ 108,1 bi", "4.3.07", "Créditos Extraordinários", "4.3.03"):
        assert trecho in fundeb
    bolsa = _nota(saida, 2020, "bolsa_familia")["texto"]
    for trecho in ("R$ 0,6 bi", "R$ 3,6 bi", "4.4.1.2"):
        assert trecho in bolsa
    assert "{" not in fundeb + bolsa


def test_notas_no_json_e_lista_vazia_nos_outros_anos(saida):
    for ano, d in saida.items():
        assert isinstance(d["notas"], list)
        for n in d["notas"]:
            assert set(n) == {"no", "classe", "texto", "fonte", "observacao", "base_precos"}
    assert {ano for ano, d in saida.items() if d["notas"]} == {n["ano"] for n in P.carregar_notas()}


def test_marcador_desconhecido_levanta():
    nota = {"ano": 2020, "no": "bpc", "classe": "fatos", "texto": "{xyz:4.3.05}",
            "fonte": [{"tipo": "serie", "titulo": "t", "linhas": [], "nota": None, "nota_na_tabela": None}]}
    with pytest.raises(ValueError, match="xyz"):
        P.aplicar_notas([nota], 2020, P.pd.DataFrame(), {}, {})


def test_formato_bi():
    assert P.formatar_bi(1027412.3) == "R$ 1.027,4 bi"
    assert P.formatar_bi(591910.668) == "R$ 591,9 bi"
    assert P.formatar_bi(-61694.3) == "R$ -61,7 bi"


def test_termos_com_digito_e_lista_fechada_so_com_covid():
    # uma fonte só: o pipeline define a lista, o testes.py a importa e o T16 confere que ela é a aprovada
    assert T.TERMOS_COM_DIGITO is P.TERMOS_COM_DIGITO  # a lista aprovada é conferida no T23, dentro do testes.py
    ok, detalhe = T.t16_notas_campos()
    assert ok and "lista fechada: True" in detalhe


@pytest.mark.parametrize("marcador", ["{mes:4.4.1.2:13}", "{mes:4.4.1.2:00}", "{mes:4.4.1.2:3}",
                                      "{soma:4.4.1.2:08-04}", "{soma:4.4.1.2:00-03}", "{soma:4.4.1.2:04-13}"])
def test_mes_ou_intervalo_invalido_levanta(marcador):
    with pytest.raises(ValueError, match="mês"):
        P.valor_marcador(marcador, 2020, P.pd.DataFrame(), {})


@pytest.fixture(scope="module")
def ctx():
    return T.contexto(RTN, IPCA)


@pytest.mark.parametrize("teste", ["t18_notas_fontes", "t19_notas_contexto"])
def test_t18_e_t19_usam_o_rtn_recebido(ctx, teste):
    with pytest.raises(FileNotFoundError):
        getattr(T, teste)(ctx, "nao-existe.xlsx")


@pytest.mark.parametrize("frase", ["a maior parte", "a maioria", "a maior fatia", "grande parte", "quase todo",
                                   "quase toda", "praticamente todos", "boa parte", "boa fatia", "grande fatia",
                                   "metade", "quase tudo"])
def test_recusa_quantificadores(ctx, frase):
    notas = P.carregar_notas()
    notas[2]["texto"] += f" O auxílio é {frase} do grupo."  # a nota de contexto da Nota 18
    ok, detalhe = T.t17_notas_comparacoes(ctx, RTN, notas=notas)
    assert not ok and "quantificador proibido" in detalhe


# Posição de cada citação do boletim em notas.json (nota, citação): achar por posição, não pelo texto da `nota`, para que
# uma mutação na própria `nota` não faça o ajudante falhar antes do teste
POSICAO_CITACAO = {"Nota 18": (2, 0), "Nota 16": (3, 0), "Nota 21": (4, 0)}


def _citacao(notas, nota):
    i, j = POSICAO_CITACAO[nota]
    return notas[i]["fonte"][j]


def _fatos(notas, no):
    return next(n for n in notas if n["classe"] == "fatos" and n["no"] == no)


def _linha_rtn(nota_boletim, codigo):
    def mudar(notas):
        _citacao(notas, nota_boletim)["linha_rtn"] = codigo
    return mudar


def _fatos_fundeb_com_4305(notas):
    n = _fatos(notas, "fundeb_seguro_desemprego_outras")
    n["texto"] += " O BPC soma {linha:4.3.05}."
    for c in P.citacoes(n["fonte"]):
        c.setdefault("linhas", []).append("4.3.05")


@pytest.mark.parametrize("caso,mudar", [
    ("Fundeb com linha_rtn 4", _linha_rtn("Nota 18", "4")),
    ("Fundeb com linha_rtn 4.3.05", _linha_rtn("Nota 18", "4.3.05")),
    ("fatos do Fundeb com {linha:4.3.05}, mesmo na fonte", _fatos_fundeb_com_4305),
    ("Bolsa com linha_rtn 4", _linha_rtn("Nota 21", "4")),
    ("Bolsa com linha_rtn 4.4.1.3", _linha_rtn("Nota 21", "4.4.1.3")),
])
def test_t17_regra_unica_rejeita(ctx, caso, mudar):
    notas = P.carregar_notas()
    mudar(notas)
    ok, detalhe = T.t17_notas_comparacoes(ctx, RTN, notas=notas)
    assert not ok, f"{caso}: {detalhe}"


def test_t17_regra_unica_aceita_bolsa_com_4_4_1(ctx):
    # o caso é injetado na memória: a regra aceita a mãe direta (4.4.1) como linha_rtn do Bolsa Família, qualquer que
    # seja o valor de hoje em notas.json
    notas = P.carregar_notas()
    _citacao(notas, "Nota 21")["linha_rtn"] = "4.4.1"
    ok, detalhe = T.t17_notas_comparacoes(ctx, RTN, notas=notas)
    assert ok, detalhe


def test_textos_com_codigo_e_nome_da_linha(saida):
    bolsa = _nota(saida, 2020, "bolsa_familia")["texto"]
    assert "a linha 4.4.1.2 Bolsa Família e Auxílio Brasil somou" in bolsa
    nota2 = next(n for n in saida[2020]["notas"] if n["classe"] == "contexto" and "Apoio Fin." in n["texto"])
    assert "esse está na linha 4.3.07 Créditos Extraordinários, segundo o Tesouro." in nota2["texto"]


VALOR_FORMATADO = r"R\$ -?[\d.]+,\d bi"


def test_base_precos_em_toda_nota_com_valor(saida):
    import re
    com_valor = sem_valor = 0
    for ano, d in saida.items():
        assert d["mes_base"] == "2025-12"
        for n in d["notas"]:
            if re.search(VALOR_FORMATADO, n["texto"]):
                com_valor += 1
                assert n["base_precos"] == "R$ constantes de dez/2025 (IPCA)", n
            else:
                sem_valor += 1
                assert n["base_precos"] is None, n
            for c in n["fonte"]:
                if c["tipo"] == "boletim":
                    assert c["base_precos"] == "R$ correntes (o boletim publica a preços correntes)", c
    assert com_valor == 2 and sem_valor == 3
