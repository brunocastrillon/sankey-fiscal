## Resumo (10 linhas)

<!-- Dez linhas, no máximo: o que muda em dados/, o que muda nos testes, as decisões que pedem revisão. -->

1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
9. 
10. 

## Testes e mutações (códigos de saída)

<!-- Cole a saída final, com o código de saída de cada comando (sem pipe). As mutações rodam numa cópia descartável:
     `.venv/Scripts/python tools/mutacoes.py --pdf <caminho do PDF>` (ou `--so <ids>`). -->

- `pytest -q`: 
- `python testes.py`: 
- `python pipeline.py` e `git diff --stat dados/` (o CI confere que `dados/` corresponde ao pipeline): 
- `tools/mutacoes.py`: N/N conferem com o esperado (cole a tabela ou o resumo)
- CI (`validacoes`, `site`, `site-navegador`): tempos de cada job

## Notas de contexto

- [ ] Mexi em `notas.json`? Rodei `python verificar_trechos.py --pdf <caminho>`, colei a saída abaixo e o SHA256 do PDF
      (`Get-FileHash -Algorithm SHA256 <caminho>`). O PDF não vai para o repositório.

```text
(saída do verificar_trechos.py)
SHA256: 
```

## Decisões a conferir

<!-- O que foi decidido no caminho e pode ser revisto, com o custo de mudar. -->
