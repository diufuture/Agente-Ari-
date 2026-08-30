// Recorrido completo del sistema, como lo usaría el negocio en una semana:
// se arma el catálogo, se dicta una cotización, se le cobran abonos, se
// mueve inventario, llega una lista de precios actualizada y se imprime.
//
// Cada paso se compara contra el número que debería dar, no sólo contra que
// "no explote". Correr con:  npm test
//
// Usa su propia base de datos temporal: no toca la del negocio.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, inflateSync } from 'node:zlib';

/** Un .zip mínimo pero de verdad, para poder armar un .xlsx de prueba. */
const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

function armarZip(archivos) {
  const locales = [];
  const central = [];
  let off = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comp = deflateRawSync(datos);
    const n = Buffer.from(nombre, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(datos), 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(n.length, 26);
    locales.push(lh, n, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(datos), 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(datos.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, n);
    off += lh.length + n.length + comp.length;
  }
  const cuerpo = Buffer.concat(locales);
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, dir, fin]);
}

const carpeta = mkdtempSync(join(tmpdir(), 'ari-prueba-'));
process.env.ARI_DB = join(carpeta, 'prueba.db');

const fallos = [];
const ok = [];
function comprobar(que, real, esperado) {
  const igual = JSON.stringify(real) === JSON.stringify(esperado);
  (igual ? ok : fallos).push(`${igual ? '✓' : '✗'} ${que}: ${JSON.stringify(real)}${igual ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

const db = await import('./server/db.js');
const tools = await import('./server/tools.js');
const imprimir = await import('./server/imprimir.js');
const t = (n, a) => tools.ejecutar(n, a);

/* 1 · Catálogo ---------------------------------------------------- */
db.conciliarProductos('Interruptores', [
  { fila: 2, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', precio_canal: 154868, precio_constructor: 216816, precio_cliente: 247790 },
  { fila: 3, referencia: 'G7-3', descripcion: 'Interruptor 3 canales', precio_canal: 163793, precio_constructor: 229311, precio_cliente: 262070 },
], {});
db.conciliarProductos('Propios', [
  { fila: 2, referencia: 'CC-CAM', descripcion: 'Cámara IP Click Control', precio_cliente: 380000, stock: 25 },
], { manejaInventario: true });

comprobar('productos en catálogo', db.consultar('productos', {}).length, 3);
comprobar('stock del producto propio', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, 25);

/* 2 · Cotización dictada ------------------------------------------- */
t('crear_cotizacion', { cliente: 'Sr. Jimmy Forero', titulo: 'Automatización casa', porcentaje_iva: 19 });
comprobar('queda en curso al crearla', Boolean(db.cotizacionActiva()), true);

t('agregar_item_cotizacion', { producto: 'G7-2', cantidad: 7 });     // sin nombrar cliente
t('agregar_item_cotizacion', { producto: 'G7-3', cantidad: 3 });
t('agregar_item_cotizacion', { descripcion: 'Mano de obra', precio_unitario: 1500000, seccion: 'Mano de obra' });

const cotId = db.cotizacionActiva().id;
const esperadoSub = 7 * 247790 + 3 * 262070 + 1500000;
comprobar('subtotal', db.totalesCotizacion(cotId).subtotal, esperadoSub);
comprobar('total con IVA 19%', Math.round(db.totalesCotizacion(cotId).total), Math.round(esperadoSub * 1.19));
comprobar('monto guardado = total', db.obtenerPorId('cotizaciones', cotId).monto, Math.round(esperadoSub * 1.19));

/* 3 · Ajustes por voz ---------------------------------------------- */
const items = db.consultar('cotizacion_items', { cotizacion_id: cotId });
t('ajustar_item_cotizacion', { item_id: items[0].id, porcentaje: 15 });
comprobar('precio tras +15%', db.obtenerPorId('cotizacion_items', items[0].id).precio_unitario, Math.round(247790 * 1.15));

t('ajustar_cotizacion', { porcentaje_servicio: 20 });
const tot = db.totalesCotizacion(cotId);
const sub2 = Math.round(247790 * 1.15) * 7 + 3 * 262070 + 1500000;
comprobar('subtotal tras ajuste', tot.subtotal, sub2);
comprobar('servicio 20%', Math.round(tot.servicio), Math.round(sub2 * 0.2));
comprobar('total con servicio e IVA', Math.round(tot.total), Math.round(sub2 * 1.2 * 1.19));

t('finalizar_cotizacion', {});
comprobar('se cierra la sesión', db.cotizacionActiva(), null);

/* 4 · Abonos sobre esa cotización ---------------------------------- */
t('registrar_abono', { cliente: 'Jimmy', monto: 3000000, nota: 'Anticipo' });
const cot = db.obtenerPorId('cotizaciones', cotId);
comprobar('abonado', cot.abonado, 3000000);
comprobar('saldo = total - abonado', cot.saldo, cot.monto - 3000000);

/* 5 · Inventario ---------------------------------------------------- */
t('ajustar_inventario', { producto: 'CC-CAM', cantidad: -4, motivo: 'venta' });
comprobar('stock tras vender 4', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, 21);
let rechazado = false;
try { t('ajustar_inventario', { producto: 'G7-2', cantidad: 5 }); } catch { rechazado = true; }
comprobar('rechaza inventario en producto de proveedor', rechazado, true);

/* 5b · Aprobar descuenta del inventario ----------------------------- */
const stockAntes = db.consultar('productos', { texto: 'CC-CAM' })[0].stock;   // 21
t('crear_cotizacion', { cliente: 'Ferretería El Tornillo', titulo: 'Cámaras' });
const cotStock = db.cotizacionActiva().id;
t('agregar_item_cotizacion', { producto: 'CC-CAM', cantidad: 6 });
t('agregar_item_cotizacion', { producto: 'G7-3', cantidad: 2 });  // de proveedor: no toca bodega
t('finalizar_cotizacion', {});

comprobar('cotizar todavía no descuenta', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes);

t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'aprobada' });
comprobar('al aprobar, descuenta', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 6);

// Cambiar la cantidad de un renglón de una cotización ya aprobada
const itemCam = db.consultar('cotizacion_items', { cotizacion_id: cotStock })
  .find((i) => i.referencia === 'CC-CAM');
db.actualizarItem(itemCam.id, { cantidad: 10 });
comprobar('cambiar la cantidad rehace el descuento', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 10);

// Aprobarla de nuevo no debe descontar dos veces
t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'aprobada' });
comprobar('re-aprobar no descuenta dos veces', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 10);

// Y si deja de estar aprobada, vuelve
t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'rechazada' });
comprobar('desaprobar devuelve el stock', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes);

/* 6 · Lista actualizada -------------------------------------------- */
db.actualizar('productos', 1, { foto: '/uploads/productos/1.png', notas: 'no borrar' });
const inf = db.conciliarProductos('Interruptores', [
  { fila: 2, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', precio_cliente: 268000 },
  { fila: 4, referencia: 'G7-4', descripcion: 'Interruptor 4 canales', precio_cliente: 295000 },
], { descontinuarAusentes: true });

comprobar('lista nueva: nuevos', inf.nuevos.length, 1);
comprobar('lista nueva: actualizados', inf.actualizados.length, 1);
comprobar('lista nueva: ausentes', inf.ausentes.length, 1);
const g72 = db.obtenerPorId('productos', 1);
comprobar('conserva la foto', g72.foto, '/uploads/productos/1.png');
comprobar('conserva la nota', g72.notas, 'no borrar');
comprobar('precio actualizado', g72.precio_cliente, 268000);
comprobar('el descontinuado no sale al cotizar', db.consultar('productos', {}).some((p) => p.referencia === 'G7-3'), false);
comprobar('pero sigue existiendo', db.consultar('productos', { incluir_inactivos: true }).some((p) => p.referencia === 'G7-3'), true);

/* 7 · La cotización vieja no se movió ------------------------------ */
const cotDespues = db.obtenerPorId('cotizaciones', cotId);
comprobar('el total de la cotización enviada no cambió', cotDespues.monto, cot.monto);
comprobar('el renglón conserva su precio de entonces',
  db.obtenerPorId('cotizacion_items', items[1].id).precio_unitario, 262070);

/* 7b · Editar una cotización ya terminada --------------------------- */
// El cliente pide cambios sobre la oferta ya enviada: se le cambia el nombre
// al renglón, se le pone el área, y recién ahí se aprueba.
db.actualizarItem(items[0].id, {
  descripcion: 'Panel táctil de 4 pulgadas\nMarco de aluminio, blanco',
  area: 'Sala',
  seccion: 'Control',
});
const editado = db.obtenerPorId('cotizacion_items', items[0].id);
comprobar('se le cambia el nombre al renglón', editado.descripcion.split('\n')[0], 'Panel táctil de 4 pulgadas');
comprobar('se le pone el área', editado.area, 'Sala');
comprobar('el precio no se movió al renombrarlo', editado.precio_unitario, Math.round(247790 * 1.15));

// Un campo que no existe no puede colarse dentro del SQL
db.actualizarItem(items[0].id, { 'x = 1, cantidad': 99 });
comprobar('un campo inventado se ignora', db.obtenerPorId('cotizacion_items', items[0].id).cantidad, 7);

/* 8 · Impresión ----------------------------------------------------- */
const html = imprimir.paginaCotizacion(cotId);
comprobar('la página imprimible se genera', typeof html === 'string' && html.includes('Cotización N.º'), true);
comprobar('trae el total impreso', html.includes(new Intl.NumberFormat('es-CO').format(Math.round(cotDespues.monto))), true);
comprobar('cotización inexistente devuelve null', imprimir.paginaCotizacion(9999), null);
comprobar('el nombre editado sale impreso', html.includes('Panel táctil de 4 pulgadas'), true);
comprobar('la ficha técnica sale aparte', html.includes('Marco de aluminio, blanco'), true);
comprobar('aparece la columna de área porque se usó', html.includes('<th style="width:92px">Área</th>'), true);
comprobar('y el área del renglón', html.includes('<td class="area">Sala</td>'), true);

// Representante: el de la cotización manda sobre el de la empresa
db.guardarAjustes({ representante: 'Mostrador', representante_telefono: '601 000' });
comprobar('sin representante propio, sale el de la empresa',
  imprimir.paginaCotizacion(cotId).includes('Mostrador'), true);
db.actualizar('cotizaciones', cotId, { representante: 'Andrés Gómez', representante_telefono: '310 555' });
const conRep = imprimir.paginaCotizacion(cotId);
comprobar('el de la cotización le gana al de la empresa', conRep.includes('Andrés Gómez'), true);
comprobar('y desplaza al de la empresa', conRep.includes('Mostrador'), false);

// Logo: sale el que se cargó en ajustes
db.guardarAjustes({ logo: '/uploads/marca/logo.webp?v=9' });
comprobar('el logo cargado encabeza la hoja',
  imprimir.paginaCotizacion(cotId).includes('src="/uploads/marca/logo.webp?v=9"'), true);

// Una cotización sin áreas no debe traer la columna
t('crear_cotizacion', { cliente: 'Sin áreas', titulo: 'Simple' });
const cotSimple = db.cotizacionActiva().id;
t('agregar_item_cotizacion', { descripcion: 'Visita técnica', precio_unitario: 90000 });
t('finalizar_cotizacion', {});
comprobar('sin áreas cargadas, la columna no aparece',
  imprimir.paginaCotizacion(cotSimple).includes('>Área</th>'), false);

/* 7c · Una cotización armada por fuera, subida en PDF ---------------- */
// No tiene renglones y no los va a tener: la oferta es el archivo. Lo que se
// le pide al sistema es el seguimiento, y para eso el valor que se escribió a
// mano tiene que quedarse quieto.
const subida = db.insertar('cotizaciones', {
  titulo: 'Oferta armada por fuera',
  cliente_id: db.resolverCliente('Sr. Jimmy Forero').id,
  monto: 6113158,
  estado: 'pendiente',
  archivo: '/uploads/cotizaciones/99.pdf?v=1',
  archivo_nombre: 'Oferta_Sr_Jimmy.pdf',
});

db.recalcularCotizacion(subida.id);
comprobar('sin renglones, el valor escrito a mano no se toca',
  db.obtenerPorId('cotizaciones', subida.id).monto, 6113158);

// Hay otra cotización abierta del mismo cliente, así que se nombra cuál
t('registrar_abono', { cliente: 'Jimmy', cotizacion: 'armada por fuera', monto: 2000000, nota: 'Anticipo' });
const subidaConAbono = db.obtenerPorId('cotizaciones', subida.id);
comprobar('los abonos le funcionan igual que a cualquier otra', subidaConAbono.abonado, 2000000);
comprobar('y el saldo también', subidaConAbono.saldo, 6113158 - 2000000);

// Aprobarla no puede romper nada aunque no tenga renglones que descontar
t('actualizar_estado', { entidad: 'cotizaciones', id: subida.id, estado: 'aprobada' });
comprobar('se puede aprobar sin renglones', db.obtenerPorId('cotizaciones', subida.id).estado, 'aprobada');
comprobar('y conserva el PDF adjunto', db.obtenerPorId('cotizaciones', subida.id).archivo_nombre, 'Oferta_Sr_Jimmy.pdf');

// La página imprimible sigue existiendo, por si se quiere armar una acá
comprobar('la vista imprimible no se rompe sin renglones',
  imprimir.paginaCotizacion(subida.id).includes('todavía no tiene renglones'), true);

/* 7d · Seguir trabajando sobre una cotización que ya existe ---------- */
// "Agregale dos cámaras a la cotización de Jimmy" no puede abrir una nueva.
// La de El Tornillo quedó rechazada al probar el inventario; se reabre, que
// es como estaría en la vida real cuando el cliente sigue negociando.
db.actualizar('cotizaciones', cotStock, { estado: 'pendiente' });
const cuantasAntes = db.consultar('cotizaciones', { limite: 300 }).length;
db.cerrarCotizacionActiva();   // nadie está dictando: se llega por el cliente

const camaras = () => db.consultar('cotizacion_items', { cotizacion_id: cotStock })
  .filter((i) => i.referencia === 'CC-CAM');

t('agregar_item_cotizacion', { cliente: 'Ferretería El Tornillo', producto: 'CC-CAM', cantidad: 2 });
comprobar('agregar nombrando al cliente no crea otra cotización',
  db.consultar('cotizaciones', { limite: 300 }).length, cuantasAntes);
comprobar('el mismo producto no se repite como renglón nuevo', camaras().length, 1);
comprobar('le suma la cantidad al que ya estaba', camaras()[0].cantidad, 12);

// Salvo que vaya a otra parte de la casa: ahí sí son renglones distintos
t('agregar_item_cotizacion', { cliente: 'Ferretería El Tornillo', producto: 'CC-CAM', cantidad: 3, seccion: 'Cocina' });
comprobar('en otra sección va en su propio renglón', camaras().length, 2);
comprobar('sin tocar el primero', camaras().find((i) => i.seccion !== 'Cocina').cantidad, 12);
db.eliminarItem(camaras().find((i) => i.seccion === 'Cocina').id);

// Y cambiar un renglón sin saber su número, nombrándolo como lo diría uno
db.cerrarCotizacionActiva();
t('ajustar_item_cotizacion', { cliente: 'Ferretería El Tornillo', producto: 'cámara', cantidad: 4 });
comprobar('se le cambia la cantidad nombrando el producto',
  db.consultar('cotizacion_items', { cotizacion_id: cotStock }).find((i) => i.referencia === 'CC-CAM').cantidad, 4);

t('ajustar_item_cotizacion', { cliente: 'Ferretería El Tornillo', producto: 'cámara', porcentaje: 10 });
comprobar('y se le sube un porcentaje igual',
  db.consultar('cotizacion_items', { cotizacion_id: cotStock }).find((i) => i.referencia === 'CC-CAM').precio_unitario,
  Math.round(380000 * 1.1));

// Si lo que nombra no está, lo dice y muestra qué hay
let noEsta = '';
try {
  t('ajustar_item_cotizacion', { cliente: 'Ferretería El Tornillo', producto: 'aire acondicionado' });
} catch (e) { noEsta = e.message; }
comprobar('un renglón que no existe se avisa con las opciones',
  noEsta.includes('No encontré') && noEsta.includes('Renglones:'), true);

/* 7e · Lo aprobado pasa a estar por cobrar --------------------------- */
// Una cotización aprobada es una venta cerrada: lo que le falte es cobranza,
// no algo que se esté negociando.
const antes = db.resumen().contadores;
const laQueAprobamos = db.insertar('cotizaciones', {
  titulo: 'Obra aprobada', cliente_id: db.resolverCliente('Sr. Jimmy Forero').id,
  monto: 5000000, estado: 'pendiente',
});
comprobar('recién enviada, cuenta como cotizado',
  db.resumen().contadores.saldoCotizado, antes.saldoCotizado + 5000000);
comprobar('y todavía no como por cobrar', db.resumen().contadores.porCobrar, antes.porCobrar);

t('actualizar_estado', { entidad: 'cotizaciones', id: laQueAprobamos.id, estado: 'aprobada' });
const trasAprobar = db.resumen().contadores;
comprobar('al aprobarla deja de estar en lo cotizado', trasAprobar.saldoCotizado, antes.saldoCotizado);
comprobar('y pasa a estar por cobrar', trasAprobar.porCobrar, antes.porCobrar + 5000000);

// Aparece en la pantalla de cobros, con su saldo al día
const enCobros = db.cobrosDeCotizaciones().find((c) => c.id === laQueAprobamos.id);
comprobar('sale en cobros con lo que falta', enCobros.monto, 5000000);
comprobar('marcada como que viene de una cotización', enCobros.origen, 'cotizacion');

// Y un abono la baja enseguida, sin tener que tocar nada más
t('registrar_abono', { cliente: 'Jimmy', cotizacion: 'Obra aprobada', monto: 1500000 });
comprobar('un abono baja lo que falta cobrar',
  db.cobrosDeCotizaciones().find((c) => c.id === laQueAprobamos.id).monto, 3500000);
comprobar('y baja el total por cobrar', db.resumen().contadores.porCobrar, antes.porCobrar + 3500000);

// Saldada, desaparece de por cobrar
t('registrar_abono', { cliente: 'Jimmy', cotizacion: 'Obra aprobada', monto: 3500000 });
comprobar('saldada, sale de la lista',
  db.cobrosDeCotizaciones().some((c) => c.id === laQueAprobamos.id), false);
comprobar('y el total vuelve a lo de antes', db.resumen().contadores.porCobrar, antes.porCobrar);

/* 7b2 · Cerrar una cotización la saca de la lista de trabajo --------- */
// Sólo se cierra lo que ya no debe plata: perderla de vista justo cuando
// todavía hay que cobrarla es lo contrario de lo que uno quiere.
const paraCerrar = db.insertar('cotizaciones', {
  titulo: 'Obra terminada', cliente_id: db.resolverCliente('Sr. Jimmy Forero').id,
  monto: 1000000, estado: 'aprobada',
});

let noSePudo = '';
try { db.cerrarCotizacion(paraCerrar.id); } catch (e) { noSePudo = e.message; }
comprobar('con saldo no deja cerrarla', noSePudo.includes('por cobrar'), true);
comprobar('y sigue en la lista',
  db.consultar('cotizaciones', { limite: 300 }).some((q) => q.id === paraCerrar.id), true);

db.insertar('abonos', { cotizacion_id: paraCerrar.id, monto: 1000000 });
db.cerrarCotizacion(paraCerrar.id);
comprobar('saldada, se cierra y sale de la lista',
  db.consultar('cotizaciones', { limite: 300 }).some((q) => q.id === paraCerrar.id), false);
comprobar('pero queda en el historial',
  db.consultar('cotizaciones', { solo_archivadas: true, limite: 300 }).some((q) => q.id === paraCerrar.id), true);
comprobar('y no se borró nada', Boolean(db.obtenerPorId('cotizaciones', paraCerrar.id)), true);

db.reabrirCotizacion(paraCerrar.id);
comprobar('reabrirla la devuelve a la lista',
  db.consultar('cotizaciones', { limite: 300 }).some((q) => q.id === paraCerrar.id), true);
db.cerrarCotizacion(paraCerrar.id);

// Y "enviada" ya no existe: lo que había quedó en pendiente
comprobar('no quedan cotizaciones en «enviada»',
  db.consultar('cotizaciones', { incluir_archivadas: true, limite: 300 })
    .some((q) => q.estado === 'enviada'), false);

/* 7c2 · Las fechas son las del negocio, no las del servidor ---------- */
// El hosting corre en UTC. De 7 de la tarde en adelante eso hace creer al
// servidor que ya es el día siguiente, y "mañana" cae pasado mañana. Se
// compara contra la fecha de Colombia calculada aparte, sin depender de la
// zona del proceso, para que la prueba valga corra donde corra.
const enBogota = (dias = 0) => new Date(Date.now() + dias * 864e5)
  .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

comprobar('el día de hoy es el de Colombia', db.hoy(), enBogota(0));
comprobar('«mañana» es mañana en Colombia', tools.normalizarFecha('mañana'), enBogota(1));
comprobar('«hoy» es hoy en Colombia', tools.normalizarFecha('hoy'), enBogota(0));

// Y lo que se ve en el tablero: una cita de mañana no cuenta como de hoy
const paraManana = db.insertar('citas', {
  titulo: 'Visita de mañana', inicio: `${enBogota(1)}T15:00`,
});
const soloHoy = db.consultar('citas', { rango: 'hoy', estado: 'pendiente' });
comprobar('una cita de mañana no sale en las de hoy',
  soloHoy.some((c) => c.id === paraManana.id), false);
comprobar('pero sí en las próximas',
  db.consultar('citas', { rango: 'proximos', estado: 'pendiente' }).some((c) => c.id === paraManana.id), true);
comprobar('y el contador del tablero tampoco la cuenta',
  db.resumen().contadores.citasHoy, soloHoy.length);
db.eliminar('citas', paraManana.id);

/* 7d2 · Etiquetar los productos para poder filtrarlos ---------------- */
// "Mostrame los displays" tiene que traer sólo los displays. El tipo va aparte
// de la categoría, que la manda el proveedor en su lista.
db.actualizar('productos', db.consultar('productos', { texto: 'G7-2' })[0].id, { tipo: 'Switch EU' });
const idG74 = db.consultar('productos', { texto: 'G7-4' })[0].id;
db.actualizar('productos', idG74, { tipo: 'Switch EU' });
db.actualizar('productos', db.consultar('productos', { texto: 'CC-CAM' })[0].id, { tipo: 'Cámara' });

// La pestaña del Excel etiqueta a todos los de la hoja de una sola pasada,
// incluidos los que ya estaban cargados sin tipo.
db.conciliarProductos('Interruptores', [
  { fila: 2, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', precio_cliente: 268000 },
  { fila: 3, referencia: 'NUEVO-1', descripcion: 'Interruptor recién salido', precio_cliente: 300000 },
], { tipo: 'Switch EU' });
comprobar('la pestaña etiqueta a los que ya estaban',
  db.consultar('productos', { texto: 'G7-2' })[0].tipo, 'Switch EU');
comprobar('y también a los nuevos de esa hoja',
  db.consultar('productos', { texto: 'NUEVO-1' })[0].tipo, 'Switch EU');
db.eliminar('productos', db.consultar('productos', { texto: 'NUEVO-1' })[0].id);

// Los que ya estaban cargados de antes se agrupan de una, sin reimportar: al
// importar la categoría se llenó con el nombre de la pestaña, así que ese
// nombre ya está guardado y alcanza con copiarlo al tipo.
db.actualizar('productos', db.consultar('productos', { texto: 'G7-2' })[0].id, { tipo: null });
const antesDeAgrupar = db.productosSinTipo().conCategoria;
comprobar('sabe cuántos se pueden agrupar', antesDeAgrupar > 0, true);
db.etiquetarTipoDesdeCategoria();
comprobar('agrupar les pone el nombre de su pestaña',
  db.consultar('productos', { texto: 'G7-2' })[0].tipo, 'Interruptores');
comprobar('y ya no quedan sin agrupar', db.productosSinTipo().conCategoria, 0);

// Pero no pisa uno puesto a mano
db.actualizar('productos', db.consultar('productos', { texto: 'CC-CAM' })[0].id, { tipo: 'Cámara IP' });
db.etiquetarTipoDesdeCategoria();
comprobar('un tipo puesto a mano no se pisa',
  db.consultar('productos', { texto: 'CC-CAM' })[0].tipo, 'Cámara IP');

db.actualizar('productos', db.consultar('productos', { texto: 'G7-2' })[0].id, { tipo: 'Switch EU' });
db.actualizar('productos', db.consultar('productos', { texto: 'CC-CAM' })[0].id, { tipo: 'Cámara' });
comprobar('filtra por tipo', db.consultar('productos', { tipo: 'Switch EU' }).length, 2);
comprobar('el filtro no distingue mayúsculas', db.consultar('productos', { tipo: 'switch eu' }).length, 2);
comprobar('los tipos usados salen con su conteo',
  db.tiposProductos().map((t) => [t.tipo, t.n]), [['Switch EU', 2], ['Cámara', 1]]);
comprobar('y también se llega buscando por texto',
  db.consultar('productos', { texto: 'Switch EU' }).length, 2);

// La ficha técnica se guarda como cualquier otro dato del producto
db.actualizar('productos', idG74, { ficha: '/uploads/fichas/9.pdf', ficha_nombre: 'G7-4.pdf' });
comprobar('la ficha técnica queda pegada al producto',
  db.obtenerPorId('productos', idG74).ficha_nombre, 'G7-4.pdf');

// Y una lista nueva del proveedor no puede borrar lo que se puso a mano
db.conciliarProductos('Interruptores', [
  { fila: 4, referencia: 'G7-4', descripcion: 'Interruptor 4 canales', precio_cliente: 310000 },
], {});
const tras = db.obtenerPorId('productos', idG74);
comprobar('actualizar la lista conserva el tipo', tras.tipo, 'Switch EU');
comprobar('y conserva la ficha técnica', tras.ficha_nombre, 'G7-4.pdf');
comprobar('pero sí actualiza el precio', tras.precio_cliente, 310000);

/* 7e2 · Agregarle algo a una reunión que ya está --------------------- */
// "Agendame mañana reunión con el ingeniero Javier" y enseguida "agregale que
// tengo que llevar el catálogo". Lo segundo no puede crear otra reunión.
const citasAntes = db.consultar('citas', { limite: 100 }).length;
t('agendar_cita', {
  titulo: 'Reunión Ingeniero Javier', cliente: 'Ingeniero Javier Forero',
  fecha_hora: '2026-08-11T15:00', lugar: 'Oficina',
});
comprobar('la reunión queda agendada', db.consultar('citas', { limite: 100 }).length, citasAntes + 1);

t('editar', { entidad: 'citas', detalle: 'Llevar el catálogo' });
comprobar('agregarle detalle no crea otra reunión', db.consultar('citas', { limite: 100 }).length, citasAntes + 1);

const laCita = db.consultar('citas', { texto: 'Ingeniero Javier', limite: 5 })[0];
comprobar('el detalle quedó guardado', laCita.notas, 'Llevar el catálogo');

// Y se le puede seguir agregando: se suma, no se pisa
t('editar', { entidad: 'citas', que: 'Ingeniero Javier', detalle: 'Y unos bombillos' });
comprobar('lo que se agrega después se suma',
  db.obtenerPorId('citas', laCita.id).notas, 'Llevar el catálogo\nY unos bombillos');
comprobar('sigue habiendo una sola reunión', db.consultar('citas', { limite: 100 }).length, citasAntes + 1);

// Cambiarle la hora y el lugar tampoco duplica
t('editar', { entidad: 'citas', que: 'Ingeniero Javier', fecha_hora: '2026-08-11T16:00', lugar: 'La obra' });
const movida = db.obtenerPorId('citas', laCita.id);
comprobar('se le cambia la hora', movida.inicio, '2026-08-11T16:00');
comprobar('y el lugar', movida.lugar, 'La obra');
comprobar('y el detalle no se perdió', movida.notas, 'Llevar el catálogo\nY unos bombillos');
comprobar('y sigue siendo una sola', db.consultar('citas', { limite: 100 }).length, citasAntes + 1);

// Un recordatorio es otra cosa: se edita su propio texto
t('crear_recordatorio', { texto: 'Comprar bombillos', vence_en: '2026-08-11' });
t('editar', { entidad: 'recordatorios', que: 'bombillos', prioridad: 'alta' });
comprobar('al recordatorio se le cambia la prioridad',
  db.consultar('recordatorios', { texto: 'bombillos' })[0].prioridad, 'alta');

// Nombrarla como uno habla, aunque el título esté escrito de otra manera:
// hay dos reuniones, y la frase tiene que dar con la correcta.
t('agendar_cita', { titulo: 'Reunión obra Hotel Dammai', fecha_hora: '2026-08-12T09:00' });
t('editar', { entidad: 'citas', que: 'la reunión con el ingeniero Javier', detalle: 'Es en Amazonía' });
comprobar('encuentra la reunión aunque se la nombre distinto',
  db.obtenerPorId('citas', laCita.id).notas.includes('Es en Amazonía'), true);
comprobar('y no tocó la otra reunión',
  db.consultar('citas', { texto: 'Dammai' })[0].notas, null);
comprobar('sin crear ninguna de más', db.consultar('citas', { limite: 100 }).length, citasAntes + 2);

// Si lo que nombra no existe, lo dice en vez de crear algo
let noHay = '';
try { t('editar', { entidad: 'citas', que: 'almuerzo con el alcalde', lugar: 'X' }); } catch (e) { noHay = e.message; }
comprobar('editar algo que no existe avisa', noHay.includes('No encontré'), true);

/* 7f · La cartera de cada cliente ------------------------------------ */
// En la lista de clientes, en vez de la empresa va la plata: cuánto se le
// cotizó, cuánto abonó y cuánto falta, sumando todas sus cotizaciones.
const nuevo = db.crearCliente({ nombre: 'Hotel Dammai', telefono: '6014445566' });
const conCotizaciones = (n) => db.consultar('clientes', { texto: n })[0];

comprobar('un cliente recién creado no tiene cartera',
  [conCotizaciones('Dammai').cotizado, conCotizaciones('Dammai').abonado, conCotizaciones('Dammai').n_cotizaciones],
  [0, 0, 0]);

db.insertar('cotizaciones', { cliente_id: nuevo.id, titulo: 'CCTV', monto: 3000000, estado: 'aprobada' });
const wifi = db.insertar('cotizaciones', { cliente_id: nuevo.id, titulo: 'Wi-Fi', monto: 2000000, estado: 'pendiente' });
db.insertar('cotizaciones', { cliente_id: nuevo.id, titulo: 'La que no fue', monto: 9000000, estado: 'rechazada' });
db.insertar('abonos', { cotizacion_id: wifi.id, monto: 500000 });

const d = conCotizaciones('Dammai');
comprobar('suma lo cotizado de todas sus cotizaciones', d.cotizado, 5000000);
comprobar('la rechazada no cuenta como plata', d.cotizado < 9000000, true);
comprobar('suma los abonos de todas', d.abonado, 500000);
comprobar('y el saldo es la resta', d.saldo, 4500000);
comprobar('cuenta cuántas tiene, rechazadas incluidas', d.n_cotizaciones, 3);

// "Por cobrar" no es lo mismo que el saldo: el saldo cuenta TODO lo que sigue
// en negociación (la Wi-Fi, que está pendiente); por cobrar es lo que el
// cliente ya se comprometió a pagar —cobros sueltos, más el saldo de las
// cotizaciones YA APROBADAS—, la CCTV en este caso. Antes esto se calculaba
// aparte en cada pantalla y sólo miraba los cobros sueltos, así que una
// cotización aprobada sin cobro registrado no aparecía como "por cobrar" en
// ningún lado salvo en la pantalla de Cobros: la CCTV, aprobada y sin abonos,
// ya cuenta acá aunque nadie haya registrado un cobro sobre ella.
comprobar('la aprobada sin abonos ya cuenta como por cobrar, sin necesitar un cobro aparte',
  conCotizaciones('Hotel Dammai').por_cobrar, 3000000);
comprobar('la Wi-Fi, pendiente, no suma acá aunque sí sume en el saldo', d.saldo, 4500000);

db.insertar('cobros', { cliente_id: nuevo.id, concepto: 'Anticipo', monto: 200000, estado: 'pendiente' });
comprobar('un cobro suelto se suma al lado de la aprobada',
  conCotizaciones('Hotel Dammai').por_cobrar, 3000000 + 200000);

db.insertar('abonos', { cotizacion_id: db.consultar('cotizaciones', { cliente_id: nuevo.id, texto: 'CCTV' })[0].id, monto: 1000000 });
comprobar('un abono sobre la aprobada baja el por cobrar al toque',
  conCotizaciones('Hotel Dammai').por_cobrar, 2000000 + 200000);

/* 8b · Cómo Excel ancla las fotos ----------------------------------- */
// Cuatro switches, cuatro maneras de pegar la foto en la misma hoja. Es
// exactamente lo que pasa cuando alguien arma la lista a mano.
const xlsx = await import('./server/xlsx.js');

const anclaje = (tipo, desde, hasta, id) => `
  <xdr:${tipo}>
    ${tipo === 'absoluteAnchor' ? '<xdr:pos x="100" y="200"/>' : `<xdr:from><xdr:col>0</xdr:col><xdr:row>${desde}</xdr:row></xdr:from>`}
    ${tipo === 'twoCellAnchor' ? `<xdr:to><xdr:col>1</xdr:col><xdr:row>${hasta}</xdr:row></xdr:to>` : ''}
    <xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic>
  </xdr:${tipo}>`;

const dibujo = `<xdr:wsDr>
  ${anclaje('oneCellAnchor', 1, 1, 'rId1')}
  ${anclaje('twoCellAnchor', 2, 4, 'rId2')}
  ${anclaje('twoCellAnchor', 2, 5, 'rId3')}
  ${anclaje('absoluteAnchor', 0, 0, 'rId4')}
</xdr:wsDr>`;

const { anclajes, sinFila } = xlsx.anclajesDeDibujo(dibujo);
comprobar('lee los anclajes que sí tienen fila', anclajes.length, 3);
comprobar('la foto estirada conserva hasta dónde llega', anclajes[1], { desde: 2, hasta: 4, embed: 'rId2' });
comprobar('una foto pegada a una sola celda empieza y termina igual', anclajes[0], { desde: 1, hasta: 1, embed: 'rId1' });
comprobar('la foto suelta se cuenta como no ubicable', sinFila, 1);

// Y sobre un .xlsx armado de verdad: cuatro interruptores, cuatro fotos
// pegadas de distinta manera. Dos arrancan en la misma fila porque alguien
// estiró una hacia arriba, que es lo que pasa cuando la lista se arma a mano.
// Antes de cubrir el rango completo del anclaje, la tercera se perdía sin
// avisar y el producto salía sin foto en la oferta ya enviada.
const png = (b) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from([b])]);
const filaXml = (r, ref, desc, precio) =>
  `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${ref}</t></is></c>`
  + `<c r="B${r}" t="inlineStr"><is><t>${desc}</t></is></c><c r="C${r}"><v>${precio}</v></c></row>`;
const anc = (tipo, desde, hasta, id) => `<xdr:${tipo}>
  <xdr:from><xdr:col>0</xdr:col><xdr:row>${desde}</xdr:row></xdr:from>
  ${hasta === null ? '' : `<xdr:to><xdr:col>1</xdr:col><xdr:row>${hasta}</xdr:row></xdr:to>`}
  <xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic></xdr:${tipo}>`;

const libro = armarZip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Interruptores" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>REF</t></is></c><c r="B1" t="inlineStr"><is><t>DESCRIPCION</t></is></c><c r="C1" t="inlineStr"><is><t>PRECIO CLIENTE</t></is></c></row>
    ${filaXml(2, 'G7-1', 'Interruptor 1 canal', 120000)}${filaXml(3, 'G7-2', 'Interruptor 2 canales', 154868)}
    ${filaXml(4, 'G7-3', 'Interruptor 3 canales', 163793)}${filaXml(5, 'G7-4', 'Interruptor 4 canales', 180000)}
  </sheetData><drawing r:id="rIdD"/></worksheet>`,
  'xl/worksheets/_rels/sheet1.xml.rels': '<Relationships><Relationship Id="rIdD" Target="../drawings/drawing1.xml"/></Relationships>',
  'xl/drawings/drawing1.xml': `<xdr:wsDr>${anc('oneCellAnchor', 1, null, 'rId1')}${
    anc('twoCellAnchor', 2, 3, 'rId2')}${anc('twoCellAnchor', 2, 4, 'rId3')}${anc('oneCellAnchor', 4, null, 'rId4')}</xdr:wsDr>`,
  'xl/drawings/_rels/drawing1.xml.rels': `<Relationships>
    <Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../media/image2.png"/>
    <Relationship Id="rId3" Target="../media/image3.png"/><Relationship Id="rId4" Target="../media/image4.png"/></Relationships>`,
  'xl/media/image1.png': png(1), 'xl/media/image2.png': png(2),
  'xl/media/image3.png': png(3), 'xl/media/image4.png': png(4),
});

