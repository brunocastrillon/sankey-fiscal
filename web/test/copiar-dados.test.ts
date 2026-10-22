import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copiarDados } from '../scripts/copiar-dados.mjs';
import { anos, PASTA_DADOS } from './apoio/dados';

describe('dados do site', () => {
  it('anos() devolve exatamente os 11 anos que existem em dados/', () => {
    const arquivos = readdirSync(PASTA_DADOS)
      .filter((f) => f.endsWith('.json') && f !== 'indice.json')
      .map((f) => Number(f.replace('.json', '')))
      .sort((a, b) => a - b);
    expect(anos()).toHaveLength(11);
    expect(anos()).toEqual(arquivos);
  });

  it('copiarDados copia os anos e o índice, sem alterar o conteúdo', () => {
    const destino = mkdtempSync(join(tmpdir(), 'sankey-dados-'));
    const copiados = copiarDados(PASTA_DADOS, destino);
    expect(copiados.sort()).toEqual([...anos().map((a) => `${a}.json`), 'indice.json'].sort());
    expect(readFileSync(join(destino, '2025.json'), 'utf8')).toBe(readFileSync(join(PASTA_DADOS, '2025.json'), 'utf8'));
  });
});
