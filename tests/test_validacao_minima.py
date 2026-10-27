"""Validação das notas com uma fixture mínima, montada do zero: mapeamento de 2 nós, uma nota de fatos e uma de contexto.

Cada caso muda uma coisa e confere o erro ESPECÍFICO que a validação do pipeline relata (não só "lista não vazia").
"""
import copy
import sys
from pathlib import Path

import pandas as pd
import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402

MAPA = {
    "totais": {"receita_total": "1", "transferencias": "2", "receita_liquida": "3", "despesa_total": "4",
               "primario_acima": "5"},
    "receita": [],
    "despesa": [{"id": "bolsa", "soma": ["4.4.1.2"]}, {"id": "fundeb", "soma": ["4.3"], "subtrai": ["4.3.05"]}],
}
CODIGOS = ["1", "2", "3", "4", "4.3", "4.3.01", "4.3.05", "4.3.07", "4.4", "4.4.1", "4.4.1.2", "4.4.1.3", "5"]
URL = P.ENDERECOS[0]
FATOS = {
    "ano": 2020, "no": "fundeb", "classe": "fatos",
    "texto": "Em {ano}, a linha {codigo:4.3.07} {nome:4.3.07} somou {linha:4.3.07}.",
    "comparacoes": [["{linha:4.3.01}", "<", "{linha:4.3.07}"]],
    "observacao": None,
    "fonte": [{"tipo": "serie", "titulo": P.TITULOS_SERIE[0], "linhas": ["4.3.07", "4.3.01"], "nota": None,
               "nota_na_tabela": None}],
}
CONTEXTO = {
    "ano": 2020, "no": "bolsa", "classe": "contexto",
    "texto": "Segundo o Tesouro, o Programa Bolsa Família caiu em {ano}.",
    "observacao": "a numeração segue o texto das Notas Explicativas, p. 9; a tabela da p. 7 numera diferente",
    "fonte": [{"tipo": "boletim", "publicacao": P.PUBLICACOES[0], "boletim": P.BOLETINS[0],
               "base_precos": P.BASES_PRECOS_PUBLICACAO[0], "pagina": 9,
               "nota": "Nota 21 das Notas Explicativas do resultado acumulado",
               "nota_na_tabela": "Nota 20 da tabela do resultado acumulado (p. 7)", "endereco": URL,
               "verificado_em": "2026-10-26", "arquivo_sha256": "a" * 64, "trecho": "houve migração temporária",
               "linha_rtn": "4.4.1", "menciona": "4.4.1.2"}],
}
MESES = pd.date_range("2020-01-01", "2020-12-01", freq="MS")
R = pd.DataFrame({m: {"4.3.01": 1.0, "4.3.07": 10.0, "4.4.1.2": 5.0} for m in MESES})
NOS_REAIS = {"fundeb": pd.Series(11.0, index=MESES), "bolsa": pd.Series(5.0, index=MESES)}


def _validar(notas):
    return P.validar_notas(notas, MAPA, CODIGOS, R, NOS_REAIS)


def _com(mudar):
    notas = copy.deepcopy([FATOS, CONTEXTO])
    mudar(notas)
    return _validar(notas)


def _citacao(notas):
    return notas[1]["fonte"][0]


def test_fixture_minima_e_valida():
    assert _validar(copy.deepcopy([FATOS, CONTEXTO])) == []


@pytest.mark.parametrize("mudar,erro", [
    (lambda n: _citacao(n).update(observacao="x"), "citação 1: chave desconhecida 'observacao'"),
    (lambda n: n[0].update(comentario="x"), "chave desconhecida 'comentario'"),
    (lambda n: _citacao(n).update(tipo="Boletim"), "tipo 'Boletim' (esperado serie ou boletim)"),
    (lambda n: n[0].update(texto=n[0]["texto"] + " Em 2020."), "texto com dígito fora dos marcadores"),
    (lambda n: _citacao(n).update(trecho="houve migração em 2020"), "trecho com dígito"),
    (lambda n: _citacao(n).update(nota="21"), "nota fora da forma \"Nota N …\""),
    (lambda n: _citacao(n).update(nota_na_tabela=20), "nota_na_tabela com tipo int"),
    (lambda n: _citacao(n).update(pagina=0), "pagina 0 não é inteiro ≥ 1"),
    (lambda n: _citacao(n).update(verificado_em="2026-02-30"), "verificado_em '2026-02-30' não é data real"),
    (lambda n: _citacao(n).update(verificado_em="2999-01-01"), "verificado_em '2999-01-01' não é data real"),
    (lambda n: n[1].update(no="bolsa_que_nao_existe"), "nó 'bolsa_que_nao_existe' inexistente"),
    (lambda n: _citacao(n).update(menciona="4.3.07"), "menciona 4.3.07 fora do nó"),
    (lambda n: n[0]["fonte"][0].update(linhas=["4.3.07"]), "marcadores com linhas fora da fonte ['4.3.01']"),
    (lambda n: n[0].update(texto="A linha {codigo:4.3.05} {nome:4.3.05}."), "marcadores com linhas fora do nó ['4.3.05']"),
], ids=["observacao na citação", "chave na nota", "tipo Boletim", "dígito no texto", "dígito no trecho", "nota sem forma",
        "nota_na_tabela numérica", "página 0", "data inexistente", "data futura", "nó inexistente", "menciona fora do nó",
        "marcador fora da fonte", "marcador em subtrai"])
