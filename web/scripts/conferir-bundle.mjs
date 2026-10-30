// Confere o build de produção: todo caminho do index.html sob /sankey-fiscal/ (fora o canonical absoluto).
// Uso: node scripts/conferir-bundle.mjs <pasta>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '/sankey-fiscal/';
const CANONICAL = 'https://castrillon.dev/sankey-fiscal/';

const [pasta] = process.argv.slice(2);
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
if (!arquivosJs.length) erros.push(`nenhum .js em ${pasta}`);

if (erros.length) {
  console.error(erros.join('\n'));
  process.exit(1);
}
console.log(`ok: ${pasta}, ${arquivosJs.length} arquivos .js, caminhos sob ${BASE}`);
