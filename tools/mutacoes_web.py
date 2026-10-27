"""Manifesto de mutações do site (3b em diante) e o executor que as roda numa cópia descartável do repositório (fora do CI).

Irmão de tools/mutacoes.py, com a mesma disciplina. Cada mutação diz em que arquivo mexer (trecho -> substituição) e o
que se espera: o código de saída de cada comando que ela roda (vitest; tsc -b; e2e, o Playwright filtrado por -g) e o
conjunto exato de testes que cai em cada um. O executor:

1. cria uma cópia descartável com `git worktree add --detach` numa pasta temporária, fora do repositório (nunca mexe na
   árvore de trabalho principal), e roda `npm ci` nela;
2. para cada mutação, aplica as edições, roda os comandos com `node` direto (sem shell e sem pipe, timeout de 600 s cada),
   lendo o código de saída de cada um e os relatórios JSON do Vitest e do Playwright, e restaura os arquivos;
3. imprime uma tabela em Markdown e sai com 1 se algum resultado for diferente do esperado;
4. remove a cópia e roda `git worktree prune`.

Uso (na raiz do repositório; o e2e local usa o Chrome instalado e a porta 4173 livre):
    PW_CANAL=chrome python tools/mutacoes_web.py
    python tools/mutacoes_web.py --so W1,W2 --tabela saida.md
    python tools/mutacoes_web.py --esboco     # imprime o observado, para revisar e fixar
"""
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutacoes import aplicar  # noqa: E402  (mesma aplicação de trechos: ocorrência única ou "primeira")

RAIZ = Path(__file__).resolve().parent.parent
TIMEOUT_S = 600  # por comando
COMANDOS = ("vitest", "tsc", "e2e")


def mut(id_, nome, edicoes, codigos, vitest=(), e2e=(), grep=None):
    """Uma mutação. codigos: {comando: saída esperada} só dos comandos que ela roda (vitest, tsc, e2e).
    vitest e e2e: os testes que caem ("arquivo > descrição > teste"). grep: filtro -g do Playwright (obrigatório com e2e)."""
    assert "e2e" not in codigos or grep, f"{id_}: e2e sem grep"
    return {"id": id_, "nome": nome, "edicoes": edicoes, "esperado": codigos, "grep": grep,
            "caem": {"vitest": sorted(vitest), "e2e": sorted(e2e)}}


ANOS = range(2015, 2026)
MODOS_PCT_DESP = "test/modos.test.ts > modos de {} > % da despesa: o rótulo × despesa total real / 100 volta ao valor real (≤ 0,05 p.p.)"

# (arquivo, trecho, substituição); o trecho tem de aparecer uma vez só (ou use "primeira" como 4º elemento).
MUTACOES = [
    # B1: modos, fluxos do resultado, carga dos 11 anos
    mut("W1", "% da despesa sobre nominal (nominal / despesa total nominal)",
        [("web/src/grafo/grafo.ts", "modo === 'desp' ? 100 / d.real.totais.despesa_total", "modo === 'desp' ? 100 / d.nominal.totais.despesa_total"),
         ("web/src/grafo/grafo.ts", "multiplicar(modo === 'pib' ? d.nominal : d.real, k)", "multiplicar(modo === 'rs' ? d.real : d.nominal, k)")],
        {"vitest": 1}),
    mut("W2", "% do PIB com uma casa",
        [("web/src/formatar.ts", "(modo === 'desp' ? umaCasa : duasCasas)", "umaCasa")], {"vitest": 1}),
    mut("W3", "fluxo do superávit só quando há superávit (sem o fluxo de valor 0)",
        [("web/src/grafo/grafo.ts", "  fluxo('receita_liquida', 'resultado_primario', Math.max(0, r));",
          "  if (r > 0) fluxo('receita_liquida', 'resultado_primario', r);")], {"vitest": 1}),
    mut("W4", "carregarTodos ignora o arquivo que falha",
        [("web/src/dados/carregar.ts",
          "return Promise.all(Array.from({ length: fim - inicio + 1 }, (_, i) => carregarAno(inicio + i)));",
          "return Promise.allSettled(Array.from({ length: fim - inicio + 1 }, (_, i) => carregarAno(inicio + i))).then((rs) =>\n"
          "    rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),\n  );")],
        {"vitest": 1, "e2e": 1}, grep="erro de carga em UM"),
    mut("W5", "\"Tentar de novo\" só some com a mensagem, sem refazer a carga",
        [("web/src/App.tsx", "<button type=\"button\" onClick={tentar}>", "<button type=\"button\" onClick={() => setErro(false)}>")],
        {"e2e": 1}, grep="erro de carga em UM"),
    mut("W6", "sem o texto de carregamento",
        [("web/src/App.tsx", "{!carga && !erro && (", "{false && (")], {"tsc": 0, "e2e": 1}, grep="carregamento:"),
]

