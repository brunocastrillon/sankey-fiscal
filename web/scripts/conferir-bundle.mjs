// Confere o build: caminhos sob /sankey-fiscal/ (fora o canonical absoluto) e o parâmetro ?ano= só no build de teste.
// Uso: node scripts/conferir-bundle.mjs <pasta> [--teste]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '/sankey-fiscal/';
const CANONICAL = 'https://castrillon.dev/sankey-fiscal/';
const SENTINELA = 'PARAM_ANO_SO_TESTE';

const [pasta, modo] = process.argv.slice(2);
const teste = modo === '--teste';
const erros = [];

const html = readFileSync(join(pasta, 'index.html'), 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!url.startsWith('data:') && !url.startsWith(BASE) && url !== CANONICAL) erros.push(`index.html referencia ${url}, fora de ${BASE}`);
}

const arquivosJs = [];
const varrer = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith('.js')) arquivosJs.push(p);
  }
};
varrer(pasta);
const comSentinela = arquivosJs.filter((p) => readFileSync(p, 'utf8').includes(SENTINELA));
if (!teste && comSentinela.length) erros.push(`build de produção contém ${SENTINELA}: ${comSentinela.join(', ')}`);
if (teste && !comSentinela.length) erros.push(`build de teste não contém ${SENTINELA}`);

if (erros.length) {
  console.error(erros.join('\n'));
  process.exit(1);
}
console.log(`ok: ${pasta} (${teste ? 'teste' : 'produção'}), ${arquivosJs.length} arquivos .js, caminhos sob ${BASE}`);
