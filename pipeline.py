"""Pipeline do Sankey fiscal do Governo Central.

Lê a série histórica do RTN (Tesouro Transparente) e o IPCA (SIDRA, tabela 1737),
aplica o mapeamento de mapeamento.json, deflaciona mês a mês e grava um JSON por ano.

Uso (com os arquivos em entrada/):
    python pipeline.py
    python pipeline.py --base 2025-12      # mês-base da deflação (padrão do mapeamento)
    python pipeline.py --rtn outro.xlsx --ipca outro.csv --saida dados
"""
import argparse
import json
import re
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).parent
MESES = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}


def entradas_padrao():
    """Arquivos de entrada em entrada/: a série histórica mais recente (por nome) e o CSV do IPCA."""
    pasta = AQUI / "entrada"
    rtn = sorted(pasta.glob("seriehistorica*.xlsx"))
    return (str(rtn[-1]) if rtn else None), str(pasta / "tabela1737.csv")


def carregar_mapeamento(caminho=None):
    with open(caminho or AQUI / "mapeamento.json", encoding="utf-8") as f:
        return json.load(f)


def _codigo(rotulo):
    """'1.1.03    Imposto sobre a Renda' -> '1.1.03'; '5. RESULTADO ...' -> '5'."""
    return str(rotulo).split()[0].rstrip(".")


def normalizar_nome(rotulo):
    """Nome oficial da linha sem o código, o separador logo após o código, as notas finais e espaços sobrando.

    '1.3 -  Arrecadação Líquida para o RGPS' -> 'Arrecadação Líquida para o RGPS';
    '2. TRANSF. POR REPARTIÇÃO DE RECEITA 2/' -> 'TRANSF. POR REPARTIÇÃO DE RECEITA'.
    Hífens internos ficam: 'CIDE - Combustíveis', '... ACIMA DA LINHA (3 - 4)'.
    """
    s = str(rotulo).strip()
    s = s[len(s.split()[0]):]
    s = re.sub(r"^\s*-\s+", "", s)
    s = re.sub(r"(\s+\d+/)+\s*$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _corpo_aba(xlsx, aba):
    bruto = pd.read_excel(xlsx, sheet_name=aba, header=None)
    h = bruto.index[bruto[0].astype(str).str.startswith("Discriminação")][0]
    fim = bruto.index[bruto[0].astype(str).str.startswith("10. RESULTADO NOMINAL")][0]
    corpo = bruto.iloc[h + 1: fim + 1].copy()
    return bruto, h, corpo[corpo[0].notna()]


def ler_nomes_linhas(xlsx, aba="1.2"):
    """Código -> nome oficial normalizado, para as linhas da aba (um rótulo por linha, válido para a série toda)."""
    _, _, corpo = _corpo_aba(xlsx, aba)
    return {_codigo(r): normalizar_nome(r) for r in corpo[0]}


def montar_linhas(mapa, nomes):
    """Linhas do RTN que formam cada nó do mapeamento e cada total desenhado, na ordem soma e depois subtrai."""
    def item(codigo, operacao):
        return {"codigo": codigo, "nome": nomes[codigo], "operacao": operacao}

    linhas = {}
    for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]:
        linhas[n["id"]] = ([item(c, "soma") for c in n["soma"]]
                           + [item(c, "subtrai") for c in n.get("subtrai", [])])
    for k in ("receita_total", "receita_liquida", "despesa_total", "primario_acima"):
        linhas[k] = [item(mapa["totais"][k], "soma")]
    return linhas


def montar_estrutura(mapa):
    """Papéis dos nós e ordem fixa de desenho, para o site não depender de mapeamento.json."""
    discr = [n["id"] for n in mapa["despesa"] if n["grupo"] == "discricionaria"]
    if len(discr) != 1:
        raise ValueError(f"o desenho supõe uma única folha discricionária; há {discr}")
    return {
        "receita": [n["id"] for n in mapa["receita"]],
        "repasse": mapa["repasse"]["id"],
        "obrigatorias": list(mapa["desenho"]["ordem_obrigatorias"]),
        "discricionarias": discr[0],
    }


