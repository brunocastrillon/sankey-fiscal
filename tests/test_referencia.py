"""O T8 lê a referência do gráfico original de referencias/ e não passa em silêncio com referência vazia ou incompleta."""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import pipeline as P  # noqa: E402
import testes as T  # noqa: E402

RTN, IPCA = P.entradas_padrao()
CTX = T.contexto(RTN, IPCA)


def test_t8_falha_com_referencia_vazia():
    ok, _ = T.t8_regressao(CTX, ref={})
    assert ok is False


def test_t8_falha_com_contagem_errada():
    ref = T.carregar_referencia()
    del ref["deficit"]
    ok, detalhe = T.t8_regressao(CTX, ref=ref)
    assert ok is False
    assert "18" in detalhe


def test_t8_compara_18_valores():
    ok, detalhe = T.t8_regressao(CTX)
    assert ok is True
    assert "18 valores comparados" in detalhe
