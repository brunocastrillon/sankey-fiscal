"""Manifesto de mutações da 3a e o executor que as roda numa cópia descartável do repositório (fora do CI).

Cada mutação diz em que arquivo mexer (trecho -> substituição), e o que se espera de cada comando: pytest, testes.py,
pipeline.py (com a comparação do CI entre dados/ e o que o pipeline gera) e verificar_trechos.py. O executor:

1. cria uma cópia descartável com `git worktree add --detach` numa pasta temporária, fora do repositório (nunca mexe na
   árvore de trabalho principal);
2. para cada mutação, aplica as edições, roda os comandos com o Python que roda este script (o do .venv), lendo o código
   de saída de cada um (sem shell e sem pipe), e restaura os arquivos;
3. imprime uma tabela em Markdown e sai com 1 se algum resultado for diferente do esperado;
4. remove a cópia.

Uso (na raiz do repositório, com o .venv):
    .venv/Scripts/python tools/mutacoes.py --pdf C:/caminho/RTN_Boletim_2020_12.pdf
    .venv/Scripts/python tools/mutacoes.py --pdf ... --so 1,6,17 --tabela saida.md

Sem --pdf, o verificar_trechos.py não roda e as mutações que dependem dele ficam marcadas como não conferidas.
Os trechos valem para o código da 3a; numa sub-fase nova, acrescente mutações e confira que cada trecho ainda é único.
"""
import argparse
import importlib.util
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# esperado: código de saída de cada comando; "pipeline" é a saída do python pipeline.py (a comparação de dados/ só é
# mostrada, porque qualquer mutação nos dados ou nas notas a muda de propósito)
DERRUBA = {"pytest": 1, "testes": 1, "pipeline": 0, "verificar": 0}
DERRUBA_E_PARA_O_PIPELINE = {"pytest": 1, "testes": 1, "pipeline": 1, "verificar": 0}
SO_VERIFICAR = {"pytest": 0, "testes": 0, "pipeline": 0, "verificar": 1}
PASSA = {"pytest": 0, "testes": 0, "pipeline": 0, "verificar": 0}