def ler_rtn_mensal(xlsx, aba="1.2"):
    """Devolve (DataFrame código x mês, último mês publicado). Valores em R$ milhões correntes."""
    bruto, h, corpo = _corpo_aba(xlsx, aba)
    datas = pd.to_datetime(bruto.iloc[h].iloc[1:], errors="coerce")
    corpo.index = [_codigo(r) for r in corpo[0]]
    if corpo.index.duplicated().any():
        raise ValueError(f"Códigos duplicados na aba {aba}: {list(corpo.index[corpo.index.duplicated()])}")
    corpo = corpo.drop(columns=0)
    corpo.columns = pd.to_datetime(datas.values)
    corpo = corpo.apply(pd.to_numeric, errors="coerce")
    corpo = corpo.loc[:, corpo.columns.notna()]
    return corpo, corpo.columns.max()


def ler_rtn_anual(xlsx, aba):
    """Aba anual (2.2 em R$ milhões, 2.2-A em % do PIB): DataFrame código x ano."""
    bruto = pd.read_excel(xlsx, sheet_name=aba, header=None)
    h = bruto.index[bruto[0].astype(str).str.startswith("Discriminação")][0]
    anos = pd.to_numeric(bruto.iloc[h].iloc[1:], errors="coerce")
    corpo = bruto.iloc[h + 1:].copy()
    corpo = corpo[corpo[0].notna() & corpo[0].astype(str).str.match(r"^\d")]
    corpo.index = [_codigo(r) for r in corpo[0]]
    corpo = corpo[~corpo.index.duplicated(keep="first")].drop(columns=0)
    corpo.columns = anos.astype("Int64").values
    return corpo.apply(pd.to_numeric, errors="coerce")


def ler_ipca(csv):
    """IPCA número-índice (dez/1993 = 100) do SIDRA, tabela 1737, em CSV com ';'. Série por mês."""
    linhas = open(csv, encoding="utf-8-sig").read().splitlines()
    # a linha de meses é a primeira com mais de 2 campos cujo segundo campo contém um nome de mês;
    # a linha seguinte traz os valores
    i = next(k for k, l in enumerate(linhas)
             if len(l.split(";")) > 2 and any(m in l.split(";")[1].lower() for m in MESES))
    meses = [c.strip('"') for c in linhas[i].split(";")][1:]
    valores = [c.strip('"') for c in linhas[i + 1].split(";")][1:]
    serie = {}
    for m, v in zip(meses, valores):
        nome, ano = m.split()
        serie[pd.Timestamp(int(ano), MESES[nome], 1)] = float(v.replace(".", "").replace(",", "."))
    return pd.Series(serie).sort_index()


def fator_deflacao(ipca, meses, base):
    """Fator que leva um valor do mês m para preços do mês-base: IPCA[base] / IPCA[m]."""
    base = pd.Timestamp(base)
    faltam = [m for m in list(meses) + [base] if m not in ipca.index]
    if faltam:
        raise ValueError(f"IPCA sem dados para: {faltam[:3]}")
    return ipca[base] / ipca.reindex(meses).values


def _soma(M, soma, subtrai=()):
    s = sum(M.loc[c] for c in soma)
    for c in subtrai:
        s = s - M.loc[c]
    return s


def calcular_nos(M, mapa):
    """Séries mensais dos nós do Sankey. Devolve (nós, totais RTN)."""
    nos = {}
    for n in mapa["receita"]:
        nos[n["id"]] = _soma(M, n["soma"], n.get("subtrai", ()))
    r = mapa["repasse"]
    nos[r["id"]] = _soma(M, r["soma"])
    for n in mapa["despesa"]:
        nos[n["id"]] = _soma(M, n["soma"], n.get("subtrai", ()))
    totais = {k: M.loc[c] for k, c in mapa["totais"].items()}
    return nos, totais


def por_ano(serie_mensal):
    return serie_mensal.groupby(serie_mensal.index.year).sum()


