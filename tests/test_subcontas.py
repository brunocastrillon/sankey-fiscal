"""O AAAA.json grava as subcontas que montar_subcontas calcula, com valores de 3 casas."""
import sys
from pathlib import Path

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
