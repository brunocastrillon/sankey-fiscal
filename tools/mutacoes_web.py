"""Manifesto de mutações do site (3b em diante) e o executor que as roda numa cópia descartável do repositório (fora do CI).

Irmão de tools/mutacoes.py, com a mesma disciplina. Cada mutação diz em que arquivo mexer (trecho -> substituição) e o
que se espera: o código de saída de cada comando que ela roda (vitest; tsc -b; e2e, o Playwright filtrado por -g) e os
testes que caem em cada um, agrupados com o ano e o fator do medidor normalizados ("AAAA", "×F") e contados: um teste que
cai em 7 anos aparece uma vez, com 7. O executor:

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
import re
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


def resumir(nomes):
    """Testes que caem ("arquivo > descrição > teste") agrupados com o ano e o fator normalizados: {nome: quantos}."""
    contagem = {}
    for n in nomes:
        n = re.sub(r"medidor ×[\d.]+", "medidor ×F", re.sub(r" > \d{4} > ", " > AAAA > ", re.sub(r"(?<= em )\d{4}(?= >)", "AAAA", n)))
        contagem[n] = contagem.get(n, 0) + 1
    return dict(sorted(contagem.items()))


def mut(id_, nome, edicoes, codigos, grep=None):
    """Uma mutação. codigos: {comando: saída esperada} só dos comandos que ela roda (vitest, tsc, e2e).
    grep: filtro -g do Playwright (obrigatório com e2e). Os testes que caem vêm de CAEM."""
    assert "e2e" not in codigos or grep, f"{id_}: e2e sem grep"
    return {"id": id_, "nome": nome, "edicoes": edicoes, "esperado": codigos, "grep": grep, "caem": {"vitest": {}, "e2e": {}}}


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
    # B2: escala compartilhada, âncora, altura, reserva de largura, fila apertada
    mut("E1", "alturaSvg 20 px menor no desktop (732)", [("web/src/layout/constantes.ts", "  alturaSvg: 752,", "  alturaSvg: 732,")],
        {"vitest": 1}),
    mut("E2", "alturaSvg 20 px menor no celular (724)", [("web/src/layout/constantes.ts", "  alturaSvg: 744,", "  alturaSvg: 724,")],
        {"vitest": 1}),
    mut("E3", "a série com o ano sintético 2025 × 1,3 cabe (controle: passa)",
        [("web/test/escala.test.ts", "expect(problemas(SERIE, cfg, opcoes)).toEqual([]);",
          "expect(problemas(comSintetico(1.3), cfg, opcoes, { deslocamento: false })).toEqual([]);")], {"vitest": 0}),
    mut("E4", "a série com o ano sintético 2025 × 1,5 (a espessura mínima cai no celular)",
        [("web/test/escala.test.ts", "expect(problemas(SERIE, cfg, opcoes)).toEqual([]);",
          "expect(problemas(comSintetico(1.5), cfg, opcoes, { deslocamento: false })).toEqual([]);")], {"vitest": 1}),
    mut("E5", "rótulo das discricionárias empurrado 20 px além, para longe da barra",
        [("web/src/layout/layout.ts", "      const topo = faixaTopo + (item.altura - t.altura) / 2;",
          "      const topo = faixaTopo + (item.altura - t.altura) / 2 +\n"
          "        (item.id === 'discricionarias' ? 20 * Math.sign(faixaTopo + item.altura / 2 - (nl.y0 + nl.y1) / 2) : 0);")],
        {"vitest": 1}),
    mut("E6", "reservaLargura sem porNo (posições x pelos rótulos do próprio ano)",
        [("web/src/layout/layout.ts", "const larguraX = (id: string) => Math.max(textos.get(id)!.largura, reserva?.porNo[id] ?? 0);",
          "const larguraX = (id: string) => textos.get(id)!.largura;")], {"vitest": 1}),
    mut("E7", "filaApertada desligada (a fila empurrada pelos limites não acusa)",
        [("web/src/layout/layout.ts", " > 1e-6)) filaApertada = true;", " > 1e-6)) filaApertada = false;")], {"vitest": 1}),
    # antes da B3: dica nativa do navegador
    mut("D1", "elemento title de volta no SVG (dica nativa)",
        [("web/src/ui/Sankey.tsx", "    >\n      <defs>", "    >\n      <title>{`${TEXTOS.tituloSvg}, ${grafo.ano}`}</title>\n      <defs>")],
        {"vitest": 1, "e2e": 1}, grep="sem dica nativa"),
    mut("D2", "o <svg> como role=\"img\" (esconderia os nós focáveis)",
        [("web/src/ui/Sankey.tsx", '      role="group"', '      role="img"')], {"vitest": 1}),
    # B3: superávit (duas posições, rótulo A′, guia em L) e nó zero
    mut("R1", "resultadoComSinal invertido (2022 sairia como déficit)",
        [("web/src/grafo/grafo.ts", "    resultadoComSinal: r,", "    resultadoComSinal: -r,")], {"vitest": 1}),
    mut("R2", "as duas posições do resultado trocadas",
        [("web/src/layout/layout.ts",
          "nos.set('resultado_primario', resultado > 0 ? posicoesResultado.superavit : posicoesResultado.deficit);",
          "nos.set('resultado_primario', resultado > 0 ? posicoesResultado.deficit : posicoesResultado.superavit);")], {"vitest": 1}),
    mut("S1", "rótulo do superávit junto do nó (abaixo dele, na quarta coluna) no celular",
        [("web/src/layout/layout.ts", "    const nl = n.papel === 'resultado' ? posicoesResultado.deficit : nos.get(n.id)!;",
          "    const nl = n.papel === 'resultado' && !(cfg.alvoToque > 0 && resultado > 0) ? posicoesResultado.deficit : nos.get(n.id)!;")],
        {"vitest": 1}),
    mut("S2", "nó com valor zero entra nos rótulos (e na fila)",
        [("web/src/layout/layout.ts", "  const visiveis = g.nos.filter((n) => n.valor > 0);", "  const visiveis = g.nos;")], {"vitest": 1}),
    mut("S3", "nó com valor zero desenhado como g.no focável",
        [("web/src/ui/Sankey.tsx", "{L.nos.filter((nl) => porId.get(nl.id)!.valor > 0).map((nl) => {", "{L.nos.map((nl) => {")], {"vitest": 1}),
    mut("S4", "nó com valor zero com linha na tabela de valores",
        [("web/src/ui/TabelaValores.tsx", "{grafo.nos.filter((n) => n.valor > 0).map((n) => {", "{grafo.nos.map((n) => {")], {"vitest": 1}),
    mut("S5", "sem a guia em L do superávit",
        [("web/src/layout/layout.ts", "    if (distancia > LIMIAR_GUIA_RESULTADO) guias.push(", "    if (distancia > 1e9) guias.push(")], {"vitest": 1}),
    mut("S6", "\"não inclui juros\" só no déficit (o superávit sem a nota)",
        [("web/src/layout/layout.ts", "      ...(n.papel === 'resultado' ? [{ texto: TEXTOS.naoIncluiJuros",
          "      ...(n.papel === 'resultado' && g.resultado === 'deficit' ? [{ texto: TEXTOS.naoIncluiJuros")], {"vitest": 1}),
]

# Esperado de cada mutação: (testes que caem no vitest, testes que caem no e2e). Observado com --esboco e revisado um a um.
NO_ZERO = {  # os testes do nó zero nos 11 anos, dois formatos, resultado zerado e folha zerada
    f"test/superavit.test.tsx > nó zero em AAAA > {formato} > {caso}": 11
    for formato in ("celular 390", "desktop 1200")
    for caso in ("folha zerada (BPC): sem rótulo, guia, alvo, parada no Tab nem linha na tabela",
                 "resultado zerado: sem rótulo, guia, alvo, parada no Tab nem linha na tabela; as duas posições com altura 0")
}
ERRO_DE_CARGA ='sankey.spec.ts > foco da revisão > erro de carga em UM dos anos: mensagem e "Tentar de novo"; sem a falha, o clique desenha'
CAEM = {
    "W1": ([MODOS_PCT_DESP.format(a) for a in ANOS], []),
    "W2": (["test/modos.test.ts > % do PIB com duas casas > déficit de 2025 = 0,48% e superávit de 2022 = 0,46%, diferentes",
            "test/modos.test.ts > formatarValor > R$ em bilhões; % da despesa com uma casa; % do PIB com duas"], []),
    "W3": (["test/grafo.test.ts > fluxos do resultado em 2021 > os dois fluxos do resultado existem, um deles com valor 0; "
            "o resultado com sinal vem do JSON"], []),
    "W4": (["test/carregar.test.ts > carregarTodos > um arquivo com 404 rejeita a carga, com o nome do arquivo"], [ERRO_DE_CARGA]),
    "W5": ([], [ERRO_DE_CARGA]),
    "W6": ([], ["sankey.spec.ts > foco da revisão > carregamento: texto enquanto os anos chegam, depois o desenho"]),
    "D1": ({
        'test/dica-nativa.test.ts > dica nativa do navegador > nenhum <title> nem atributo title em web/src': 1,
        'test/sankey-render.test.tsx > Sankey renderizado (celular 2020) > sem <title> no SVG (dica nativa); o nome acessível é o aria-label, com o ano': 1,
        'test/sankey-render.test.tsx > Sankey renderizado (celular) > sem <title> no SVG (dica nativa); o nome acessível é o aria-label, com o ano': 1,
        'test/sankey-render.test.tsx > Sankey renderizado (desktop) > sem <title> no SVG (dica nativa); o nome acessível é o aria-label, com o ano': 1,
    }, {'sankey.spec.ts > sem dica nativa do navegador · 1280x720 > mouse parado 2 s sobre um nó e sobre um fluxo: só a Dica, nenhum title sob o ponteiro': 1}),
    # B3
    "S1": ({
        'test/superavit.test.tsx > 2022, superávit (celular 390) > medidor ×F > o rótulo não colide com outro rótulo, outra guia, outra barra nem com a faixa do fluxo Gasto total → discricionárias': 3,
        'test/superavit.test.tsx > 2022, superávit (celular 390) > medidor ×F > rótulo A′: no lugar do rótulo do déficit, com "Superávit primário", o valor e "não inclui juros"': 3,
    }, {}),
    "S2": ({
        'test/layout.test.ts > folha zerada > celular: sem NaN, sem espessura negativa, conservação na geometria e sem rótulo da folha zerada': 1,
        'test/layout.test.ts > folha zerada > desktop: sem NaN, sem espessura negativa, conservação na geometria e sem rótulo da folha zerada': 1,
        **NO_ZERO,
    }, {}),
    "S3": (NO_ZERO, {}),
    "S4": (NO_ZERO, {}),
    "S5": ({
        'test/superavit.test.tsx > 2022, superávit (celular 390) > medidor ×F > a mais de 12 px do segmento onde nasce o fluxo do superávit, o rótulo ganha guia em L até o nó': 3,
        'test/superavit.test.tsx > 2022, superávit (desktop 1200) > medidor ×F > a mais de 12 px do segmento onde nasce o fluxo do superávit, o rótulo ganha guia em L até o nó': 3,
    }, {}),
    "S6": ({
        'test/superavit.test.tsx > 2022, superávit (celular 390) > medidor ×F > rótulo A′: no lugar do rótulo do déficit, com "Superávit primário", o valor e "não inclui juros"': 3,
        'test/superavit.test.tsx > 2022, superávit (desktop 1200) > medidor ×F > rótulo A′: no lugar do rótulo do déficit, com "Superávit primário", o valor e "não inclui juros"': 3,
    }, {}),
    # B2 (agrupados: ano e fator normalizados, com a contagem)
    "E1": ({
        'test/escala.test.ts > altura do SVG > constantes da fase 3: 752 no desktop, 744 no celular, espessura mínima de 3 px': 1,
        'test/escala.test.ts > altura do SVG > desktop 1100: a série de hoje cabe na altura declarada': 1,
        'test/escala.test.ts > altura do SVG > desktop 1200: a série de hoje cabe na altura declarada': 1,
        'test/layout-anos.test.ts > modo pib > desktop 1100, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3,
        'test/layout-anos.test.ts > modo pib > desktop 1200, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3,
        'test/layout-anos.test.ts > modo rs > desktop 1100, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3,
        'test/layout-anos.test.ts > modo rs > desktop 1200, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3
    }, {}),
    "E2": ({
        'test/escala.test.ts > altura do SVG > celular 390: a série de hoje cabe na altura declarada': 1,
        'test/escala.test.ts > altura do SVG > constantes da fase 3: 752 no desktop, 744 no celular, espessura mínima de 3 px': 1,
        'test/escala.test.ts > ano novo maior que todos (2025 sintético, como 2026) > × 1,3: a escala encolhe e tudo passa (extensão, colisões, espessura mínima) nos dois formatos e nos três modos': 1,
        'test/layout-anos.test.ts > modo pib > celular 390, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo pib > celular 768 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo pib > celular 990 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 390, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 768 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 990 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1
    }, {}),
    "E3": ({}, {}),
    "E4": ({
        'test/escala.test.ts > altura do SVG > celular 390: a série de hoje cabe na altura declarada': 1
    }, {}),
    "E5": ({
        'test/escala.test.ts > altura do SVG > celular 390: a série de hoje cabe na altura declarada': 1,
        'test/escala.test.ts > altura do SVG > desktop 1100: a série de hoje cabe na altura declarada': 1,
        'test/escala.test.ts > altura do SVG > desktop 1200: a série de hoje cabe na altura declarada': 1,
        'test/escala.test.ts > ano novo maior que todos (2025 sintético, como 2026) > × 1,3: a escala encolhe e tudo passa (extensão, colisões, espessura mínima) nos dois formatos e nos três modos': 1,
        'test/layout-anos.test.ts > modo desp > celular 390, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 2,
        'test/layout-anos.test.ts > modo desp > celular 768 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 2,
        'test/layout-anos.test.ts > modo desp > celular 990 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 2,
        'test/layout-anos.test.ts > modo desp > desktop 1100, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 14,
        'test/layout-anos.test.ts > modo desp > desktop 1200, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 14,
        'test/layout-anos.test.ts > modo pib > celular 390, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo pib > celular 390, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 10,
        'test/layout-anos.test.ts > modo pib > celular 768 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo pib > celular 768 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 10,
        'test/layout-anos.test.ts > modo pib > celular 990 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo pib > celular 990 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 10,
        'test/layout-anos.test.ts > modo pib > desktop 1100, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3,
        'test/layout-anos.test.ts > modo pib > desktop 1100, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 27,
        'test/layout-anos.test.ts > modo pib > desktop 1200, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 3,
        'test/layout-anos.test.ts > modo pib > desktop 1200, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 27,
        'test/layout-anos.test.ts > modo rs > celular 390, medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 390, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 7,
        'test/layout-anos.test.ts > modo rs > celular 768 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 768 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 7,
        'test/layout-anos.test.ts > modo rs > celular 990 (sem rolagem), medidor ×F > AAAA > barras, rótulos, alvos e guias dentro de [12, alturaSvg − 12], sem a fila de rótulos empurrada; a altura é a constante': 1,
        'test/layout-anos.test.ts > modo rs > celular 990 (sem rolagem), medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 7,
        'test/layout-anos.test.ts > modo rs > desktop 1100, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 24,
        'test/layout-anos.test.ts > modo rs > desktop 1200, medidor ×F > AAAA > deslocamento máximo do rótulo dentro do limite declarado': 24
    }, {}),
    "E6": ({
        'test/escala.test.ts > escala compartilhada > celular 390: colunas nas mesmas posições x nos três modos e nos 11 anos': 1,
        'test/escala.test.ts > escala compartilhada > desktop 1100: colunas nas mesmas posições x nos três modos e nos 11 anos': 1
    }, {}),
    "E7": ({
        'test/escala.test.ts > altura do SVG > celular 390: com a altura 20 px menor, a extensão falha': 1,
        'test/escala.test.ts > altura do SVG > desktop 1100: com a altura 20 px menor, a extensão falha': 1,
        'test/escala.test.ts > altura do SVG > desktop 1200: com a altura 20 px menor, a extensão falha': 1
    }, {}),
}
for _m in MUTACOES:
    if _m["id"] in CAEM:
        _v, _e = CAEM[_m["id"]]
        _m["caem"] = {k: x if isinstance(x, dict) else resumir(x) for k, x in (("vitest", _v), ("e2e", _e))}


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
        o, e = resumir(obs[k]), m["caem"][k]
        diferentes = sorted(n for n in set(o) | set(e) if o.get(n, 0) != e.get(n, 0))
        if diferentes:
            n = diferentes[0]
            dif.append(f"no {k}, {len(diferentes)} grupos diferentes (ex.: {n}: {o.get(n, 0)}, esperado {e.get(n, 0)})")
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
                print(f'    {m["id"]!r}: ({resumir(obs["vitest"])!r},\n           {resumir(obs["e2e"])!r}),  # códigos {cod}', flush=True)
            esp = "/".join(f"{k} {m['esperado'][k]}" for k in COMANDOS if k in m["esperado"])
            obt = "/".join(f"{k} {cod[k]}" for k in COMANDOS if k in cod)
            caiu = "; ".join(f"{k}: {len(obs[k])} em {len(resumir(obs[k]))} grupos ({next(iter(resumir(obs[k])))}"
                             f"{' …' if len(resumir(obs[k])) > 1 else ''})" for k in ("vitest", "e2e") if obs[k])
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
