"""Manifesto de mutações da 3a e o executor que as roda numa cópia descartável do repositório (fora do CI).

Cada mutação diz em que arquivo mexer (trecho -> substituição) e o que se espera: o código de saída de pytest, testes.py,
pipeline.py e verificar_trechos.py, o conjunto de testes que cai (no pytest e no testes.py) e os arquivos de dados/ que a
comparação do CI acusaria. O executor:

1. recusa rodar se o Python não é o do .venv do repositório;
2. cria uma cópia descartável com `git worktree add --detach` numa pasta temporária, fora do repositório (nunca mexe na
   árvore de trabalho principal);
3. para cada mutação, aplica as edições, roda os comandos (sem shell e sem pipe, timeout de 300 s cada), lendo o código de
   saída de cada um, e restaura os arquivos;
4. imprime uma tabela em Markdown e sai com 1 se algum resultado for diferente do esperado;
5. remove a cópia e roda `git worktree prune`.

Uso (na raiz do repositório):
    .venv/Scripts/python tools/mutacoes.py --pdf C:/caminho/RTN_Boletim_2020_12.pdf
    .venv/Scripts/python tools/mutacoes.py --pdf ... --so 1,6,17 --tabela saida.md
    .venv/Scripts/python tools/mutacoes.py --pdf ... --esboco     # imprime o observado, para revisar e fixar

Sem --pdf, o verificar_trechos.py não roda (o código esperado dele não é conferido).
Os trechos valem para o código da 3a; numa sub-fase nova, acrescente mutações e confira que cada trecho ainda é único.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def mut(id_, nome, edicoes, codigos, pytest=(), testes=(), diff="igual"):
    """Uma mutação. codigos: saídas esperadas de pytest, testes.py, pipeline.py e verificar_trechos.py, nessa ordem.
    pytest e testes: o conjunto de testes que cai em cada um. diff: arquivos de dados/ que a comparação do CI acusaria
    ("igual" se nenhum; "—" se o pipeline não chega a gerar)."""
    return {"id": id_, "nome": nome, "edicoes": edicoes,
            "esperado": dict(zip(("pytest", "testes", "pipeline", "verificar"), codigos)),
            "caem": {"pytest": list(pytest), "testes": list(testes)}, "diff": diff}


# Testes que caem quando o pipeline não gera os dados (montar_anos levanta ValueError antes de gravar)
QUANDO_O_PIPELINE_PARA = ["test_bloco_pib_no_json_e_ultimo_trimestre_do_arquivo_no_indice", "test_subcontas_no_json",
                          "T11", "test_notas_de_2020_com_os_valores_da_serie",
                          "test_notas_no_json_e_lista_vazia_nos_outros_anos", "test_textos_com_codigo_e_nome_da_linha",
                          "test_base_precos_em_toda_nota_com_valor"]
NOTA21 = '"no": "bolsa_familia",\n    "classe": "contexto"'  # a nota de contexto da Nota 21
NOTA21_ATE_TRECHO = ('"arquivo_sha256": "1417803c9eddbca4ece724d264138a2d0c44d1b8c0a024699d763c0fcda423ef",\n'
                     '        "trecho": "houve migração')

# (arquivo, trecho, substituição); o trecho tem de aparecer uma vez só (ou use "primeira" como 4º elemento).
# Os conjuntos de testes que caem foram observados (--esboco) e revisados um a um antes de virar o esperado.
MUTACOES = [
    mut("1", "valores de 4.3.03 e 4.3.07 trocados no dados/2020.json (real e nominal)",
        [("dados/2020.json", "108120.886", "@@A@@"), ("dados/2020.json", "591910.668", "108120.886"),
         ("dados/2020.json", "@@A@@", "591910.668"), ("dados/2020.json", "78247.026", "@@B@@"),
         ("dados/2020.json", "429608.08", "78247.026"), ("dados/2020.json", "@@B@@", "429608.08")],
        (1, 1, 0, 0)),
    mut("2", "nota de fatos do Bolsa Família no nó da Saúde",
        [("notas.json", '"no": "bolsa_familia",\n    "classe": "fatos"', '"no": "saude_obrigatoria",\n    "classe": "fatos"')],
        (1, 1, 1, 0)),
    mut("3", "\"a maior fatia\" no texto da nota da Nota 18",
        [("notas.json", "Entre elas, o Tesouro destaca", "A maior fatia vem delas; o Tesouro destaca")], (1, 1, 1, 0)),
    mut("4", "{codigo:4.3.10} na nota 2, fora da fonte",
        [("notas.json", "esse está na linha {codigo:4.3.07} {nome:4.3.07}, segundo",
          "esse está na linha {codigo:4.3.07} {nome:4.3.07}, não na {codigo:4.3.10}, segundo")], (1, 1, 1, 0)),
    mut("5", "termo novo nas duas listas de termos com dígito",
        [("pipeline.py", 'TERMOS_COM_DIGITO = ("Covid-19",)', 'TERMOS_COM_DIGITO = ("Covid-19", "Lei 14.020")'),
         ("testes.py", 'TERMOS_COM_DIGITO_APROVADOS = ("Covid-19",)', 'TERMOS_COM_DIGITO_APROVADOS = ("Covid-19", "Lei 14.020")')],
        (1, 1, 0, 0)),
    mut("6", "3T2020 removido do CSV do PIB",
        [("entrada/tabela1846.csv", '"3º trimestre 2020";', ""),
         ("entrada/tabela1846.csv", '"PIB a preços de mercado";', "", "primeira"),
         ("entrada/tabela1846.csv", '"1929323";', "")], (1, 1, 1, 0)),
    mut("7", "{mes:4.4.1.2:13} no texto da nota do Bolsa Família",
        [("notas.json", "contra {mes:4.4.1.2:03} só em março", "contra {mes:4.4.1.2:13} só em março")], (1, 1, 1, 0)),
    mut("8", "{soma:4.4.1.2:08-04} (início maior que o fim)",
        [("notas.json", "{soma:4.4.1.2:04-08} entre abril", "{soma:4.4.1.2:08-04} entre abril")], (1, 1, 1, 0)),
    mut("9", "trimestre duplicado no CSV do PIB",
        [("entrada/tabela1846.csv", '"2º trimestre 2015"', '"1º trimestre 2015"')], (1, 1, 1, 0)),
    mut("10", "resíduo na fonte: 1.1.03.1 de mai/2018 + R$ 1 mi (a mãe 1.1.03 não muda)",
        [("pipeline.py", '    corpo = corpo.apply(pd.to_numeric, errors="coerce")\n',
          '    corpo = corpo.apply(pd.to_numeric, errors="coerce")\n    if aba == "1.2":\n'
          '        corpo.loc["1.1.03.1", pd.Timestamp("2018-05-01")] += 1\n')], (1, 1, 0, 0)),
    mut("11", "trecho inventado na citação da Nota 21",
        [("notas.json", '"trecho": "houve migração temporária desses benefícios para os benefícios de auxílio emergencial"',
          '"trecho": "houve migração definitiva desses benefícios para o auxílio emergencial"')], (0, 0, 0, 1)),
    mut("12", "dados/2020.json: nominal da 4.3.07 + 1.000, sem regenerar",
        [("dados/2020.json", "429608.08", "430608.08")], (1, 1, 0, 0)),
    mut("13", "dados/2020.json: real da 4.3.07 + 0,002, sem regenerar",
        [("dados/2020.json", "591910.668", "591910.67")], (1, 1, 0, 0)),
    mut("14", "código de subconta trocado no pipeline (4.3.07 gravada como 4.3.08), valor certo",
        [("pipeline.py", '[{"codigo": c, "nome": nomes[c],', '[{"codigo": ("4.3.08" if c == "4.3.07" else c), "nome": nomes[c],')],
        (1, 1, 0, 0)),
    mut("15", "código de subconta trocado à mão no dados/2020.json (4.3.07 -> 4.3.08), valor certo",
        [("dados/2020.json", '"codigo": "4.3.07"', '"codigo": "4.3.08"')], (1, 1, 0, 0)),
    mut("17", "referência do boletim: 4.3.07 + 0,4% (431.215,2)",
        [("referencias/boletim-dez-2020.json", '"valor": 429497.2,', '"valor": 431215.2,')], (1, 1, 0, 0)),
    mut("18", "Fundeb (Nota 18) com linha_rtn \"4\"",
        [("notas.json", 'combate ao Covid-19",\n        "linha_rtn": "4.3.07"', 'combate ao Covid-19",\n        "linha_rtn": "4"')],
        (1, 1, 1, 0)),
    mut("19", "Bolsa Família (Nota 21) com linha_rtn \"4\"",
        [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4",')], (1, 1, 1, 0)),
    mut("20", "Fundeb (Nota 18) com linha_rtn \"4.3.05\"",
        [("notas.json", 'combate ao Covid-19",\n        "linha_rtn": "4.3.07"', 'combate ao Covid-19",\n        "linha_rtn": "4.3.05"')],
        (1, 1, 1, 0)),
    mut("21", "Bolsa Família (Nota 21) com linha_rtn \"4.4.1.3\"",
        [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.4.1.3",')], (1, 1, 1, 0)),
    mut("22", "nota de fatos do Fundeb com {linha:4.3.05}, com a 4.3.05 na fonte",
        [("notas.json", '{nome:4.3.01}."', '{nome:4.3.01}. O BPC soma {linha:4.3.05}."'),
         ("notas.json", '          "4.3.10"\n        ],', '          "4.3.10",\n          "4.3.05"\n        ],')],
        (1, 1, 1, 0)),
    # 3ª passada: esquema fechado, regras por campo, tipo desconhecido, quantificadores, valor de nó editado à mão
    mut("N1", "citação da Nota 21 com tipo \"Boletim\" (maiúsculo)",
        [("notas.json", '"tipo": "boletim",\n        "publicacao": "Resultado do Tesouro Nacional, dezembro de 2020",\n'
                        '        "boletim": "v. 26, n. 12",\n        "base_precos": "R$ correntes (o boletim publica a preços correntes)",\n'
                        '        "pagina": 9,\n        "nota": "Nota 21',
          '"tipo": "Boletim",\n        "publicacao": "Resultado do Tesouro Nacional, dezembro de 2020",\n'
          '        "boletim": "v. 26, n. 12",\n        "base_precos": "R$ correntes (o boletim publica a preços correntes)",\n'
          '        "pagina": 9,\n        "nota": "Nota 21')], (1, 1, 1, 1)),
    mut("N2", "observacao dentro da citação da Nota 21 (chave desconhecida)",
        [("notas.json", NOTA21_ATE_TRECHO, NOTA21_ATE_TRECHO.replace('"trecho"', '"observacao": "x",\n        "trecho"'))],
        (1, 1, 1, 0)),
    mut("N3", "dígito na observacao (\"em 2020\")",
        [("notas.json", "a tabela da p. 7 numera diferente\"", "a tabela da p. 7 numera diferente em 2020\"", "primeira")],
        (1, 1, 1, 0)),
    mut("N4", "dígito no trecho da Nota 16 (\"… e DF em 2020\")",
        [("notas.json", "Estados, Municípios e DF\"", "Estados, Municípios e DF em 2020\"")], (1, 1, 1, 1)),
    mut("N5", "nota da Nota 21 fora da forma \"Nota N …\" (\"21\")",
        [("notas.json", '"nota": "Nota 21 das Notas Explicativas do resultado acumulado"', '"nota": "21"')], (1, 1, 1, 0)),
    mut("N6", "verificado_em inexistente (2026-02-30) na Nota 21",
        [("notas.json", '"verificado_em": "2026-10-26",\n        ' + NOTA21_ATE_TRECHO,
          '"verificado_em": "2026-02-30",\n        ' + NOTA21_ATE_TRECHO)], (1, 1, 1, 0)),
    mut("N7", "verificado_em no futuro (2999-01-01) na Nota 21",
        [("notas.json", '"verificado_em": "2026-10-26",\n        ' + NOTA21_ATE_TRECHO,
          '"verificado_em": "2999-01-01",\n        ' + NOTA21_ATE_TRECHO)], (1, 1, 1, 0)),
    mut("N8", "quantificador novo: \"Boa parte\" no texto da nota da Nota 18",
        [("notas.json", "Entre elas, o Tesouro destaca", "Boa parte vem delas; o Tesouro destaca")], (1, 1, 1, 0)),
    mut("N9", "R13: dados/2020.json, real do nó Fundeb e outras + 1.000, sem regenerar",
        [("dados/2020.json", "906938.601", "907938.601")], (1, 1, 0, 0)),
    mut("N10", "R13b: dados/2020.json, nominal do nó Fundeb e outras + 1.000, sem regenerar",
        [("dados/2020.json", "657775.789", "658775.789")], (1, 1, 0, 0)),
    mut("N11", "linha_rtn válida trocada: Nota 21 com 4.4.1.2 (em L) — passa",
        [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.4.1.2",')], (0, 0, 0, 0)),
    # 4ª passada (regressões): conjuntos fechados (X1–X3), comparação falsa (X9), esquema do AAAA.json sem regenerar
    # (equivalentes a X4–X8 e X10), regra da mãe direta (M2), segunda série com nome sem data (B2)
    mut("X1", "titulo da série com valor: \"Série histórica do RTN, aba 1.2 (R$ 293,1 bi)\"",
        [("notas.json", '"titulo": "Série histórica do RTN, aba 1.2",', '"titulo": "Série histórica do RTN, aba 1.2 (R$ 293,1 bi)",')],
        (1, 1, 1, 0)),
    mut("X2", "boletim com valor: \"v. 26, n. 12 (R$ 293,1 bi)\" (1ª citação)",
        [("notas.json", '"boletim": "v. 26, n. 12",', '"boletim": "v. 26, n. 12 (R$ 293,1 bi)",', "primeira")], (1, 1, 1, 0)),
    mut("X3", "observacao com \"p. 2931\" (1ª nota de contexto)",
        [("notas.json", "Notas Explicativas, p. 9;", "Notas Explicativas, p. 2931;", "primeira")], (1, 1, 1, 0)),
    mut("X9", "comparação falsa: soma de abril a agosto > março (Bolsa Família)",
        [("notas.json", '"{soma:4.4.1.2:04-08}",\n        "<",', '"{soma:4.4.1.2:04-08}",\n        ">",')], (1, 1, 1, 0)),
    mut("X4e", "dados/2020.json: valor de nó em real.nos como texto (imposto_renda), sem regenerar",
        [("dados/2020.json", '"imposto_renda": 384124.926,', '"imposto_renda": "384124.926",')], (1, 1, 0, 0)),
    mut("X5e", "dados/2020.json: pib.valor_nominal como texto, sem regenerar",
        [("dados/2020.json", '"valor_nominal": 7609597.0,', '"valor_nominal": "7609597.0",')], (1, 1, 0, 0)),
    mut("X6e", "dados/2020.json: real de subconta como texto (4.3.07), sem regenerar",
        [("dados/2020.json", '"real": 591910.668,', '"real": "591910.668",')], (1, 1, 0, 0)),
    mut("X7e", "dados/2020.json: notas como objeto no lugar de lista, sem regenerar",
        [("dados/2020.json", '"notas": [', '"notas": {"lista": ['), ("dados/2020.json", "  ]\n}", "  ]}\n}")], (1, 1, 0, 0)),
    mut("X8e", "dados/2020.json: tipo de citação numérico na 1ª nota, sem regenerar",
        [("dados/2020.json", '"tipo": "serie",', '"tipo": 7,', "primeira")], (1, 1, 0, 0)),
    mut("X10e", "dados/2020.json: base_precos nulo numa nota com valores, sem regenerar",
        [("dados/2020.json", '"base_precos": "R$ constantes de dez/2025 (IPCA)"', '"base_precos": null', "primeira")],
        (1, 1, 0, 0)),
    mut("M2a", "nota da Nota 21 no nó BPC com linha_rtn \"4.3\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "bpc")), ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.3",')],
        (1, 1, 1, 0)),
    mut("M2b", "nota da Nota 21 no nó Imposto de Renda com linha_rtn \"1.1\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "imposto_renda")),
         ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "1.1",')], (1, 1, 1, 0)),
    mut("M2c", "nota da Nota 21 no nó CSLL com linha_rtn \"1.1\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "csll")), ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "1.1",')],
        (1, 1, 1, 0)),
    mut("M2d", "nota da Nota 21 no nó Cofins e PIS com linha_rtn \"1.1\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "cofins_pis")),
         ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "1.1",')], (1, 1, 1, 0)),
    mut("M2e", "nota da Nota 21 no nó IOF, IPI e importação com linha_rtn \"1.1\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "iof_ipi_importacao")),
         ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "1.1",')], (1, 1, 1, 0)),
    mut("M2f", "nota da Nota 21 no nó Saúde com linha_rtn \"4.4.1\" e sem menciona",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "saude_obrigatoria")),
         ("notas.json", '"linha_rtn": "4.4.1",\n        "menciona": "4.4.1.2"', '"linha_rtn": "4.4.1"')], (1, 1, 1, 0)),
    mut("M2g", "nota da Nota 21 no nó Demais com controle de fluxo com linha_rtn \"4.4.1\" e sem menciona",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "demais_controle_fluxo")),
         ("notas.json", '"linha_rtn": "4.4.1",\n        "menciona": "4.4.1.2"', '"linha_rtn": "4.4.1"')], (1, 1, 1, 0)),
    mut("M2h", "nota da Nota 21 no nó Discricionárias com linha_rtn \"4.4\"",
        [("notas.json", NOTA21, NOTA21.replace("bolsa_familia", "discricionarias")),
         ("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.4",')], (1, 1, 1, 0)),
    mut("M2i", "Bolsa Família (Nota 21) com linha_rtn \"4.4.1.1\" (irmã)",
        [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.4.1.1",')], (1, 1, 1, 0)),
    mut("M2j", "Bolsa Família (Nota 21) com linha_rtn \"4.3\" (outra mãe)",
        [("notas.json", '"linha_rtn": "4.4.1",', '"linha_rtn": "4.3",')], (1, 1, 1, 0)),
    mut("M2k", "mãe direta sem menciona: Bolsa Família (Nota 21) com linha_rtn \"4.4.1\" e sem menciona",
        [("notas.json", '"linha_rtn": "4.4.1",\n        "menciona": "4.4.1.2"', '"linha_rtn": "4.4.1"')], (1, 1, 1, 0)),
    mut("B2", "segunda série histórica com nome sem data em entrada/ (seriehistorica.xlsx)",
        [("entrada/seriehistorica.xlsx", None, "")], (2, 2, 2, 0)),
    mut("C", "controle: referência do boletim: 4.3.07 + 0,05% (429.711,9) — passa",
        [("referencias/boletim-dez-2020.json", '"valor": 429497.2,', '"valor": 429711.9,')], (0, 0, 0, 0)),
]


# Esperado de cada mutação: (testes que caem no pytest, testes que caem no testes.py, arquivos que o diff do CI
# acusaria). Observado com --esboco (4ª passada, em 096f196) e revisado um a um (ver o PR #18).
# Quando as notas param o pipeline (a validação vem antes do PIB), o teste do PIB nulo também vê o erro das notas.
QUANDO_AS_NOTAS_PARAM_O_PIPELINE = QUANDO_O_PIPELINE_PARA + ["test_valor_nulo_tira_o_ano_e_o_pipeline_falha"]
NOTAS_INVALIDAS = sorted(QUANDO_AS_NOTAS_PARAM_O_PIPELINE + ["T22", "test_notas_e_dados_de_hoje_sao_validos",
                                                          "test_observacao_aceita_paginas_p_n"])
CAEM = {
    '1': (['T20', 'T21', 'test_subcontas_boletim_dez_2020', 'test_subcontas_oraculo', 'test_t21_tolerancia_de_0_1_por_cento[1.0005-True]'],
           ['T20', 'T21'], ['2020.json']),
    '2': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '3': (QUANDO_AS_NOTAS_PARAM_O_PIPELINE + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17'], '—'),
    '4': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '5': (['T23'],
           ['T23'], []),
    '6': (QUANDO_O_PIPELINE_PARA + ['A4', 'T13', 'test_a4_pulada_quando_o_t13_falha'],
           ['A4', 'T11', 'T13'], '—'),
    '7': (NOTAS_INVALIDAS + ['T17', 'test_pipeline_recusa_conteudo_invalido_antes_de_gravar[compara\\xe7\\xe3o falsa (X9)]', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '8': (NOTAS_INVALIDAS + ['T17', 'test_pipeline_recusa_conteudo_invalido_antes_de_gravar[compara\\xe7\\xe3o falsa (X9)]', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '9': (QUANDO_AS_NOTAS_PARAM_O_PIPELINE + ['A3', 'A4', 'T13', 'test_a4_pulada_quando_o_t13_falha', 'test_ano_incompleto_fica_fora_e_ultimo_trimestre_e_o_do_arquivo', 'test_trimestre_duplicado_levanta'],
           ['A3', 'A4', 'T11', 'T13'], '—'),
    '10': (['T14'],
           ['T14'], ['2018.json']),
    '11': ([],
           [], ['2020.json']),
    '12': (['T20', 'T21', 'T24', 'test_dados_publicados_fecham', 'test_subcontas_boletim_dez_2020', 'test_subcontas_oraculo', 'test_t21_tolerancia_de_0_1_por_cento[1.0005-True]'],
           ['T20', 'T21', 'T24'], ['2020.json']),
    '13': (['T20', 'test_subcontas_oraculo'],
           ['T20'], ['2020.json']),
    '14': (['T14', 'T15'],
           ['T14', 'T15'], ['2015.json', '2016.json', '2017.json', '2018.json', '2019.json', '2020.json', '2021.json', '2022.json', '2023.json', '2024.json', '2025.json']),
    '15': (['T20', 'T21', 'test_subcontas_boletim_dez_2020', 'test_subcontas_oraculo', 'test_t21_tolerancia_de_0_1_por_cento[1.0005-True]', 'test_t21_tolerancia_de_0_1_por_cento[1.004-False]'],
           ['T20', 'T21'], ['2020.json']),
    '17': (['T21', 'test_subcontas_boletim_dez_2020', 'test_t21_tolerancia_de_0_1_por_cento[1.0005-True]'],
           ['T21'], []),
    '18': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '19': (NOTAS_INVALIDAS + ['T17'],
           ['T11', 'T17', 'T22'], '—'),
    '20': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    '21': (NOTAS_INVALIDAS + ['T17'],
           ['T11', 'T17', 'T22'], '—'),
    '22': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    'N1': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'N2': (NOTAS_INVALIDAS + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T22'], '—'),
    'N3': (NOTAS_INVALIDAS + ['T16', 'T19', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T19', 'T22'], '—'),
    'N4': (NOTAS_INVALIDAS + ['T16', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T22'], '—'),
    'N5': (NOTAS_INVALIDAS + ['T16', 'T19', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T19', 'T22'], '—'),
    'N6': (NOTAS_INVALIDAS + ['T16', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T22'], '—'),
    'N7': (NOTAS_INVALIDAS + ['T16', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T22'], '—'),
    'N8': (QUANDO_AS_NOTAS_PARAM_O_PIPELINE + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17'], '—'),
    'N9': (['T24', 'test_dados_publicados_fecham'],
           ['T24'], ['2020.json']),
    'N10': (['T24', 'test_dados_publicados_fecham'],
           ['T24'], ['2020.json']),
    'N11': ([],
           [], ['2020.json']),
    'X1': (NOTAS_INVALIDAS + ['T16', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T22'], '—'),
    'X2': (NOTAS_INVALIDAS + ['T16', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T22'], '—'),
    'X3': (NOTAS_INVALIDAS + ['T16', 'T19', 'test_termos_com_digito_e_lista_fechada_so_com_covid'],
           ['T11', 'T16', 'T19', 'T22'], '—'),
    'X9': (QUANDO_AS_NOTAS_PARAM_O_PIPELINE + ['T17', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17'], '—'),
    'X4e': (['T22', 'T24', 'test_dados_publicados_fecham', 'test_notas_e_dados_de_hoje_sao_validos'],
           ['T22', 'T24'], ['2020.json']),
    'X5e': (['T22', 'test_notas_e_dados_de_hoje_sao_validos'],
           ['T22'], ['2020.json']),
    'X6e': (['T20', 'T22', 'T24', 'test_dados_publicados_fecham', 'test_notas_e_dados_de_hoje_sao_validos', 'test_subcontas_oraculo'],
           ['T20', 'T22', 'T24'], ['2020.json']),
    'X7e': (['T22', 'test_b1_esquema_declarativo_do_ano[base_precos nulo com valores (X10)]', 'test_b1_esquema_declarativo_do_ano[fonte objeto (X8)]', 'test_b1_formas_erradas_viram_erros_e_nunca_excecao[fonte texto]', 'test_b1_formas_erradas_viram_erros_e_nunca_excecao[nota n\\xfamero]', 'test_notas_e_dados_de_hoje_sao_validos', 'test_validar_ano_recusa[base_precos de outro m\\xeas]', 'test_validar_ano_recusa[chave na cita\\xe7\\xe3o]', 'test_validar_ano_recusa[chave na nota]'],
           ['T22'], ['2020.json']),
    'X8e': (['T22', 'test_notas_e_dados_de_hoje_sao_validos'],
           ['T22'], ['2020.json']),
    'X10e': (['T22', 'test_notas_e_dados_de_hoje_sao_validos'],
           ['T22'], ['2020.json']),
    'M2a': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2b': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2c': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2d': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2e': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2f': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2g': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2h': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'M2i': (NOTAS_INVALIDAS + ['T17'],
           ['T11', 'T17', 'T22'], '—'),
    'M2j': (NOTAS_INVALIDAS + ['T17'],
           ['T11', 'T17', 'T22'], '—'),
    'M2k': (NOTAS_INVALIDAS + ['T17', 'T19', 'test_t17_regra_unica_aceita_bolsa_com_4_4_1'],
           ['T11', 'T17', 'T19', 'T22'], '—'),
    'B2': (['tests/test_notas.py', 'tests/test_pib.py', 'tests/test_referencia.py', 'tests/test_subcontas.py', 'tests/test_validacao.py', 'tests/test_validacoes.py'],
           [], '—'),
    'C': ([],
           [], []),
}
for _m in MUTACOES:
    _p, _t, _d = CAEM[_m["id"]]
    _m["caem"], _m["diff"] = {"pytest": _p, "testes": _t}, _d


def aplicar(copia, edicoes):
    """Aplica as edições na cópia; devolve {arquivo: bytes originais} para restaurar."""
    originais = {}
    for e in edicoes:
        arquivo, trecho, subst = e[:3]
        f = copia / arquivo
        if trecho is None:  # cria o arquivo (e a restauração o apaga)
            if f.exists():
                raise SystemExit(f"{arquivo} já existe na cópia")
            originais[arquivo] = None
            f.write_bytes(subst.encode("utf-8"))
            continue
        originais.setdefault(arquivo, f.read_bytes())
        texto = f.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in texto else "\n"
        trecho, subst = trecho.replace("\n", nl), subst.replace("\n", nl)
        n = texto.count(trecho)
        if n == 0 or (n > 1 and (len(e) < 4 or e[3] != "primeira")):
            raise SystemExit(f"{arquivo}: trecho aparece {n} vezes: {trecho[:60]!r}")
        f.write_bytes(texto.replace(trecho, subst, 1).encode("utf-8"))
    return originais


TIMEOUT_S = 300  # por comando


def rodar(argv, cwd):
    try:
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, encoding="utf-8", timeout=TIMEOUT_S,
                           env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except subprocess.TimeoutExpired:
        return "timeout", ""
    return r.returncode, r.stdout + r.stderr


def caiu_no_pytest(saida):
    ids = re.findall(r"^(?:FAILED|ERROR) (.+?)(?: - .*)?$", saida, re.M)
    return sorted({re.sub(r"^test_validacao\[(.+)\]$", r"\1", i.split("::")[-1]) for i in ids})


def caiu_no_testes(saida):
    return sorted(set(re.findall(r"^\[FALHOU\] (\S+)", saida, re.M)))


def comparar_dados(a, b):
    """Arquivos de dados/ que diferem entre a cópia e o que o pipeline gerou (fim de linha normalizado, como no CI)."""
    norm = lambda p: p.read_bytes().replace(b"\r\n", b"\n")
    nomes = sorted({p.name for p in a.glob("*.json")} | {p.name for p in b.glob("*.json")})
    return [n for n in nomes if not (a / n).exists() or not (b / n).exists() or norm(a / n) != norm(b / n)]


def observar(m, copia, base, py, pdf):
    """Aplica a mutação, roda os quatro comandos e devolve o observado: códigos, o que caiu e o diff."""
    originais = aplicar(copia, m["edicoes"])
    try:
        cod, obs = {}, {}
        cod["pytest"], s = rodar([py, "-m", "pytest", "-q", "-p", "no:cacheprovider"], copia)
        obs["pytest"] = caiu_no_pytest(s)
        cod["testes"], s = rodar([py, "-X", "utf8", "testes.py"], copia)
        obs["testes"] = caiu_no_testes(s)
        saida = base / f"saida-{m['id']}"
        shutil.rmtree(saida, ignore_errors=True)
        cod["pipeline"], s = rodar([py, "-X", "utf8", "pipeline.py", "--saida", str(saida)], copia)
        obs["erro_pipeline"] = (s.strip().splitlines() or ["—"])[-1][:100] if cod["pipeline"] else "—"
        obs["diff"] = comparar_dados(copia / "dados", saida) if cod["pipeline"] == 0 else "—"
        if pdf:
            cod["verificar"], s = rodar([py, "-X", "utf8", "verificar_trechos.py", "--pdf", pdf], copia)
            obs["verificar"] = [l[9:90] for l in s.splitlines() if l.startswith("[FALHOU]")]
        else:
            cod["verificar"], obs["verificar"] = None, None
    finally:
        for arquivo, b in originais.items():
            if b is None:
                (copia / arquivo).unlink()
            else:
                (copia / arquivo).write_bytes(b)
    return cod, obs


def conferir(m, cod, obs):
    """Diferenças entre o esperado e o observado (lista vazia se confere)."""
    e, dif = m["esperado"], []
    for k in ("pytest", "testes", "pipeline", "verificar"):
        if cod[k] is not None and cod[k] != e[k]:
            dif.append(f"saída de {k} {cod[k]} (esperado {e[k]})")
    for k in ("pytest", "testes"):
        if sorted(m["caem"][k]) != obs[k]:
            dif.append(f"caem no {k}: {obs[k]} (esperado {sorted(m['caem'][k])})")
    esperado_diff = m["diff"] if isinstance(m["diff"], str) else sorted(m["diff"])
    if obs["diff"] != esperado_diff:
        dif.append(f"diff {obs['diff']} (esperado {esperado_diff})")
    return dif


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", help="PDF do boletim do RTN de dez/2020 (para o verificar_trechos.py)")
    ap.add_argument("--so", help="ids separados por vírgula (padrão: todas)")
    ap.add_argument("--tabela", help="grava a tabela em Markdown neste arquivo")
    ap.add_argument("--ref", default="HEAD", help="commit a testar (padrão: HEAD)")
    ap.add_argument("--esboco", action="store_true", help="imprime o observado no formato do manifesto (para revisar)")
    a = ap.parse_args()
    venv = (RAIZ / ".venv").resolve()
    if Path(sys.prefix).resolve() != venv:
        raise SystemExit(f"rode com o Python do .venv ({venv}), não com {sys.executable}")
    py = sys.executable
    escolhidas = [m for m in MUTACOES if not a.so or m["id"] in a.so.split(",")]
    base = Path(tempfile.mkdtemp(prefix="sankey-mutacoes-"))
    copia = base / "copia"
    subprocess.run(["git", "worktree", "add", "--detach", str(copia), a.ref], cwd=RAIZ, check=True, capture_output=True)
    linhas, divergentes = [], []
    try:
        print(f"cópia descartável: {copia} ({a.ref})")
        for m in escolhidas:
            cod, obs = observar(m, copia, base, py, a.pdf)
            dif = conferir(m, cod, obs)
            if dif:
                divergentes.append(m["id"])
            if a.esboco:
                print(f'    # {m["id"]}: "caem": {{"pytest": {obs["pytest"]}, "testes": {obs["testes"]}}}, '
                      f'"diff": {obs["diff"]!r}, códigos {cod}', flush=True)
            esp = "/".join(str(m["esperado"][k]) for k in ("pytest", "testes", "pipeline", "verificar"))
            obt = "/".join("—" if cod[k] is None else str(cod[k]) for k in ("pytest", "testes", "pipeline", "verificar"))
            caiu = "; ".join(f"{k}: {', '.join(obs[k])}" for k in ("pytest", "testes", "verificar") if obs[k])
            diff = obs["diff"] if isinstance(obs["diff"], str) else (", ".join(obs["diff"]) or "igual")
            linhas.append(f"| {m['id']} | {m['nome']} | {esp} | {obt} | {'sim' if not dif else '**NÃO**: ' + '; '.join(dif)} | "
                          f"{obs['erro_pipeline']} | {diff} | {caiu or '—'} |")
            print(linhas[-1], flush=True)
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(copia)], cwd=RAIZ, capture_output=True)
        subprocess.run(["git", "worktree", "prune"], cwd=RAIZ, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)
    cab = ("| # | Mutação | Esperado (pytest/testes/pipeline/verificar) | Obtido | Confere (códigos, testes que caem, diff) "
           "| Erro do pipeline | Diff do CI sobre dados/ | O que caiu |\n| --- | --- | --- | --- | --- | --- | --- | --- |")
    tabela = cab + "\n" + "\n".join(linhas)
    if a.tabela:
        Path(a.tabela).write_text(tabela + "\n", encoding="utf-8")
    print("\n" + tabela)
    print(f"\n{len(escolhidas) - len(divergentes)}/{len(escolhidas)} conferem com o esperado"
          + (f"; divergentes: {divergentes}" if divergentes else ""))
    sys.exit(1 if divergentes else 0)


if __name__ == "__main__":
    main()
