"""Testes de validação do pipeline (seção 6 do documento + âncoras de conferência).

Uso (com os arquivos em entrada/):
    python testes.py
    python testes.py --rtn outro.xlsx --ipca outro.csv --pib outro.csv
Sai com código 1 se qualquer teste falhar (o pipeline não deve publicar nesse caso).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

import pipeline as P

TOL = 0.01  # R$ milhões (R$ 10 mil): ruído de ponto flutuante, não erro contábil

# Gráfico original (2025, preços de dez/2025, R$ bi): valores em referencias/, lidos também pelo Vitest do site
REFERENCIA = P.AQUI / "referencias" / "original-2025.json"
N_VALORES_REFERENCIA = 18  # 12 nós + 1 grupo + 4 totais + déficit


def contexto(rtn, ipca_csv):
    mapa = P.carregar_mapeamento()
    ano0, ano1 = mapa["anos"]
    M, _ = P.ler_rtn_mensal(rtn)
    M = M.loc[:, (M.columns >= f"{ano0}-01-01") & (M.columns <= f"{ano1}-12-01")]
    nos, totais = P.calcular_nos(M, mapa)
    return mapa, M, nos, totais, P.ler_ipca(ipca_csv)


def maxres(a, b):
    return float((a - b).abs().max())


def t1_receita(c):
    mapa, M, nos, totais, _ = c
    soma = sum(nos[n["id"]] for n in mapa["receita"])
    r = maxres(soma, totais["receita_total"])
    return r < TOL, f"resíduo máximo mensal R$ {r:.2e} mi (132 meses)"


def t2_receita_liquida(c):
    _, M, nos, totais, _ = c
    r = maxres(totais["receita_total"] - totais["transferencias"], totais["receita_liquida"])
    return r < TOL, f"resíduo máximo mensal R$ {r:.2e} mi"


def t3_despesa(c):
    mapa, M, nos, totais, _ = c
    soma = sum(nos[n["id"]] for n in mapa["despesa"])
    r = maxres(soma, totais["despesa_total"])
    return r < TOL, f"resíduo máximo mensal R$ {r:.2e} mi"


def t4_primario(c):
    _, M, nos, totais, _ = c
    r = maxres(totais["receita_liquida"] - totais["despesa_total"], totais["primario_acima"])
    return r < TOL, f"resíduo máximo mensal R$ {r:.2e} mi"


def t5_mensal_anual(c, rtn):
    mapa, M, nos, totais, _ = c
    anual = P.ler_rtn_anual(rtn, "2.2")
    codigos = set()
    for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]:
        codigos |= set(n["soma"]) | set(n.get("subtrai", []))
    codigos |= set(mapa["totais"].values())
    ausentes = sorted(x for x in codigos if x not in anual.index)
    if ausentes:
        return False, f"códigos ausentes na aba 2.2: {ausentes}"
    anos = range(mapa["anos"][0], mapa["anos"][1] + 1)
    pior = 0.0
    for cod in codigos:
        mensal = M.loc[cod].groupby(M.columns.year).sum()
        for a in anos:
            dif = abs(float(mensal[a]) - float(anual.loc[cod, a]))
            if pd.isna(dif):
                return False, f"valor ausente (NaN) na linha {cod}, ano {a}"
            pior = max(pior, dif)
    return pior < TOL, f"{len(codigos)} linhas x {len(list(anos))} anos; maior diferença R$ {pior:.2e} mi"


def t6_deflacao(c, rtn):
    mapa, M, nos, totais, ipca = c
    base = pd.Timestamp(mapa["mes_base_padrao"])
    # (a) identidade: no mês-base o valor real é igual ao nominal
    f = P.fator_deflacao(ipca, M.columns, base)
    fb = float(pd.Series(f, index=M.columns)[base])
    ok_a = abs(fb - 1.0) < 1e-12
    # (b) cobertura: IPCA sem lacunas de jan/2015 até o mês-base
    mes = pd.date_range("2015-01-01", base, freq="MS")
    ok_b = all(m in ipca.index for m in mes)
    # (c) igual à aba 1.2-A do Tesouro (valores constantes de Jul/2026) em todas as linhas mapeadas
    A, _ = P.ler_rtn_mensal(rtn, "1.2-A")
    A = A.loc[:, M.columns]
    base_t = pd.Timestamp("2026-07-01")
    ft = pd.Series(P.fator_deflacao(ipca, M.columns, base_t), index=M.columns)
    codigos = set(mapa["totais"].values())
    for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]:
        codigos |= set(n["soma"]) | set(n.get("subtrai", []))
    if A.loc[list(codigos)].isna().any().any() or M.loc[list(codigos)].isna().any().any():
        return False, "valores ausentes (NaN) nas linhas mapeadas; o teste não pode ser concluído"
    pior = max(float((A.loc[cod] - M.loc[cod] * ft).abs().max()) for cod in codigos)
    ok_c = pior < 1e-6
    return ok_a and ok_b and ok_c, (
        f"(a) fator no mês-base = {fb:.12f}; (b) IPCA cobre {len(mes)} meses; "
        f"(c) diferença máxima contra a aba 1.2-A do Tesouro: R$ {pior:.2e} mi"
    )


def t7_sinais(c):
    mapa, M, nos, totais, _ = c
    anuais_neg = {k: float(v.groupby(v.index.year).sum().min()) for k, v in nos.items()
                  if (v.groupby(v.index.year).sum() < 0).any()}
    mensais = {k: [m.strftime("%Y-%m") for m in v.index[v < -1e-9]] for k, v in nos.items() if (v < -1e-9).any()}
    info = f"; negativos mensais (só informativo): {mensais}" if mensais else ""
    return not anuais_neg, f"nós com valor anual negativo: {anuais_neg or 'nenhum'}{info}"


def carregar_referencia(caminho=None):
    with open(caminho or REFERENCIA, encoding="utf-8") as f:
        return json.load(f)


def t8_regressao(c, ref=None):
    mapa, M, nos, totais, ipca = c
    ref = carregar_referencia() if ref is None else ref
    if not ref:
        return False, "referência vazia"
    base = pd.Timestamp(mapa["mes_base_padrao"])
    f = pd.Series(P.fator_deflacao(ipca, M.columns, base), index=M.columns)
    ano = lambda s: float((s * f).groupby(s.index.year).sum()[ref["ano"]]) / 1000  # R$ bi
    obrig = [n["id"] for n in mapa["despesa"] if n["grupo"] == "obrigatoria"]
    calculado = {k: ano(totais[k]) for k in ("receita_total", "receita_liquida", "despesa_total")}
    calculado["obrigatorias"] = sum(ano(nos[k]) for k in obrig)
    difs = {k: ano(nos[k]) - v for k, v in ref.get("nos", {}).items()}
    for g, d in ref.get("grupos", {}).items():
        difs[g] = sum(ano(nos[k]) for k in d["nos"]) - d["valor"]
    for k, v in ref.get("totais", {}).items():
        difs[k] = calculado[k] - v
    if "deficit" in ref:
        difs["deficit"] = -ano(totais["primario_acima"]) - ref["deficit"]
    if len(difs) != N_VALORES_REFERENCIA:
        return False, f"{len(difs)} valores comparados; esperados {N_VALORES_REFERENCIA}"
    tol = ref["tolerancia_por_no"]
    pior_k = max(difs, key=lambda k: abs(difs[k]))
    pior = abs(difs[pior_k])
    return pior <= tol, f"{len(difs)} valores comparados; maior diferença R$ {pior:.2f} bi ({pior_k}); limite R$ {tol:g} bi"


def a1_boletim(c):
    _, M, nos, totais, _ = c
    anual = lambda s: float(s.groupby(s.index.year).sum()[2025])
    ancoras = {"receita_total": 2902274.6, "despesa_total": 2394249.6, "primario_acima": -61691.2}
    difs = {k: anual(totais[k]) - v for k, v in ancoras.items()}
    pior = max(abs(v) for v in difs.values())
    det = ", ".join(f"{k} {v:+.1f}" for k, v in difs.items())
    return pior <= 5.0, f"diferença contra o boletim de dez/2025 (R$ mi, revisão da série): {det}; limite R$ 5 mi"


def a2_financiamento(c, rtn):
    mapa, M, *_ = c
    fin = {k: M.loc[cod] for k, cod in mapa["financiamento"].items()}
    r1 = maxres(fin["primario_acima"] + fin["ajustes_metodologicos"] + fin["discrepancia_estatistica"], fin["primario_abaixo"])
    r2 = maxres(fin["primario_abaixo"] + fin["juros_nominais"], fin["resultado_nominal"])
    a = lambda s: float(s.groupby(s.index.year).sum()[2025])
    d_bc = abs(a(fin["primario_abaixo"]) - (-58687.0))
    d_nom = abs(a(fin["resultado_nominal"]) - (-950567.0))
    ok = r1 < TOL and r2 < TOL and d_bc < 1.0 and d_nom < 1.0
    return ok, (f"5+6+7=8 (resíduo {r1:.1e}); 8+9=10 (resíduo {r2:.1e}); "
                f"primário abaixo da linha 2025 = {a(fin['primario_abaixo']):,.1f} (Banco Central: −58.687); "
                f"juros 2025 = {a(fin['juros_nominais']):,.1f}; resultado nominal 2025 = {a(fin['resultado_nominal']):,.1f}")


def a3_pib(c, pib_csv):
    _, M, nos, totais, _ = c
    pib = P.ler_pib_ibge(pib_csv)[0][2025]
    deficit = -float(totais["primario_acima"].groupby(totais["primario_acima"].index.year).sum()[2025])
    pct = 100 * deficit / pib
    ok = abs(pib / 1e6 - 12.7) < 0.1 and round(pct, 2) == 0.48
    return ok, f"PIB do IBGE 2025 = R$ {pib/1e6:.3f} tri (IBGE: R$ 12,7 tri); déficit/PIB = {pct:.3f}% (RTN: 0,48%)"


def t13_pib_ibge(pib_csv):
    ano0, ano1 = P.carregar_mapeamento()["anos"]
    tri = P.ler_pib_trimestral(pib_csv)
    anos = range(ano0, ano1 + 1)
    no_intervalo = tri[(tri.index.year >= ano0) & (tri.index.year <= ano1)]
    contagem = {a: int((no_intervalo.index.year == a).sum()) for a in anos}
    incompletos = {a: n for a, n in contagem.items() if n != 4}
    nulos = [P.rotulo_trimestre(t) for t in no_intervalo.index[no_intervalo.isna()]]
    ok = not incompletos and not nulos
    return ok, (f"{len(tri)} trimestres no arquivo ({P.rotulo_trimestre(tri.index.min())} a "
                f"{P.rotulo_trimestre(tri.index.max())}); {ano0}–{ano1}: anos sem 4 trimestres: {incompletos or 'nenhum'}; "
                f"valores nulos: {nulos or 'nenhum'}")


def a4_pib_ancora(c, rtn, pib_csv):
    ok13, det13 = t13_pib_ibge(pib_csv)
    if not ok13:
        return False, f"pulado: T13 falhou ({det13})"
    mapa, M, nos, totais, _ = c
    anos = range(mapa["anos"][0], mapa["anos"][1] + 1)
    pib = P.ler_pib_ibge(pib_csv)[0]
    implicito = P.pib_implicito(rtn)
    publicado = P.ler_rtn_anual(rtn, "2.2-A").loc["5"] * 100  # % do PIB publicado pelo Tesouro
    primario = totais["primario_acima"].groupby(totais["primario_acima"].index.year).sum()
    pct, rel = {}, {}
    for a in anos:
        p, p0 = 100 * float(primario[a]) / float(pib[a]), float(publicado[a])
        pct[a] = (abs(p - p0), 0.005 * abs(p0) + 0.001)
        rel[a] = abs(float(pib[a]) / float(implicito[a]) - 1)
    a_p = max(pct, key=lambda a: pct[a][0])
    a_f = min(pct, key=lambda a: pct[a][1] - pct[a][0])
    a_r = max(rel, key=rel.get)
    ok = all(d <= t for d, t in pct.values()) and all(r <= 0.005 for r in rel.values())
    return ok, (f"primário/PIB IBGE contra a aba 2.2-A: maior diferença {pct[a_p][0]:.5f} p.p. ({a_p}, tolerância "
                f"{pct[a_p][1]:.5f}); menor folga {pct[a_f][1] - pct[a_f][0]:.5f} p.p. ({a_f}); "
                f"PIB IBGE / implícito − 1: maior {100 * rel[a_r]:.5f}% ({a_r}), folga {100 * (0.005 - rel[a_r]):.5f}%")


CASOS_NOME = {
    "1.3 -  Arrecadação Líquida para o RGPS": "Arrecadação Líquida para o RGPS",
    "2. TRANSF. POR REPARTIÇÃO DE RECEITA 2/": "TRANSF. POR REPARTIÇÃO DE RECEITA",
    "1.1.09    CIDE - Combustíveis": "CIDE - Combustíveis",
    "3. RECEITA LÍQUIDA  (1-2)": "RECEITA LÍQUIDA (1-2)",
    "5. RESULTADO PRIMÁRIO GOVERNO CENTRAL - ACIMA DA LINHA (3 - 4)":
        "RESULTADO PRIMÁRIO GOVERNO CENTRAL - ACIMA DA LINHA (3 - 4)",
}
TOTAIS_COM_LINHAS = ("receita_total", "receita_liquida", "despesa_total", "primario_acima")


def t9_linhas_nomes(c, rtn):
    mapa = c[0]
    erros = [f"{k!r} -> {P.normalizar_nome(k)!r}" for k, v in CASOS_NOME.items() if P.normalizar_nome(k) != v]
    nomes = P.ler_nomes_linhas(rtn)
    linhas = P.montar_linhas(mapa, nomes)
    usados = {item["codigo"] for itens in linhas.values() for item in itens}
    sem_nome = sorted(cod for cod in usados if not nomes.get(cod, "").strip())
    ok = not erros and not sem_nome
    return ok, (f"{len(CASOS_NOME)} casos de normalização ({'; '.join(erros) or 'todos batem'}); "
                f"{len(usados)} códigos usados, sem nome na aba 1.2: {sem_nome or 'nenhum'}")


def t10_linhas_mapeamento(c, rtn):
    mapa = c[0]
    linhas = P.montar_linhas(mapa, P.ler_nomes_linhas(rtn))
    erros = []
    for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]:
        itens = linhas.get(n["id"], [])
        for op, chave in (("soma", "soma"), ("subtrai", "subtrai")):
            obtido = [i["codigo"] for i in itens if i["operacao"] == op]
            if obtido != n.get(chave, []):
                erros.append(f"{n['id']}.{op}: {obtido} != {n.get(chave, [])}")
    for k in TOTAIS_COM_LINHAS:
        itens = linhas.get(k, [])
        if [(i["codigo"], i["operacao"]) for i in itens] != [(mapa["totais"][k], "soma")]:
            erros.append(f"{k}: {itens}")
    esperadas = {n["id"] for n in mapa["receita"] + mapa["despesa"]} | {mapa["repasse"]["id"]} | set(TOTAIS_COM_LINHAS)
    extras = sorted(set(linhas) - esperadas)
    ok = not erros and not extras and set(linhas) == esperadas
    return ok, f"{len(linhas)} chaves (esperadas {len(esperadas)}); divergências: {erros or 'nenhuma'}; a mais: {extras or 'nenhuma'}"


def t12_estrutura(c):
    mapa = c[0]
    e = P.montar_estrutura(mapa)
    obrig = [n["id"] for n in mapa["despesa"] if n["grupo"] == "obrigatoria"]
    discr = [n["id"] for n in mapa["despesa"] if n["grupo"] == "discricionaria"]
    ids_nos = {n["id"] for n in mapa["receita"] + mapa["despesa"]} | {mapa["repasse"]["id"]}
    checagens = {
        "obrigatorias = ids do grupo obrigatório": sorted(e["obrigatorias"]) == sorted(obrig),
        "obrigatorias sem repetição": len(set(e["obrigatorias"])) == len(e["obrigatorias"]),
        "receita na ordem do mapeamento": e["receita"] == [n["id"] for n in mapa["receita"]],
        "repasse": e["repasse"] == mapa["repasse"]["id"],
        "discricionarias": [e["discricionarias"]] == discr,
        "ids existem entre os nós": set(e["receita"] + e["obrigatorias"] + [e["repasse"], e["discricionarias"]]) <= ids_nos,
    }
    falhas = [k for k, ok in checagens.items() if not ok]
    return not falhas, f"{len(checagens)} checagens; falharam: {falhas or 'nenhuma'}; ordem: {e['obrigatorias']}"


# Nós com 2 ou mais subcontas e quantas são (design da fase 3, "Subcontas")
SUBCONTAS_ESPERADAS = {
    "imposto_renda": 3, "contribuicao_inss": 2, "cofins_pis": 2, "iof_ipi_importacao": 7,
    "royalties_dividendos_outras": 12, "repasse_estados_municipios": 6, "aposentadorias_pensoes": 2,
    "demais_controle_fluxo": 3, "fundeb_seguro_desemprego_outras": 19, "discricionarias": 9,
}
TOL_SUBCONTAS = 0.02  # R$ milhões: 3 casas por valor, até 0,0005 por subconta, 19 × 0,0005 = 0,0095
# Meses em que a própria aba 1.2 não fecha: a linha-pai difere da soma das filhas diretas. O resíduo vem da planilha do
# Tesouro (seriehistoricajul26.xlsx), não do arredondamento do pipeline. Medido em 26/10/2026, R$ milhões correntes:
#   4.1 − (4.1.1 + 4.1.2) em ago/2016 = +0,0176 (vira R$ 0,028 mi em 2016, a preços de dez/2025, acima dos 0,02 do
#   arredondamento); em mai/2015 = −0,0001.
# Um mês com resíduo fora desta lista derruba o T14 de propósito: é uma revisão da série a conferir antes de publicar.
RESIDUOS_FONTE = {("aposentadorias_pensoes", "2015-05"), ("aposentadorias_pensoes", "2016-08")}
# A folga pelo resíduo vale só nestes nós e anos; em qualquer outro, |Σ subcontas − nó| ≤ TOL_SUBCONTAS, sem folga.
FOLGA_RESIDUO = {("aposentadorias_pensoes", 2015), ("aposentadorias_pensoes", 2016)}


def _subcontas(c, rtn):
    mapa, M, nos, totais, ipca = c
    fator = pd.Series(P.fator_deflacao(ipca, M.columns, mapa["mes_base_padrao"]), index=M.columns)
    return P.montar_subcontas(mapa, M, fator, P.ler_nomes_linhas(rtn)), fator


def t14_subcontas_fecham(c, rtn):
    mapa, M, nos, totais, _ = c
    sub, fator = _subcontas(c, rtn)
    residuos, residuo_mes = {}, {}
    for no, itens in sub.get(mapa["anos"][1], {}).items():
        r = nos[no] - sum(M.loc[i["codigo"]] for i in itens)
        for m, v in r[r.abs() > 1e-6].items():
            residuos[(no, f"{m:%Y-%m}")] = float(v)
            residuo_mes[(no, m)] = float(v)
    pior, onde, pior_arred, excedeu = 0.0, None, 0.0, []
    for ano, por_no in sub.items():
        for no, itens in por_no.items():
            for chave, f in (("real", fator), ("nominal", 1.0)):
                arred = sum(i[chave] for i in itens)
                bruto = sum(float(P.por_ano(M.loc[i["codigo"]] * f)[ano]) for i in itens)
                pior_arred = max(pior_arred, abs(arred - bruto))
                dif = abs(arred - float(P.por_ano(nos[no] * f)[ano]))
                folga = TOL_SUBCONTAS
                if (no, ano) in FOLGA_RESIDUO:
                    folga += sum(abs(v) * (float(fator[m]) if chave == "real" else 1.0)
                                 for (n2, m), v in residuo_mes.items() if n2 == no and m.year == ano)
                if dif > folga:
                    excedeu.append(f"{no} {ano} {chave}: {dif:.4f} > {folga:.4f}")
                if dif > pior:
                    pior, onde = dif, f"{no} {ano} {chave}"
    anos = list(range(mapa["anos"][0], mapa["anos"][1] + 1))
    contagens = {ano: {no: len(v) for no, v in por_no.items()} for ano, por_no in sub.items()}
    fundeb = [i["codigo"] for i in sub[2025]["fundeb_seguro_desemprego_outras"]] if 2025 in sub else []
    ir = [i["codigo"] for i in sub[2025].get("imposto_renda", [])] if 2025 in sub else []
    checagens = {
        "11 anos": sorted(sub) == anos,
        "10 nós com as contagens do design, em todos os anos": all(v == SUBCONTAS_ESPERADAS for v in contagens.values()),
        "Fundeb sem 4.3.05": "4.3.05" not in fundeb,
        "Imposto de Renda = 1.1.03.1, 1.1.03.2, 1.1.03.3": ir == ["1.1.03.1", "1.1.03.2", "1.1.03.3"],
        f"arredondamento das subcontas ≤ {TOL_SUBCONTAS}": pior_arred <= TOL_SUBCONTAS,
        "resíduo da aba 1.2 só nos meses conhecidos": set(residuos) <= RESIDUOS_FONTE,
        "meses conhecidos só nos nós e anos com folga": all((no, int(m[:4])) in FOLGA_RESIDUO for no, m in RESIDUOS_FONTE),
        f"somas fecham com o nó (≤ {TOL_SUBCONTAS}; + o resíduo do mês só em {sorted(FOLGA_RESIDUO)})": not excedeu,
    }
    falhas = [k for k, ok in checagens.items() if not ok]
    det_res = "; ".join(f"{no} {m}: {v:+.4f}" for (no, m), v in sorted(residuos.items())) or "nenhum"
    return not falhas, (f"{sum(len(v) for v in sub.get(2025, {}).values())} subcontas em {len(sub.get(2025, {}))} nós; "
                        f"maior |Σ subcontas − nó| R$ {pior:.4f} mi ({onde}); arredondamento até R$ {pior_arred:.4f} mi; "
                        f"resíduo mensal da aba 1.2 (R$ mi correntes): {det_res}; acima da folga: {excedeu[:4] or 'nenhum'}; "
                        f"falharam: {falhas or 'nenhuma'}")


def t15_subcontas_codigos(c, rtn):
    mapa, M, *_ = c
    nomes = P.ler_nomes_linhas(rtn)
    sub, _ = _subcontas(c, rtn)
    subtrai = {cod for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"] for cod in n.get("subtrai", [])}
    codigos = {i["codigo"] for por_no in sub.values() for itens in por_no.values() for i in itens}
    sem_nome = sorted(cod for cod in codigos if not nomes.get(cod, "").strip())
    nome_errado = sorted({i["codigo"] for por_no in sub.values() for itens in por_no.values() for i in itens
                          if i["nome"] != nomes.get(i["codigo"])})
    de_subtrai = sorted(codigos & subtrai)
    posicao = {cod: k for k, cod in enumerate(M.index)}
    fora_de_ordem = sorted({no for por_no in sub.values() for no, itens in por_no.items()
                            if [posicao[i["codigo"]] for i in itens] != sorted(posicao[i["codigo"]] for i in itens)})
    ok = bool(codigos) and not sem_nome and not nome_errado and not de_subtrai and not fora_de_ordem
    return ok, (f"{len(codigos)} códigos; sem nome na aba 1.2: {sem_nome or 'nenhum'}; nome diferente do da aba 1.2: "
                f"{nome_errado or 'nenhum'}; de subtrai: {de_subtrai or 'nenhum'}; fora da ordem da aba 1.2: "
                f"{fora_de_ordem or 'nenhum'}")


def _reais(c):
    """Séries mensais em R$ constantes do mês-base: linhas do RTN (código x mês) e nós."""
    mapa, M, nos, totais, ipca = c
    fator = pd.Series(P.fator_deflacao(ipca, M.columns, mapa["mes_base_padrao"]), index=M.columns)
    return M * fator, {k: v * fator for k, v in nos.items()}


# Nomes próprios com dígito aceitos no texto das notas: a lista fechada vem do pipeline (fonte única). Cada termo sai do
# texto, exatamente como escrito, antes da procura por dígitos; qualquer outro dígito numa nota derruba o T16.
TERMOS_COM_DIGITO = P.TERMOS_COM_DIGITO
TERMOS_COM_DIGITO_APROVADOS = ("Covid-19",)  # a conferência: a lista do pipeline tem de ser exatamente esta


def _sem_marcadores(texto):
    texto = re.sub(P.MARCADOR, "", texto)
    for termo in TERMOS_COM_DIGITO:
        texto = texto.replace(termo, "")
    return texto


def t16_notas_sem_digitos():
    notas = P.carregar_notas()
    com_digito = [f"{n['ano']} {n['no']}: {_sem_marcadores(n['texto'])!r}" for n in notas
                  if re.search(r"\d", _sem_marcadores(n["texto"]))]
    lista_fechada = TERMOS_COM_DIGITO == TERMOS_COM_DIGITO_APROVADOS
    return bool(notas) and not com_digito and lista_fechada, (
        f"{len(notas)} notas; com dígito fora dos marcadores: {com_digito or 'nenhuma'}; termos com dígito aceitos: "
        f"{list(TERMOS_COM_DIGITO)} (lista fechada: {lista_fechada})")


def _no_do_mapa(mapa, no_id):
    return next(n for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"] if n["id"] == no_id)


def _descendentes(raizes, codigos_aba):
    return {c for c in codigos_aba if any(c == r or c.startswith(r + ".") for r in raizes)}


def _linhas_L(mapa, no_id, codigos_aba):
    """L: as linhas de soma do nó e todas as suas descendentes."""
    return _descendentes(_no_do_mapa(mapa, no_id)["soma"], codigos_aba)


def _linhas_X(mapa, no_id, codigos_aba):
    """X: as linhas de subtrai do nó e suas descendentes, mais os totais do mapeamento (1 a 5)."""
    return _descendentes(_no_do_mapa(mapa, no_id).get("subtrai", []), codigos_aba) | set(mapa["totais"].values())


def _maes_do_no(mapa, no_id):
    """Linha-mãe direta de cada linha de soma (a Nota 21 do boletim fala da 4.4.1, mãe da 4.4.1.2)."""
    return {r.rsplit(".", 1)[0] for r in _no_do_mapa(mapa, no_id)["soma"] if "." in r}


def _codigos_das_fontes(n):
    """Linhas do RTN citadas pelas fontes da nota: `linhas` (fatos) ou `linha_rtn` e `menciona` de cada citação."""
    codigos = set()
    for f in P.citacoes(n["fonte"]):
        codigos |= set(f.get("linhas", [])) if f.get("tipo") == "serie" else {f.get("linha_rtn"), f.get("menciona")}
    return codigos - {None}


def t23_termos_com_digito():
    # A lista fechada aprovada, escrita aqui de propósito: um termo novo no pipeline (e em TERMOS_COM_DIGITO_APROVADOS)
    # derruba este teste, no testes.py e no pytest, até alguém aprovar e mudar esta linha.
    aprovada = ("Covid-19",)
    ok = P.TERMOS_COM_DIGITO == aprovada and TERMOS_COM_DIGITO is P.TERMOS_COM_DIGITO
    return ok, (f"termos com dígito no pipeline: {list(P.TERMOS_COM_DIGITO)}; aprovados: {list(aprovada)}; "
                f"fonte única: {TERMOS_COM_DIGITO is P.TERMOS_COM_DIGITO}")


def t17_notas_comparacoes(c, rtn, notas=None):
    mapa, M, *_ = c
    R, nos_reais = _reais(c)
    ids = {n["id"] for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]}
    falsas, avaliadas, erros = [], [], []
    for n in (P.carregar_notas() if notas is None else notas):
        quem = f"{n['ano']} {n['no']} ({n['classe']})"
        for a, op, b in n.get("comparacoes", []):
            va, vb = (P.valor_marcador(x, n["ano"], R, nos_reais) for x in (a, b))
            ok = {"<": va < vb, ">": va > vb}[op]
            avaliadas.append(f"{n['ano']} {a} {op} {b}: {va / 1000:.1f} {op} {vb / 1000:.1f} bi")
            if not ok:
                falsas.append(avaliadas[-1])
        if n["no"] not in ids:
            erros.append(f"{quem}: nó inexistente no mapeamento")
            continue
        # Regra única: marcadores e menciona em L e fora de X; linha_rtn em L ou mãe direta de uma linha de soma, nunca em X
        L, X = _linhas_L(mapa, n["no"], M.index), _linhas_X(mapa, n["no"], M.index)
        citadas, das_fontes = P.linhas_citadas(n), _codigos_das_fontes(n)
        fora_do_no = sorted(c for c in citadas if c not in L or c in X)
        if fora_do_no:
            erros.append(f"{quem}: marcadores com linhas fora do nó {fora_do_no}")
        if not citadas <= das_fontes:
            erros.append(f"{quem}: marcadores com linhas fora da fonte {sorted(citadas - das_fontes)}")
        if n["classe"] == "contexto":
            for f in P.citacoes(n["fonte"]):
                if f.get("menciona") not in L or f.get("menciona") in X:
                    erros.append(f"{quem}: menciona {f.get('menciona')} fora do nó")
                if f.get("linha_rtn") not in L | _maes_do_no(mapa, n["no"]) or f.get("linha_rtn") in X:
                    erros.append(f"{quem}: linha_rtn {f.get('linha_rtn')} fora do nó e da linha-mãe, ou em subtrai/totais")
    ok = bool(avaliadas) and not falsas and not erros
    return ok, (f"{len(avaliadas)} comparações ({'; '.join(avaliadas)}); falsas: {falsas or 'nenhuma'}; "
                f"nó, linhas e fontes: {erros or 'tudo certo'}")


def t18_notas_fontes(c, rtn):
    R, nos_reais = _reais(c)
    nomes = P.ler_nomes_linhas(rtn)
    citacao = {"tipo": "boletim", "publicacao": "Publicação", "pagina": 1, "nota": "Nota 1", "endereco": "https://exemplo",
               "verificado_em": "2026-01-01"}

    def nota(fonte):
        return {"ano": 2020, "no": "bolsa_familia", "classe": "contexto", "texto": "Texto.", "fonte": fonte}

    def levanta(fonte):
        try:
            P.aplicar_notas([nota(fonte)], 2020, R, nomes, nos_reais)
            return False
        except ValueError:
            return True

    # a fonte é sempre lista: uma citação fora de lista é ValueError, e também sem página ou sem nota em qualquer citação
    levantou = {f"{falta} na citação {i + 1} de 2": levanta([{k: v for k, v in citacao.items() if not (j == i and k == falta)}
                                                          for j in range(2)])
                for falta in ("pagina", "nota") for i in range(2)}
    levantou["citação fora de lista"] = levanta(citacao)
    completas = {"lista de 1": nota([citacao]), "lista de 2": nota([citacao, dict(citacao, nota="Nota 2")])}
    gravadas = {k: P.aplicar_notas([n], 2020, R, nomes, nos_reais)[0]["fonte"] for k, n in completas.items()}
    em_lista = all(isinstance(f, list) and all(c["pagina"] and c["nota"] for c in f) for f in gravadas.values())
    classes = sorted({n["classe"] for n in P.carregar_notas()})
    ok = all(levantou.values()) and em_lista and set(classes) <= set(P.CLASSES_NOTA)
    return ok, (f"fonte de contexto incompleta levanta ValueError: {levantou}; fonte completa gravada como lista: "
                f"{em_lista}; classes em notas.json: {classes}")


# Notas de contexto de 2020: boletim do RTN de dezembro de 2020, Notas Explicativas do resultado acumulado (página 9 do PDF)
PUBLICACAO_RTN_2020 = "Resultado do Tesouro Nacional, dezembro de 2020"
ENDERECO_RTN_2020 = "https://www.tesourotransparente.gov.br/publicacoes/boletim-resultado-do-tesouro-nacional-rtn/2020/12"
# nó -> notas do boletim citadas pela nota, em ordem
NOTAS_CONTEXTO_2020 = {("fundeb_seguro_desemprego_outras", ("Nota 18",)),
                       ("fundeb_seguro_desemprego_outras", ("Nota 16", "Nota 18")),
                       ("bolsa_familia", ("Nota 21",))}
CAMPOS_FONTE_T19 = ("tipo", "publicacao", "boletim", "pagina", "nota", "nota_na_tabela", "endereco", "verificado_em",
                    "arquivo_sha256", "trecho", "linha_rtn", "menciona")
# O texto das Notas Explicativas (p. 9) e a tabela do resultado acumulado (p. 7) numeram as notas de jeitos diferentes
NOTA_NA_TABELA = {f"Nota {texto}": f"Nota {tabela} da tabela do resultado acumulado (p. 7)"
                  for texto, tabela in (("16", "15"), ("18", "17"), ("21", "20"))}
OBSERVACAO_NUMERACAO = "a numeração segue o texto das Notas Explicativas, p. 9; a tabela da p. 7 numera diferente"
# SHA256 do PDF do boletim baixado pelo Bruno (Get-FileHash), o mesmo de referencias/boletim-dez-2020.json
SHA256_PDF_RTN_2020 = "1417803c9eddbca4ece724d264138a2d0c44d1b8c0a024699d763c0fcda423ef"
# Nota 21 do boletim: queda real do Bolsa Família de 2019 para 2020, em % (preços de dez/2020; a nossa série usa dez/2025,
# mas a variação real entre dois anos não depende do mês-base)
QUEDA_REAL_BOLSA_FAMILIA_NOTA_21 = -44.3
# Quantificadores que as notas de contexto não usam (o boletim não diz que o auxílio é a maior parte de nada)
QUANTIFICADORES_PROIBIDOS = r"\b(maior parte|maioria|maior fatia|grande parte|quase tod[oa]s?|praticamente tod[oa]s?)\b"
TOL_QUEDA_BOLSA_FAMILIA = 0.2  # pontos percentuais


def no_da_linha(mapa, codigo):
    """Id do nó cujas linhas de soma contêm o código (ele mesmo ou um ancestral), fora das linhas de subtrai."""
    dentro = lambda c, raizes: any(c == r or c.startswith(r + ".") for r in raizes)
    nos = [n["id"] for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]
           if dentro(codigo, n["soma"]) and not dentro(codigo, n.get("subtrai", []))]
    return nos[0] if len(nos) == 1 else None


def t19_notas_contexto(c, rtn, notas=None):
    mapa, M, nos, *_ = c
    nomes = P.ler_nomes_linhas(rtn)
    contexto = [n for n in (P.carregar_notas() if notas is None else notas) if n["classe"] == "contexto"]
    erros = []
    for n in contexto:
        for f in P.citacoes(n["fonte"]):
            quem = f"{n['ano']} {n['no']} {f.get('nota')}"
            faltam = [k for k in CAMPOS_FONTE_T19 if f.get(k) in (None, "")]
            if faltam:
                erros.append(f"{quem}: sem {faltam}")
                continue
            if not isinstance(f["pagina"], int) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", f["verificado_em"]):
                erros.append(f"{quem}: página não inteira ou data fora de AAAA-MM-DD")
            if len(f["trecho"]) > 200 or len(f["trecho"].split()) >= 15:
                erros.append(f"{quem}: trecho longo")
            if f["publicacao"] != PUBLICACAO_RTN_2020 or f["endereco"] != ENDERECO_RTN_2020:
                erros.append(f"{quem}: publicação ou endereço")
            if f["nota_na_tabela"] != NOTA_NA_TABELA.get(f["nota"].split(" das ")[0]):
                erros.append(f"{quem}: nota_na_tabela {f['nota_na_tabela']}")
            if f["tipo"] != "boletim":
                erros.append(f"{quem}: tipo {f['tipo']} numa nota de contexto")
            if f["arquivo_sha256"] != SHA256_PDF_RTN_2020 or f["arquivo_sha256"] != _ler_json(BOLETIM_2020)["fonte"]["arquivo_sha256"]:
                erros.append(f"{quem}: arquivo_sha256")
            if f["linha_rtn"] not in nomes or f["menciona"] not in nomes:
                erros.append(f"{quem}: linha_rtn ou menciona fora da aba 1.2")
            elif no_da_linha(mapa, f["menciona"]) != n["no"]:
                erros.append(f"{quem}: menciona {f['menciona']} é do nó {no_da_linha(mapa, f['menciona'])}")
        if n.get("observacao") != OBSERVACAO_NUMERACAO:
            erros.append(f"{n['ano']} {n['no']}: observação da numeração (uma vez por nota)")
        quantificadores = re.findall(QUANTIFICADORES_PROIBIDOS, n["texto"], re.I)
        if quantificadores:
            erros.append(f"{n['ano']} {n['no']}: quantificador proibido {quantificadores}")
    frases = [fr for n in contexto if n["ano"] == 2020 for fr in re.split(r"(?<=[.!?])\s+", n["texto"])]
    pessoas = [fr for fr in frases if "pessoas" in fr and "{codigo:4.3.07}" in fr]
    governos = [fr for fr in frases if "Estados" in fr and "{codigo:4.3.03}" in fr]
    juntos = [fr for fr in frases if "pessoas" in fr and "Estados" in fr]
    if not pessoas or not governos or juntos:
        erros.append(f"auxílio a pessoas e a Estados e Municípios em frases separadas: pessoas {len(pessoas)}, "
                     f"Estados {len(governos)}, na mesma frase {len(juntos)}")
    presentes = {(n["no"], tuple(f.get("nota", "").split(" das ")[0] for f in P.citacoes(n["fonte"])))
                 for n in contexto if n["ano"] == 2020}
    if presentes != NOTAS_CONTEXTO_2020:
        erros.append(f"notas de 2020: {sorted(presentes)} (esperadas {sorted(NOTAS_CONTEXTO_2020)})")
    bf = P.por_ano(nos["bolsa_familia"] * pd.Series(P.fator_deflacao(c[4], M.columns, mapa["mes_base_padrao"]), index=M.columns))
    queda = 100 * (float(bf[2020]) / float(bf[2019]) - 1)
    if abs(queda - QUEDA_REAL_BOLSA_FAMILIA_NOTA_21) > TOL_QUEDA_BOLSA_FAMILIA:
        erros.append(f"queda real do Bolsa Família {queda:.3f}% contra {QUEDA_REAL_BOLSA_FAMILIA_NOTA_21}% da Nota 21")
    return not erros, (f"{len(contexto)} notas de contexto; queda real do Bolsa Família 2019→2020 na série {queda:.3f}% "
                       f"(Nota 21: {QUEDA_REAL_BOLSA_FAMILIA_NOTA_21}%, tolerância {TOL_QUEDA_BOLSA_FAMILIA}); "
                       f"problemas: {erros or 'nenhum'}")


DADOS = P.AQUI / "dados"
BOLETIM_2020 = P.AQUI / "referencias" / "boletim-dez-2020.json"
TOL_ORACULO = 0.001  # R$ milhões: o JSON grava 3 casas (erro de até 0,0005)
_MESES_ORACULO = {"janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
                  "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}


def _ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def _oraculo_aba12(rtn):
    """Leitura própria da aba 1.2, sem o pipeline: código -> {mês: valor em R$ milhões correntes} e a ordem dos códigos."""
    bruto = pd.read_excel(rtn, sheet_name="1.2", header=None)
    rotulos = bruto[0].astype(str)
    h = rotulos[rotulos.str.startswith("Discriminação")].index[0]
    meses = pd.to_datetime(bruto.iloc[h, 1:], errors="coerce")
    serie, ordem = {}, []
    for i in range(h + 1, len(bruto)):
        if pd.isna(bruto.iloc[i, 0]):
            continue
        cod = str(bruto.iloc[i, 0]).split()[0].rstrip(".")
        if cod in serie:
            continue
        valores = pd.to_numeric(bruto.iloc[i, 1:], errors="coerce")
        serie[cod] = {m: (0.0 if pd.isna(v) else float(v)) for m, v in zip(meses, valores) if pd.notna(m)}
        ordem.append(cod)
    return serie, ordem


def _oraculo_ipca(csv):
    """Leitura própria do IPCA do SIDRA (tabela 1737): {mês: número-índice}."""
    with open(csv, encoding="utf-8-sig") as f:
        linhas = [[c.strip('"') for c in l.split(";")] for l in f.read().splitlines()]
    i = next(k for k, l in enumerate(linhas) if len(l) > 2 and l[1].split(" ")[0].lower() in _MESES_ORACULO)
    return {pd.Timestamp(int(m.split()[1]), _MESES_ORACULO[m.split()[0].lower()], 1):
            float(v.replace(".", "").replace(",", ".")) for m, v in zip(linhas[i][1:], linhas[i + 1][1:])}


def _oraculo_codigos(n, ordem):
    """Filhas diretas de cada linha de soma (ou a própria linha), menos subtrai, na ordem da aba; None se menos de 2."""
    codigos = []
    for s in n["soma"]:
        filhas = [c for c in ordem if c.startswith(s + ".") and c.count(".") == s.count(".") + 1]
        codigos += filhas or [s]
    codigos = sorted((c for c in codigos if c not in n.get("subtrai", [])), key=ordem.index)
    return codigos if len(codigos) >= 2 else None


def t20_subcontas_oraculo(rtn, ipca_csv, pasta=DADOS):
    mapa = P.carregar_mapeamento()
    serie, ordem = _oraculo_aba12(rtn)
    ipca = _oraculo_ipca(ipca_csv)
    erros, pior, n_val = [], 0.0, 0
    for ano in range(mapa["anos"][0], mapa["anos"][1] + 1):
        d = _ler_json(Path(pasta) / f"{ano}.json")
        base = pd.Timestamp(d["mes_base"])
        esperados = {n["id"]: _oraculo_codigos(n, ordem) for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]}
        esperados = {k: v for k, v in esperados.items() if v}
        gravados = {no: [i["codigo"] for i in itens] for no, itens in d["subcontas"].items()}
        if gravados != esperados:
            erros.append(f"{ano}: códigos {gravados} != {esperados}")
            continue
        for no, itens in d["subcontas"].items():
            for i in itens:
                meses = {m: v for m, v in serie[i["codigo"]].items() if m.year == ano}
                nominal = sum(meses.values())
                real = sum(v * ipca[base] / ipca[m] for m, v in meses.items())
                for chave, x in (("nominal", nominal), ("real", real)):
                    dif = abs(i[chave] - x)
                    n_val += 1
                    if dif > pior:
                        pior = dif
                    if dif > TOL_ORACULO:
                        erros.append(f"{ano} {no} {i['codigo']} {chave}: JSON {i[chave]} × oráculo {x:.3f}")
    return not erros and n_val > 0, (f"{n_val} valores (subconta × real/nominal × ano) recalculados; maior diferença "
                                     f"R$ {pior:.4f} mi (limite {TOL_ORACULO}); erros: {erros[:5] or 'nenhum'}")


def _valor_no_json(d, codigo, chave="nominal"):
    """Valor de uma linha do RTN no AAAA.json: como subconta, ou como nó formado só por ela."""
    for itens in d["subcontas"].values():
        for i in itens:
            if i["codigo"] == codigo:
                return i[chave]
    for no, linhas in d["linhas"].items():
        if [(l["codigo"], l["operacao"]) for l in linhas] == [(codigo, "soma")] and no in d[chave]["nos"]:
            return d[chave]["nos"][no]
    raise KeyError(codigo)


def t21_subcontas_boletim(caminho=BOLETIM_2020, pasta=DADOS):
    # Tolerância de 0,1% (tolerancia_relativa da referência); observado 0,026% e 0,040%. Uma revisão do Tesouro acima de
    # 0,1% entre o boletim e a série histórica falha de propósito: é para ser conferida antes de publicar.
    ref = _ler_json(caminho)
    d = _ler_json(Path(pasta) / f"{ref['ano']}.json")
    tol, linhas, falhas = ref["tolerancia_relativa"], [], []
    for v in ref["valores"]:
        x = _valor_no_json(d, v["codigo"])
        rel = x / v["valor"] - 1
        linhas.append(f"{v['codigo']} {x:,.1f} × {v['valor']:,.1f} (p. {v['pagina']}, {100 * rel:+.3f}%)")
        if abs(rel) > tol:
            falhas.append(v["codigo"])
    return bool(ref["valores"]) and not falhas, (f"{len(ref['valores'])} linhas de {ref['ano']} contra o boletim (limite "
                                                f"{100 * tol:.1f}%): {'; '.join(linhas)}; fora: {falhas or 'nenhuma'}")


# Esquema dos dados publicados e de notas.json, conferido em Python puro (sem dependência nova)
CHAVES_ANO = {"ano", "unidade", "mes_base", "versao_dados", "mapeamento_versao", "rotulos", "grupos_despesa", "linhas",
              "estrutura", "nominal", "real", "pib", "subcontas", "notas"}
CAMPOS_CITACAO = {
    "serie": {"tipo": str, "titulo": str, "linhas": list, "nota": (str, type(None)), "nota_na_tabela": (str, type(None))},
    "boletim": {"tipo": str, "publicacao": str, "boletim": str, "base_precos": str, "pagina": int, "nota": str,
                "nota_na_tabela": (str, type(None)), "endereco": str, "verificado_em": str, "arquivo_sha256": str,
                "trecho": str, "linha_rtn": str, "menciona": str},
}
TIPO_DA_CLASSE = {"fatos": "serie", "contexto": "boletim"}


def _erros_citacao(c, quem, classe):
    if not isinstance(c, dict):
        return [f"{quem}: citação não é objeto"]
    tipo = c.get("tipo")
    if tipo not in CAMPOS_CITACAO:
        return [f"{quem}: tipo {tipo!r} (esperado serie ou boletim)"]
    erros = [] if tipo == TIPO_DA_CLASSE[classe] else [f"{quem}: citação {tipo} numa nota de {classe}"]
    for k, t in CAMPOS_CITACAO[tipo].items():
        if k not in c:
            erros.append(f"{quem}: sem {k}")
        elif not isinstance(c[k], t) or isinstance(c[k], bool):
            erros.append(f"{quem}: {k} com tipo {type(c[k]).__name__}")
    if tipo == "serie" and not all(isinstance(x, str) for x in c.get("linhas", [])):
        erros.append(f"{quem}: linhas não são texto")
    if tipo == "boletim":
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(c.get("verificado_em"))):
            erros.append(f"{quem}: verificado_em fora de AAAA-MM-DD")
        if not re.fullmatch(r"[0-9a-f]{64}", str(c.get("arquivo_sha256"))):
            erros.append(f"{quem}: arquivo_sha256 não é SHA256 em minúsculas")
    return erros


def _erros_nota(n, quem, publicada):
    if not isinstance(n, dict):
        return [f"{quem}: nota não é objeto"]
    erros = []
    obrigatorias = {"no": str, "classe": str, "texto": str, "fonte": list, "observacao": (str, type(None))}
    if publicada:
        obrigatorias["base_precos"] = (str, type(None))
    else:
        obrigatorias["ano"] = int
    for k, t in obrigatorias.items():
        if k not in n:
            erros.append(f"{quem}: sem {k}")
        elif not isinstance(n[k], t) or isinstance(n[k], bool):
            erros.append(f"{quem}: {k} com tipo {type(n[k]).__name__}")
    if n.get("classe") not in TIPO_DA_CLASSE:
        return erros + [f"{quem}: classe {n.get('classe')!r}"]
    if isinstance(n.get("fonte"), list):
        if not n["fonte"]:
            erros.append(f"{quem}: fonte vazia")
        for i, c in enumerate(n["fonte"], 1):
            erros += _erros_citacao(c, f"{quem} citação {i}", n["classe"])
    for comp in n.get("comparacoes", []):
        if not (isinstance(comp, list) and len(comp) == 3 and comp[1] in ("<", ">")):
            erros.append(f"{quem}: comparação malformada {comp}")
    return erros


def t22_esquema(pasta=DADOS, caminho_notas=None):
    erros, n_notas = [], 0
    notas = _ler_json(caminho_notas or P.AQUI / "notas.json")
    if not isinstance(notas, list):
        erros.append("notas.json não é lista")
        notas = []
    for i, n in enumerate(notas):
        erros += _erros_nota(n, f"notas.json[{i}]", publicada=False)
    indice = _ler_json(Path(pasta) / "indice.json")
    for ano in range(indice["anos"][0], indice["anos"][1] + 1):
        d = _ler_json(Path(pasta) / f"{ano}.json")
        if set(d) != CHAVES_ANO:
            erros.append(f"{ano}.json: chaves {sorted(set(d) ^ CHAVES_ANO)}")
        pib = d.get("pib", {})
        if not (isinstance(pib.get("valor_nominal"), float) and isinstance(pib.get("fonte"), str)
                and pib.get("trimestres") == 4 and re.fullmatch(r"\d{4}T[1-4]", str(pib.get("ultimo_trimestre")))):
            erros.append(f"{ano}.json: bloco pib")
        for no, itens in d.get("subcontas", {}).items():
            if not isinstance(itens, list) or not all(
                    isinstance(i, dict) and set(i) == {"codigo", "nome", "real", "nominal"} and isinstance(i["codigo"], str)
                    and isinstance(i["nome"], str) and all(isinstance(i[k], (int, float)) for k in ("real", "nominal"))
                    for i in itens):
                erros.append(f"{ano}.json: subcontas de {no}")
        if not isinstance(d.get("notas"), list):
            erros.append(f"{ano}.json: notas não é lista")
            continue
        for j, n in enumerate(d["notas"]):
            n_notas += 1
            erros += _erros_nota(n, f"{ano}.json notas[{j}]", publicada=True)
    return not erros, (f"notas.json ({len(notas)} notas) e {indice['anos'][1] - indice['anos'][0] + 1} AAAA.json "
                       f"({n_notas} notas publicadas): {erros[:6] or 'esquema certo'}")


def t11_determinismo(rtn, ipca, pib):
    a = json.dumps(P.montar_anos(rtn, ipca, pib)[0], ensure_ascii=False)
    b = json.dumps(P.montar_anos(rtn, ipca, pib)[0], ensure_ascii=False)
    return a == b, f"duas gerações: {len(a)} caracteres, idênticas: {a == b}"


def lista_testes(c, rtn, ipca, pib):
    return [
        ("T1  Receita: soma dos 6 nós = receita total", lambda: t1_receita(c)),
        ("T2  Receita total − repasses = receita líquida", lambda: t2_receita_liquida(c)),
        ("T3  Despesa: soma dos 8 nós = despesa total", lambda: t3_despesa(c)),
        ("T4  Receita líquida − despesa = primário (linha 5)", lambda: t4_primario(c)),
        ("T5  Soma dos 12 meses = anual (aba 2.2), por linha", lambda: t5_mensal_anual(c, rtn)),
        ("T6  Deflação: base, cobertura do IPCA e Tesouro 1.2-A", lambda: t6_deflacao(c, rtn)),
        ("T7  Nenhum fluxo anual negativo", lambda: t7_sinais(c)),
        ("T8  Regressão: 2025 real bate com o gráfico original", lambda: t8_regressao(c)),
        ("A1  Âncora: boletim RTN de dez/2025 (2025 nominal)", lambda: a1_boletim(c)),
        ("A2  Âncora: financiamento (BC) e identidades 5+6+7=8, 8+9=10", lambda: a2_financiamento(c, rtn)),
        ("A3  Âncora: PIB do IBGE e déficit de 0,48% do PIB", lambda: a3_pib(c, pib)),
        ("A4  Âncora: primário/PIB contra a aba 2.2-A e PIB contra o implícito", lambda: a4_pib_ancora(c, rtn, pib)),
        ("T9  Linhas: códigos existem na aba 1.2 e nomes normalizados", lambda: t9_linhas_nomes(c, rtn)),
        ("T10 Linhas reproduzem soma/subtrai do mapeamento e os totais", lambda: t10_linhas_mapeamento(c, rtn)),
        ("T11 Gerar duas vezes dá JSON idêntico", lambda: t11_determinismo(rtn, ipca, pib)),
        ("T12 Estrutura: papéis e ordem fixa das obrigatórias", lambda: t12_estrutura(c)),
        ("T13 PIB do IBGE: 4 trimestres por ano, sem nulos", lambda: t13_pib_ibge(pib)),
        ("T14 Subcontas fecham com o nó, nos 11 anos (real e nominal)", lambda: t14_subcontas_fecham(c, rtn)),
        ("T15 Subcontas: códigos da aba 1.2, com nome, na ordem dela, nenhum de subtrai", lambda: t15_subcontas_codigos(c, rtn)),
        ("T16 Notas sem dígitos fora dos marcadores", lambda: t16_notas_sem_digitos()),
        ("T17 Notas: comparações verdadeiras e linhas citadas na fonte", lambda: t17_notas_comparacoes(c, rtn)),
        ("T18 Notas: contexto sem página ou nota na fonte falha", lambda: t18_notas_fontes(c, rtn)),
        ("T19 Notas de contexto de 2020: fonte completa, nó certo, auxílios separados", lambda: t19_notas_contexto(c, rtn)),
        ("T20 Subcontas do JSON contra um oráculo próprio (aba 1.2 e IPCA)", lambda: t20_subcontas_oraculo(rtn, ipca)),
        ("T21 Subcontas e Bolsa Família de 2020 contra o boletim de dez/2020", lambda: t21_subcontas_boletim()),
        ("T22 Esquema de notas.json e dos AAAA.json (fonte sempre lista de citações com tipo)", lambda: t22_esquema()),
        ("T23 Termos com dígito nas notas: lista fechada, só \"Covid-19\"", lambda: t23_termos_com_digito()),
    ]


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # no Windows, a saída redirecionada usa cp1252 e quebra em "−" e "→"
    ap = argparse.ArgumentParser()
    rtn0, ipca0, pib0 = P.entradas_padrao()
    ap.add_argument("--rtn", default=rtn0)
    ap.add_argument("--ipca", default=ipca0)
    ap.add_argument("--pib", default=pib0)
    a = ap.parse_args()
    if not a.rtn:
        try:
            P.escolher_rtn(P.AQUI / "entrada")
        except ValueError as e:
            ap.error(str(e))
        ap.error("nenhum arquivo entrada/seriehistorica*.xlsx encontrado; passe --rtn")
    c = contexto(a.rtn, a.ipca)
    testes = lista_testes(c, a.rtn, a.ipca, a.pib)
    falhas = 0
    for nome, fn in testes:
        try:
            ok, det = fn()
        except Exception as e:  # um teste que quebra conta como falha, e a bateria segue
            ok, det = False, f"exceção {type(e).__name__}: {e}"
        falhas += (not ok)
        print(f"[{'OK ' if ok else 'FALHOU'}] {nome}\n         {det}")
    print(f"\n{len(testes) - falhas}/{len(testes)} testes passaram")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