const hojaLeida = xlsx.leerXlsx(libro, { conImagenes: true }).hojas[0];
comprobar('los cuatro interruptores quedan con su foto',
  [1, 2, 3, 4].map((f) => hojaLeida.imagenes.get(f)?.datos[8] ?? null), [1, 2, 3, 4]);
comprobar('y ninguna queda sin ubicar', hojaLeida.imagenes.sinUbicar, 0);

/* 8b-bis · Lo mismo, pero leído en el hilo de trabajo ---------------- */
// El worker no puede simplemente devolver lo mismo que leerXlsx(): las
// imágenes van en un Map con una propiedad extra colgada encima, que se
// aplana para cruzar entre hilos y se vuelve a armar del otro lado. Esto
// prueba que ese viaje de ida y vuelta no pierde ni cambia nada, comparando
// contra el resultado ya verificado arriba en el hilo principal.
const trabajos = await import('./server/trabajos.js');
const hojaEnWorker = (await trabajos.leerXlsxEnSegundoPlano(libro, { conImagenes: true })).hojas[0];
comprobar('el worker lee las mismas filas que el hilo principal',
  hojaEnWorker.filas, hojaLeida.filas);
comprobar('el worker conserva las fotos en la fila que les toca',
  [1, 2, 3, 4].map((f) => hojaEnWorker.imagenes.get(f)?.datos[8] ?? null), [1, 2, 3, 4]);
