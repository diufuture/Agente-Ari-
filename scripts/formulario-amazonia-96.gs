/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FORMULARIO DE AGENDAMIENTO · Amazonía 96  ·  con enlace a Ari
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Es el mismo script que ya tenías —recibe el turno, lo escribe en la hoja
 *  «Citas», te avisa por correo y le manda la confirmación al residente—, con
 *  DOS AGREGADOS:
 *
 *    1. `avisarAAri(d)`      Al guardar la fila, la cita aparece sola en la
 *                            agenda de Ari, con su cliente creado.
 *
 *    2. `sincronizarConAri()` Cada hora le manda a Ari la lista completa de
 *                            turnos que siguen en pie. Lo que borraste de la
 *                            hoja (porque alguien canceló) se marca cancelado
 *                            en la agenda. Es la ÚNICA forma de enterarse de
 *                            una cancelación: el formulario no avisa cuando se
 *                            borra una fila.
 *
 *  ── QUÉ HAY QUE HACER ───────────────────────────────────────────────────
 *
 *  1. En cPanel → variables de entorno, agregar:
 *         ARI_TOKEN_ENLACE = una clave larga inventada (16+ caracteres)
 *     y reiniciar la aplicación. Sin esa variable la puerta responde 503:
 *     nadie puede escribir en la agenda.
 *
 *  2. Pegar ARI_TOKEN acá abajo, el mismo valor.
 *
 *  3. Reemplazar con este archivo el contenido del Apps Script de la hoja
 *     (Extensiones → Apps Script), y volver a publicar la implementación
 *     (Implementar → Gestionar implementaciones → editar → Nueva versión).
 *     Sin republicar, la web sigue llamando a la versión vieja.
 *
 *  4. Para las cancelaciones: Apps Script → Activadores (el reloj) → Añadir
 *     activador → función `sincronizarConAri`, "Según el tiempo", cada hora.
 * ───────────────────────────────────────────────────────────────────────── */

var CORREO_NOTIFICACION = 'ari.bravob18@gmail.com';
var NOMBRE_HOJA = 'Citas';

/* ── Enlace con Ari ──────────────────────────────────────────────────────
   El nombre del proyecto sale de UNA sola constante y lo usan las dos
   funciones. Si el aviso suelto y la sincronización mandaran nombres
   distintos, la sincronización no reconocería la cita que ya entró y la
   agendaría de nuevo: quedarían duplicadas. */
var ARI_URL      = 'https://ari.clickcontrol.co';
var ARI_TOKEN    = 'PEGAR-ACA-EL-MISMO-VALOR-DE-ARI_TOKEN_ENLACE';
var ARI_PROYECTO = 'Amazonía 96';

// En qué columna está cada dato. Ya calzan con tu hoja (A=1): Fecha, Hora,
// Nombre, Apartamento, Teléfono, Correo, Registrado.
var ARI_COL_FECHA    = 1;
var ARI_COL_HORA     = 2;
var ARI_COL_NOMBRE   = 3;
var ARI_COL_APTO     = 4;
var ARI_COL_TELEFONO = 5;
var ARI_COL_CORREO   = 6;
var ARI_FILA_INICIO  = 2;   // la 1 es el encabezado

/* ═══════════════════════════════════════════════════════════════════════
   Tu formulario, tal como estaba
   ═══════════════════════════════════════════════════════════════════════ */