# (arquivo, trecho, substituição); o trecho tem de aparecer uma vez só (ou use "primeira" como 4º elemento)
MUTACOES = [
    {"id": "1", "nome": "valores de 4.3.03 e 4.3.07 trocados no dados/2020.json (real e nominal)", "esperado": DERRUBA,
     "edicoes": [("dados/2020.json", "108120.886", "@@A@@"), ("dados/2020.json", "591910.668", "108120.886"),
                 ("dados/2020.json", "@@A@@", "591910.668"), ("dados/2020.json", "78247.026", "@@B@@"),
                 ("dados/2020.json", "429608.08", "78247.026"), ("dados/2020.json", "@@B@@", "429608.08")]},
    {"id": "2", "nome": "nota de fatos do Bolsa Família no nó da Saúde", "esperado": DERRUBA,
     "edicoes": [("notas.json", '"no": "bolsa_familia",\n    "classe": "fatos"',
                  '"no": "saude_obrigatoria",\n    "classe": "fatos"')]},
    {"id": "3", "nome": "\"a maior fatia\" no texto da nota da Nota 18", "esperado": DERRUBA,
     "edicoes": [("notas.json", "Entre elas, o Tesouro destaca", "A maior fatia vem delas; o Tesouro destaca")]},
    {"id": "4", "nome": "{codigo:4.3.10} na nota 2, fora da fonte", "esperado": DERRUBA,
     "edicoes": [("notas.json", "esse está na linha {codigo:4.3.07} {nome:4.3.07}, segundo",
                  "esse está na linha {codigo:4.3.07} {nome:4.3.07}, não na {codigo:4.3.10}, segundo")]},
    {"id": "5", "nome": "termo novo nas duas listas de termos com dígito", "esperado": DERRUBA,
     "edicoes": [("pipeline.py", 'TERMOS_COM_DIGITO = ("Covid-19",)', 'TERMOS_COM_DIGITO = ("Covid-19", "Lei 14.020")'),
                 ("testes.py", 'TERMOS_COM_DIGITO_APROVADOS = ("Covid-19",)',
                  'TERMOS_COM_DIGITO_APROVADOS = ("Covid-19", "Lei 14.020")')]},
    {"id": "6", "nome": "3T2020 removido do CSV do PIB", "esperado": DERRUBA_E_PARA_O_PIPELINE,
     "edicoes": [("entrada/tabela1846.csv", '"3º trimestre 2020";', ""),
                 ("entrada/tabela1846.csv", '"PIB a preços de mercado";', "", "primeira"),
                 ("entrada/tabela1846.csv", '"1929323";', "")]},
    {"id": "7", "nome": "{mes:4.4.1.2:13} no texto da nota do Bolsa Família", "esperado": DERRUBA_E_PARA_O_PIPELINE,
     "edicoes": [("notas.json", "contra {mes:4.4.1.2:03} só em março", "contra {mes:4.4.1.2:13} só em março")]},
    {"id": "8", "nome": "{soma:4.4.1.2:08-04} (início maior que o fim)", "esperado": DERRUBA_E_PARA_O_PIPELINE,
     "edicoes": [("notas.json", "{soma:4.4.1.2:04-08} entre abril", "{soma:4.4.1.2:08-04} entre abril")]},
    {"id": "9", "nome": "trimestre duplicado no CSV do PIB", "esperado": DERRUBA_E_PARA_O_PIPELINE,
     "edicoes": [("entrada/tabela1846.csv", '"2º trimestre 2015"', '"1º trimestre 2015"')]},
    {"id": "10", "nome": "resíduo na fonte: 1.1.03.1 de mai/2018 + R$ 1 mi (a mãe 1.1.03 não muda)", "esperado": DERRUBA,
     "edicoes": [("pipeline.py", '    corpo = corpo.apply(pd.to_numeric, errors="coerce")\n',
                  '    corpo = corpo.apply(pd.to_numeric, errors="coerce")\n    if aba == "1.2":\n'
                  '        corpo.loc["1.1.03.1", pd.Timestamp("2018-05-01")] += 1\n')]},
    {"id": "11", "nome": "trecho inventado na citação da Nota 21", "esperado": SO_VERIFICAR,
     "edicoes": [("notas.json", '"trecho": "houve migração temporária desses benefícios para os benefícios de auxílio emergencial"',
                  '"trecho": "houve migração definitiva desses benefícios para o auxílio emergencial"')]},
    {"id": "12", "nome": "dados/2020.json: nominal da 4.3.07 + 1.000, sem regenerar", "esperado": DERRUBA,
     "edicoes": [("dados/2020.json", "429608.08", "430608.08")]},
    {"id": "13", "nome": "dados/2020.json: real da 4.3.07 + 0,002, sem regenerar", "esperado": DERRUBA,
     "edicoes": [("dados/2020.json", "591910.668", "591910.67")]},
    {"id": "14", "nome": "código de subconta trocado no pipeline (4.3.07 gravada como 4.3.08), valor certo", "esperado": DERRUBA,
     "edicoes": [("pipeline.py", '[{"codigo": c, "nome": nomes[c],',
                  '[{"codigo": ("4.3.08" if c == "4.3.07" else c), "nome": nomes[c],')]},
    {"id": "15", "nome": "código de subconta trocado à mão no dados/2020.json (4.3.07 -> 4.3.08), valor certo", "esperado": DERRUBA,
     "edicoes": [("dados/2020.json", '"codigo": "4.3.07"', '"codigo": "4.3.08"')]},
    {"id": "16", "nome": "referência do boletim: 4.3.07 + 0,6% (432.074,2)", "esperado": DERRUBA,
     "edicoes": [("referencias/boletim-dez-2020.json", '"valor": 429497.2,', '"valor": 432074.2,')]},
    {"id": "17", "nome": "referência do boletim: 4.3.07 + 0,4% (431.215,2)", "esperado": DERRUBA,
     "edicoes": [("referencias/boletim-dez-2020.json", '"valor": 429497.2,', '"valor": 431215.2,')]},
    {"id": "18", "nome": "Fundeb (Nota 18) com linha_rtn \"4\"", "esperado": DERRUBA,
     "edicoes": [("notas.json", 'combate ao Covid-19",\n        "linha_rtn": "4.3.07"', 'combate ao Covid-19",\n        "linha_rtn": "4"')]},
    {"id": "19", "nome": "Bolsa Família (Nota 21) com linha_rtn \"4\"", "esperado": DERRUBA,
     "edicoes": [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4",')]},
    {"id": "20", "nome": "Fundeb (Nota 18) com linha_rtn \"4.3.05\"", "esperado": DERRUBA,
     "edicoes": [("notas.json", 'combate ao Covid-19",\n        "linha_rtn": "4.3.07"', 'combate ao Covid-19",\n        "linha_rtn": "4.3.05"')]},
    {"id": "21", "nome": "Bolsa Família (Nota 21) com linha_rtn \"4.4.1.3\"", "esperado": DERRUBA,
     "edicoes": [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.4.1.3",')]},
    {"id": "22", "nome": "nota de fatos do Fundeb com {linha:4.3.05}, com a 4.3.05 na fonte", "esperado": DERRUBA,
     "edicoes": [("notas.json", '{nome:4.3.01}."', '{nome:4.3.01}. O BPC soma {linha:4.3.05}."'),
                 ("notas.json", '          "4.3.10"\n        ],', '          "4.3.10",\n          "4.3.05"\n        ],')]},
    {"id": "C", "nome": "controle: referência do boletim: 4.3.07 + 0,05% (429.711,9) — passa", "esperado": PASSA,
     "edicoes": [("referencias/boletim-dez-2020.json", '"valor": 429497.2,', '"valor": 429711.9,')]},
]


def aplicar(copia, edicoes):
    """Aplica as edições na cópia; devolve {arquivo: bytes originais} para restaurar."""
    originais = {}
    for e in edicoes:
        arquivo, trecho, subst = e[:3]
        f = copia / arquivo
        originais.setdefault(arquivo, f.read_bytes())
        texto = f.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in texto else "\n"
        trecho, subst = trecho.replace("\n", nl), subst.replace("\n", nl)
        n = texto.count(trecho)
        if n == 0 or (n > 1 and (len(e) < 4 or e[3] != "primeira")):
            raise SystemExit(f"{arquivo}: trecho aparece {n} vezes: {trecho[:60]!r}")
        f.write_bytes(texto.replace(trecho, subst, 1).encode("utf-8"))
    return originais


def rodar(argv, cwd):
    r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                       env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
    return r.returncode, r.stdout + r.stderr


def caiu_no_pytest(saida):
    ids = re.findall(r"^(?:FAILED|ERROR) (.+?)(?: - .*)?$", saida, re.M)
    curtos = [re.sub(r"^test_validacao\[(.+)\]$", r"\1", i.split("::")[-1]) for i in ids]
    return ", ".join(dict.fromkeys(curtos)) or "—"


def caiu_no_testes(saida):
    return ", ".join(re.findall(r"^\[FALHOU\] (\S+)", saida, re.M)) or "—"


def comparar_dados(a, b):
    """Arquivos de dados/ que diferem entre a cópia e o que o pipeline gerou (fim de linha normalizado, como no CI)."""
    norm = lambda p: p.read_bytes().replace(b"\r\n", b"\n")
    nomes = sorted({p.name for p in a.glob("*.json")} | {p.name for p in b.glob("*.json")})
    return [n for n in nomes if not (a / n).exists() or not (b / n).exists() or norm(a / n) != norm(b / n)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", help="PDF do boletim do RTN de dez/2020 (para o verificar_trechos.py)")
    ap.add_argument("--so", help="ids separados por vírgula (padrão: todas)")
    ap.add_argument("--tabela", help="grava a tabela em Markdown neste arquivo")
    ap.add_argument("--ref", default="HEAD", help="commit a testar (padrão: HEAD)")
    a = ap.parse_args()
    if importlib.util.find_spec("pandas") is None:
        raise SystemExit(f"{sys.executable} não tem pandas: rode com o Python do .venv")
    py = sys.executable
    escolhidas = [m for m in MUTACOES if not a.so or m["id"] in a.so.split(",")]
    base = Path(tempfile.mkdtemp(prefix="sankey-mutacoes-"))
    copia = base / "copia"
    subprocess.run(["git", "worktree", "add", "--detach", str(copia), a.ref], cwd=RAIZ, check=True, capture_output=True)
    linhas, divergentes = [], []
    try:
        print(f"cópia descartável: {copia} ({a.ref})")
        for m in escolhidas:
            originais = aplicar(copia, m["edicoes"])
            try:
                cod, res = {}, {}
                cod["pytest"], s = rodar([py, "-m", "pytest", "-q", "-p", "no:cacheprovider"], copia)
                res["pytest"] = caiu_no_pytest(s)
                cod["testes"], s = rodar([py, "-X", "utf8", "testes.py"], copia)
                res["testes"] = caiu_no_testes(s)
                saida = base / f"saida-{m['id']}"
                shutil.rmtree(saida, ignore_errors=True)
                cod["pipeline"], s = rodar([py, "-X", "utf8", "pipeline.py", "--saida", str(saida)], copia)
                res["pipeline"] = (s.strip().splitlines() or ["—"])[-1][:90] if cod["pipeline"] else "—"
                difere = comparar_dados(copia / "dados", saida) if cod["pipeline"] == 0 else []
                res["diff"] = ("difere: " + ", ".join(difere)) if difere else ("igual" if cod["pipeline"] == 0 else "—")
                if a.pdf:
                    cod["verificar"], s = rodar([py, "-X", "utf8", "verificar_trechos.py", "--pdf", a.pdf], copia)
                    res["verificar"] = "; ".join(l[9:80] for l in s.splitlines() if l.startswith("[FALHOU]")) or "—"
                else:
                    cod["verificar"], res["verificar"] = None, "não rodado (sem --pdf)"
            finally:
                for arquivo, b in originais.items():
                    (copia / arquivo).write_bytes(b)
            ok = all(cod[k] == v for k, v in m["esperado"].items() if cod[k] is not None)
            if not ok:
                divergentes.append(m["id"])
            esp = "/".join(str(m["esperado"][k]) for k in ("pytest", "testes", "pipeline", "verificar"))
            obt = "/".join("—" if cod[k] is None else str(cod[k]) for k in ("pytest", "testes", "pipeline", "verificar"))
            caiu = "; ".join(f"{k}: {res[k]}" for k in ("pytest", "testes", "verificar") if res[k] not in ("—",))
            linhas.append(f"| {m['id']} | {m['nome']} | {esp} | {obt} | {'sim' if ok else '**NÃO**'} | {res['pipeline']} | "
                          f"{res['diff']} | {caiu or '—'} |")
            print(linhas[-1], flush=True)
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(copia)], cwd=RAIZ, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)
    cab = ("| # | Mutação | Esperado (pytest/testes/pipeline/verificar) | Obtido | Confere | Pipeline | Diff do CI sobre dados/ "
           "| O que caiu |\n| --- | --- | --- | --- | --- | --- | --- | --- |")
    tabela = cab + "\n" + "\n".join(linhas)
    if a.tabela:
        Path(a.tabela).write_text(tabela + "\n", encoding="utf-8")
    print("\n" + tabela)
    print(f"\n{len(escolhidas) - len(divergentes)}/{len(escolhidas)} conferem com o esperado"
          + (f"; divergentes: {divergentes}" if divergentes else ""))
    sys.exit(1 if divergentes else 0)


if __name__ == "__main__":
    main()
