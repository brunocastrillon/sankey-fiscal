"""Pipeline do Sankey fiscal do Governo Central.

Lê a série histórica do RTN (Tesouro Transparente), o IPCA (SIDRA, tabela 1737) e o PIB (SIDRA, tabela 1846),
aplica o mapeamento de mapeamento.json, deflaciona mês a mês e grava um JSON por ano.

Uso (com os arquivos em entrada/):
    python pipeline.py
    python pipeline.py --base 2025-12      # mês-base da deflação (padrão do mapeamento)
    python pipeline.py --rtn outro.xlsx --ipca outro.csv --pib outro.csv --saida dados
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).parent
MESES = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}
MESES_ABREV = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
MARCADORES_COM_VALOR = ("linha", "total", "soma", "mes")
SIMBOLOS_SIDRA = {"-", "..", "...", "X"}  # valor ausente, inibido ou que não se aplica (legenda do SIDRA)
CATEGORIA_PIB = "PIB a preços de mercado"
FONTE_PIB = "IBGE, Contas Nacionais Trimestrais, tabela 1846"
MARCADOR = r"\{[^{}]*\}"
CLASSES_NOTA = ("fatos", "contexto")
CAMPOS_FONTE_CONTEXTO = ("publicacao", "pagina", "nota", "endereco", "verificado_em")
# Lista FECHADA de nomes próprios com dígito que podem aparecer no texto das notas sem ser número fiscal. Hoje só
# "Covid-19" (notas de contexto de 2020, aprovadas pelo Bruno em 26/10/2026). Fonte única: o testes.py importa daqui e o
# T16 confere que a lista é exatamente a aprovada; acrescentar um termo exige mudar a conferência junto, de propósito.
TERMOS_COM_DIGITO = ("Covid-19",)


def data_do_nome(nome):
    """'seriehistoricajul26.xlsx' -> (2026, 7); None se o nome não segue seriehistorica<mes><aa>."""
    m = re.fullmatch(r"seriehistorica([a-z]{3})(\d{2})\.xlsx", Path(nome).name.lower())
    if not m or m.group(1) not in MESES_ABREV:
        return None
    return 2000 + int(m.group(2)), MESES_ABREV.index(m.group(1)) + 1


def escolher_rtn(pasta):
    """A série histórica mais recente pela data do nome (jul26 = 2026-07), nunca pela ordem alfabética.

    Um arquivo só é usado como está; com mais de um, um nome sem data é ValueError (passe --rtn).
    """
    arquivos = sorted(Path(pasta).glob("seriehistorica*.xlsx"))
    if len(arquivos) <= 1:
        return str(arquivos[0]) if arquivos else None
    sem_data = [a.name for a in arquivos if data_do_nome(a.name) is None]
    if sem_data:
        raise ValueError(f"{len(arquivos)} séries em {pasta} e nome sem data (seriehistorica<mes><aa>): {sem_data}; "
                         f"passe --rtn")
    return str(max(arquivos, key=lambda a: data_do_nome(a.name)))


def entradas_padrao(pasta=None):
    """Arquivos de entrada (padrão: entrada/): a série histórica mais recente pela data do nome, o CSV do IPCA e o do PIB.

    Se a escolha da série for ambígua, devolve None no lugar dela (escolher_rtn diz por quê).
    """
    pasta = Path(pasta) if pasta else AQUI / "entrada"
    try:
        rtn = escolher_rtn(pasta)
    except ValueError:
        rtn = None
    return rtn, str(pasta / "tabela1737.csv"), str(pasta / "tabela1846.csv")


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


def rotulo_trimestre(t):
    """pd.Period('2025Q4') -> '2025T4'."""
    return f"{t.year}T{t.quarter}"


def ler_pib_trimestral(csv):
    """PIB a preços de mercado, valores correntes (R$ milhões), do SIDRA, tabela 1846, em CSV com ';'. Série por trimestre.

    Confere o layout: linha de trimestres ('1º trimestre 2015', ...), linha da categoria (só "PIB a preços de mercado")
    e linha de valores do Brasil. Símbolos do SIDRA (valor ausente ou inibido) viram nulos.
    """
    with open(csv, encoding="utf-8-sig") as f:
        linhas = [[c.strip('"') for c in l.split(";")] for l in f.read().splitlines()]
    trimestre = re.compile(r"^([1-4])º trimestre (\d{4})$")
    i = next((k for k, l in enumerate(linhas) if len(l) > 2 and trimestre.match(l[1])), None)
    if i is None:
        raise ValueError(f"{csv}: linha de trimestres do SIDRA não encontrada")
    cab, categorias, valores = linhas[i][1:], linhas[i + 1][1:], linhas[i + 2]
    if any(not trimestre.match(q) for q in cab) or set(categorias) != {CATEGORIA_PIB} or len(categorias) != len(cab):
        raise ValueError(f"{csv}: esperada só a categoria {CATEGORIA_PIB!r}, um trimestre por coluna")
    if valores[0] != "Brasil" or len(valores) - 1 != len(cab):
        raise ValueError(f"{csv}: esperada uma linha 'Brasil' com {len(cab)} valores")
    serie = {}
    for q, v in zip(cab, valores[1:]):
        n, ano = trimestre.match(q).groups()
        t = pd.Period(year=int(ano), quarter=int(n), freq="Q")
        if t in serie:
            raise ValueError(f"{csv}: trimestre duplicado: {q}")
        serie[t] = float("nan") if v in SIMBOLOS_SIDRA else float(v.replace(".", "").replace(",", "."))
    return pd.Series(serie).sort_index()


def ler_pib_ibge(csv):
    """PIB anual (R$ milhões correntes): soma dos 4 trimestres, só nos anos completos; e o último trimestre do arquivo."""
    tri = ler_pib_trimestral(csv).dropna()
    n = tri.groupby(tri.index.year).size()
    anual = tri.groupby(tri.index.year).sum()
    return anual[n == 4], rotulo_trimestre(tri.index.max())


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


def montar_subcontas(mapa, M, fator, nomes):
    """Ano -> id do nó -> subcontas [{codigo, nome, real, nominal}] (R$ milhões, 3 casas), na ordem da aba 1.2.

    Subcontas de um nó: as filhas diretas de cada linha de `soma` (uma linha sem filhas entra como ela mesma), menos as
    linhas de `subtrai`. Só entram nós com duas ou mais subcontas.
    """
    ordem = {c: k for k, c in enumerate(M.index)}

    def filhas(c):
        return [k for k in M.index if k.startswith(c + ".") and k.count(".") == c.count(".") + 1]

    por_no = {}
    for n in mapa["receita"] + [mapa["repasse"]] + mapa["despesa"]:
        codigos = [f for c in n["soma"] for f in (filhas(c) or [c]) if f not in n.get("subtrai", [])]
        if len(codigos) >= 2:
            por_no[n["id"]] = sorted(codigos, key=ordem.get)
    real = {c: por_ano(M.loc[c] * fator) for cs in por_no.values() for c in cs}
    nominal = {c: por_ano(M.loc[c]) for cs in por_no.values() for c in cs}
    anos = sorted(set(M.columns.year))
    return {ano: {no: [{"codigo": c, "nome": nomes[c], "real": round(float(real[c][ano]), 3),
                        "nominal": round(float(nominal[c][ano]), 3)} for c in cs]
                  for no, cs in por_no.items()}
            for ano in anos}


def formatar_bi(valor_mi):
    """R$ milhões -> 'R$ 1.027,4 bi' (como formatarBi do site)."""
    return "R$ " + f"{valor_mi / 1000:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".") + " bi"


def carregar_notas(caminho=None):
    with open(caminho or AQUI / "notas.json", encoding="utf-8") as f:
        return json.load(f)


def _partes(marcador):
    m = re.fullmatch(r"\{(\w+)(?::([^{}]*))?\}", marcador)
    if not m:
        raise ValueError(f"marcador malformado: {marcador}")
    return m.group(1), m.group(2) or ""


def _mes(texto, marcador):
    """'03' -> 3; mês com dois dígitos, de 01 a 12, ou ValueError."""
    if not re.fullmatch(r"\d{2}", texto) or not 1 <= int(texto) <= 12:
        raise ValueError(f"marcador {marcador}: mês {texto!r} fora de 01–12")
    return int(texto)


def valor_marcador(marcador, ano, R, nos_reais):
    """Valor (R$ milhões constantes) de um marcador numérico no ano: {linha:COD}, {total:id}, {soma:COD:MM-MM},
    {soma:COD+COD} e {mes:COD:MM}. R é a série mensal das linhas (código x mês); nos_reais, a dos nós."""
    tipo, arg = _partes(marcador)

    def no_ano(serie, meses=range(1, 13)):
        return float(serie[(serie.index.year == ano) & serie.index.month.isin(list(meses))].sum())

    if tipo == "linha":
        return no_ano(R.loc[arg])
    if tipo == "total":
        return no_ano(nos_reais[arg])
    if tipo == "mes":
        cod, mes = arg.split(":")
        mes = _mes(mes, marcador)
        return no_ano(R.loc[cod], [mes])
    if tipo == "soma" and ":" in arg:
        cod, meses = arg.split(":")
        m0, m1 = (_mes(x, marcador) for x in meses.split("-"))
        if m0 > m1:
            raise ValueError(f"marcador {marcador}: mês inicial maior que o final")
        return no_ano(R.loc[cod], range(m0, m1 + 1))
    if tipo == "soma":
        return sum(no_ano(R.loc[cod]) for cod in arg.split("+"))
    raise ValueError(f"marcador sem valor numérico: {marcador}")


def linhas_citadas(nota):
    """Códigos do RTN citados pelos marcadores do texto e das comparações de uma nota."""
    marcadores = re.findall(MARCADOR, nota["texto"]) + [x for a, _, b in nota.get("comparacoes", []) for x in (a, b)]
    codigos = set()
    for m in marcadores:
        tipo, arg = _partes(m)
        if tipo in ("linha", "mes", "soma", "codigo", "nome"):
            codigos |= set(arg.split(":")[0].split("+"))
    return codigos


def citacoes(fonte):
    """Citações da fonte de uma nota: a fonte é sempre uma lista; outra coisa é ValueError."""
    if not isinstance(fonte, list):
        raise ValueError(f"a fonte de uma nota é uma lista de citações, não {type(fonte).__name__}")
    return fonte


def rotulo_base_precos(mes_base):
    """'2025-12' -> 'R$ constantes de dez/2025 (IPCA)': a base dos valores escritos nas notas."""
    ano, mes = mes_base.split("-")
    return f"R$ constantes de {MESES_ABREV[int(mes) - 1]}/{ano} (IPCA)"


def aplicar_notas(notas, ano, R, nomes, nos_reais, mes_base=None):
    """Notas do ano com os marcadores substituídos: [{no, classe, texto, fonte}].

    Valores em 'R$ x,y bi' (R$ constantes). A fonte de toda nota é uma lista de citações (`tipo` "serie" ou "boletim");
    numa nota de contexto, cada citação precisa de publicação, página, nota, endereço e data de verificação. Fora disso,
    ValueError. A observação (texto ou null) fica uma vez por nota. Uma nota com valor (marcador {linha}, {total},
    {soma} ou {mes}) ganha `base_precos`, montada de `mes_base` (sem mes_base, ValueError); sem valor, `base_precos` é null.
    """
    for n in notas:
        if n["classe"] not in CLASSES_NOTA:
            raise ValueError(f"nota {n['ano']} {n['no']}: classe {n['classe']!r} desconhecida")
        fonte = citacoes(n["fonte"])
        if n["classe"] != "contexto":
            continue
        for i, c in enumerate(fonte, 1):
            faltam = [k for k in CAMPOS_FONTE_CONTEXTO if not c.get(k)]
            if faltam:
                raise ValueError(f"nota de contexto {n['ano']} {n['no']} sem {faltam} na citação {i} da fonte")

    def substituir(m):
        tipo, arg = _partes(m.group(0))
        if tipo == "ano":
            return str(ano)
        if tipo in ("codigo", "nome"):
            if arg not in nomes:
                raise ValueError(f"linha {arg} não existe na aba 1.2")
            return arg if tipo == "codigo" else nomes[arg]
        if tipo in ("linha", "total", "soma", "mes"):
            return formatar_bi(valor_marcador(m.group(0), ano, R, nos_reais))
        raise ValueError(f"marcador desconhecido: {tipo}")

    def base_precos(n):
        if not any(_partes(m)[0] in MARCADORES_COM_VALOR for m in re.findall(MARCADOR, n["texto"])):
            return None
        if mes_base is None:
            raise ValueError(f"nota {n['ano']} {n['no']} tem valores, mas o mês-base não foi informado")
        return rotulo_base_precos(mes_base)

    return [{"no": n["no"], "classe": n["classe"], "texto": re.sub(MARCADOR, substituir, n["texto"]),
             "fonte": n["fonte"], "observacao": n.get("observacao"), "base_precos": base_precos(n)}
            for n in notas if n["ano"] == ano]


# --- Validação das notas e do esquema publicado ------------------------------------------------------------------------
# Uma função só (validar_notas) para notas.json e outra (validar_ano) para cada AAAA.json; o pipeline chama as duas antes de
# gravar, e os testes chamam as mesmas.

# Esquema fechado: chaves permitidas em cada nível. Chave desconhecida é erro.
CHAVES_NOTA = {"ano", "no", "classe", "texto", "comparacoes", "observacao", "fonte"}  # notas.json
CHAVES_NOTA_OPCIONAIS = {"comparacoes"}
CHAVES_NOTA_PUBLICADA = {"no", "classe", "texto", "fonte", "observacao", "base_precos"}  # AAAA.json
CHAVES_CITACAO = {
    "serie": {"tipo", "titulo", "linhas", "nota", "nota_na_tabela"},
    "boletim": {"tipo", "publicacao", "boletim", "base_precos", "pagina", "nota", "nota_na_tabela", "endereco",
                "verificado_em", "arquivo_sha256", "trecho", "linha_rtn", "menciona"},
}
TIPO_DA_CLASSE = {"fatos": "serie", "contexto": "boletim"}
CHAVES_ANO = {"ano", "unidade", "mes_base", "versao_dados", "mapeamento_versao", "rotulos", "grupos_despesa", "linhas",
              "estrutura", "nominal", "real", "pib", "subcontas", "notas"}
CHAVES_BLOCO_VALORES = {"nos", "totais", "financiamento"}
CHAVES_PIB = {"valor_nominal", "fonte", "trimestres", "ultimo_trimestre"}
CHAVES_ESTRUTURA = {"receita", "repasse", "obrigatorias", "discricionarias"}
CHAVES_LINHA = {"codigo", "nome", "operacao"}
CHAVES_SUBCONTA = {"codigo", "nome", "real", "nominal"}
CHAVES_INDICE = {"ultimo_mes_publicado", "mes_base", "anos", "pib_ultimo_trimestre"}
# Formas fixas: "Nota N …" sem outro dígito; na tabela, também "(p. N)" no fim
FORMA_NOTA = r"Nota [1-9]\d* [^\d()]+"
FORMA_NOTA_NA_TABELA = r"Nota [1-9]\d* [^\d()]+(?: \(p\. [1-9]\d*\))?"
# Conjuntos fechados: só estes textos são aceitos nestes campos (um valor ou um número escondido neles é erro). Uma
# publicação nova entra aqui, de propósito, junto com as notas que a citam.
TITULOS_SERIE = ("Série histórica do RTN, aba 1.2", "Série histórica do RTN, aba 1.2, mensal")
PUBLICACOES = ("Resultado do Tesouro Nacional, dezembro de 2020",)
BOLETINS = ("v. 26, n. 12",)
ENDERECOS = ("https://www.tesourotransparente.gov.br/publicacoes/boletim-resultado-do-tesouro-nacional-rtn/2020/12",)
BASES_PRECOS_PUBLICACAO = ("R$ correntes (o boletim publica a preços correntes)",)
CONJUNTOS_FECHADOS = {
    "serie": {"titulo": TITULOS_SERIE},
    "boletim": {"publicacao": PUBLICACOES, "boletim": BOLETINS, "endereco": ENDERECOS, "base_precos": BASES_PRECOS_PUBLICACAO},
}
# Quantificadores que as notas de contexto não usam (o boletim não diz que o auxílio é a maior parte de nada)
QUANTIFICADORES_PROIBIDOS = (r"\b(maior parte|maioria|maior fatia|grande parte|boa parte|boa fatia|grande fatia|metade|"
                             r"quase tudo|quase tod[oa]s?|praticamente tod[oa]s?)\b")
PAGINA_NA_OBSERVACAO = r"\bp\. ([1-9]\d*)\b"


def _tipo_ok(valor, tipo):
    return isinstance(valor, tipo) and not isinstance(valor, bool)


def _sem_digito(texto, permitidos=()):
    for p in permitidos:
        texto = re.sub(p, "", texto)
    return re.search(r"\d", texto) is None


def erros_campos(n, quem, mes_base=None, publicada=False):
    """Regras de cada campo de uma nota e de suas citações. No notas.json, o texto não tem dígito fora dos marcadores e de
    TERMOS_COM_DIGITO; publicada (AAAA.json), o texto já traz os valores, e o base_precos é o montado de mes_base."""
    termos = [re.escape(t) for t in TERMOS_COM_DIGITO]
    erros = []
    texto = n.get("texto", "")
    if not publicada and isinstance(texto, str) and not _sem_digito(texto, [MARCADOR] + termos):
        erros.append(f"{quem}: texto com dígito fora dos marcadores e de {list(TERMOS_COM_DIGITO)}")
    obs = n.get("observacao")
    if isinstance(obs, str):
        paginas = {c["pagina"] for c in n.get("fonte") or [] if isinstance(c, dict) and _tipo_ok(c.get("pagina"), int)}
        paginas |= {int(x) for c in n.get("fonte") or [] if isinstance(c, dict) and isinstance(c.get("nota_na_tabela"), str)
                    for x in re.findall(r"\(p\. ([1-9]\d*)\)", c["nota_na_tabela"])}
        for x in re.findall(PAGINA_NA_OBSERVACAO, obs):
            if int(x) not in paginas:
                erros.append(f"{quem}: observacao cita a p. {x}, que não é página de citação da nota {sorted(paginas)}")
        if not _sem_digito(obs, [PAGINA_NA_OBSERVACAO]):
            erros.append(f"{quem}: observacao com dígito fora de \"p. N\"")
    if "base_precos" in n and n["base_precos"] is not None and (
            mes_base is None or n["base_precos"] != rotulo_base_precos(mes_base)):
        erros.append(f"{quem}: base_precos {n['base_precos']!r} não é a montada de mes_base {mes_base!r}")
    for i, c in enumerate(n.get("fonte") or [], 1):
        if not isinstance(c, dict):
            continue
        q = f"{quem} citação {i}"
        for campo, aceitos in CONJUNTOS_FECHADOS.get(c.get("tipo"), {}).items():
            if campo in c and c[campo] not in aceitos:
                erros.append(f"{q}: {campo} fora da lista {list(aceitos)}: {c[campo]!r}")
        if c.get("tipo") == "serie":
            if c.get("nota") is not None or c.get("nota_na_tabela") is not None:
                erros.append(f"{q}: nota e nota_na_tabela de uma citação da série são null")
            continue
        if isinstance(c.get("trecho"), str) and not _sem_digito(c["trecho"], termos):
            erros.append(f"{q}: trecho com dígito fora de {list(TERMOS_COM_DIGITO)}")
        if not (isinstance(c.get("nota"), str) and re.fullmatch(FORMA_NOTA, c["nota"])):
            erros.append(f"{q}: nota fora da forma \"Nota N …\": {c.get('nota')!r}")
        nt = c.get("nota_na_tabela")
        if nt is not None and not (isinstance(nt, str) and re.fullmatch(FORMA_NOTA_NA_TABELA, nt)):
            erros.append(f"{q}: nota_na_tabela fora da forma \"Nota N … (p. N)\": {nt!r}")
        if not (_tipo_ok(c.get("pagina"), int) and c["pagina"] >= 1):
            erros.append(f"{q}: pagina {c.get('pagina')!r} não é inteiro ≥ 1")
        v = c.get("verificado_em")
        try:
            data = date.fromisoformat(v) if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) else None
        except ValueError:
            data = None
        if data is None or data > date.today():
            erros.append(f"{q}: verificado_em {v!r} não é data real AAAA-MM-DD até hoje")
        if not (isinstance(c.get("arquivo_sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", c["arquivo_sha256"])):
            erros.append(f"{q}: arquivo_sha256 não é SHA256 em minúsculas")
    return erros


def erros_esquema_nota(n, quem, publicada=False):
    """Chaves (fechadas) e tipos de uma nota e de suas citações."""
    if not isinstance(n, dict):
        return [f"{quem}: nota não é objeto"]
    permitidas = CHAVES_NOTA_PUBLICADA if publicada else CHAVES_NOTA
    obrigatorias = permitidas - (set() if publicada else CHAVES_NOTA_OPCIONAIS)
    erros = [f"{quem}: chave desconhecida {k!r}" for k in sorted(set(n) - permitidas)]
    erros += [f"{quem}: sem {k}" for k in sorted(obrigatorias - set(n))]
    tipos = {"ano": int, "no": str, "classe": str, "texto": str, "fonte": list, "comparacoes": list}
    erros += [f"{quem}: {k} com tipo {type(n[k]).__name__}" for k, t in tipos.items() if k in n and not _tipo_ok(n[k], t)]
    for k in ("observacao", "base_precos"):
        if k in n and n[k] is not None and not isinstance(n[k], str):
            erros.append(f"{quem}: {k} com tipo {type(n[k]).__name__}")
    if n.get("classe") not in TIPO_DA_CLASSE:
        return erros + [f"{quem}: classe {n.get('classe')!r}"]
    if isinstance(n.get("fonte"), list):
        if not n["fonte"]:
            erros.append(f"{quem}: fonte vazia")
        for i, c in enumerate(n["fonte"], 1):
            q = f"{quem} citação {i}"
            if not isinstance(c, dict):
                erros.append(f"{q}: citação não é objeto")
                continue
            tipo = c.get("tipo")
            if tipo not in CHAVES_CITACAO:
                erros.append(f"{q}: tipo {tipo!r} (esperado serie ou boletim)")
                continue
            if tipo != TIPO_DA_CLASSE[n["classe"]]:
                erros.append(f"{q}: citação {tipo} numa nota de {n['classe']}")
            erros += [f"{q}: chave desconhecida {k!r}" for k in sorted(set(c) - CHAVES_CITACAO[tipo])]
            erros += [f"{q}: sem {k}" for k in sorted(CHAVES_CITACAO[tipo] - set(c))]
            textos = {"titulo", "publicacao", "boletim", "base_precos", "endereco", "verificado_em", "arquivo_sha256",
                      "trecho", "linha_rtn", "menciona"}
            erros += [f"{q}: {k} com tipo {type(c[k]).__name__}" for k in sorted(textos & set(c)) if not isinstance(c[k], str)]
            erros += [f"{q}: {k} com tipo {type(c[k]).__name__}" for k in ("nota", "nota_na_tabela")
                      if k in c and c[k] is not None and not isinstance(c[k], str)]
            if tipo == "serie" and not (isinstance(c.get("linhas"), list) and all(isinstance(x, str) for x in c["linhas"])):
                erros.append(f"{q}: linhas não é lista de códigos")
    for comp in n.get("comparacoes", []) if isinstance(n.get("comparacoes"), list) else []:
        if not (isinstance(comp, list) and len(comp) == 3 and comp[1] in ("<", ">")):
            erros.append(f"{quem}: comparação malformada {comp}")
    return erros


def _nos_do_mapa(mapa):
    return mapa["receita"] + ([mapa["repasse"]] if mapa.get("repasse") else []) + mapa["despesa"]


def _no_do_mapa(mapa, no_id):
    return next((n for n in _nos_do_mapa(mapa) if n["id"] == no_id), None)


def _descendentes(raizes, codigos_aba):
    return {c for c in codigos_aba if any(c == r or c.startswith(r + ".") for r in raizes)}


def linhas_L(mapa, no_id, codigos_aba):
    """L: as linhas de soma do nó e todas as suas descendentes."""
    return _descendentes(_no_do_mapa(mapa, no_id)["soma"], codigos_aba)


def linhas_X(mapa, no_id, codigos_aba):
    """X: as linhas de subtrai do nó e suas descendentes, mais os totais do mapeamento (1 a 5)."""
    return _descendentes(_no_do_mapa(mapa, no_id).get("subtrai", []), codigos_aba) | set(mapa["totais"].values())


def maes_do_no(mapa, no_id):
    """Linha-mãe direta de cada linha de soma (a Nota 21 do boletim fala da 4.4.1, mãe da 4.4.1.2)."""
    return {r.rsplit(".", 1)[0] for r in _no_do_mapa(mapa, no_id)["soma"] if "." in r}


def codigos_das_fontes(n):
    """Linhas do RTN citadas pelas fontes da nota: `linhas` (série) ou `linha_rtn` e `menciona` (boletim)."""
    codigos = set()
    for c in n["fonte"]:
        codigos |= set(c.get("linhas", [])) if c.get("tipo") == "serie" else {c.get("linha_rtn"), c.get("menciona")}
    return codigos - {None}


def erros_regra_linhas(n, quem, mapa, codigos_aba):
    """O nó existe; marcadores e menciona em L e fora de X; todo código de marcador está entre as linhas das fontes.

    linha_rtn: em L; ou mãe direta de uma linha de soma, e então a citação precisa de um menciona em L que descenda dessa
    mãe (a Nota 21 trata da 4.4.1 e menciona a 4.4.1.2, do Bolsa Família); nunca em X (subtrai e totais).
    """
    if _no_do_mapa(mapa, n["no"]) is None:
        return [f"{quem}: nó {n['no']!r} inexistente no mapeamento"]
    L, X = linhas_L(mapa, n["no"], codigos_aba), linhas_X(mapa, n["no"], codigos_aba)
    citadas, das_fontes = linhas_citadas(n), codigos_das_fontes(n)
    erros = []
    fora = sorted(c for c in citadas if c not in L or c in X)
    if fora:
        erros.append(f"{quem}: marcadores com linhas fora do nó {fora}")
    if not citadas <= das_fontes:
        erros.append(f"{quem}: marcadores com linhas fora da fonte {sorted(citadas - das_fontes)}")
    for i, c in enumerate(n["fonte"], 1):
        if not isinstance(c, dict) or c.get("tipo") != "boletim":
            continue
        q, lr, men = f"{quem} citação {i}", c.get("linha_rtn"), c.get("menciona")
        if men is not None and (men not in L or men in X):
            erros.append(f"{q}: menciona {men} fora do nó")
        if lr in X:
            erros.append(f"{q}: linha_rtn {lr} está em subtrai ou nos totais")
        elif lr in L:
            continue
        elif lr in maes_do_no(mapa, n["no"]):
            if men is None:
                erros.append(f"{q}: linha_rtn {lr} é mãe direta, mas a citação não tem menciona")
            elif men in L and men not in X and not men.startswith(lr + "."):
                erros.append(f"{q}: menciona {men} não descende de {lr}")
        else:
            erros.append(f"{q}: linha_rtn {lr} fora do nó e não é mãe direta de uma linha de soma")
    return erros


def erros_marcadores(n, quem):
    """Sintaxe de cada marcador do texto e das comparações (tipo conhecido, código, mês de 01 a 12, intervalo em ordem)."""
    cod = r"\d+(?:\.\d+)*"
    formas = {"ano": r"", "linha": cod, "codigo": cod, "nome": cod, "total": r"[a-z_]+", "mes": cod + r":\d{2}",
              "soma": cod + r"(?::\d{2}-\d{2}|(?:\+" + cod + r")+)"}
    marcadores = re.findall(MARCADOR, n.get("texto") or "") + [x for comp in n.get("comparacoes") or []
                                                               if isinstance(comp, list) and len(comp) == 3
                                                               for x in (comp[0], comp[2]) if isinstance(x, str)]
    erros = []
    for m in marcadores:
        try:
            tipo, arg = _partes(m)
        except ValueError:
            erros.append(f"{quem}: marcador malformado {m}")
            continue
        if tipo not in formas:
            erros.append(f"{quem}: marcador desconhecido {m}")
        elif not re.fullmatch(formas[tipo], arg):
            erros.append(f"{quem}: marcador malformado {m}")
        elif tipo in ("mes", "soma") and ":" in arg:
            try:
                meses = [_mes(x, m) for x in arg.split(":")[1].split("-")]
                if len(meses) == 2 and meses[0] > meses[1]:
                    raise ValueError(f"marcador {m}: mês inicial maior que o final")
            except ValueError as e:
                erros.append(f"{quem}: {e}")
    return erros


def erros_conteudo(n, quem, R, nos_reais):
    """Conteúdo que depende dos dados ou do sentido: comparações verdadeiras na série; sem quantificadores proibidos."""
    erros = []
    for a, op, b in n.get("comparacoes") or []:
        try:
            va, vb = (valor_marcador(x, n["ano"], R, nos_reais) for x in (a, b))
        except (ValueError, KeyError) as e:
            erros.append(f"{quem}: comparação {a} {op} {b} não pôde ser avaliada ({e})")
            continue
        if not {"<": va < vb, ">": va > vb}[op]:
            erros.append(f"{quem}: comparação falsa: {a} {op} {b} ({va / 1000:.1f} {op} {vb / 1000:.1f} bi)")
    if n.get("classe") == "contexto":
        achados = re.findall(QUANTIFICADORES_PROIBIDOS, n.get("texto") or "", re.I)
        if achados:
            erros.append(f"{quem}: quantificador proibido {achados}")
    return erros


def validar_notas(notas, mapa, codigos_aba, R=None, nos_reais=None):
    """Todos os problemas de notas.json (lista vazia se nenhum): esquema fechado, campos, sintaxe dos marcadores, regra
    de linhas e, com os dados (R, nos_reais), as comparações e os quantificadores. O pipeline chama antes de gravar."""
    if not isinstance(notas, list):
        return ["notas.json não é uma lista"]
    erros = []
    for i, n in enumerate(notas):
        quem = f"notas.json[{i}]"
        esquema = erros_esquema_nota(n, quem)
        erros += esquema
        if not isinstance(n, dict):
            continue
        erros += erros_campos(n, quem) + erros_marcadores(n, quem)
        estrutura_ok = isinstance(n.get("no"), str) and isinstance(n.get("fonte"), list)
        sintaxe_ok = not erros_marcadores(n, quem)
        if estrutura_ok and sintaxe_ok:
            erros += erros_regra_linhas(n, quem, mapa, codigos_aba)
        if R is not None and not esquema and sintaxe_ok:
            erros += erros_conteudo(n, quem, R, nos_reais)
    return erros


def validar_ano(d):
    """Todos os problemas de esquema de um AAAA.json (lista vazia se nenhum), inclusive das notas publicadas."""
    quem = f"{d.get('ano')}.json"
    erros = [f"{quem}: chave desconhecida {k!r}" for k in sorted(set(d) - CHAVES_ANO)]
    erros += [f"{quem}: sem {k}" for k in sorted(CHAVES_ANO - set(d))]
    for bloco in ("nominal", "real"):
        if isinstance(d.get(bloco), dict) and set(d[bloco]) != CHAVES_BLOCO_VALORES:
            erros.append(f"{quem}: {bloco} com chaves {sorted(d[bloco])}")
    pib = d.get("pib", {})
    if set(pib) != CHAVES_PIB or not (_tipo_ok(pib.get("valor_nominal"), float) and isinstance(pib.get("fonte"), str)
                                      and pib.get("trimestres") == 4
                                      and re.fullmatch(r"\d{4}T[1-4]", str(pib.get("ultimo_trimestre")))):
        erros.append(f"{quem}: bloco pib")
    if isinstance(d.get("estrutura"), dict) and set(d["estrutura"]) != CHAVES_ESTRUTURA:
        erros.append(f"{quem}: estrutura com chaves {sorted(d['estrutura'])}")
    for no, itens in (d.get("linhas") or {}).items():
        if not isinstance(itens, list) or any(not isinstance(i, dict) or set(i) != CHAVES_LINHA for i in itens):
            erros.append(f"{quem}: linhas de {no}")
    for no, itens in (d.get("subcontas") or {}).items():
        if not isinstance(itens, list) or not all(
                isinstance(i, dict) and set(i) == CHAVES_SUBCONTA and isinstance(i["codigo"], str)
                and isinstance(i["nome"], str) and all(_tipo_ok(i[k], (int, float)) for k in ("real", "nominal"))
                for i in itens):
            erros.append(f"{quem}: subcontas de {no}")
    if not isinstance(d.get("notas"), list):
        return erros + [f"{quem}: notas não é lista"]
    for j, n in enumerate(d["notas"]):
        q = f"{quem} notas[{j}]"
        esquema = erros_esquema_nota(n, q, publicada=True)
        erros += esquema + (erros_campos(n, q, d.get("mes_base"), publicada=True) if isinstance(n, dict) else [])
    return erros


def validar_indice(indice):
    erros = [f"indice.json: chave desconhecida {k!r}" for k in sorted(set(indice) - CHAVES_INDICE)]
    return erros + [f"indice.json: sem {k}" for k in sorted(CHAVES_INDICE - set(indice))]


def pib_implicito(xlsx):
    """PIB nominal anual (R$ milhões) implícito nas abas 2.2 (valor) e 2.2-A (% do PIB) do RTN."""
    v = ler_rtn_anual(xlsx, "2.2").loc["1"]
    p = ler_rtn_anual(xlsx, "2.2-A").loc["1"]
    return v / p


def montar_anos(xlsx, ipca_csv, pib_csv, base=None, mapa=None):
    mapa = mapa or carregar_mapeamento()
    base = base or mapa["mes_base_padrao"]
    ano0, ano1 = mapa["anos"]
    M, ultimo = ler_rtn_mensal(xlsx)
    M = M.loc[:, (M.columns >= f"{ano0}-01-01") & (M.columns <= f"{ano1}-12-01")]
    ipca = ler_ipca(ipca_csv)
    fator = pd.Series(fator_deflacao(ipca, M.columns, base), index=M.columns)

    nos, totais = calcular_nos(M, mapa)
    # As notas são validadas antes de ler o PIB: um erro nelas aparece mesmo com outro problema nas entradas
    notas, R, nos_reais = carregar_notas(), M * fator, {k: s * fator for k, s in nos.items()}
    erros = validar_notas(notas, mapa, M.index, R, nos_reais)
    if erros:
        raise ValueError("notas.json inválido:\n  " + "\n  ".join(erros))
    fin = {k: M.loc[c] for k, c in mapa["financiamento"].items()}
    pib, ultimo_trimestre_arquivo = ler_pib_ibge(pib_csv)
    faltam = [a for a in range(ano0, ano1 + 1) if a not in pib.index]
    if faltam:
        raise ValueError(f"PIB do IBGE sem os 4 trimestres de: {faltam}")

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
    nomes = ler_nomes_linhas(xlsx)
    linhas = montar_linhas(mapa, nomes)
    subcontas = montar_subcontas(mapa, M, fator, nomes)
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
                "fonte": FONTE_PIB,
                "trimestres": 4,
                "ultimo_trimestre": rotulo_trimestre(pd.Period(year=ano, quarter=4, freq="Q")),
            },
            "subcontas": subcontas[ano],
            "notas": aplicar_notas(notas, ano, R, nomes, nos_reais, base),
        }
    indice = {"ultimo_mes_publicado": f"{ultimo:%Y-%m}", "mes_base": base, "anos": [ano0, ano1],
              "pib_ultimo_trimestre": ultimo_trimestre_arquivo}
    erros = [e for d in saida.values() for e in validar_ano(d)] + validar_indice(indice)
    if erros:
        raise ValueError("dados gerados fora do esquema:\n  " + "\n  ".join(erros))
    return saida, indice


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
    rtn0, ipca0, pib0 = entradas_padrao()
    ap.add_argument("--rtn", default=rtn0, help="série histórica do RTN (xlsx); padrão: entrada/seriehistorica*.xlsx")
    ap.add_argument("--ipca", default=ipca0, help="IPCA do SIDRA 1737 (csv); padrão: entrada/tabela1737.csv")
    ap.add_argument("--pib", default=pib0, help="PIB do SIDRA 1846 (csv); padrão: entrada/tabela1846.csv")
    ap.add_argument("--saida", default=str(AQUI / "dados"))
    ap.add_argument("--base", default=None)
    a = ap.parse_args()
    if not a.rtn:
        try:
            escolher_rtn(AQUI / "entrada")
        except ValueError as e:
            ap.error(str(e))
        ap.error("nenhum arquivo entrada/seriehistorica*.xlsx encontrado; passe --rtn")
    s, idx = montar_anos(a.rtn, a.ipca, a.pib, a.base)
    gravar(s, idx, a.saida)
    print(f"{len(s)} anos gravados em {a.saida}/ (mês-base {idx['mes_base']}, dados até {idx['ultimo_mes_publicado']})")
