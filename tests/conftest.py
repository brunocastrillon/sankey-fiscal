"""Entradas padrão da bateria: um erro na escolha da série histórica chega ao pytest com a mensagem ("passe --rtn")."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402


def entradas(pasta=None):
    """(rtn, ipca, pib) de entrada/; se a escolha falhar, pytest.fail com a mensagem do pipeline, sem traceback."""
    try:
        return P.entradas_padrao(pasta)
    except ValueError as e:
        pytest.fail(f"entradas padrão: {e}", pytrace=False)


@pytest.fixture(scope="session")
def entradas_padrao():
    return entradas()