# Esperado de cada mutação: (testes que caem no vitest, testes que caem no e2e). Observado com --esboco e revisado um a um.
CAEM = {
}
for _m in MUTACOES:
    if _m["id"] in CAEM:
        _v, _e = CAEM[_m["id"]]
        _m["caem"] = {"vitest": sorted(_v), "e2e": sorted(_e)}


def rodar(argv, cwd, env=None):
    try:
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=TIMEOUT_S, env={**os.environ, **(env or {})})
    except subprocess.TimeoutExpired:
        return "timeout", ""
    return r.returncode, r.stdout + r.stderr


def caiu_no_vitest(relatorio):
    """Testes com estado 'failed' no relatório JSON do Vitest, como "arquivo > descrição > teste"."""
    if not relatorio.exists():
        return ["(sem relatório)"]
    dados = json.loads(relatorio.read_text(encoding="utf-8"))
    caem = []
    for arquivo in dados["testResults"]:
        nome = Path(arquivo["name"]).as_posix().split("/web/", 1)[-1]
        falhas = [a for a in arquivo["assertionResults"] if a["status"] == "failed"]
        if arquivo["status"] == "failed" and not falhas:
            caem.append(f"{nome} (o arquivo não roda)")
        caem += [" > ".join([nome, *a["ancestorTitles"], a["title"]]) for a in falhas]
    return sorted(caem)


def caiu_no_e2e(relatorio):
    """Testes que não passaram no relatório JSON do Playwright, como "arquivo > descrição > teste"."""
    if not relatorio.exists():
        return ["(sem relatório)"]
    caem = []

    def percorrer(suite, caminho):
        for s in suite.get("suites", []):
            percorrer(s, caminho + [s["title"]])
        for spec in suite.get("specs", []):
            if not spec["ok"]:
                caem.append(" > ".join(caminho + [spec["title"]]))

    for s in json.loads(relatorio.read_text(encoding="utf-8"))["suites"]:
        percorrer(s, [s["title"]])
    return sorted(caem)


def porta_livre(porta):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", porta)) != 0


def observar(m, copia, base):
    """Aplica a mutação, roda os comandos dela e devolve o observado: códigos e o que caiu."""
    node = shutil.which("node")
    web = copia / "web"
    originais = aplicar(copia, m["edicoes"])
    try:
        cod, obs = {}, {"vitest": [], "e2e": []}
        if "vitest" in m["esperado"]:
            rel = base / "vitest.json"
            rel.unlink(missing_ok=True)
            cod["vitest"], _ = rodar([node, "node_modules/vitest/vitest.mjs", "run", "--reporter=json", f"--outputFile={rel}"], web)
            obs["vitest"] = caiu_no_vitest(rel)
        if "tsc" in m["esperado"]:
            cod["tsc"], _ = rodar([node, "node_modules/typescript/bin/tsc", "-b"], web)
        if "e2e" in m["esperado"]:
            if not porta_livre(4173):
                raise SystemExit("a porta 4173 está ocupada: encerre o servidor de prévia antes do e2e")
            rel = base / "e2e.json"
            rel.unlink(missing_ok=True)
            cod["e2e"], _ = rodar([node, "node_modules/@playwright/test/cli.js", "test", "-g", m["grep"], "--reporter=json"], web,
                                  {"CI": "1", "PLAYWRIGHT_JSON_OUTPUT_NAME": str(rel)})
            obs["e2e"] = caiu_no_e2e(rel)
    finally:
        for arquivo, b in originais.items():
            if b is None:
                (copia / arquivo).unlink()
            else:
                (copia / arquivo).write_bytes(b)
    return cod, obs


