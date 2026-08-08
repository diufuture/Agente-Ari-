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

/* 8 · Impresión ----------------------------------------------------- */
const html = imprimir.paginaCotizacion(cotId);
comprobar('la página imprimible se genera', typeof html === 'string' && html.includes('Cotización N.º'), true);
comprobar('trae el total impreso', html.includes(new Intl.NumberFormat('es-CO').format(Math.round(cotDespues.monto))), true);
comprobar('cotización inexistente devuelve null', imprimir.paginaCotizacion(9999), null);

/* 9 · Borrados en cadena -------------------------------------------- */
t('eliminar', { entidad: 'productos', id: 1 });
comprobar('borrar del catálogo no borra el renglón',
  db.obtenerPorId('cotizacion_items', items[0].id).descripcion, 'Interruptor 2 canales');

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