function doGet(e) {
  var sh = obtenerHoja();
  var datos = sh.getDataRange().getDisplayValues();
  var ocupadas = {};
  for (var i = 1; i < datos.length; i++) {
    var fecha = datos[i][0].trim();
    var hora = datos[i][1].trim();
    if (!fecha) continue;
    if (!ocupadas[fecha]) ocupadas[fecha] = [];
    ocupadas[fecha].push(hora);
  }
  return json(ocupadas);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.fecha || !d.hora || !d.nombre || !d.apto || (!d.telefono && !d.correo)) {
      return json({ ok: false, motivo: 'datos' });
    }
    var sh = obtenerHoja();
    var datos = sh.getDataRange().getDisplayValues();
    for (var i = 1; i < datos.length; i++) {
      if (datos[i][0].trim() === String(d.fecha) && datos[i][1].trim() === String(d.hora)) {
        return json({ ok: false, motivo: 'ocupado' });
      }
    }
    var tel = d.telefono ? String(d.telefono) : '';
    var correo = d.correo ? String(d.correo) : '';
    var fila = sh.getLastRow() + 1;
    sh.getRange(fila, 1, 1, 7).setNumberFormat('@');
    sh.getRange(fila, 1, 1, 7).setValues([[String(d.fecha), String(d.hora), String(d.nombre), String(d.apto), tel, correo, new Date().toLocaleString('es-CO', {timeZone: 'America/Bogota'})]]);

    // ── AGREGADO · La cita entra sola a la agenda de Ari ──
    // Va acá, apenas la fila quedó guardada: si Ari estuviera caído o lento,
    // `avisarAAri` lo anota en el registro y sigue de largo. El turno del
    // residente ya está a salvo en la hoja; que la agenda se entere un rato
    // después es un inconveniente, perder el agendamiento sería un problema.
    avisarAAri(d);

    // Correo de notificacion a Click Control
    if (CORREO_NOTIFICACION && CORREO_NOTIFICACION.indexOf('@') > 0) {
      MailApp.sendEmail(
        CORREO_NOTIFICACION,
        'Nueva cita Amazonia 96 - ' + d.fecha + ' ' + d.hora + ' a.m.',
        'Se agendo una nueva entrega de domotica:\n\n' +
        'Fecha: ' + d.fecha + '\n' +
        'Hora: ' + d.hora + ' a.m.\n' +
        'Nombre: ' + d.nombre + '\n' +
        'Apartamento: ' + d.apto + '\n' +
        'Telefono: ' + (tel || '-') + '\n' +
        'Correo: ' + (correo || '-') + '\n\n' +
        'Hoja: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
      );
    }

    // Correo HTML de confirmacion al residente
    if (correo) {
      var h1 = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f4f5;font-family:Arial,Helvetica,sans-serif">';
      var h2 = '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">';
      var h3 = '<tr><td style="background:#00182C;padding:28px 30px;text-align:center">';
      var h4 = '<h1 style="margin:0;color:#6DE4FC;font-size:22px;letter-spacing:2px">CLICK CONTROL</h1>';
      var h5 = '<p style="margin:6px 0 0;color:#8FB0C4;font-size:13px">Domotica y seguridad - Bogota</p>';
      var h6 = '</td></tr>';
      var h7 = '<tr><td style="padding:30px">';
      var h8 = '<div style="background:#E8F8F0;border-left:4px solid #3DDC97;padding:14px 18px;border-radius:8px;margin-bottom:22px">';
      var h9 = '<p style="margin:0;font-size:18px;font-weight:bold;color:#1B7A45">Cita confirmada!</p></div>';
      var h10 = '<p style="font-size:15px;color:#333;margin:0 0 18px">Hola <strong>' + d.nombre + '</strong>, tu cita de entrega de domotica en <strong>Amazonia 96</strong> ha sido confirmada:</p>';
      var h11 = '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAFA;border-radius:10px;overflow:hidden;border:1px solid #E0EAEC">';
      var h12 = '<tr><td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:13px;color:#6B8A97;width:120px">Fecha</td>';
      var h13 = '<td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:15px;font-weight:bold;color:#00182C">' + d.fecha + '</td></tr>';
      var h14 = '<tr><td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:13px;color:#6B8A97">Hora</td>';
      var h15 = '<td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:15px;font-weight:bold;color:#00182C">' + d.hora + ' a.m.</td></tr>';
      var h16 = '<tr><td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:13px;color:#6B8A97">Apartamento</td>';
      var h17 = '<td style="padding:14px 18px;border-bottom:1px solid #E0EAEC;font-size:15px;font-weight:bold;color:#00182C">' + d.apto + '</td></tr>';
      var h18 = '<tr><td style="padding:14px 18px;font-size:13px;color:#6B8A97">Nombre</td>';
      var h19 = '<td style="padding:14px 18px;font-size:15px;font-weight:bold;color:#00182C">' + d.nombre + '</td></tr></table>';
      var h20 = '<div style="background:#FFF8E6;border-left:4px solid #F5C21B;padding:14px 18px;border-radius:8px;margin:22px 0">';
      var h21 = '<p style="margin:0;font-size:14px;color:#6B5A00"><strong>Recuerda:</strong> es indispensable contar con WiFi o Internet activo en tu apartamento para poder realizar la instalacion y configuracion completa de tu sistema de domotica.</p></div>';
      var h22 = '<div style="background:#F0F7FF;border:1px solid #D0E3F5;border-radius:10px;padding:20px;margin:22px 0;text-align:center">';
      var h23 = '<p style="margin:0 0 6px;font-size:16px;font-weight:bold;color:#00182C">Quieres conocer mas productos para tu hogar?</p>';
      var h24 = '<p style="margin:0 0 14px;font-size:14px;color:#555">Cortinas inteligentes, sonido en techo, cerraduras, camaras, cine en casa y mucho mas para tu apartamento.</p>';
      var h25 = '<a href="https://clickcontrol.co" style="display:inline-block;background:#6DE4FC;color:#00182C;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:0.5px">Descubre nuestros productos</a></div>';
      var h26 = '<p style="font-size:14px;color:#555;margin:18px 0 0">Si necesitas reprogramar tu cita, escribenos por WhatsApp:</p>';
      var h27 = '<p style="margin:8px 0 0"><a href="https://wa.me/573215073310" style="display:inline-block;background:#25D366;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">WhatsApp +57 321 507 3310</a></p>';
      var h28 = '</td></tr>';
      var h29 = '<tr><td style="background:#00182C;padding:20px 30px;text-align:center">';
      var h30 = '<p style="margin:0;color:#6DE4FC;font-size:13px;font-weight:bold;letter-spacing:1px">CLICK CONTROL</p>';
      // CORREGIDO · acá había un enlace escrito en Markdown —[texto](url)—
      // metido dentro del HTML del correo, así que al residente le llegaban
      // los corchetes y el paréntesis en crudo. Ahora es un enlace de verdad.
      var h31 = '<p style="margin:6px 0 0;color:#5A8DA0;font-size:12px"><a href="https://www.clickcontrol.co" style="color:#6DE4FC;text-decoration:none">www.clickcontrol.co</a> - WhatsApp +57 321 507 3310</p>';
      var h32 = '</td></tr></table></body></html>';

      var htmlCompleto = h1+h2+h3+h4+h5+h6+h7+h8+h9+h10+h11+h12+h13+h14+h15+h16+h17+h18+h19+h20+h21+h22+h23+h24+h25+h26+h27+h28+h29+h30+h31+h32;

      MailApp.sendEmail({
        to: correo,
        subject: 'Tu cita de entrega - Amazonia 96 - Click Control',
        htmlBody: htmlCompleto,
        body: 'Cita confirmada - Amazonia 96\n\nFecha: ' + d.fecha + '\nHora: ' + d.hora + ' a.m.\nApartamento: ' + d.apto + '\nNombre: ' + d.nombre + '\n\nClick Control\nwww.clickcontrol.co'
      });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, motivo: 'error' });
  } finally {
    lock.releaseLock();
  }
}

function obtenerHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NOMBRE_HOJA);
  if (!sh) sh = ss.insertSheet(NOMBRE_HOJA);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Fecha', 'Hora', 'Nombre', 'Apartamento', 'Telefono', 'Correo', 'Registrado']);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════════════════
   AGREGADO · Enlace con Ari
   ═══════════════════════════════════════════════════════════════════════ */

/** Avisa de un turno nuevo. Lo llama `doPost` al guardar la fila. */
function avisarAAri(d) {
  llamarAAri('/api/enlace/cita', {
    proyecto: ARI_PROYECTO,
    fecha:    String(d.fecha),        // '2026-08-21'
    hora:     String(d.hora),         // '9:30'
    nombre:   String(d.nombre),
    apto:     String(d.apto),
    telefono: d.telefono ? String(d.telefono) : '',
    correo:   d.correo ? String(d.correo) : ''
  });
}

/**
 * Pone la agenda a tono con la hoja. Es lo que permite CANCELAR.
 *
 * Le manda a Ari todos los turnos que siguen en pie; Ari cancela los que ya no
 * estén. No borra: la cita queda marcada como cancelada, con su registro.
 *
 * Tres cosas que Ari no toca, a propósito: las citas cargadas a mano, las
 * entregas que ya pasaron, y —si la lista llegara vacía— nada en absoluto:
 * frena y avisa, porque es más probable que la hoja no se haya podido leer a
 * que se cancelara todo junto.
 *
 * Se puede correr a mano desde el editor cuando cancelás algo y no querés
 * esperar a la hora.
 */
function sincronizarConAri() {
  var hoja = SpreadsheetApp.getActive().getSheetByName(NOMBRE_HOJA);
  if (!hoja) { Logger.log('No encontré la pestaña "' + NOMBRE_HOJA + '".'); return; }

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
    // Si de verdad se cancelaron TODAS y la lista queda vacía, Ari frena por
    // las dudas. Para vaciarla a propósito, descomentá la línea de abajo,
    // ejecutá una vez, y volvé a comentarla.
    // , permitir_vaciar: true
  });

  if (r) Logger.log('Sincronizado: ' + r);
}

/**
 * Manda el pedido a Ari.
 *
 * Nunca detiene lo que estabas haciendo: si Ari no contesta (se cayó, se está
 * reiniciando, no hay red), anota el problema y sigue. Si eso pasa, la
 * sincronización de la hora siguiente pone la agenda al día igual, así que no
 * se pierde nada.
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

/**
 * Una sola vez, para meter en la agenda lo que YA está en la hoja.
 *
 * `sincronizarConAri` alcanza para eso —agenda lo que falte y cancela lo que
 * sobre—, así que basta con ejecutarla a mano desde el editor la primera vez.
 * Queda esta función sólo para tenerlo escrito con todas las letras.
 */
function cargarLoQueYaEstaEnLaHoja() {
  sincronizarConAri();
}