comprobar('y también el conteo de fotos sin ubicar', hojaEnWorker.imagenes.sinUbicar, hojaLeida.imagenes.sinUbicar);

// Un archivo roto tiene que rechazarse igual desde el worker que desde el
// hilo principal, no colgarse esperando una respuesta que nunca llega.
let rotoEnWorker = null;
try { await trabajos.leerXlsxEnSegundoPlano(Buffer.from('no es un zip'), { conImagenes: false }); }
catch (err) { rotoEnWorker = err.message; }
comprobar('un archivo que no es .xlsx se rechaza también desde el worker',
  typeof rotoEnWorker === 'string' && rotoEnWorker.length > 0, true);

/* 8c · La lista de precios que vive en línea ------------------------ */
const remoto = await import('./server/remoto.js');

// La dirección que uno copia del navegador es para mirar la hoja, no para
// bajarla. Se traduce sola.
comprobar('la hoja de Google se convierte en descarga de CSV',
  remoto.direccionDeDescarga('https://docs.google.com/spreadsheets/d/1AbC_dEf/edit#gid=847'),
  'https://docs.google.com/spreadsheets/d/1AbC_dEf/export?format=csv&gid=847');
comprobar('Dropbox baja el archivo en vez de mostrarlo',
  remoto.direccionDeDescarga('https://www.dropbox.com/s/xyz/lista.xlsx?dl=0'),
  'https://www.dropbox.com/s/xyz/lista.xlsx?dl=1');

