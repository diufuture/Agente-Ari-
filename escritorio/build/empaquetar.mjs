/* Empaqueta la interfaz en un solo archivo HTML.
 *
 * Sirve para dos cosas:
 *   1. Es lo que carga la ventana de Electron (un archivo suelto evita
 *      los líos de cargar módulos desde file://).
 *   2. Es la versión «sin instalar nada»: se abre con doble clic en
 *      Safari o Chrome y funciona igual, siempre local.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'dist', 'sintetizador-de-prompts.html');

const leer = (...partes) => readFile(join(RAIZ, ...partes), 'utf8');

const [html, css, motor, app] = await Promise.all([
  leer('src', 'index.html'),
  leer('src', 'estilos.css'),
  leer('src', 'motor.js'),
  leer('src', 'app.js'),
]);

// Al quedar todo en un solo <script>, el motor y la interfaz comparten
// alcance: sobran los `export` y el `import`.
const motorPlano = motor.replace(/^export /gm, '');
const appPlana = app.replace(/^import[\s\S]*?from '\.\/motor\.js';\n/m, '');

// Ojo: el reemplazo va como función. El código lleva `$&` y `$1` dentro
// de sus expresiones regulares, y como texto plano `replace` los
// interpretaría y ensuciaría el archivo.
const unico = html
  .replace('<link rel="stylesheet" href="estilos.css">', () => `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="app.js"></script>',
    () => `<script>\n${motorPlano}\n\n${appPlana}\n</script>`,
  );

if (unico.includes('href="estilos.css"') || unico.includes('src="app.js"')) {
  throw new Error('index.html cambió de forma: el empaquetador no supo dónde meter el CSS o el JS');
}

await mkdir(join(RAIZ, 'dist'), { recursive: true });
await writeFile(DESTINO, unico, 'utf8');

console.log(`Listo: dist/sintetizador-de-prompts.html (${Math.round(unico.length / 1024)} KB)`);
