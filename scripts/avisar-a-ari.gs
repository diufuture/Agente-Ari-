/**
 * ─────────────────────────────────────────────────────────────────────
 *  ENLACE CON ARI  ·  pegar al final del Apps Script de la hoja
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Hace dos cosas:
 *
 *   1. avisarAAri(...)       Cuando alguien toma un turno en la web, la cita
 *                            aparece sola en la agenda de Ari.
 *
 *   2. sincronizarConAri()   Cada tanto le manda a Ari la lista completa de
 *                            turnos que siguen en pie. Lo que ya no está en la
 *                            hoja (porque borraste la fila cuando alguien
 *                            canceló) se marca cancelado en la agenda.
 *
 *  ── CONFIGURACIÓN ───────────────────────────────────────────────────
 */

// La dirección de Ari, y el mismo token que quedó en ARI_TOKEN_ENLACE.
var ARI_URL   = 'https://ari.clickcontrol.co';
var ARI_TOKEN = 'PEGAR-ACA-EL-MISMO-TOKEN-DE-ARI_TOKEN_ENLACE';

// Cómo se llama este proyecto en la agenda.
var ARI_PROYECTO = 'Amazonía 96';

// La pestaña donde están las citas, y en qué columna está cada dato.
// OJO: revisá que estos números coincidan con tu hoja. La columna A es 1.
var ARI_HOJA      = 'Citas';
var ARI_COL_FECHA    = 1;   // A · 2026-08-21
var ARI_COL_HORA     = 2;   // B · 8:30
var ARI_COL_NOMBRE   = 3;   // C
var ARI_COL_APTO     = 4;   // D
var ARI_COL_TELEFONO = 5;   // E
var ARI_COL_CORREO   = 6;   // F
var ARI_FILA_INICIO  = 2;   // la 1 es el encabezado

/* ─────────────────────────────────────────────────────────────────────
 *  1 · Avisar de un agendamiento nuevo
 *
 *  Llamá a esta función justo después de la línea donde ya guardás la fila
 *  en la hoja, dentro de tu doPost().
 * ───────────────────────────────────────────────────────────────────── */
function avisarAAri(datos) {
  llamarAAri('/api/enlace/cita', {
    proyecto: ARI_PROYECTO,
    fecha:    datos.fecha,      // '2026-08-21'
    hora:     datos.hora,       // '8:30'
    nombre:   datos.nombre,
    apto:     datos.apto,
    telefono: datos.telefono,
    correo:   datos.correo
  });
}

/* ─────────────────────────────────────────────────────────────────────
 *  2 · Poner la agenda a tono (es lo que permite cancelar)
 *
 *  El formulario no avisa cuando borrás una fila, así que esta función le
 *  manda a Ari la lista de lo que sigue en pie. Ari cancela lo que ya no
 *  esté en esa lista.
 *
 *  Para que corra sola: Apps Script → Activadores (el reloj) → Añadir
 *  activador → función `sincronizarConAri`, "Según el tiempo", cada hora.
 *
 *  También podés ejecutarla a mano desde el editor cuando canceles algo y
 *  no quieras esperar.
 * ───────────────────────────────────────────────────────────────────── */
function sincronizarConAri() {
  var hoja = SpreadsheetApp.getActive().getSheetByName(ARI_HOJA);
  if (!hoja) { Logger.log('No encontré la pestaña "' + ARI_HOJA + '".'); return; }

  var ultima = hoja.getLastRow();
  var turnos = [];

  if (ultima >= ARI_FILA_INICIO) {
    var filas = hoja.getRange(ARI_FILA_INICIO, 1, ultima - ARI_FILA_INICIO + 1, hoja.getLastColumn()).getValues();
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      var fecha = comoFecha(f[ARI_COL_FECHA - 1]);
      var hora  = comoHora(f[ARI_COL_HORA - 1]);
      var nombre = String(f[ARI_COL_NOMBRE - 1] || '').trim();
      // Una fila a medio llenar no es un turno: se saltea.
      if (!fecha || !hora || !nombre) continue;

      turnos.push({
        fecha: fecha, hora: hora, nombre: nombre,
        apto:     String(f[ARI_COL_APTO - 1]     || '').trim(),
        telefono: String(f[ARI_COL_TELEFONO - 1] || '').trim(),
        correo:   String(f[ARI_COL_CORREO - 1]   || '').trim()
      });
    }
  }

  var r = llamarAAri('/api/enlace/agenda', {
    proyecto: ARI_PROYECTO,
    turnos: turnos
    // Ari sólo mira de hoy en adelante, así que las entregas ya hechas no se
    // tocan aunque limpies la hoja.
    //
    // Si de verdad se cancelaron TODAS y la lista queda vacía, Ari frena por
    // las dudas. Para vaciarla a propósito, descomentá la línea de abajo,
    // ejecutá una vez, y volvé a comentarla.
    // , permitir_vaciar: true
  });

  if (r) Logger.log('Sincronizado: ' + r);
}

/* ─── Ayudantes ──────────────────────────────────────────────────────── */

/**
 * Manda el pedido a Ari.
 *
 * Nunca detiene lo que estabas haciendo: si Ari no contesta (se cayó, se está
 * reiniciando, no hay red), anota el problema y sigue. La cita del cliente ya
 * está guardada en la hoja y su confirmación ya salió; que la agenda se entere
 * un rato después es un inconveniente, perder el agendamiento sería un
 * problema de verdad.
 */
function llamarAAri(ruta, cuerpo) {
  try {
    var respuesta = UrlFetchApp.fetch(ARI_URL + ruta, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ARI_TOKEN },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true
    });
    var texto = respuesta.getContentText();
    if (respuesta.getResponseCode() !== 200) {
      Logger.log('Ari respondió ' + respuesta.getResponseCode() + ': ' + texto);
      return null;
    }
    return texto;
  } catch (e) {
    Logger.log('No pude hablar con Ari: ' + e);
    return null;
  }
}

/** La celda puede traer una fecha de verdad o un texto. Sale 'AAAA-MM-DD'. */
function comoFecha(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Igual con la hora. Sale 'H:MM' (Ari le pone el cero adelante si falta). */
function comoHora(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'H:mm');
  }
  var s = String(v || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1] + ':' + m[2] : '';
}