def pib_implicito(xlsx):
    """PIB nominal anual (R$ milhões) implícito nas abas 2.2 (valor) e 2.2-A (% do PIB) do RTN."""
    v = ler_rtn_anual(xlsx, "2.2").loc["1"]
    p = ler_rtn_anual(xlsx, "2.2-A").loc["1"]
    return v / p


def montar_anos(xlsx, ipca_csv, base=None, mapa=None):
    mapa = mapa or carregar_mapeamento()
    base = base or mapa["mes_base_padrao"]
    ano0, ano1 = mapa["anos"]
    M, ultimo = ler_rtn_mensal(xlsx)
    M = M.loc[:, (M.columns >= f"{ano0}-01-01") & (M.columns <= f"{ano1}-12-01")]
    ipca = ler_ipca(ipca_csv)
    fator = pd.Series(fator_deflacao(ipca, M.columns, base), index=M.columns)

    nos, totais = calcular_nos(M, mapa)
    fin = {k: M.loc[c] for k, c in mapa["financiamento"].items()}
    pib = pib_implicito(xlsx)

    def pacote(f):
        return {
            "nos": {k: por_ano(s * f) for k, s in nos.items()},
            "totais": {k: por_ano(s * f) for k, s in totais.items()},
            "financiamento": {k: por_ano(s * f) for k, s in fin.items()},
        }

    nominal = pacote(1.0)
    real = pacote(fator)
    rotulos = {n["id"]: n["rotulo"] for n in mapa["receita"] + mapa["despesa"]}
    rotulos[mapa["repasse"]["id"]] = mapa["repasse"]["rotulo"]
    grupos = {n["id"]: n["grupo"] for n in mapa["despesa"]}
    linhas = montar_linhas(mapa, ler_nomes_linhas(xlsx))
    estrutura = montar_estrutura(mapa)

    saida = {}
    for ano in range(ano0, ano1 + 1):
        def fatia(p):
            return {
                "nos": {k: round(float(v[ano]), 3) for k, v in p["nos"].items()},
                "totais": {k: round(float(v[ano]), 3) for k, v in p["totais"].items()},
                "financiamento": {k: round(float(v[ano]), 3) for k, v in p["financiamento"].items()},
            }
        saida[ano] = {
            "ano": ano,
            "unidade": "R$ milhões",
            "mes_base": base,
            "versao_dados": f"RTN série histórica, último mês publicado {ultimo:%Y-%m}",
            "mapeamento_versao": mapa["versao"],
            "rotulos": rotulos,
            "grupos_despesa": grupos,
            "linhas": linhas,
            "estrutura": estrutura,
            "nominal": fatia(nominal),
            "real": fatia(real),
            "pib": {
                "valor_nominal": round(float(pib[ano]), 1),
                "fonte": "implícito nas abas 2.2 e 2.2-A do RTN (provisório até carregar a série do IBGE)",
            },
        }
    return saida, {"ultimo_mes_publicado": f"{ultimo:%Y-%m}", "mes_base": base, "anos": [ano0, ano1]}


def gravar(saida, indice, pasta):
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    for ano, dados in saida.items():
        with open(pasta / f"{ano}.json", "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
    with open(pasta / "indice.json", "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    rtn0, ipca0 = entradas_padrao()
    ap.add_argument("--rtn", default=rtn0, help="série histórica do RTN (xlsx); padrão: entrada/seriehistorica*.xlsx")
    ap.add_argument("--ipca", default=ipca0, help="IPCA do SIDRA 1737 (csv); padrão: entrada/tabela1737.csv")
    ap.add_argument("--saida", default=str(AQUI / "dados"))
    ap.add_argument("--base", default=None)
    a = ap.parse_args()
    if not a.rtn:
        ap.error("nenhum arquivo entrada/seriehistorica*.xlsx encontrado; passe --rtn")
    s, idx = montar_anos(a.rtn, a.ipca, a.base)
    gravar(s, idx, a.saida)
    print(f"{len(s)} anos gravados em {a.saida}/ (mês-base {idx['mes_base']}, dados até {idx['ultimo_mes_publicado']})")
