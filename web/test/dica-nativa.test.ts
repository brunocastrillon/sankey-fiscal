// Sem dica nativa do navegador: um <title> no SVG (ou um atributo title) vira uma dica do sistema que compete com a Dica
// de hover e pode cobrir os nós. O nome acessível vem de aria-label / aria-labelledby.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const arquivos = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('dica nativa do navegador', () => {
  it('nenhum <title> nem atributo title em web/src', () => {
    const achados = arquivos(SRC).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linha, i) => ({ f, i: i + 1, linha }))
        .filter(({ linha }) => /<title\b|\stitle=/.test(linha))
        .map(({ f, i }) => `${f.slice(SRC.length)}:${i}`),
    );
    expect(achados).toEqual([]);
  });
});
