// Extremo del hilo de trabajo: sólo sabe leer un .xlsx. No toca la base de
// datos ni nada más del sistema, así que no hay nada que sincronizar con el
// hilo principal aparte del mensaje de entrada y el de salida.

import { parentPort } from 'node:worker_threads';
import { leerXlsx } from './xlsx.js';

/**
 * `imagenes` es un Map con una propiedad extra (`sinUbicar`) colgada encima.
 * Eso no es algo que un Map sepa llevar de un hilo a otro tal cual: se pasa
 * a una forma plana acá, y trabajos.js la vuelve a armar del otro lado.
 */
function aplanarImagenes(mapa) {
  return { sinUbicar: mapa.sinUbicar ?? 0, filas: [...mapa.entries()] };
}

parentPort.on('message', ({ id, buffer, byteOffset, byteLength, opciones }) => {
  try {
    const datos = Buffer.from(buffer, byteOffset, byteLength);
    const { hojas } = leerXlsx(datos, opciones);
    const resultado = {
      hojas: hojas.map((h) => ({ ...h, imagenes: aplanarImagenes(h.imagenes) })),
    };
    parentPort.postMessage({ id, resultado });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
