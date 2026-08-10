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
import { deflateRawSync } from 'node:zlib';

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
  estado: 'enviada',
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
db.actualizar('cotizaciones', cotStock, { estado: 'enviada' });
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
  monto: 5000000, estado: 'enviada',
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