// No puede salir a la red interna del hosting
for (const mala of ['http://127.0.0.1:8734/api', 'http://192.168.1.10/lista.csv', 'http://localhost/x']) {
  let bloqueada = false;
  try { remoto.validarDireccion(mala); } catch { bloqueada = true; }
  comprobar(`rechaza la dirección interna ${mala}`, bloqueada, true);
}
let sinProtocolo = false;
try { remoto.validarDireccion('file:///etc/passwd'); } catch { sinProtocolo = true; }
comprobar('rechaza lo que no sea http o https', sinProtocolo, true);

/* 8c-bis · descargar() no vuelve a bajar lo mismo enseguida ---------- */
// "Probar" una lista antes de guardarla es a los ponchazos: se prueba, se
// ajusta el mapeo, se prueba de nuevo. Sin esta caché cada clic volvería a
// bajar la hoja entera. Se reemplaza fetch por uno que cuenta cuántas veces
// lo llaman, y se pide la misma dirección dos veces seguidas.
const fetchDeVerdad = globalThis.fetch;
let llamadasFetch = 0;
globalThis.fetch = async () => {
  llamadasFetch += 1;
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => libro.buffer.slice(libro.byteOffset, libro.byteOffset + libro.byteLength),
  };
};
try {
  await remoto.descargar('https://ejemplo.com/lista.xlsx');
  await remoto.descargar('https://ejemplo.com/lista.xlsx');
  comprobar('la segunda descarga de la misma dirección no vuelve a pedirla', llamadasFetch, 1);

  const traida = await remoto.traerLista('https://ejemplo.com/lista.xlsx');
  comprobar('traerLista() reconoce el .xlsx y lo manda por el worker', traida.formato, 'xlsx');
  comprobar('con las mismas filas que leerlo directo', traida.filas, hojaLeida.filas);
} finally {
  globalThis.fetch = fetchDeVerdad;
}

