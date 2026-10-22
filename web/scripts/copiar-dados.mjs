// Copia ../dados/*.json para public/dados/ antes do dev e do build: dados/ continua sendo a única fonte (sem symlink).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Copia os *.json de `origem` para `destino`; devolve os nomes copiados. */
export function copiarDados(origem, destino) {
  mkdirSync(destino, { recursive: true });
  const nomes = readdirSync(origem).filter((f) => f.endsWith('.json'));
  for (const nome of nomes) copyFileSync(join(origem, nome), join(destino, nome));
  return nomes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const nomes = copiarDados(join(raiz, '..', 'dados'), join(raiz, 'public', 'dados'));
  console.log(`${nomes.length} arquivos copiados de dados/ para web/public/dados/`);
}
