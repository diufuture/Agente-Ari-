#!/usr/bin/env node
/* El mismo motor, desde la terminal.
 *
 *   sintetizar reunion.txt
 *   pbpaste | sintetizar --nivel esencial --plantilla claude
 *   sintetizar dictado.md > prompt.md
 */

import { readFile } from 'node:fs/promises';
import { optimizar, NIVELES, PLANTILLAS } from '../src/motor.js';

const argumentos = process.argv.slice(2);
const opciones = { nivel: 'equilibrado', plantilla: 'estructurado' };
const archivos = [];

for (let i = 0; i < argumentos.length; i++) {
  const arg = argumentos[i];
  if (arg === '--nivel' || arg === '-n') opciones.nivel = argumentos[++i];
  else if (arg === '--plantilla' || arg === '-p') opciones.plantilla = argumentos[++i];
  else if (arg === '--sin-datos') opciones.datos = false;
  else if (arg === '--sin-conceptos') opciones.conceptos = false;
  else if (arg === '--sin-preguntas') opciones.preguntas = false;
  else if (arg === '--ayuda' || arg === '-h') { ayuda(); process.exit(0); }
  else archivos.push(arg);
}

function ayuda() {
  console.log(`Sintetiza un dictado largo en un prompt corto. Todo local, sin tokens.

  sintetizar [archivo] [opciones]        (sin archivo, lee de la entrada estándar)

  -n, --nivel       ${Object.keys(NIVELES).join(' | ')}
  -p, --plantilla   ${PLANTILLAS.map((p) => p.id).join(' | ')}
      --sin-datos, --sin-conceptos, --sin-preguntas
`);
}

async function entradaEstandar() {
  const trozos = [];
  for await (const trozo of process.stdin) trozos.push(trozo);
  return Buffer.concat(trozos).toString('utf8');
}

if (!NIVELES[opciones.nivel]) {
  console.error(`Nivel desconocido: ${opciones.nivel}. Usá ${Object.keys(NIVELES).join(', ')}.`);
  process.exit(1);
}
if (!PLANTILLAS.some((p) => p.id === opciones.plantilla)) {
  console.error(`Plantilla desconocida: ${opciones.plantilla}. Usá ${PLANTILLAS.map((p) => p.id).join(', ')}.`);
  process.exit(1);
}

const texto = archivos.length
  ? (await Promise.all(archivos.map((a) => readFile(a, 'utf8')))).join('\n\n')
  : await entradaEstandar();

if (!texto.trim()) {
  ayuda();
  process.exit(1);
}

const { prompt, metricas } = optimizar(texto, opciones);
process.stdout.write(`${prompt}\n`);
process.stderr.write(
  `\n· ${metricas.palabrasEntrada} palabras → ${metricas.palabrasSalida} ` +
  `(${metricas.reduccion > 0 ? `−${metricas.reduccion}%` : 'más estructura'}), ` +
  `~${metricas.tokensAhorrados} tokens menos por consulta\n`,
);