// El CSV como lo exporta una hoja en español: punto y coma de separador,
// puntos de miles, y un campo entrecomillado con comas y comillas adentro.
const csv = `LISTA DE PRECIOS CLIC CONTROL;;;
REF;DESCRIPCION;PRECIO CANAL;PRECIO CLIENTE FINAL
G7-1;Interruptor 1 canal;98.500;120.000
G7-2;Interruptor 2 canales;154.868;247.790
G7-4;"Interruptor 4 canales, línea ""Key Look""";190.000;295.000
`;
const filasCsv = remoto.leerCsv(csv);
comprobar('separa por punto y coma', filasCsv[1], ['REF', 'DESCRIPCION', 'PRECIO CANAL', 'PRECIO CLIENTE FINAL']);
comprobar('los miles con punto quedan como número', filasCsv[2][3], 120000);
comprobar('respeta las comas dentro de comillas', filasCsv[4][1], 'Interruptor 4 canales, línea "Key Look"');
comprobar('y el precio de esa fila también', filasCsv[4][3], 295000);

// De ahí en más es el mismo camino que una lista subida a mano
const mapeoCsv = xlsx.sugerirMapeo(filasCsv);
const productosCsv = xlsx.filasDesdeMapeo(filasCsv, mapeoCsv);
comprobar('reconoce los tres productos', productosCsv.length, 3);
comprobar('y de qué columna sale el precio', productosCsv[1],
  { fila: 3, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', marca: null, unidad: null,
    precio_canal: 154868, precio_constructor: null, precio_cliente: 247790, stock: null });

const infCsv = db.conciliarProductos('Desde la hoja', productosCsv, {});
comprobar('la hoja en línea alimenta el catálogo', infCsv.nuevos.length, 3);

// Y una segunda pasada con la hoja ya editada: precio nuevo y una referencia
// que desapareció, sin perder nada de lo cargado a mano.
const idG71 = db.consultar('productos', { texto: 'G7-1' })[0].id;
db.actualizar('productos', idG71, { foto: '/uploads/productos/x.webp', notas: 'la trajo Andrés' });
const infCsv2 = db.conciliarProductos('Desde la hoja', remoto.leerCsv(csv.replace('120.000', '125.000'))
  .slice(2).map((f, i) => ({ fila: i + 2, referencia: f[0], descripcion: f[1], precio_canal: f[2], precio_cliente: f[3] })), {});
comprobar('al volver a traerla sólo cambia el precio', infCsv2.actualizados.length, 1);
comprobar('y conserva la foto cargada a mano', db.obtenerPorId('productos', idG71).foto, '/uploads/productos/x.webp');

// La forma de la lista real: un título arriba, el encabezado, y debajo los
// subtítulos de los tres niveles de precio. El encabezado tiene que ser el del
// medio —no el título, que también dice "precios"— y "Interruptor 2 canales"
// no puede confundirse con la columna de precio de canal.
const conSubtitulos = [
  ['LISTA DE PRECIOS ENERO 2025', null, null, null, null],
  ['REF', 'DESCRIPCION', 'PRECIO', null, null],
  [null, null, 'CANAL', 'CONSTRUCTOR', 'CLIENTE FINAL'],
  ['G7-2', 'Interruptor 2 canales', 154868, 216816, 247790],
  ['G7-3', 'Interruptor 3 canales', 163793, 229311, 262070],
];
const mapeoReal = xlsx.sugerirMapeo(conSubtitulos);
comprobar('el encabezado es el del medio, no el título', mapeoReal.filaEncabezado, 1);
comprobar('los datos empiezan después de los subtítulos', mapeoReal.filaInicioDatos, 3);
comprobar('cada nivel de precio cae en su columna',
  [mapeoReal.columnas.referencia, mapeoReal.columnas.descripcion, mapeoReal.columnas.precio_canal,
    mapeoReal.columnas.precio_constructor, mapeoReal.columnas.precio_cliente], [0, 1, 2, 3, 4]);

// Una hoja de la que no se entiende cuál columna es el producto no se importa
// a medias: se para y lo dice.
let sinDescripcion = false;
try {
  xlsx.filasDesdeMapeo([[1, 2], [3, 4]], { columnas: { referencia: 0 }, filaInicioDatos: 0 });
} catch { sinDescripcion = true; }
comprobar('sin columna de descripción no importa nada', sinDescripcion, true);

/* 9 · Borrados en cadena -------------------------------------------- */
t('eliminar', { entidad: 'productos', id: 1 });
comprobar('borrar del catálogo no borra el renglón',
  db.obtenerPorId('cotizacion_items', items[0].id).descripcion.split('\n')[0],
  'Panel táctil de 4 pulgadas');

/* 8d · Cambiar con qué lista de precios está armada la cotización ---- */
// Se cotiza al cliente final, pero la misma oferta puede tener que salir a
// precio de constructor o de canal. Antes el selector guardaba el nivel pero
// no le volvía a poner precio a lo que ya estaba, así que no servía de nada.
// Con productos propios de esta prueba: los de más arriba ya pasaron por
// importaciones y borrados, y apoyarse en ellos haría fallar esto por algo
// que no tiene nada que ver.
db.conciliarProductos('Niveles', [
  { fila: 2, referencia: 'NV-2', descripcion: 'Interruptor 2 canales', precio_canal: 154868, precio_constructor: 216816, precio_cliente: 247790 },
  { fila: 3, referencia: 'NV-3', descripcion: 'Interruptor 3 canales', precio_canal: 163793, precio_constructor: 229311, precio_cliente: 262070 },
], {});
const idNv2 = db.consultar('productos', { texto: 'NV-2' })[0].id;
const idNv3 = db.consultar('productos', { texto: 'NV-3' })[0].id;

const cotNivel = db.insertar('cotizaciones', { titulo: 'Para un constructor' });
db.agregarItem(cotNivel.id, { producto_id: idNv2, cantidad: 2 });
db.agregarItem(cotNivel.id, { producto_id: idNv3, cantidad: 1 });
db.agregarItem(cotNivel.id, { descripcion: 'Mano de obra', precio_unitario: 900000 });

const precioDe = (cotId, texto) =>
  db.consultar('cotizacion_items', { cotizacion_id: cotId })
    .find((i) => i.descripcion.includes(texto))?.precio_unitario;

comprobar('arranca con el precio de cliente final', precioDe(cotNivel.id, '2 canales'), 247790);

const aConstructor = db.cambiarNivelPrecio(cotNivel.id, 'constructor');
comprobar('pasarla a constructor cambia los renglones del catálogo',
  precioDe(cotNivel.id, '2 canales'), 216816);
comprobar('todos los del catálogo, no sólo el primero',
  precioDe(cotNivel.id, '3 canales'), 229311);
comprobar('y avisa cuántos cambió', aConstructor.actualizados, 2);
// Un renglón libre no salió del catálogo: no tiene precio de constructor.
comprobar('la mano de obra no se toca', precioDe(cotNivel.id, 'Mano de obra'), 900000);
comprobar('el total se recalcula solo',
  db.obtenerPorId('cotizaciones', cotNivel.id).monto, 2 * 216816 + 229311 + 900000);

// Lo tocado a mano se respeta: volver a ponerle el precio de lista sería
// borrar una decisión del usuario sin avisar.
const itemTocado = db.consultar('cotizacion_items', { cotizacion_id: cotNivel.id })
  .find((i) => i.descripcion.includes('2 canales'));
db.actualizarItem(itemTocado.id, { precio_unitario: 200000 });
const aCanal = db.cambiarNivelPrecio(cotNivel.id, 'canal');
comprobar('el renglón con precio tocado a mano no se pisa',
  precioDe(cotNivel.id, '2 canales'), 200000);
comprobar('y se dice cuál quedó afuera, no se esconde',
  aCanal.respetados.map((r) => r.descripcion), ['Interruptor 2 canales']);
comprobar('los demás sí pasan a canal', precioDe(cotNivel.id, '3 canales'), 163793);

// Volver al mismo nivel no toca nada.
const sinCambio = db.cambiarNivelPrecio(cotNivel.id, 'canal');
comprobar('reaplicar el mismo nivel no cambia nada', [sinCambio.actualizados, sinCambio.respetados.length], [0, 0]);

let nivelInvalido = false;
try { db.cambiarNivelPrecio(cotNivel.id, 'mayorista'); } catch { nivelInvalido = true; }
comprobar('un nivel que no existe se rechaza', nivelInvalido, true);

// El caso que dejaba el selector inservible: reimportar la lista del proveedor
// deja los renglones ya cotizados con SU precio —a propósito, una oferta
// enviada no cambia sola—, pero comparar contra el catálogo hacía que todos
// parecieran tocados a mano y cambiar de lista no movía un peso.
const cotVieja = db.insertar('cotizaciones', { titulo: 'De antes del aumento' });
db.agregarItem(cotVieja.id, { producto_id: idNv2, cantidad: 10 });
db.conciliarProductos('Niveles', [
  { fila: 2, referencia: 'NV-2', descripcion: 'Interruptor 2 canales', precio_canal: 161000, precio_constructor: 225000, precio_cliente: 258000 },
], {});
comprobar('el renglón conserva el precio con el que se cotizó',
  precioDe(cotVieja.id, '2 canales'), 247790);

const trasAumento = db.cambiarNivelPrecio(cotVieja.id, 'constructor');
comprobar('haber reimportado la lista no lo hace pasar por tocado a mano',
  [trasAumento.actualizados, trasAumento.respetados.length], [1, 0]);
comprobar('y queda con el precio de constructor que rige hoy',
  precioDe(cotVieja.id, '2 canales'), 225000);

