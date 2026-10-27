"""Escolha da série histórica do RTN em entrada/: pela data do nome (seriehistorica<mes><aa>), nunca pela ordem alfabética."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402


def _pasta(tmp_path, *nomes):
    for n in nomes + ("tabela1737.csv", "tabela1846.csv"):
        (tmp_path / n).write_bytes(b"")
    return tmp_path


def test_data_do_nome():
    assert P.data_do_nome("seriehistoricajul26.xlsx") == (2026, 7)
    assert P.data_do_nome("seriehistoricaago26.xlsx") == (2026, 8)
    assert P.data_do_nome("seriehistoricadez25.xlsx") == (2025, 12)
    assert P.data_do_nome("seriehistorica.xlsx") is None
    assert P.data_do_nome("seriehistoricaxyz26.xlsx") is None


def test_escolhe_ago26_e_nao_jul26(tmp_path):
    # pela ordem alfabética, "ago26" vem antes de "jul26"; pela data, ago/2026 é a mais recente
    rtn, _, _ = P.entradas_padrao(_pasta(tmp_path, "seriehistoricajul26.xlsx", "seriehistoricaago26.xlsx"))
    assert Path(rtn).name == "seriehistoricaago26.xlsx"


def test_escolhe_pela_data_entre_anos(tmp_path):
    rtn, _, _ = P.entradas_padrao(_pasta(tmp_path, "seriehistoricadez25.xlsx", "seriehistoricajan26.xlsx"))
    assert Path(rtn).name == "seriehistoricajan26.xlsx"


def test_um_arquivo_so_com_nome_ininterpretavel_e_usado(tmp_path):
    rtn, _, _ = P.entradas_padrao(_pasta(tmp_path, "seriehistorica.xlsx"))
    assert Path(rtn).name == "seriehistorica.xlsx"


def test_nome_ininterpretavel_com_mais_de_um_arquivo_exige_rtn(tmp_path):
    pasta = _pasta(tmp_path, "seriehistorica.xlsx", "seriehistoricajul26.xlsx")
    with pytest.raises(ValueError, match="passe --rtn"):
        P.escolher_rtn(pasta)
    with pytest.raises(ValueError, match="passe --rtn"):  # nunca None em silêncio
        P.entradas_padrao(pasta)


def test_sem_serie_historica_levanta_em_vez_de_none(tmp_path):
    with pytest.raises(ValueError, match="passe --rtn"):
        P.entradas_padrao(_pasta(tmp_path))


def test_no_pytest_a_ambiguidade_chega_com_a_mensagem(tmp_path):
    import conftest
    pasta = _pasta(tmp_path, "seriehistorica.xlsx", "seriehistoricajul26.xlsx")
    with pytest.raises(pytest.fail.Exception, match="passe --rtn"):
        conftest.entradas(pasta)
