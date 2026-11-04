/**
 * Arma el PDF de cada ficha técnica en `fichas-contenido.js` y lo deja en
 * `dist-fichas/`, con un nombre de archivo igual a la referencia —así el
 * importador en lote de Productos → Importar fichas técnicas los empareja
 * solo, sin tener que subirlos uno por uno.
 *
 * Correr con: node scripts/generar-fichas.mjs [carpeta_de_salida]
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfDeFichaTecnica } from '../server/ficha-tecnica-pdf.js';
import { FICHAS } from '../server/fichas-contenido.js';

const RAIZ = dirname(fileURLToPath(new URL('..', import.meta.url)));
const SALIDA = process.argv[2] ? resolve(process.argv[2]) : join(RAIZ, 'dist-fichas');

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

let ok = 0;
let confirmadas = 0;
const nombreDeArchivo = (referencia) => referencia.replace(/[\\/:*?"<>|]/g, '-').trim();

for (const [referencia, datos] of Object.entries(FICHAS)) {
  const pdf = pdfDeFichaTecnica({ ...datos, referencia: datos.referencia ?? referencia });
  const archivo = `${nombreDeArchivo(referencia)}.pdf`;
  writeFileSync(join(SALIDA, archivo), pdf);
  ok += 1;
  if (datos.confianza === 'confirmado') confirmadas += 1;
  console.log(`✓ ${referencia.padEnd(18)} ${(pdf.length / 1024).toFixed(0)} KB  [${datos.confianza}]`);
}

console.log(`\n${ok} ficha(s) generada(s) en dist-fichas/ · ${confirmadas} confirmadas, ${ok - confirmadas} con nota "estándar".`);