// Dictar otro precio al agregar el renglón ya cuenta como tocarlo a mano.
const cotDictada = db.insertar('cotizaciones', { titulo: 'Con precio dictado' });
db.agregarItem(cotDictada.id, { producto_id: idNv3, cantidad: 1, precio_unitario: 300000 });
const trasDictar = db.cambiarNivelPrecio(cotDictada.id, 'canal');
comprobar('un precio dictado al agregar el renglón tampoco se pisa',
  [precioDe(cotDictada.id, '3 canales'), trasDictar.actualizados], [300000, 0]);

/* 8e · Eliminar una cotización -------------------------------------- */
// Una oferta abierta por error no tenía cómo salir de la lista.
const cotBorrar = db.insertar('cotizaciones', { titulo: 'Abierta por error', estado: 'aprobada' });
const propio = db.consultar('productos', { texto: 'CC-CAM' })[0];
db.agregarItem(cotBorrar.id, { producto_id: propio.id, cantidad: 3 });
db.insertar('abonos', { cotizacion_id: cotBorrar.id, monto: 100000 });
db.activarCotizacion(cotBorrar.id);

const stockAntesDeBorrar = db.consultar('productos', { texto: 'CC-CAM' })[0].stock;
comprobar('estando aprobada, ya descontó de la bodega',
  db.consultar('movimientos_stock', { producto_id: propio.id })
    .some((m) => m.cotizacion_id === cotBorrar.id), true);

const borrado = db.eliminarCotizacion(cotBorrar.id);
comprobar('la cotización se borra', borrado.borrada, true);
comprobar('y avisa cuántos abonos se llevó', borrado.abonos, 1);
comprobar('ya no está en la lista', db.obtenerPorId('cotizaciones', cotBorrar.id), undefined);
comprobar('sus renglones se van con ella',
  db.consultar('cotizacion_items', { cotizacion_id: cotBorrar.id }).length, 0);
comprobar('y sus abonos también',
  db.consultar('abonos', { cotizacion_id: cotBorrar.id }).length, 0);

// Lo que no puede pasar: que la bodega quede descontada por algo que ya no existe.
comprobar('lo que había salido de bodega vuelve',
  db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntesDeBorrar + 3);
comprobar('sin dejar movimientos huérfanos apuntando a la nada',
  db.consultar('movimientos_stock', { producto_id: propio.id })
    .some((m) => m.cotizacion_id === cotBorrar.id), false);

// Si era la que se estaba dictando, se deja de apuntar a ella.
comprobar('deja de ser la cotización en curso', db.cotizacionActiva(), null);
comprobar('borrar una que no existe avisa en vez de romper',
  db.eliminarCotizacion(99999).borrada, false);

/* 9a · La cotización en PDF ----------------------------------------- */
// El botón "Imprimir" no hacía nada en la aplicación instalada del celular
// (iOS no le da diálogo de impresión a una app instalada), así que la oferta
// no se podía mandar. Ahora el PDF lo arma el servidor.
const pdfMod = await import('./server/oferta-pdf.js');
const bajo = await import('./server/pdf.js');

const armado = pdfMod.pdfDeCotizacion(cotId);
comprobar('el PDF se arma', Boolean(armado?.pdf?.length), true);
comprobar('y es un PDF de verdad', armado.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
comprobar('cerrado como corresponde', armado.pdf.subarray(-6).toString('latin1').trim(), '%%EOF');
// La tabla de posiciones del final es lo que hace que un lector pueda abrirlo;
// sin ella el archivo existe pero ningún visor lo muestra.
comprobar('trae la tabla de posiciones', armado.pdf.includes(Buffer.from('startxref')), true);

// Lo que va adentro tiene que ser lo de esta cotización, no cualquier cosa.
const leerTextoPdf = (pdf) => {
  let salida = '';
  const crudo = pdf.toString('latin1');
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { salida += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* imagen */ }
  }
  return salida;
};
const textoPdf = leerTextoPdf(armado.pdf);
comprobar('lleva el número de la cotización', textoPdf.includes(`COTIZACIÓN N.º ${cotId}`), true);
comprobar('y el nombre del cliente', textoPdf.includes('Jimmy'), true);
// Las tildes y la eñe sobreviven al viaje: el PDF no habla el mismo alfabeto
// que el navegador y hay que traducirlas.
comprobar('las tildes salen bien', textoPdf.includes('DESCRIPCIÓN'), true);

const nombre = pdfMod.nombreDeArchivo(armado.cotizacion);
comprobar('el archivo se llama de forma reconocible', /^Cotizacion-\d+-.*\.pdf$/.test(nombre), true);
comprobar('sin tildes ni espacios, que rompen al descargarlo', /^[A-Za-z0-9.-]+$/.test(nombre), true);

// Una cotización que no existe no revienta: avisa que no está.
comprobar('una cotización inexistente no arma nada', pdfMod.pdfDeCotizacion(99999), null);

// Cortar renglones largos es lo que evita que el texto se salga de la columna.
const cortado = bajo.partirEnRenglones('Panel táctil de cuatro pulgadas con marco de aluminio anodizado', 90, 8);
comprobar('parte los textos largos en varios renglones', cortado.length > 1, true);
comprobar('y ninguno se pasa del ancho',
  cortado.every((r) => bajo.anchoTexto(r, 8) <= 90), true);

// Una palabra sola más larga que la columna se parte, en vez de desbordarse.
const palabrota = bajo.partirEnRenglones('Supercalifragilisticoespialidoso', 40, 8);
comprobar('una palabra gigante también se corta',
  palabrota.every((r) => bajo.anchoTexto(r, 8) <= 40), true);

// El tamaño de la foto se lee de la cabecera del JPEG, sin descomprimirla.
comprobar('un JPEG falso no se toma por bueno', bajo.medirJpeg(Buffer.from('no soy jpeg')), null);

/* 9a-bis · El logo no se dice dos veces --------------------------- */
// Con el logo cargado, el nombre de la empresa en letras grandes debajo era
// decir lo mismo dos veces: el logo ya lo dice. Sin logo sí tiene que estar,
// o la oferta saldría sin decir de quién es.
//
// El pie de página no cuenta: ahí el nombre acompaña al teléfono y al correo,
// y es lo que se mira cuando la hoja quedó suelta sobre un escritorio.
const cuantasVeces = (texto, aguja) => texto.split(aguja).length - 1;

db.guardarAjustes({ empresa: 'Click Control', logo: '' });
const sinLogo = leerTextoPdf(pdfMod.pdfDeCotizacion(cotId).pdf);
comprobar('sin logo, el nombre va en el encabezado y en el pie',
  cuantasVeces(sinLogo, 'Click Control'), 2);

// Un JPEG mínimo pero legítimo, para que el generador lo acepte como logo.
const jpegDePrueba = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
  + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
comprobar('el JPEG de prueba es válido', Boolean(bajo.medirJpeg(jpegDePrueba)), true);

db.guardarAjustes({ logo: '/uploads/marca/logo.png' });
const conLogo = pdfMod.pdfDeCotizacion(cotId, new Map([['/uploads/marca/logo.png', jpegDePrueba]]));
const textoConLogo = leerTextoPdf(conLogo.pdf);
comprobar('con logo, el nombre queda sólo en el pie',
  cuantasVeces(textoConLogo, 'Click Control'), 1);
comprobar('y el logo va incrustado de verdad',
  conLogo.pdf.includes(Buffer.from('DCTDecode')), true);
// La fecha no puede irse abajo arrastrada por el alto del logo.
comprobar('la fecha sigue en el encabezado', textoConLogo.includes('Fecha:'), true);

// Si el logo está configurado pero no llegó convertido, la oferta sale igual:
// se cae al nombre en letras en vez de quedarse sin encabezado.
const logoQueNoLlego = leerTextoPdf(pdfMod.pdfDeCotizacion(cotId).pdf);
comprobar('si el logo no llegó, vuelve el nombre en letras',
  cuantasVeces(logoQueNoLlego, 'Click Control'), 2);

db.guardarAjustes({ logo: '' });

/* 9b · El formulario de la web agenda solo -------------------------- */
// Lo que manda el Apps Script cuando alguien toma un turno en la web.
const agendamiento = {
  proyecto: 'Amazonía 96', fecha: '2026-08-21', hora: '8:30',
  nombre: 'Isabella Ruiz', apto: '318',
  telefono: '3108706368', correo: 'isabellaruizguarin2006@gmail.com',
};

const alta = db.registrarCitaExterna(agendamiento);
comprobar('el agendamiento de la web entra como cita nueva', alta.creada, true);
// Las 8:30 tienen que quedar como 08:30. Sin rellenar con cero, la agenda se
// ordena como texto y una cita de las 8:30 aparecería DESPUÉS de una de las
// 10:00, que es justo al revés de lo que pasa en el día.
comprobar('la hora queda con dos dígitos para poder ordenarla', alta.cita.inicio, '2026-08-21T08:30');
comprobar('el título dice qué es y en qué apartamento', alta.cita.titulo, 'Entrega domótica · Apto 318');
comprobar('y el lugar junta proyecto y apartamento', alta.cita.lugar, 'Amazonía 96 · Apto 318');
// El residente NO entra como cliente: quien agenda una entrega es el dueño de
// un apartamento, no un cliente de Clic Control —el cliente es la
// constructora, la que tiene la cotización—. Una torre de cincuenta
// apartamentos llenaba la lista de nombres con los que no se factura nada.
// Sus datos viven en la cita, que es donde sirven el día de la entrega.
comprobar('la entrega no cuelga de ningún cliente', alta.cita.cliente_id, null);
comprobar('pero la cita guarda quién es el residente y cómo ubicarlo',
  ['Residente: Isabella Ruiz', 'Teléfono: 3108706368', 'Correo: isabellaruizguarin2006@gmail.com']
    .every((l) => alta.cita.notas.includes(l)), true);

// Que la cita aparezca en la agenda de ese día es el punto de todo esto.
comprobar('la cita se ve en la agenda de ese día',
  db.consultar('citas', { desde: '2026-08-21', hasta: '2026-08-21' }).map((c) => c.titulo),
  ['Entrega domótica · Apto 318']);

// Un reintento del aviso (la red se cortó, Google reintentó) no puede dejar
// dos citas iguales: es el problema que ya apareció antes en la agenda.
const repetido = db.registrarCitaExterna(agendamiento);
comprobar('un aviso repetido actualiza en vez de duplicar', repetido.creada, false);
comprobar('y sigue habiendo una sola cita en esa franja',
  db.consultar('citas', { desde: '2026-08-21', hasta: '2026-08-21' }).length, 1);
