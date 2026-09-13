/**
 * Trabajo pesado (leer un .xlsx grande, con sus imágenes) corriendo en un
 * hilo aparte, para que mientras se procesa un archivo grande el resto del
 * sistema —el asistente de voz, el dashboard, cualquier otra pestaña
 * abierta— no se quede esperando.
 *
 * Node es de un solo hilo: mientras el hilo principal está ocupado
 * descomprimiendo y leyendo a mano el XML de una hoja grande (con
 * expresiones regulares sobre texto de varios megabytes), ningún otro
 * pedido HTTP avanza, sin importar que esté escrito con `async`. `async`
 * hace no bloqueante la espera de I/O (la descarga, el disco); no reparte
 * trabajo de CPU entre pedidos. Para eso hace falta sacarlo del hilo
 * principal de verdad, que es lo que hace este archivo con un Worker
 * (`node:worker_threads`): un hilo del sistema operativo aparte, sin
 * memoria compartida, que no le quita tiempo de CPU al que atiende las
 * peticiones.
 *
 * El worker no toca la base de datos ni el resto de la aplicación —sólo
 * sabe transformar un buffer en filas— así que no hay nada que coordinar
 * entre los dos hilos aparte de mandarle el archivo y esperar el resultado.
 *
 * Se reutiliza un único worker entre llamadas: arrancar uno nuevo cada vez
 * tiene un costo (decenas de milisegundos) que no vale la pena para los
 * archivos chicos, que son la mayoría. Si se cae, se levanta de nuevo solo.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const RUTA_WORKER = fileURLToPath(new URL('./xlsx-worker.js', import.meta.url));

let worker = null;
let siguienteId = 1;
const pendientes = new Map();

function rechazarTodoYReiniciar(err) {
  for (const tarea of pendientes.values()) tarea.reject(err);
  pendientes.clear();
  worker = null;
}

function arrancarWorker() {
  const w = new Worker(RUTA_WORKER);
  w.on('message', (msg) => {
    const tarea = pendientes.get(msg.id);
    if (!tarea) return; // respuesta de un pedido que ya se dio por perdido
    pendientes.delete(msg.id);
    // Sin nada pendiente, que no sea el worker quien mantenga vivo el
    // proceso (ver la nota en unref() de más abajo).
    if (pendientes.size === 0) w.unref();
    if (msg.error) tarea.reject(new Error(msg.error));
    else tarea.resolve(msg.resultado);
  });
  w.on('error', (err) => rechazarTodoYReiniciar(err));
  w.on('exit', () => {
    rechazarTodoYReiniciar(new Error('El proceso que lee archivos Excel se cerró inesperadamente.'));
  });
  worker = w;
  return w;
}

/** Vuelve a armar el Map-con-propiedad que espera el resto del código. */
function reconstruirImagenes(plano) {
  const mapa = new Map(plano.filas);
  mapa.sinUbicar = plano.sinUbicar;
  return mapa;
}

/**
 * Lo mismo que `leerXlsx` de xlsx.js, pero corrido en el hilo de trabajo.
 * @returns {Promise<{hojas: Array}>}
 */
export function leerXlsxEnSegundoPlano(buffer, opciones = {}) {
  return new Promise((resolve, reject) => {
    const w = worker ?? arrancarWorker();
    const id = siguienteId++;

    // Mientras haya algo pendiente, el worker sí tiene que mantener vivo el
    // proceso: si no, y no queda ningún otro trabajo esperando (por ejemplo
    // en un script como éste, corriendo pruebas), Node puede decidir que ya
    // no hay nada por hacer y salir con la respuesta todavía en camino.
    w.ref();
    pendientes.set(id, {
      resolve: (resultado) => resolve({
        hojas: resultado.hojas.map((h) => ({ ...h, imagenes: reconstruirImagenes(h.imagenes) })),
      }),
      reject,
    });

    // Una copia propia del buffer, en su propio ArrayBuffer exclusivo: el
    // que llega puede compartir memoria con otros (un slice, o un Buffer
    // chico que Node reparte del mismo fondo común para no desperdiciar
    // asignaciones), y transferir eso tal cual se llevaría por delante datos
    // ajenos —o directamente lo rechaza, que es lo que hacía acá. `.slice()`
    // de un TypedArray, a diferencia de Buffer.from(), siempre reserva un
    // ArrayBuffer nuevo y propio, sea cual sea el tamaño.
    const copia = new Uint8Array(buffer).slice();
    w.postMessage(
      { id, buffer: copia.buffer, byteOffset: copia.byteOffset, byteLength: copia.byteLength, opciones },
      [copia.buffer],
    );
  });
}
