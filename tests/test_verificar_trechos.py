"""verificar_trechos: cada trecho citado nas notas de contexto aparece na página do PDF e tem menos de 15 palavras."""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import verificar_trechos as V  # noqa: E402

SHA = "a" * 64
PAGINA = ("Nota 16 - Apoio Fin. EE/MM (+R$ 1,0 milhões): aumento resul-\n"
          "tante do Auxílio   Emergencial aos\nEstados, Municípios e DF, inserido no rol de medidas.")


def _nota(trecho, pagina=9, sha=SHA):
    return {"ano": 2020, "no": "x", "classe": "contexto", "texto": "t",
            "fonte": [{"tipo": "boletim", "nota": "Nota 16", "pagina": pagina, "trecho": trecho,
                       "arquivo_sha256": sha}]}


def test_normalizar_junta_hifenizacao_e_espacos():
    assert V.normalizar("resul-\ntante  do\n Auxílio") == "resultante do Auxílio"
    assert V.normalizar("Covid-19 e DF") == "Covid-19 e DF"


def test_trecho_presente_na_pagina_passa():
    problemas = V.conferir([_nota("aumento resultante do Auxílio Emergencial aos Estados, Municípios e DF")],
                           {9: PAGINA}.get, SHA)
    assert problemas == []


def test_trecho_inventado_ou_em_outra_pagina_falha():
    assert V.conferir([_nota("aumento resultante de um trecho inventado")], {9: PAGINA}.get, SHA)
    assert V.conferir([_nota("aumento resultante do Auxílio", pagina=8)], {9: PAGINA, 8: "outra página"}.get, SHA)


def test_trecho_longo_falha():
    longo = "aumento resultante do Auxílio Emergencial aos Estados, Municípios e DF, inserido no rol de medidas"
    assert len(longo.split()) >= 15
    assert V.conferir([_nota(longo)], {9: PAGINA}.get, SHA)


def test_pdf_diferente_do_citado_falha():
    assert V.conferir([_nota("aumento resultante do Auxílio")], {9: PAGINA}.get, "b" * 64)


def test_notas_de_fatos_ficam_de_fora():
    fatos = {"ano": 2020, "no": "x", "classe": "fatos", "texto": "t",
             "fonte": [{"tipo": "serie", "titulo": "t", "linhas": [], "nota": None, "nota_na_tabela": None}]}
    assert V.conferir([fatos], {}.get, SHA) == []


def test_tipo_desconhecido_e_erro():
    nota = _nota("aumento resultante do Auxílio")
    nota["fonte"][0]["tipo"] = "Boletim"
    problemas = V.conferir([nota], {9: PAGINA}.get, SHA)
    assert problemas and "tipo" in problemas[0]


def test_resumo_conta_conferidas_e_ignoradas():
    serie = {"tipo": "serie", "titulo": "t", "linhas": [], "nota": None, "nota_na_tabela": None}
    fatos = {"ano": 2020, "no": "x", "classe": "fatos", "texto": "t", "fonte": [serie, dict(serie)]}
    assert V.resumo([_nota("a"), _nota("b"), fatos]) == "2 conferidas, 2 ignoradas (tipo serie)"