comprobar('y ninguna Isabella en la lista de clientes',
  db.consultar('clientes', { texto: 'Isabella Ruiz' }).length, 0);

// Dos entregas del mismo edificio son dos citas, y ninguna ensucia Clientes.
const vecino = db.registrarCitaExterna({
  ...agendamiento, hora: '9:30', nombre: 'Andrés Peña', apto: '405',
  correo: 'andres@ejemplo.com',
});
comprobar('la entrega del vecino tampoco crea cliente', vecino.cita.cliente_id, null);
comprobar('y se distingue por el apartamento', vecino.cita.titulo, 'Entrega domótica · Apto 405');

// Si alguien libera su turno y lo toma otro, la cita pasa a ser del nuevo:
// el turno es el mismo, no son dos entregas.
const reemplazo = db.registrarCitaExterna({
  ...agendamiento, nombre: 'Pedro Gómez', apto: '402', correo: 'pedro@ejemplo.com', telefono: '3001112233',
});
comprobar('si otro toma ese turno, la cita cambia de dueño', reemplazo.creada, false);
comprobar('y queda a nombre del nuevo', reemplazo.cita.titulo, 'Entrega domótica · Apto 402');
comprobar('sin dejar dos citas en la misma franja',
  db.consultar('citas', { desde: '2026-08-21', hasta: '2026-08-21' })
    .filter((c) => c.inicio === '2026-08-21T08:30').length, 1);

// Datos que no sirven se rechazan antes de tocar la agenda.
for (const [que, malo] of [
  ['sin nombre', { ...agendamiento, nombre: '  ' }],
  ['con la fecha al revés', { ...agendamiento, fecha: '21/08/2026' }],
  ['con una hora imposible', { ...agendamiento, hora: '25:00' }],
]) {
  let rechazado = false;
  try { db.registrarCitaExterna(malo); } catch { rechazado = true; }
  comprobar(`rechaza un agendamiento ${que}`, rechazado, true);
}

/* 9c · Cancelar: la hoja manda lo que sigue en pie -------------------- */
// El formulario no avisa cuando se borra una fila, así que la hoja manda cada
// tanto la lista completa y Ari cancela lo que ya no está.
const turno = (hora, nombre, apto) => ({ fecha: '2026-09-18', hora, nombre, apto,
  correo: `${apto}@ejemplo.com`, telefono: '3000000000' });

const sync1 = db.sincronizarAgendaExterna({
  proyecto: 'Amazonía 96',
  desde: '2026-01-01',   // en la prueba las fechas son futuras, pero se fija para no depender de hoy
  turnos: [turno('8:30', 'Ana Díaz', '101'), turno('9:00', 'Beto Pérez', '102'), turno('9:30', 'Caro Ruiz', '103')],
});
comprobar('la primera sincronización agenda los tres turnos', [sync1.agendadas, sync1.nuevas], [3, 3]);

// Beto canceló: su fila ya no viene en la lista.
const sync2 = db.sincronizarAgendaExterna({
  proyecto: 'Amazonía 96',
  desde: '2026-01-01',
  turnos: [turno('8:30', 'Ana Díaz', '101'), turno('9:30', 'Caro Ruiz', '103')],
});
comprobar('el turno que ya no viene queda cancelado',
  sync2.canceladas.map((c) => c.titulo), ['Entrega domótica · Apto 102']);
comprobar('no vuelve a crear los que siguen en pie', sync2.nuevas, 0);
comprobar('y la agenda de ese día ya sólo muestra dos',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'pendiente' }).length, 2);
// Cancelada, no borrada: el registro queda para poder mirarlo después.
comprobar('la cancelada sigue existiendo, sólo que tachada',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'cancelada' })
    .map((c) => c.titulo), ['Entrega domótica · Apto 102']);

// Si Beto vuelve a tomar el turno, su cita revive en vez de duplicarse.
const sync3 = db.sincronizarAgendaExterna({
  proyecto: 'Amazonía 96',
  desde: '2026-01-01',
  turnos: [turno('8:30', 'Ana Díaz', '101'), turno('9:00', 'Beto Pérez', '102'), turno('9:30', 'Caro Ruiz', '103')],
});
comprobar('si vuelve a tomar el turno, revive sin duplicar', sync3.nuevas, 0);
comprobar('y la agenda vuelve a mostrar los tres',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'pendiente' }).length, 3);

// Lo que NO puede pasar: que una cita cargada a mano se cancele sola.
const aMano = db.insertar('citas', {
  titulo: 'Visita técnica cargada a mano', inicio: '2026-09-18T14:00', estado: 'pendiente',
});
db.sincronizarAgendaExterna({ proyecto: 'Amazonía 96', desde: '2026-01-01', turnos: [] , permitir_vaciar: true });
comprobar('una cita cargada a mano no se cancela sola',
  db.obtenerPorId('citas', aMano.id).estado, 'pendiente');
comprobar('pero sí se cancelaron las del proyecto',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'pendiente' })
    .map((c) => c.titulo), ['Visita técnica cargada a mano']);

// Una lista vacía sin pedirlo con todas las letras no vacía la agenda: es más
// probable que la hoja no se haya podido leer a que se cancelara todo junto.
db.sincronizarAgendaExterna({ proyecto: 'Amazonía 96', desde: '2026-01-01', turnos: [turno('8:30', 'Ana Díaz', '101')] });
let frenoVacio = false;
try { db.sincronizarAgendaExterna({ proyecto: 'Amazonía 96', desde: '2026-01-01', turnos: [] }); }
catch { frenoVacio = true; }
comprobar('una lista vacía inesperada no vacía la agenda', frenoVacio, true);
comprobar('y la cita que había sigue en pie',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'pendiente' })
    .filter((c) => c.titulo.includes('101')).length, 1);

// Un turno mal formado frena todo: si se salteara, su cita se cancelaría por
// no aparecer en la lista de vigentes, que es exactamente lo que no queremos.
let frenoTurnoMalo = false;
try {
  db.sincronizarAgendaExterna({
    proyecto: 'Amazonía 96', desde: '2026-01-01',
    turnos: [turno('8:30', 'Ana Díaz', '101'), { ...turno('9:00', 'Beto Pérez', '102'), fecha: '18/09/2026' }],
  });
} catch { frenoTurnoMalo = true; }
comprobar('un turno mal formado frena la sincronización entera', frenoTurnoMalo, true);
comprobar('sin haber cancelado nada por el camino',
  db.consultar('citas', { desde: '2026-09-18', hasta: '2026-09-18', estado: 'pendiente' })
    .filter((c) => c.titulo.includes('101')).length, 1);

// Lo viejo no se toca: si la hoja se limpia, las entregas ya hechas siguen ahí.
db.registrarCitaExterna({ proyecto: 'Amazonía 96', fecha: '2026-02-06', hora: '8:30',
  nombre: 'Entrega vieja', apto: '001', correo: 'vieja@ejemplo.com' });
db.sincronizarAgendaExterna({
  proyecto: 'Amazonía 96', desde: '2026-09-01',
  turnos: [turno('8:30', 'Ana Díaz', '101')],
});
comprobar('una entrega anterior a la fecha de corte no se cancela',
  db.consultar('citas', { desde: '2026-02-06', hasta: '2026-02-06' })[0].estado, 'pendiente');

/* 10 · La caché del resumen y los ajustes se entera de lo que cambia - */
// El dashboard se pide muy seguido (cada acción del asistente lo vuelve a
// pedir), así que resumen() y leerAjustes() se cachean unos segundos. Lo
// que hay que probar no es que cacheen —eso se nota en la velocidad, no en
// el resultado— sino que una escritura se ve enseguida y no hay que esperar
// a que venza el plazo.
const clientesAntes = db.resumen().contadores.clientes;
db.crearCliente({ nombre: 'Cliente para probar la caché' });
comprobar('el resumen ve un cliente nuevo sin esperar el vencimiento de la caché',
  db.resumen().contadores.clientes, clientesAntes + 1);

const empresaAntes = db.leerAjustes().empresa;
db.guardarAjustes({ empresa: 'Otro nombre de prueba' });
comprobar('los ajustes cambian sin esperar el vencimiento de la caché',
  db.leerAjustes().empresa, 'Otro nombre de prueba');
comprobar('y de verdad cambiaron (no es que ya tuvieran ese valor)',
  empresaAntes === 'Otro nombre de prueba', false);

/* 9 · Fichas técnicas ------------------------------------------------ */
// No se prueba el contenido —eso lo revisa una persona—, sino que el
// generador no se caiga con ninguna de las fichas reales del catálogo: un
// campo mal escrito ahí rompería la importación en lote para todo el mundo.
{
  const { pdfDeFichaTecnica } = await import('./server/ficha-tecnica-pdf.js');
  const { FICHAS } = await import('./server/fichas-contenido.js');
  const referencias = Object.keys(FICHAS);
  comprobar('hay fichas técnicas de contenido cargadas', referencias.length > 0, true);

  let todasArmaron = true;
  let todasEmpiezanComoPdf = true;
  for (const [referencia, datos] of Object.entries(FICHAS)) {
    try {
      const pdf = pdfDeFichaTecnica({ ...datos, referencia: datos.referencia ?? referencia });
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') todasEmpiezanComoPdf = false;
    } catch {
      todasArmaron = false;
    }
  }
  comprobar('todas las fichas del catálogo arman su PDF sin romperse', todasArmaron, true);
  comprobar('y lo que arman es de verdad un PDF', todasEmpiezanComoPdf, true);
}

