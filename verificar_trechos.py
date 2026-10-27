"""Confere os trechos citados nas notas de contexto contra o PDF da publicação (fora do CI).

Para cada citação de cada nota de contexto de notas.json: o PDF é o citado (SHA256 igual a `arquivo_sha256`), o `trecho`
aparece no texto da página citada (com espaços e hifenização de fim de linha normalizados) e tem menos de 15 palavras.
Sai com código 1 se alguma citação falhar. Rode antes de qualquer merge que mexa em notas de contexto.

Uso:
    python verificar_trechos.py --pdf C:/caminho/RTN_Boletim_2020_12.pdf
    python verificar_trechos.py --pdf boletim.pdf --notas outro.json

Precisa do `pdftotext` (do xpdf ou do Poppler) no PATH. O PDF não é versionado (ver entrada/LEIAME.md).
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).parent
MAX_PALAVRAS = 15  # o trecho precisa ter menos que isso


def normalizar(texto):
    """Junta palavras partidas por hífen no fim da linha ('resul-\\ntante' -> 'resultante') e reduz espaços a um só."""
    texto = re.sub(r"(\w)-[ \t]*\r?\n\s*(?=[a-zà-ÿ])", r"\1", texto)
    return re.sub(r"\s+", " ", texto).strip()


def sha256(caminho):
    with open(caminho, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def texto_da_pagina(pdf):
    """Função página -> texto, com o pdftotext (UTF-8, ordem de leitura)."""
    cache = {}

    def ler(pagina):
        if pagina not in cache:
            r = subprocess.run(["pdftotext", "-enc", "UTF-8", "-f", str(pagina), "-l", str(pagina), str(pdf), "-"],
                               capture_output=True, check=True)
            cache[pagina] = r.stdout.decode("utf-8")
        return cache[pagina]

    return ler


def conferir(notas, pagina_texto, sha_pdf):
    """Lista de problemas (vazia se tudo confere) das citações das notas de contexto."""
    problemas = []
    for n in notas:
        if n["classe"] != "contexto":
            continue
        if not isinstance(n["fonte"], list):
            problemas.append(f"{n['ano']} {n['no']}: a fonte não é uma lista de citações")
            continue
        for c in (c for c in n["fonte"] if c.get("tipo") == "boletim"):
            quem = f"{n['ano']} {n['no']} {c.get('nota')} (p. {c.get('pagina')})"
            trecho = normalizar(c.get("trecho", ""))
            if c.get("arquivo_sha256") != sha_pdf:
                problemas.append(f"{quem}: o PDF não é o citado (SHA256 {sha_pdf[:12]}… × {str(c.get('arquivo_sha256'))[:12]}…)")
            if not trecho or len(trecho.split()) >= MAX_PALAVRAS:
                problemas.append(f"{quem}: trecho vazio ou com {MAX_PALAVRAS} palavras ou mais")
            texto = pagina_texto(c.get("pagina"))
            if not texto or trecho not in normalizar(texto):
                problemas.append(f"{quem}: trecho não encontrado na página: {trecho!r}")
    return problemas


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, help="PDF da publicação citada")
    ap.add_argument("--notas", default=str(AQUI / "notas.json"))
    a = ap.parse_args()
    with open(a.notas, encoding="utf-8") as f:
        notas = json.load(f)
    citacoes = [c for n in notas if n["classe"] == "contexto" and isinstance(n["fonte"], list)
                for c in n["fonte"] if c.get("tipo") == "boletim"]
    problemas = conferir(notas, texto_da_pagina(a.pdf), sha256(a.pdf))
    for p in problemas:
        print(f"[FALHOU] {p}")
    print(f"{len(citacoes)} citações conferidas contra {Path(a.pdf).name}: {len(problemas)} problema(s)")
    sys.exit(1 if problemas else 0)


if __name__ == "__main__":
    main()