def conferir(m, cod, obs):
    """Diferenças entre o esperado e o observado (lista vazia se confere)."""
    dif = [f"saída de {k} {cod[k]} (esperado {e})" for k, e in m["esperado"].items() if cod[k] != e]
    for k in ("vitest", "e2e"):
        if m["caem"][k] != obs[k]:
            dif.append(f"caem no {k}: {obs[k]} (esperado {m['caem'][k]})")
    return dif


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--so", help="ids separados por vírgula (padrão: todas)")
    ap.add_argument("--tabela", help="grava a tabela em Markdown neste arquivo")
    ap.add_argument("--ref", default="HEAD", help="commit a testar (padrão: HEAD)")
    ap.add_argument("--esboco", action="store_true", help="imprime o observado no formato do manifesto (para revisar)")
    a = ap.parse_args()
    escolhidas = [m for m in MUTACOES if not a.so or m["id"] in a.so.split(",")]
    base = Path(tempfile.mkdtemp(prefix="sankey-mutacoes-web-"))
    copia = base / "copia"
    subprocess.run(["git", "worktree", "add", "--detach", str(copia), a.ref], cwd=RAIZ, check=True, capture_output=True)
    linhas, divergentes = [], []
    try:
        print(f"cópia descartável: {copia} ({a.ref})", flush=True)
        npm = Path(shutil.which("node")).parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
        c, s = rodar([shutil.which("node"), str(npm), "ci", "--prefer-offline", "--no-audit", "--no-fund"], copia / "web")
        if c != 0:
            raise SystemExit(f"npm ci falhou na cópia ({c}):\n{s[-2000:]}")
        for m in escolhidas:
            cod, obs = observar(m, copia, base)
            dif = conferir(m, cod, obs)
            if dif:
                divergentes.append(m["id"])
            if a.esboco:
                print(f'    {m["id"]!r}: ({obs["vitest"]!r},\n           {obs["e2e"]!r}),  # códigos {cod}', flush=True)
            esp = "/".join(f"{k} {m['esperado'][k]}" for k in COMANDOS if k in m["esperado"])
            obt = "/".join(f"{k} {cod[k]}" for k in COMANDOS if k in cod)
            caiu = "; ".join(f"{k}: {len(obs[k])} ({obs[k][0]}{' …' if len(obs[k]) > 1 else ''})" for k in ("vitest", "e2e") if obs[k])
            linhas.append(f"| {m['id']} | {m['nome']} | {esp} | {obt} | {'sim' if not dif else '**NÃO**: ' + '; '.join(dif)} | "
                          f"{caiu or '—'} |")
            print(linhas[-1], flush=True)
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(copia)], cwd=RAIZ, capture_output=True)
        subprocess.run(["git", "worktree", "prune"], cwd=RAIZ, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)
    cab = ("| # | Mutação | Esperado (códigos de saída) | Obtido | Confere (códigos e testes que caem) | O que caiu (quantos; o primeiro) |\n"
           "| --- | --- | --- | --- | --- | --- |")
    tabela = cab + "\n" + "\n".join(linhas)
    if a.tabela:
        Path(a.tabela).write_text(tabela + "\n", encoding="utf-8")
    print("\n" + tabela)
    print(f"\n{len(escolhidas) - len(divergentes)}/{len(escolhidas)} conferem com o esperado"
          + (f"; divergentes: {divergentes}" if divergentes else ""))
    sys.exit(1 if divergentes else 0)


if __name__ == "__main__":
    main()