/* 10 · Encontrar el producto por como uno lo nombra ------------------- */
// Dictando nadie dice la referencia como está en la lista de precios: dice
// "un interruptor z uno" o "la pantalla de cuatro pulgadas". Esto es lo que
// separa una cotización que se arma hablando de una en la que hay que
// saberse el catálogo de memoria, así que se prueba caso por caso.
{
  const catalogo = [
    ['CLICK Z1', 'Interruptor inteligente Zigbee 1 canal, con retorno de estado'],
    ['CLICK Z2', 'Interruptor inteligente Zigbee 2 canales, con retorno de estado'],
    ['CLICK Z3', 'Interruptor inteligente Zigbee 3 canales, con retorno de estado'],
    ['CLICK DP4', 'Pantalla tactil de 4 pulgadas para control de escenas y clima'],
    ['CLICK DP7', 'Pantalla tactil de 7 pulgadas para control de escenas y clima'],
    ['CLICK DP10', 'Pantalla tactil de 10 pulgadas, panel maestro de vivienda'],
    ['CLICK S1', 'Cerradura inteligente con huella y teclado, acabado negro'],
    ['CLICK 15', 'Cerradura de sobreponer con clave y tarjeta'],
    ['MICRODIMMER 2CH', 'Modulo dimmer de 2 canales para iluminacion regulable'],
  ];
  for (const [referencia, descripcion] of catalogo) {
    db.insertar('productos', { referencia, descripcion, precio_cliente: 100000, tipo: 'Domotica' });
  }

  const cual = (frase) => db.resolverProducto(frase).producto?.referencia ?? null;

  comprobar('la referencia dicha con el número en letras', cual('clic z uno'), 'CLICK Z1');
  comprobar('y deletreando la letra', cual('click zeta uno'), 'CLICK Z1');
  comprobar('sólo el pedazo que uno recuerda', cual('z uno'), 'CLICK Z1');
  comprobar('nombrando lo que es, no la referencia', cual('un interruptor z tres'), 'CLICK Z3');
  // Y si de verdad hay dos que encajan igual —acá el G7-3 de más arriba
  // también es un interruptor de 3 canales— no elige ninguno: pregunta.
  comprobar('con dos que encajan igual de bien, no se juega por una',
    cual('un interruptor de tres canales'), null);
  comprobar('con la medida que vive en la descripción',
    cual('una pantalla de cuatro pulgadas'), 'CLICK DP4');
  comprobar('sin que el 4 se lo lleve la DP10',
    cual('una pantalla de diez pulgadas'), 'CLICK DP10');
  comprobar('con acentos y todo', cual('una pantalla táctil de 7 pulgadas'), 'CLICK DP7');

  // Y lo que NO tiene que hacer: elegir por elegir.
  comprobar('con algo ambiguo no elige solo', cual('una pantalla'), null);
  comprobar('pero ofrece las opciones para preguntar',
    db.resolverProducto('una pantalla').sugerencias.length, 3);
  comprobar('y no inventa uno que no está', cual('una nevera de dos puertas'), null);
}

/* 11 · El catálogo público: registro, aprobación, un solo precio, pedido - */
// Nadie ve un precio hasta que lo aprueban con un nivel; el registro y la
// aprobación NO crean cliente —eso pasa recién con el primer pedido de
// verdad—, y si ese correo ya era cliente por otro lado, se engancha ahí en
// vez de duplicarlo.
{
  db.insertar('productos', {
    referencia: 'CLICK Z9', descripcion: 'Interruptor de prueba portal', tipo: 'Switch',
    precio_canal: 100000, precio_constructor: 130000, precio_cliente: 160000,
  });
  db.insertar('productos', {
    referencia: 'CLICK SB9', descripcion: 'Relé sin precio de canal', tipo: 'Módulo',
    precio_cliente: 250000,
  });

  const clientesAntes = db.consultar('clientes', {}).length;

  const registrado = db.registrarPortalUsuario({
    nombre: 'Ferretería El Tornillo', empresa: 'El Tornillo SAS',
    telefono: '3105554433', email: 'compras@eltornillo.co', clave_hash: 'x:y',
  });
  comprobar('el registro queda pendiente', registrado.estado, 'pendiente');
  comprobar('registrarse no crea cliente', db.consultar('clientes', {}).length, clientesAntes);

  comprobar('no se puede registrar dos veces el mismo correo',
    (() => { try { db.registrarPortalUsuario({ nombre: 'Otro', email: 'compras@eltornillo.co', clave_hash: 'x:y' }); return 'no falló'; }
      catch (e) { return e.message; } })(),
    'Ya hay un registro con ese correo, esperando aprobación.');

  const aprobado = db.aprobarPortalUsuario(registrado.id, 'constructor');
  comprobar('aprobado con el precio que le asignaron', aprobado.nivel_precio, 'constructor');
  comprobar('aprobar tampoco crea cliente', db.consultar('clientes', {}).length, clientesAntes);

  const catalogo = db.catalogoPublico('constructor');
  const z9 = catalogo.find((p) => p.referencia === 'CLICK Z9');
  const sb9 = catalogo.find((p) => p.referencia === 'CLICK SB9');
  comprobar('ve el precio CONSTRUCTOR, no canal ni cliente', z9?.precio, 130000);
  comprobar('el que no tiene precio constructor cae al de cliente', sb9?.precio, 250000);
  comprobar('sin ficha técnica todavía, no rompe: viene null', z9.ficha, null);

  db.actualizar('productos', z9.id, { ficha: '/uploads/fichas/x.pdf', ficha_nombre: 'CLICK Z9.pdf' });
  const conFicha = db.catalogoPublico('constructor').find((p) => p.id === z9.id);
  comprobar('la ficha técnica viaja al catálogo público para que la vea el cliente', conFicha.ficha, '/uploads/fichas/x.pdf');

  db.actualizar('productos', z9.id, { notas: 'Requiere neutro. Compatible con Alexa y Google Home.' });
  comprobar('lo cargado en "Notas" llega como características del producto en el catálogo',
    db.catalogoPublico('constructor').find((p) => p.id === z9.id).caracteristicas,
    'Requiere neutro. Compatible con Alexa y Google Home.');

  const pedido = db.crearPedidoPortal(registrado.id, {
    items: [{ producto_id: z9.id, cantidad: 2 }, { producto_id: sb9.id, cantidad: 1 }],
    notas: 'Para la obra de la calle 45',
  });
  comprobar('el pedido llega como cotización marcada del portal', pedido.origen, 'portal');
  comprobar('pendiente, esperando aprobación del dueño', pedido.estado, 'pendiente');
  comprobar('al precio constructor: 2×130.000 + 1×250.000',
    db.totalesCotizacion(pedido.id).subtotal, 2 * 130000 + 250000);

  const clientesDespues = db.consultar('clientes', {});
  comprobar('recién con el primer pedido aparece el cliente', clientesDespues.length, clientesAntes + 1);
  const nuevoCliente = clientesDespues.find((c) => c.email === 'compras@eltornillo.co');
  comprobar('con los datos del registro', nuevoCliente?.nombre, 'Ferretería El Tornillo');

  const segundoPedido = db.crearPedidoPortal(registrado.id, { items: [{ producto_id: z9.id, cantidad: 1 }] });
  comprobar('un segundo pedido no crea otro cliente', db.consultar('clientes', {}).length, clientesAntes + 1);
  comprobar('pero cuelga otra cotización del mismo cliente', segundoPedido.cliente_id, nuevoCliente.id);

  // Alguien que ya era cliente por otro lado (le cotizaron por voz, p.ej.):
  // el pedido del portal se engancha ahí, no crea uno repetido.
  const yaCliente = db.crearCliente({ nombre: 'Constructora Los Andes', email: 'gerencia@losandes.co' });
  const registrado2 = db.registrarPortalUsuario({
    nombre: 'Los Andes Compras', email: 'gerencia@losandes.co', clave_hash: 'x:y',
  });
  db.aprobarPortalUsuario(registrado2.id, 'cliente');
  const pedido2 = db.crearPedidoPortal(registrado2.id, { items: [{ producto_id: sb9.id, cantidad: 1 }] });
  comprobar('se engancha al cliente que ya existía, no lo duplica', pedido2.cliente_id, yaCliente.id);

  const rechazado = db.registrarPortalUsuario({ nombre: 'Alguien Random', email: 'random@ejemplo.com', clave_hash: 'x:y' });
  db.rechazarPortalUsuario(rechazado.id);
  comprobar('a un rechazado no lo deja pedir',
    (() => { try { db.crearPedidoPortal(rechazado.id, { items: [{ producto_id: z9.id, cantidad: 1 }] }); return 'no falló'; }
      catch (e) { return e.message; } })(),
    'No estás autorizado a comprar en el catálogo.');

  comprobar('el resumen cuenta cuántos están esperando aprobación',
    db.resumen().contadores.portalPendientes, 0);   // ya no queda ninguno pendiente: aprobado×2, rechazado×1

  // Ver la cotización del carrito ANTES de mandarlo: no tiene que dejar
  // ningún rastro —ni cotización, ni cliente nuevo— hasta que de verdad se
  // mande. Se usa al que ya se aprobó (registrado, nivel constructor) con
  // un renglón nuevo que todavía no agregó a ningún pedido real.
  const cotizacionesAntesDeLaPrevia = db.consultar('cotizaciones', {}).length;
  const previa = imprimir.paginaVistaPreviaPortal(
    db.portalUsuarioPorEmail('compras@eltornillo.co'),
    [{ producto_id: z9.id, cantidad: 3 }],
    'Para la bodega nueva',
  );
  comprobar('la vista previa no crea ninguna cotización', db.consultar('cotizaciones', {}).length, cotizacionesAntesDeLaPrevia);
  comprobar('avisa que es una vista previa, no una cotización mandada', previa.includes('Vista previa'), true);
  comprobar('con el precio de SU nivel (constructor: 130.000)', previa.includes('130.000'), true);
  comprobar('la cantidad que tenía en el carrito', previa.includes('390.000'), true);   // 3 × 130.000
  comprobar('y las notas que había escrito', previa.includes('Para la bodega nueva'), true);
  comprobar('un carrito vacío no rompe: avisa que no hay nada', imprimir.paginaVistaPreviaPortal(
    db.portalUsuarioPorEmail('compras@eltornillo.co'), [],
  ).includes('Todavía no agregaste nada'), true);

  // Fotos: la principal más las que se van agregando, sin repetir.
  db.agregarFotoProducto(z9.id, '/uploads/productos/foto-1.jpg');
  db.agregarFotoProducto(z9.id, '/uploads/productos/foto-2.jpg');
  comprobar('las fotos extra se acumulan (no hay foto principal, sólo estas dos)',
    db.catalogoPublico('constructor').find((p) => p.id === z9.id).fotos.length, 2);
  db.quitarFotoProducto(z9.id, '/uploads/productos/foto-1.jpg');
  comprobar('se puede quitar una', db.catalogoPublico('constructor').find((p) => p.id === z9.id).fotos.length, 1);
}

/* ------------------------------------------------------------------ */

db.db.close();
rmSync(carpeta, { recursive: true, force: true });

console.log(ok.join('\n'));
if (fallos.length) {
  console.log('\n--- FALLÓ ---');
  console.log(fallos.join('\n'));
}
console.log(`\n${ok.length} correctas, ${fallos.length} fallidas`);
process.exit(fallos.length ? 1 : 0);
