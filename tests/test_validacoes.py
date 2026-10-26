"""Executa a bateria de testes de testes.py sob o pytest (um caso por teste)."""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402
import testes as T  # noqa: E402

RTN, IPCA, PIB = P.entradas_padrao()
CTX = T.contexto(RTN, IPCA)
CASOS = T.lista_testes(CTX, RTN, IPCA, PIB)


@pytest.mark.parametrize("nome,fn", CASOS, ids=[n.split()[0] for n, _ in CASOS])
def test_validacao(nome, fn):
    ok, detalhe = fn()
    assert ok, f"{nome}: {detalhe}"