def test_erro_especifico(mudar, erro):
    erros = _com(mudar)
    assert any(erro in e for e in erros), erros


# M1: conjuntos fechados e páginas da observação
@pytest.mark.parametrize("mudar,erro", [
    (lambda n: n[0]["fonte"][0].update(titulo=P.TITULOS_SERIE[0] + " (R$ 293,1 bi)"), "titulo fora da lista"),
    (lambda n: _citacao(n).update(boletim="v. 26, n. 12 (R$ 293,1 bi)"), "boletim fora da lista"),
    (lambda n: _citacao(n).update(publicacao="Resultado do Tesouro Nacional, dezembro de 2021"), "publicacao fora da lista"),
    (lambda n: _citacao(n).update(endereco=URL + "/"), "endereco fora da lista"),
    (lambda n: _citacao(n).update(base_precos="R$ de 2020"), "base_precos fora da lista"),
    (lambda n: n[1].update(observacao="ver p. 2931"), "observacao cita a p. 2931"),
    (lambda n: n[1].update(observacao="ver p. 8"), "observacao cita a p. 8"),
    (lambda n: n[1].update(observacao="ver o texto de 2020"), "observacao com dígito fora de \"p. N\""),
], ids=["titulo com valor (X1)", "boletim com valor (X2)", "publicacao", "endereco", "base_precos da publicação",
        "p. 2931 (X3)", "p. 8", "dígito solto"])
def test_m1_conjuntos_fechados_e_paginas(mudar, erro):
    erros = _com(mudar)
    assert any(erro in e for e in erros), erros


def test_m1_observacao_aceita_as_paginas_da_nota():
    # p. 9 é a pagina da citação; p. 7 é a página em nota_na_tabela
    assert _com(lambda n: n[1].update(observacao="ver p. 9 e p. 7")) == []


# M2: linha_rtn em L, ou mãe direta de uma linha de soma com menciona em L e descendente dessa mãe; nunca em X
MAPA_DUAS_MAES = copy.deepcopy(MAPA)
MAPA_DUAS_MAES["despesa"][0]["soma"] = ["4.4.1.2", "4.3.01"]


@pytest.mark.parametrize("mudar,erro", [
    (lambda n: _citacao(n).update(linha_rtn="4.4.1.3"), "linha_rtn 4.4.1.3"),
    (lambda n: _citacao(n).update(linha_rtn="4"), "linha_rtn 4"),
    (lambda n: _citacao(n).update(linha_rtn="4.3"), "linha_rtn 4.3"),
    (lambda n: (n[1].update(no="fundeb"), _citacao(n).update(linha_rtn="4", menciona="4.3.07")), "linha_rtn 4"),
    (lambda n: (n[1].update(no="fundeb"), _citacao(n).update(linha_rtn="4.3.05", menciona="4.3.07")), "linha_rtn 4.3.05"),
    (lambda n: _citacao(n).pop("menciona"), "linha_rtn 4.4.1 é mãe direta, mas a citação não tem menciona"),
], ids=["irmã 4.4.1.3", "total 4", "outra mãe 4.3", "Fundeb com 4 (total)", "Fundeb com 4.3.05 (subtrai)", "mãe sem menciona"])
def test_m2_linha_rtn_rejeitada(mudar, erro):
    erros = _com(mudar)
    assert any(erro in e for e in erros), erros


def test_m2_mae_direta_exige_menciona_descendente_dessa_mae():
    notas = copy.deepcopy([FATOS, CONTEXTO])
    _citacao(notas).update(linha_rtn="4.4.1", menciona="4.3.01")  # 4.3.01 está em L, mas não descende de 4.4.1
    erros = P.validar_notas(notas, MAPA_DUAS_MAES, CODIGOS, R, NOS_REAIS)
    assert any("menciona 4.3.01 não descende de 4.4.1" in e for e in erros), erros


def test_m2_aceita_bolsa_com_4_4_1_e_menciona_4_4_1_2():
    assert _citacao(copy.deepcopy([FATOS, CONTEXTO]))["linha_rtn"] == "4.4.1"
    assert _validar(copy.deepcopy([FATOS, CONTEXTO])) == []


# Item 7: sintaxe dos marcadores
@pytest.mark.parametrize("marcador,erro", [
    ("{mes:4.3.07:13}", "mês '13' fora de 01–12"),
    ("{soma:4.3.07:08-04}", "mês inicial maior que o final"),
    ("{xyz:4.3.07}", "marcador desconhecido"),
    ("{linha:4.3.07:01}", "marcador malformado"),
], ids=["mês 13", "intervalo invertido", "tipo desconhecido", "linha com mês"])
def test_item7_sintaxe_dos_marcadores(marcador, erro):
    erros = _com(lambda n: n[0].update(texto=f"Em {{ano}}, {marcador}."))
    assert any(erro in e for e in erros), erros


# M3: quantificadores e comparações na validação
def test_m3_quantificador_proibido():
    erros = _com(lambda n: n[1].update(texto="Segundo o Tesouro, boa parte do programa caiu em {ano}."))
    assert any("quantificador proibido ['boa parte']" in e for e in erros), erros


def test_m3_comparacao_falsa():
    erros = _com(lambda n: n[0].update(comparacoes=[["{linha:4.3.07}", "<", "{linha:4.3.01}"]]))
    assert any("comparação falsa" in e for e in erros), erros
