"""Validação das notas e do esquema publicado: uma função só no pipeline (validar_notas, validar_ano), chamada antes de gravar."""
import copy
import json
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()
MAPA = P.carregar_mapeamento()
DADOS = RAIZ / "dados"


@pytest.fixture(scope="module")
def codigos():
    return P.ler_rtn_mensal(RTN)[0].index


def _ano(ano):
    with open(DADOS / f"{ano}.json", encoding="utf-8") as f:
        return json.load(f)


# Posição de cada citação do boletim em notas.json (nota, citação): achar por posição, não pelo texto da `nota`, para que
# uma mutação na própria `nota` não faça o ajudante falhar antes do teste
POSICAO_CITACAO = {"Nota 18": (2, 0), "Nota 16": (3, 0), "Nota 21": (4, 0)}


def _citacao(notas, nota):
    i, j = POSICAO_CITACAO[nota]
    return notas[i]["fonte"][j]


def test_notas_e_dados_de_hoje_sao_validos(codigos):
    assert P.validar_notas(P.carregar_notas(), MAPA, codigos) == []
    for ano in range(MAPA["anos"][0], MAPA["anos"][1] + 1):
        assert P.validar_ano(_ano(ano)) == []
    with open(DADOS / "indice.json", encoding="utf-8") as f:
        assert P.validar_indice(json.load(f)) == []


def _mudar_observacao_na_citacao(notas):
    _citacao(notas, "Nota 18")["observacao"] = "a numeração segue o texto"


def _mudar_chave_na_nota(notas):
    notas[0]["comentario"] = "chave a mais"


def _mudar_digito_na_observacao(notas):
    next(n for n in notas if n["classe"] == "contexto")["observacao"] += " em 2020"


def _mudar_digito_no_trecho(notas):
    _citacao(notas, "Nota 16")["trecho"] += " 2020"


def _mudar_nota_sem_forma(notas):
    _citacao(notas, "Nota 21")["nota"] = "21"


def _mudar_nota_na_tabela_numerica(notas):
    _citacao(notas, "Nota 21")["nota_na_tabela"] = 20


def _mudar_pagina_zero(notas):
    _citacao(notas, "Nota 21")["pagina"] = 0


def _mudar_data_inexistente(notas):
    _citacao(notas, "Nota 21")["verificado_em"] = "2026-02-30"


def _mudar_data_futura(notas):
    _citacao(notas, "Nota 21")["verificado_em"] = "2999-01-01"


def _mudar_tipo_maiusculo(notas):
    _citacao(notas, "Nota 21")["tipo"] = "Boletim"


def _mudar_linha_rtn_4(notas):
    _citacao(notas, "Nota 18")["linha_rtn"] = "4"


def _mudar_no_inexistente(notas):
    notas[0]["no"] = "fundeb_que_nao_existe"


@pytest.mark.parametrize("mudar", [
    _mudar_observacao_na_citacao, _mudar_chave_na_nota, _mudar_digito_na_observacao, _mudar_digito_no_trecho,
    _mudar_nota_sem_forma, _mudar_nota_na_tabela_numerica, _mudar_pagina_zero, _mudar_data_inexistente,
    _mudar_data_futura, _mudar_tipo_maiusculo, _mudar_linha_rtn_4, _mudar_no_inexistente,
], ids=lambda f: f.__name__[len("_mudar_"):])
def test_validar_notas_recusa(codigos, mudar):
    notas = P.carregar_notas()
    mudar(notas)
    assert P.validar_notas(notas, MAPA, codigos)


def test_observacao_aceita_paginas_p_n(codigos):
    notas = P.carregar_notas()
    assert "p. 9" in next(n for n in notas if n["classe"] == "contexto")["observacao"]
    assert P.validar_notas(notas, MAPA, codigos) == []


@pytest.mark.parametrize("mudar", [
    lambda d: d.update(extra=1),
    lambda d: d["pib"].update(revisao="2026T2"),
    lambda d: d["notas"][0].update(comentario="x"),
    lambda d: d["notas"][2]["fonte"][0].update(observacao="x"),
    lambda d: d["subcontas"]["imposto_renda"][0].update(peso=1),
    lambda d: d["notas"][0].update(base_precos="R$ constantes de jan/2025 (IPCA)"),
], ids=["chave no ano", "chave no pib", "chave na nota", "chave na citação", "chave na subconta", "base_precos de outro mês"])
def test_validar_ano_recusa(mudar):
    d = copy.deepcopy(_ano(2020))
    mudar(d)
    assert P.validar_ano(d)


def test_pipeline_recusa_notas_invalidas_antes_de_gravar(monkeypatch):
    notas = P.carregar_notas()
    _mudar_linha_rtn_4(notas)
    monkeypatch.setattr(P, "carregar_notas", lambda caminho=None: notas)
    with pytest.raises(ValueError, match="notas.json"):
        P.montar_anos(RTN, IPCA, PIB)


@pytest.mark.parametrize("mudar,erro", [
    (lambda notas: notas[1]["comparacoes"].__setitem__(0, ["{mes:4.4.1.2:03}", "<", "{soma:4.4.1.2:04-08}"]), "comparação falsa"),
    (lambda notas: notas[2].update(texto=notas[2]["texto"].replace("Entre elas", "Boa parte vem delas; entre elas")),
     "quantificador proibido"),
], ids=["comparação falsa (X9)", "boa parte"])
def test_pipeline_recusa_conteudo_invalido_antes_de_gravar(monkeypatch, mudar, erro):
    notas = P.carregar_notas()
    mudar(notas)
    monkeypatch.setattr(P, "carregar_notas", lambda caminho=None: notas)
    with pytest.raises(ValueError, match=erro):
        P.montar_anos(RTN, IPCA, PIB)


def test_b3_notas_validadas_antes_de_ler_o_pib(monkeypatch, tmp_path):
    notas = P.carregar_notas()
    _mudar_linha_rtn_4(notas)
    monkeypatch.setattr(P, "carregar_notas", lambda caminho=None: notas)
    with pytest.raises(ValueError, match="notas.json"):
        P.montar_anos(RTN, IPCA, str(tmp_path / "pib-que-nao-existe.csv"))
