"""Testes de validação do pipeline (seção 6 do documento + âncoras de conferência).

Uso (com os arquivos em entrada/):
    python testes.py
    python testes.py --rtn outro.xlsx --ipca outro.csv
Sai com código 1 se qualquer teste falhar (o pipeline não deve publicar nesse caso).
"""
import argparse
import json
import sys

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


def a3_pib(c, rtn):
    _, M, nos, totais, _ = c
    pib = P.pib_implicito(rtn)[2025]
    deficit = -float(totais["primario_acima"].groupby(totais["primario_acima"].index.year).sum()[2025])
    pct = 100 * deficit / pib
    ok = abs(pib / 1e6 - 12.7) < 0.1 and round(pct, 2) == 0.48
    return ok, f"PIB implícito 2025 = R$ {pib/1e6:.3f} tri (IBGE: R$ 12,7 tri); déficit/PIB = {pct:.3f}% (RTN: 0,48%)"


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


def t11_determinismo(rtn, ipca):
    a =json.dumps(P.montar_anos(rtn, ipca)[0], ensure_ascii=False)
    b = json.dumps(P.montar_anos(rtn, ipca)[0], ensure_ascii=False)
    return a == b, f"duas gerações: {len(a)} caracteres, idênticas: {a == b}"


def lista_testes(c, rtn, ipca):
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
        ("A3  Âncora: PIB implícito e déficit de 0,48% do PIB", lambda: a3_pib(c, rtn)),
        ("T9  Linhas: códigos existem na aba 1.2 e nomes normalizados", lambda: t9_linhas_nomes(c, rtn)),
        ("T10 Linhas reproduzem soma/subtrai do mapeamento e os totais", lambda: t10_linhas_mapeamento(c, rtn)),
        ("T11 Gerar duas vezes dá JSON idêntico", lambda: t11_determinismo(rtn, ipca)),
        ("T12 Estrutura: papéis e ordem fixa das obrigatórias", lambda: t12_estrutura(c)),
    ]


def main():
    ap = argparse.ArgumentParser()
    rtn0, ipca0 = P.entradas_padrao()
    ap.add_argument("--rtn", default=rtn0)
    ap.add_argument("--ipca", default=ipca0)
    a = ap.parse_args()
    if not a.rtn:
        ap.error("nenhum arquivo entrada/seriehistorica*.xlsx encontrado; passe --rtn")
    c = contexto(a.rtn, a.ipca)
    testes = lista_testes(c, a.rtn, a.ipca)
    falhas = 0
    for nome, fn in testes:
        ok, det = fn()
        falhas += (not ok)
        print(f"[{'OK ' if ok else 'FALHOU'}] {nome}\n         {det}")
    print(f"\n{len(testes) - falhas}/{len(testes)} testes passaram")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
