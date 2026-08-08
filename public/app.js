/* ══════════════════════════════════════════════════════════════════
   Clic Control · Ari — interfaz
   ══════════════════════════════════════════════════════════════════ */

import { encoger, encogerOTalCual, aDataUrl, pesoLegible, LADO, PESO_SANO } from './foto.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const estado = {
  vista: 'inicio',
  historial: [],       // últimos turnos de conversación (texto plano)
  resumen: null,
  vistaAsistente: null, // resultado de la última consulta por voz
  cotizacionAbierta: null, // id de la cotización cuyo detalle se está viendo
  clienteAbierto: null,    // id del cliente cuya ficha se está viendo
  productoAbierto: null,   // id del producto cuya ficha se está viendo
  editando: false,         // la ficha abierta está mostrando su formulario
  importacion: null,       // hojas de un Excel ya analizadas, listas para revisar e importar
  buscarProductos: '',     // texto del buscador del catálogo
  nuevoProducto: false,    // el formulario de alta manual de producto está abierto
  subiendoFotoPara: null,  // id del producto al que se le está por asignar una foto
  buscarCatalogo: '',      // texto del buscador de productos dentro de una cotización
  resultadosCatalogo: null, // null = todavía no se buscó nada
  verDescontinuados: false, // mostrar los productos que salieron de la lista
};

/* ─────────── Formateo ─────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtFecha(v) {
  if (!v) return '—';
  const [f, h] = String(v).replace(' ', 'T').split('T');
  const [a, m, d] = f.split('-');
  if (!d) return v;
  const hoy = new Date().toLocaleDateString('sv-SE');
  const etiqueta = f === hoy ? 'Hoy' : `${Number(d)} ${MESES[Number(m) - 1]}`;
  return h ? `${etiqueta} · ${h.slice(0, 5)}` : etiqueta;
}

const fmtDinero = (n, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const esPasado = (v) => v && String(v).slice(0, 10) < new Date().toLocaleDateString('sv-SE');

const truncar = (v, n = 80) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

const atajoPegar = () =>
  (navigator.platform || navigator.userAgent).includes('Mac') ? 'Cmd+V' : 'Ctrl+V';

const archivoABase64 = aDataUrl;

/* ─────────── API ─────────── */

async function api(ruta, opciones = {}) {
  const r = await fetch(`/api${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

/* ─────────── Gestor de fotos ─────────── */

/**
 * Vuelve a achicar una foto que ya está guardada en el servidor. Sirve para
 * las que entraron por otro camino: las que venían adentro del Excel del
 * proveedor y las que se bajaron de una dirección web (ésas las descarga el
 * servidor, que no sabe redimensionar; acá sí, con el canvas del navegador).
 *
 * Devuelve cuánto se ahorró, o null si no había nada que ganar.
 */
async function achicarGuardada(producto) {
  const { dataUrl, bytes } = await encoger(producto.foto);
  if (producto.bytes && bytes >= producto.bytes) return null; // ya estaba bien
  await api(`/productos/${producto.id}/foto`, { method: 'POST', body: { imagen_base64: dataUrl } });
  return { antes: producto.bytes || 0, despues: bytes };
}

/** Achica todas las fotos guardadas que hayan quedado pesadas. */
async function achicarTodas(alAvanzar) {
  const { fotos } = await api('/productos/fotos');
  const pesadas = fotos.filter((f) => f.bytes > PESO_SANO);
  let hechas = 0;
  let antes = 0;
  let despues = 0;

  for (const f of pesadas) {
    alAvanzar?.(hechas, pesadas.length);
    try {
      const r = await achicarGuardada(f);
      if (r) {
        hechas += 1;
        antes += r.antes;
        despues += r.despues;
      }
    } catch {
      // Una foto rota no puede frenar a las demás.
    }
  }
  return { hechas, pesadas: pesadas.length, antes, despues };
}

/* ─────────── Avisos ─────────── */

let avisoTimer;
function avisar(mensaje, esError = false) {
  const el = $('#aviso');
  el.textContent = mensaje;
  el.className = `aviso visible${esError ? ' error' : ''}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove('visible'), 3800);
}

/* ══════════════════════════════════════════════════════════════════
   Renderizado
   ══════════════════════════════════════════════════════════════════ */

const TITULOS = {
  inicio: 'Hoy',
  agenda: 'Agenda',
  clientes: 'Clientes',
  productos: 'Productos',
  cotizaciones: 'Cotizaciones',
  cobros: 'Cobros',
  recordatorios: 'Recordatorios',
  ajustes: 'Datos de la empresa',
};

const ENCABEZADOS = {
  nombre: 'Nombre', empresa: 'Empresa', telefono: 'Teléfono', email: 'Correo',
  inicio: 'Cuándo', titulo: 'Asunto', cliente: 'Cliente', lugar: 'Lugar',
  estado: 'Estado', vence_en: 'Vence', texto: 'Detalle', prioridad: 'Prioridad',
  creado_en: 'Fecha', monto: 'Valor', concepto: 'Concepto', direccion: 'Dirección',
  abonado: 'Abonado', saldo: 'Saldo', cotizacion: 'Cotización', nota: 'Nota', fecha: 'Fecha',
  categoria: 'Categoría', referencia: 'Referencia', descripcion: 'Descripción', marca: 'Marca',
  unidad: 'Unidad', precio_cliente: 'Precio', precio_canal: 'P. canal',
  precio_constructor: 'P. constructor', proveedor: 'Proveedor', stock: 'Stock',
  cantidad: 'Cantidad', motivo: 'Motivo', producto: 'Producto',
};

/** Cómo se pinta cada columna. */
function celda(columna, fila) {
  const v = fila[columna];
  switch (columna) {
    case 'inicio':
    case 'vence_en':
    case 'creado_en': {
      const texto = fmtFecha(v);
      const rojo = columna !== 'creado_en' && esPasado(v) && fila.estado === 'pendiente';
      return `<span style="${rojo ? 'color:var(--alerta);font-weight:600' : ''}">${escapar(texto)}</span>`;
    }
    case 'monto':
    case 'abonado':
      return fmtDinero(v, fila.moneda);
    case 'precio_cliente':
    case 'precio_canal':
    case 'precio_constructor':
      return v === null || v === undefined ? '—' : fmtDinero(v);
    case 'descripcion':
      return `<span title="${escapar(v ?? '')}">${escapar(truncar(v, 70))}</span>`;
    case 'stock':
      return fila.maneja_inventario
        ? `<span style="${Number(v) <= 0 ? 'color:var(--alerta);font-weight:600' : ''}">${escapar(v)}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'cantidad':
      return `<span style="color:${Number(v) > 0 ? 'var(--verde)' : 'var(--alerta)'};font-weight:600">${Number(v) > 0 ? '+' : ''}${escapar(v)}</span>`;
    case 'saldo': {
      const saldado = Number(v) <= 0;
      return `<span style="color:${saldado ? 'var(--verde)' : 'var(--ambar)'};font-weight:600">${
        saldado ? 'saldada' : fmtDinero(v, fila.moneda)}</span>`;
    }
    case 'fecha':
      return escapar(fmtFecha(v));
    case 'estado':
    case 'prioridad':
      return `<span class="pastilla ${escapar(v)}">${escapar(v)}</span>`;
    case 'telefono':
      return v ? `<a href="tel:${escapar(v)}" style="color:var(--acento);text-decoration:none">${escapar(v)}</a>` : '—';
    case 'email':
      return v ? `<a href="mailto:${escapar(v)}" style="color:var(--acento);text-decoration:none">${escapar(v)}</a>` : '—';
    default:
      return escapar(v ?? '—');
  }
}

const NUEVO_ESTADO = {
  citas: 'completada',
  recordatorios: 'completada',
  cotizaciones: 'aprobada',
  cobros: 'pagado',
};

function tabla(entidad, columnas, filas, { vacio, compacta = false } = {}) {
  if (!filas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Nada por acá</strong>${escapar(vacio || 'Pedíselo a Ari por voz y aparece de inmediato.')}
    </div></div>`;
  }

  const accionable = entidad in NUEVO_ESTADO;
  const cabeceras = columnas.map((c) => {
    const num = c === 'monto';
    return `<th${num ? ' class="num"' : ''}>${ENCABEZADOS[c] || c}</th>`;
  }).join('');

  const cuerpo = filas.map((f) => {
    const celdas = columnas.map((c, i) => {
      const clases = [c === 'monto' ? 'num' : '', i === 1 || (entidad === 'clientes' && i === 0) ? 'principal-col' : ''].filter(Boolean).join(' ');
      // data-rotulo alimenta el ::before que muestra el nombre de la columna
      // cuando la tabla se apila como ficha en pantallas angostas.
      return `<td${clases ? ` class="${clases}"` : ''} data-rotulo="${ENCABEZADOS[c] || c}">${celda(c, f)}</td>`;
    }).join('');

    const listo = accionable && f.estado !== 'pendiente' && f.estado !== 'enviada';
    const acciones = `<td class="num acciones"><div class="acciones-fila">
      ${compacta ? '' : `
      ${entidad === 'cotizaciones'
        ? `<button class="mini destacado" data-accion="abrir-cotizacion" data-id="${f.id}">Abonos</button>`
        : ''}
      ${entidad === 'clientes'
        ? `<button class="mini destacado" data-accion="abrir-cliente" data-id="${f.id}">Ver ficha</button>`
        : ''}
      ${entidad === 'productos'
        ? `<button class="mini destacado" data-accion="abrir-producto" data-id="${f.id}">Ver</button>`
        : ''}
      ${accionable && !listo
        ? `<button class="mini" data-accion="estado" data-entidad="${entidad}" data-id="${f.id}" data-estado="${NUEVO_ESTADO[entidad]}">${
            entidad === 'cobros' ? 'Pagado' : 'Listo'}</button>`
        : ''}
      <button class="mini peligro" data-accion="borrar" data-entidad="${entidad}" data-id="${f.id}">Borrar</button>`}
    </div></td>`;

    return `<tr>${celdas}${acciones}</tr>`;
  }).join('');

  return `<div class="tarjeta"><div class="tabla-envoltura"><table>
    <thead><tr>${cabeceras}<th class="num"></th></tr></thead>
    <tbody>${cuerpo}</tbody>
  </table></div></div>`;
}

function bloque(titulo, contenido) {
  return `<section class="bloque">
    <h2 class="bloque-titulo">${escapar(titulo)}</h2>
    ${contenido}
  </section>`;
}

function lineaTiempo(citas) {
  if (!citas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Agenda libre</strong>No tenés citas para hoy.
    </div></div>`;
  }
  return `<div class="tarjeta"><div class="linea-tiempo">${citas.map((c) => `
    <div class="evento">
      <div class="hora">${escapar((c.inicio || '').split('T')[1]?.slice(0, 5) || '--:--')}</div>
      <div>
        <div class="que">${escapar(c.titulo)}</div>
        <div class="quien">${escapar([c.cliente, c.lugar].filter(Boolean).join(' · ') || 'Sin cliente asignado')}</div>
      </div>
      <div class="acciones-fila">
        <button class="mini" data-accion="estado" data-entidad="citas" data-id="${c.id}" data-estado="completada">Listo</button>
      </div>
    </div>`).join('')}</div></div>`;
}

/* ─────────── Renglones de una cotización ─────────── */

/** La tabla de ítems, agrupada por sección como en el formato impreso. */
function tablaItems(cot, items) {
  if (!items.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Sin renglones todavía</strong>Buscá productos del catálogo acá abajo, o agregá una línea suelta.
    </div></div>`;
  }

  // Se respeta el orden en que fueron agregados; sólo se insertan cabeceras
  // cada vez que cambia la sección, para no reordenar lo que armó el usuario.
  let seccionActual = null;
  const filas = items.map((it) => {
    const seccion = it.seccion || 'Sin sección';
    const cabecera = seccion !== seccionActual
      ? `<tr class="fila-seccion"><td colspan="6">${escapar(seccion)}</td></tr>`
      : '';
    seccionActual = seccion;

    return `${cabecera}
      <tr>
        <td data-rotulo="Referencia" class="col-ref">${escapar(it.referencia || '—')}</td>
        <td data-rotulo="Descripción" class="principal-col" title="${escapar(it.descripcion)}">
          ${escapar(truncar(it.descripcion, 60))}
          ${it.marca ? `<em class="marca-item">${escapar(it.marca)}</em>` : ''}
        </td>
        <td data-rotulo="Cant." class="num">
          <input class="celda-num" type="number" min="0" step="1" value="${escapar(it.cantidad)}"
                 data-item="${it.id}" data-campo="cantidad" />
        </td>
        <td data-rotulo="Vr. unitario" class="num">
          <input class="celda-num ancho" type="number" min="0" step="1" value="${escapar(it.precio_unitario)}"
                 data-item="${it.id}" data-campo="precio_unitario" />
        </td>
        <td data-rotulo="Vr. total" class="num total-item">${fmtDinero(it.total, cot.moneda)}</td>
        <td class="num acciones"><div class="acciones-fila">
          <button class="mini" data-accion="porcentaje-item" data-id="${it.id}"
                  title="Subirle o bajarle un porcentaje" aria-label="Ajustar por porcentaje">%</button>
          <button class="mini peligro" data-accion="borrar-item" data-id="${it.id}"
                  title="Quitar este renglón" aria-label="Quitar renglón">✕</button>
        </div></td>
      </tr>`;
  }).join('');

  return `<div class="tarjeta"><div class="tabla-envoltura"><table class="tabla-items">
    <thead><tr>
      <th>Ref.</th><th>Descripción</th><th class="num">Cant.</th>
      <th class="num">Vr. unit.</th><th class="num">Vr. total</th><th class="num"></th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table></div></div>`;
}

/** Subtotal, servicio, IVA y total, con los porcentajes editables. */
function totalesYAjustes(cot, totales) {
  const NIVELES = [['canal', 'Canal'], ['constructor', 'Constructor'], ['cliente', 'Cliente final']];
  return `
    <div class="tarjeta">
      <form class="form-totales" id="form-totales" data-id="${cot.id}">
        <label><span>Servicio %</span>
          <input name="porcentaje_servicio" type="number" min="0" step="0.1" value="${escapar(cot.porcentaje_servicio ?? 0)}" /></label>
        <label><span>IVA %</span>
          <input name="porcentaje_iva" type="number" min="0" step="0.1" value="${escapar(cot.porcentaje_iva ?? 0)}" /></label>
        <label><span>Precios que se usan</span>
          <select name="nivel_precio">
            ${NIVELES.map(([v, e]) => `<option value="${v}"${(cot.nivel_precio || 'cliente') === v ? ' selected' : ''}>${e}</option>`).join('')}
          </select></label>
        <button type="submit">Aplicar</button>
      </form>

      <div class="resumen-totales">
        <div><span>Subtotal</span><b>${fmtDinero(totales.subtotal, cot.moneda)}</b></div>
        ${totales.servicio ? `<div><span>Servicio ${cot.porcentaje_servicio}%</span><b>${fmtDinero(totales.servicio, cot.moneda)}</b></div>` : ''}
        ${totales.iva ? `<div><span>IVA ${cot.porcentaje_iva}%</span><b>${fmtDinero(totales.iva, cot.moneda)}</b></div>` : ''}
        <div class="gran-total"><span>Total</span><b>${fmtDinero(totales.total, cot.moneda)}</b></div>
      </div>
    </div>`;
}

/** Buscador del catálogo para ir sumando renglones. */
function buscadorDeProductos() {
  const r = estado.resultadosCatalogo;
  const lista = r === null
    ? '<p class="ayuda" style="padding:0 18px 16px">Escribí para buscar en el catálogo.</p>'
    : r.length
      ? `<div class="resultados-catalogo">${r.map((p) => `
          <div class="resultado">
            <div>
              <strong>${escapar(truncar(p.descripcion, 70))}</strong>
              <em>${[p.referencia, p.categoria].filter(Boolean).map(escapar).join(' · ')}</em>
            </div>
            <span class="precio">${fmtDinero(p.precio_cliente)}</span>
            <input type="number" min="1" step="1" value="1" class="celda-num" data-cant-para="${p.id}" />
            <button class="mini destacado" data-accion="agregar-item" data-id="${p.id}">Agregar</button>
          </div>`).join('')}</div>`
      : '<p class="ayuda" style="padding:0 18px 16px">Ningún producto coincide.</p>';

  return `<div class="tarjeta">
    <div style="padding:16px 18px 12px">
      <input type="search" id="buscar-catalogo" class="buscador-catalogo"
             placeholder="Buscar producto por referencia o descripción…"
             value="${escapar(estado.buscarCatalogo)}" />
    </div>
    ${lista}
  </div>`;
}

/** Ficha de una cotización: lo cotizado, lo abonado, lo que falta y sus abonos. */
function detalleCotizacion(cot, abonos, items = [], totales = null) {
  const saldado = Number(cot.saldo) <= 0;

  const filas = abonos.length
    ? abonos.map((a) => `
        <div class="abono">
          <div class="abono-fecha">${escapar(fmtFecha(a.fecha || a.creado_en))}</div>
          <div class="abono-nota">${escapar(a.nota || 'Abono')}</div>
          <div class="abono-monto">${fmtDinero(a.monto, cot.moneda)}</div>
          <button class="mini peligro" data-accion="borrar-abono" data-id="${a.id}">Quitar</button>
        </div>`).join('')
    : '<div class="vacio"><strong>Sin abonos todavía</strong>Registrá el primero acá abajo o pedíselo a Ari.</div>';

  return `
    <button class="volver" data-accion="cerrar-cotizacion">← Cotizaciones</button>

    <div class="tarjeta ficha">
      <div class="ficha-cabecera">
        <div>
          <h2>${escapar(cot.titulo)}</h2>
          <p>${escapar(cot.cliente || 'Sin cliente')} · creada ${escapar(fmtFecha(String(cot.creado_en || '').slice(0, 10)))}</p>
        </div>
        <div class="ficha-acciones">
          <span class="pastilla ${escapar(cot.estado)}">${escapar(cot.estado)}</span>
          <a class="mini destacado" href="/imprimir/cotizacion/${cot.id}" target="_blank" rel="noopener">Imprimir / PDF</a>
          <button class="mini destacado" data-accion="editar">Editar</button>
        </div>
      </div>

      <div class="ficha-cifras">
        <div><span>Cotizado</span><strong>${fmtDinero(cot.monto, cot.moneda)}</strong></div>
        <div><span>Abonado</span><strong class="ok">${fmtDinero(cot.abonado, cot.moneda)}</strong></div>
        <div><span>Saldo</span><strong class="${saldado ? 'ok' : 'pend'}">${
          saldado ? 'Saldada' : fmtDinero(cot.saldo, cot.moneda)}</strong></div>
      </div>

      <div class="barra-saldo" title="${Math.round((cot.abonado / (cot.monto || 1)) * 100)}% abonado">
        <span style="width:${Math.min(100, Math.round((cot.abonado / (cot.monto || 1)) * 100))}%"></span>
      </div>

      ${cot.descripcion ? `<p class="ficha-desc">${escapar(cot.descripcion)}</p>` : ''}
    </div>

    ${estado.editando ? formularioEdicion('cotizaciones', cot) : ''}

    ${bloque(`Renglones · ${items.length}`, tablaItems(cot, items))}

    ${totales ? bloque('Totales', totalesYAjustes(cot, totales)) : ''}

    ${bloque('Agregar del catálogo', buscadorDeProductos())}

    ${bloque('Agregar una línea suelta', `
      <div class="tarjeta">
        <form class="form-abono" id="form-item-libre" data-id="${cot.id}">
          <label class="ancho"><span>Descripción</span>
            <input name="descripcion" type="text" required placeholder="Mano de obra, obra civil, cableado…" /></label>
          <label><span>Sección</span>
            <input name="seccion" type="text" placeholder="Mano de obra" /></label>
          <label><span>Cantidad</span>
            <input name="cantidad" type="number" min="1" step="1" value="1" /></label>
          <label><span>Valor unitario</span>
            <input name="precio_unitario" type="number" min="0" step="1" required placeholder="1500000" /></label>
          <button type="submit">Agregar</button>
        </form>
      </div>`)}

    ${bloque('Abonos', `<div class="tarjeta"><div class="lista-abonos">${filas}</div></div>`)}

    ${bloque('Registrar un abono', `
      <div class="tarjeta">
        <form class="form-abono" id="form-abono">
          <label><span>Monto</span>
            <input name="monto" type="number" min="1" step="1" required placeholder="500000" /></label>
          <label><span>Fecha</span>
            <input name="fecha" type="date" value="${new Date().toLocaleDateString('sv-SE')}" /></label>
          <label class="ancho"><span>Nota</span>
            <input name="nota" type="text" placeholder="Transferencia, efectivo, referencia…" /></label>
          <button type="submit">Registrar abono</button>
        </form>
      </div>`)}
  `;
}

/* ─────────── Edición manual ─────────── */

const CAMPOS = {
  clientes: [
    { n: 'nombre', e: 'Nombre', req: true },
    { n: 'empresa', e: 'Empresa' },
    { n: 'telefono', e: 'Teléfono', tipo: 'tel' },
    { n: 'email', e: 'Correo', tipo: 'email' },
    { n: 'direccion', e: 'Dirección', ancho: true },
    { n: 'notas', e: 'Notas', area: true, ancho: true },
  ],
  cotizaciones: [
    { n: 'titulo', e: 'Asunto', req: true, ancho: true },
    { n: 'monto', e: 'Valor', tipo: 'number' },
    { n: 'vence_en', e: 'Vence', tipo: 'date' },
    { n: 'estado', e: 'Estado', opciones: ['pendiente', 'enviada', 'aprobada', 'rechazada'] },
    { n: 'moneda', e: 'Moneda' },
    { n: 'validez', e: 'Validez de la oferta' },
    { n: 'descripcion', e: 'Descripción', area: true, ancho: true },
    { n: 'condiciones', e: 'Condiciones comerciales (van impresas)', area: true, ancho: true },
  ],
  productos: [
    { n: 'descripcion', e: 'Descripción', req: true, area: true, ancho: true },
    { n: 'categoria', e: 'Categoría' },
    { n: 'referencia', e: 'Referencia' },
    { n: 'marca', e: 'Marca' },
    { n: 'unidad', e: 'Unidad' },
    { n: 'proveedor', e: 'Proveedor' },
    { n: 'precio_canal', e: 'Precio canal', tipo: 'number' },
    { n: 'precio_constructor', e: 'Precio constructor', tipo: 'number' },
    { n: 'precio_cliente', e: 'Precio cliente final', tipo: 'number', req: true },
    { n: 'maneja_inventario', e: 'Es un producto propio de Clic Control (llevar inventario)', tipo: 'checkbox' },
    { n: 'activo', e: 'Disponible en el catálogo (destildalo para descontinuarlo)', tipo: 'checkbox' },
    { n: 'notas', e: 'Notas', area: true, ancho: true },
  ],
};

/** Formulario de edición de un registro. Se guarda con PATCH. */
function formularioEdicion(entidad, fila) {
  const campos = CAMPOS[entidad].map((c) => {
    const valor = fila[c.n] ?? '';
    if (c.tipo === 'checkbox') {
      const casilla = `<label class="ancho check"><input name="${c.n}" type="checkbox" value="1"${valor ? ' checked' : ''} /> ${c.e}</label>`;
      // Junto a "llevar inventario", cuánto hay ahora: poner la cantidad
      // directo es más natural que registrar un movimiento a mano. La
      // diferencia con lo que había queda igual anotada en el historial.
      if (c.n === 'maneja_inventario') {
        return `${casilla}
          <label><span>Cantidad disponible</span>
            <input name="stock_objetivo" type="number" step="1" value="${escapar(fila.stock ?? 0)}" /></label>`;
      }
      return casilla;
    }
    const control = c.opciones
      ? `<select name="${c.n}">${c.opciones
          .map((o) => `<option value="${o}"${o === valor ? ' selected' : ''}>${o}</option>`).join('')}</select>`
      : c.area
        ? `<textarea name="${c.n}" rows="2">${escapar(valor)}</textarea>`
        : `<input name="${c.n}" type="${c.tipo || 'text'}" value="${escapar(valor)}"${c.req ? ' required' : ''} />`;
    return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
  }).join('');

  return `
    <div class="tarjeta" style="margin-bottom:26px">
      <form class="form-editar" id="form-editar" data-entidad="${entidad}" data-id="${fila.id}">
        ${campos}
        <div class="form-acciones">
          <button type="submit">Guardar cambios</button>
          <button type="button" class="secundario" data-accion="cancelar-edicion">Cancelar</button>
        </div>
      </form>
    </div>`;
}

/** Ficha de un cliente: sus cifras y todo su historial en un solo lugar. */
function detalleCliente(c, { cotizaciones, abonos, cobros, citas, notas }) {
  const suma = (lista, campo) => lista.reduce((t, f) => t + (Number(f[campo]) || 0), 0);
  const cotizado = suma(cotizaciones, 'monto');
  const abonado = suma(abonos, 'monto');
  const saldo = cotizaciones.reduce((t, q) => t + Math.max(0, Number(q.saldo) || 0), 0);
  const porCobrar = suma(cobros.filter((x) => x.estado === 'pendiente'), 'monto');

  const contacto = [
    c.empresa && `<span>${escapar(c.empresa)}</span>`,
    c.telefono && `<a href="tel:${escapar(c.telefono)}">${escapar(c.telefono)}</a>`,
    c.email && `<a href="mailto:${escapar(c.email)}">${escapar(c.email)}</a>`,
    c.direccion && `<span>${escapar(c.direccion)}</span>`,
  ].filter(Boolean).join('<i>·</i>');

  // Historial de abonos: cada uno con su fecha, su monto y sobre qué cotización.
  const historial = abonos.length
    ? abonos.map((a) => `
        <div class="abono">
          <div class="abono-fecha">${escapar(fmtFecha(a.fecha || a.creado_en))}</div>
          <div class="abono-nota">
            ${escapar(a.nota || 'Abono')}
            <em>sobre «${escapar(a.cotizacion || 'cotización eliminada')}»</em>
          </div>
          <div class="abono-monto">${fmtDinero(a.monto, a.moneda)}</div>
        </div>`).join('')
    : '<div class="vacio"><strong>Sin abonos todavía</strong>Los abonos que registres sobre sus cotizaciones aparecen acá.</div>';

  return `
    <button class="volver" data-accion="cerrar-cliente">← Clientes</button>

    <div class="tarjeta ficha">
      <div class="ficha-cabecera">
        <div>
          <h2>${escapar(c.nombre)}</h2>
          ${contacto ? `<p class="contacto">${contacto}</p>` : '<p class="contacto"><span>Sin datos de contacto</span></p>'}
        </div>
        <button class="mini destacado" data-accion="editar">Editar datos</button>
      </div>

      <div class="ficha-cifras cuatro">
        <div><span>Cotizado</span><strong>${fmtDinero(cotizado)}</strong></div>
        <div><span>Abonado</span><strong class="ok">${fmtDinero(abonado)}</strong></div>
        <div><span>Saldo cotizado</span><strong class="${saldo > 0 ? 'pend' : 'ok'}">${fmtDinero(saldo)}</strong></div>
        <div><span>Por cobrar</span><strong class="${porCobrar > 0 ? 'alerta' : 'ok'}">${fmtDinero(porCobrar)}</strong></div>
      </div>

      ${c.notas ? `<p class="ficha-desc">${escapar(c.notas)}</p>` : ''}
    </div>

    ${estado.editando ? formularioEdicion('clientes', c) : ''}

    ${bloque(`Historial de abonos · ${abonos.length}`,
      `<div class="tarjeta"><div class="lista-abonos">${historial}</div></div>`)}

    ${bloque('Cotizaciones', tabla('cotizaciones',
      ['creado_en', 'titulo', 'monto', 'abonado', 'saldo', 'estado'], cotizaciones,
      { vacio: 'Este cliente no tiene cotizaciones.', compacta: true }))}

    ${bloque('Cobros', tabla('cobros',
      ['vence_en', 'concepto', 'monto', 'estado'], cobros,
      { vacio: 'No hay cobros registrados.', compacta: true }))}

    ${bloque('Citas', tabla('citas',
      ['inicio', 'titulo', 'lugar', 'estado'], citas,
      { vacio: 'No hay citas con este cliente.', compacta: true }))}

    ${notas.length ? bloque('Notas', tabla('notas', ['creado_en', 'texto'], notas, { compacta: true })) : ''}
  `;
}

/** Ficha de un producto del catálogo: sus datos, sus tres precios, su foto y —si es propio— su inventario. */
function detalleProducto(p, movimientos = []) {
  const stockBajo = p.maneja_inventario && Number(p.stock) <= 0;

  const historial = movimientos.length
    ? movimientos.map((m) => `
        <div class="abono">
          <div class="abono-fecha">${escapar(fmtFecha(m.creado_en))}</div>
          <div class="abono-nota">${escapar(m.motivo || (m.cantidad > 0 ? 'Entrada' : 'Salida'))}</div>
          <div class="abono-monto" style="color:${m.cantidad > 0 ? 'var(--verde)' : 'var(--alerta)'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</div>
          <button class="mini peligro" data-accion="borrar-movimiento" data-id="${m.id}">Quitar</button>
        </div>`).join('')
    : '<div class="vacio"><strong>Sin movimientos todavía</strong>Registrá el primero acá abajo.</div>';

  return `
    <button class="volver" data-accion="cerrar-producto">← Productos</button>

    <div class="tarjeta ficha">
      <div class="ficha-cabecera">
        <div class="ficha-producto-cab">
          <div class="foto-producto">
            ${p.foto
              ? `<img src="${escapar(p.foto)}" alt="" width="84" height="84" loading="lazy" />`
              : '<span class="foto-vacia">Sin foto</span>'}
            <button class="mini" data-accion="cambiar-foto" data-id="${p.id}">${p.foto ? 'Cambiar' : 'Subir'}</button>
            <button class="mini" data-accion="buscar-foto" data-id="${p.id}">Buscar en la web</button>
          </div>
          <div>
            <h2>${escapar(p.descripcion)}</h2>
            <p>${[p.categoria, p.referencia, p.marca].filter(Boolean).map(escapar).join(' · ') || 'Sin categoría'}
              ${p.maneja_inventario ? '<span class="pastilla propio">propio</span>' : '<span class="pastilla">catálogo proveedor</span>'}</p>
          </div>
        </div>
        <button class="mini destacado" data-accion="editar">Editar datos</button>
      </div>

      <div class="ficha-cifras ${p.maneja_inventario ? 'cuatro' : 'tres'}">
        <div><span>Canal</span><strong>${p.precio_canal ? fmtDinero(p.precio_canal) : '—'}</strong></div>
        <div><span>Constructor</span><strong>${p.precio_constructor ? fmtDinero(p.precio_constructor) : '—'}</strong></div>
        <div><span>Cliente final</span><strong class="ok">${fmtDinero(p.precio_cliente)}</strong></div>
        ${p.maneja_inventario ? `<div><span>Stock</span><strong class="${stockBajo ? 'alerta' : 'ok'}">${p.stock}</strong></div>` : ''}
      </div>

      <p class="ficha-desc">Unidad: ${escapar(p.unidad || 'UND')}${p.proveedor ? ` · Proveedor: ${escapar(p.proveedor)}` : ''}</p>
      ${p.notas ? `<p class="ficha-desc">${escapar(p.notas)}</p>` : ''}
    </div>

    ${estado.editando ? formularioEdicion('productos', p) : ''}

    ${bloque('Foto del producto', `
      <div class="tarjeta zona-foto" data-id="${p.id}">
        <p class="ayuda" style="margin:0 0 12px">
          Si la lista del proveedor vino sin fotos: tocá <b>Buscar en la web</b> arriba —abre
          una búsqueda de imágenes con la referencia de este producto—, y cuando encuentres la
          que sirve, copiala y <b>pegala acá</b> (${atajoPegar()}), o pegá su dirección abajo.
        </p>
        <form class="form-abono" id="form-foto-url" data-id="${p.id}">
          <label class="ancho"><span>Dirección de la imagen</span>
            <input name="url" type="url" placeholder="https://…/foto-del-producto.jpg" /></label>
          <button type="submit">Traer</button>
        </form>
      </div>`)}

    ${p.maneja_inventario ? `
      ${bloque('Movimientos de inventario', `<div class="tarjeta"><div class="lista-abonos">${historial}</div></div>`)}
      ${bloque('Registrar entrada o salida', `
        <div class="tarjeta">
          <form class="form-abono" id="form-ajuste-stock" data-id="${p.id}">
            <label><span>Cantidad</span>
              <input name="cantidad" type="number" step="1" required placeholder="10 (entrada) o -3 (salida)" /></label>
            <label class="ancho"><span>Motivo</span>
              <input name="motivo" type="text" placeholder="Compra, venta, ajuste, producto dañado…" /></label>
            <button type="submit">Registrar</button>
          </form>
        </div>`)}
    ` : ''}

    <button class="mini peligro" data-accion="borrar" data-entidad="productos" data-id="${p.id}">Borrar producto</button>
  `;
}

/** Formulario para agregar un producto a mano, sin pasar por el Excel. */
function formularioNuevoProducto() {
  const campos = CAMPOS.productos.map((c) => {
    // Un producto que se está creando siempre nace disponible: la casilla de
    // descontinuarlo sólo tiene sentido al editar uno que ya existe.
    if (c.n === 'activo') return '';
    if (c.tipo === 'checkbox') {
      // Justo debajo, el stock con el que arranca (sólo se usa si se marca la casilla).
      return `<label class="ancho check"><input name="${c.n}" type="checkbox" value="1" /> ${c.e}</label>
        <label><span>Stock inicial</span><input name="stock_inicial" type="number" min="0" step="1" value="0" /></label>`;
    }
    const control = c.area
      ? `<textarea name="${c.n}" rows="2"></textarea>`
      : `<input name="${c.n}" type="${c.tipo || 'text'}" value="${c.n === 'unidad' ? 'UND' : ''}"${c.req ? ' required' : ''} />`;
    return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
  }).join('');

  return bloque('Agregar producto a mano', `
    <div class="tarjeta">
      <form class="form-editar" id="form-nuevo-producto">
        ${campos}
        <div class="form-acciones">
          <button type="submit">Guardar producto</button>
        </div>
      </form>
    </div>`);
}

/* ─────────── Ajustes de la empresa ─────────── */

const CAMPOS_AJUSTES = [
  { n: 'empresa', e: 'Nombre de la empresa' },
  { n: 'nit', e: 'NIT' },
  { n: 'direccion', e: 'Dirección', ancho: true },
  { n: 'telefono', e: 'Teléfono' },
  { n: 'email', e: 'Correo', tipo: 'email' },
  { n: 'ciudad', e: 'Ciudad' },
  { n: 'representante', e: 'Representante de ventas' },
  { n: 'representante_telefono', e: 'Teléfono del representante' },
  { n: 'representante_email', e: 'Correo del representante', tipo: 'email' },
  { n: 'validez', e: 'Validez por defecto de las ofertas' },
  { n: 'condiciones', e: 'Condiciones comerciales por defecto', area: true, ancho: true },
];

function vistaAjustes(aj) {
  const campos = CAMPOS_AJUSTES.map((c) => {
    const valor = aj[c.n] ?? '';
    const control = c.area
      ? `<textarea name="${c.n}" rows="4">${escapar(valor)}</textarea>`
      : `<input name="${c.n}" type="${c.tipo || 'text'}" value="${escapar(valor)}" />`;
    return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
  }).join('');

  return `
    <p class="ayuda" style="margin-bottom:16px">
      Estos datos encabezan y cierran las cotizaciones que imprimís. Se usan como
      punto de partida: cada cotización puede llevar su propia validez y sus
      propias condiciones si hace falta.
    </p>
    <div class="tarjeta">
      <form class="form-editar" id="form-ajustes">
        ${campos}
        <div class="form-acciones"><button type="submit">Guardar</button></div>
      </form>
    </div>`;
}

/* ─────────── Importar lista de precios ─────────── */

const CAMPOS_MAPEO = [
  ['', '— ignorar —'],
  ['referencia', 'Referencia'],
  ['descripcion', 'Descripción'],
  ['marca', 'Marca'],
  ['unidad', 'Unidad'],
  ['precio_canal', 'Precio canal'],
  ['precio_constructor', 'Precio constructor'],
  ['precio_cliente', 'Precio cliente final'],
  ['stock', 'Stock (cuánto hay)'],
];

function tarjetaHojaImportacion(hoja, indice) {
  const { filas, mapeo } = hoja;
  const encabezado = filas[mapeo.filaEncabezado] || [];
  const filaEjemplo = filas[mapeo.filaInicioDatos] || [];
  const totalColumnas = Math.min(12, Math.max(encabezado.length, filaEjemplo.length, 1));
  const mapaInverso = {};
  for (const [campo, col] of Object.entries(mapeo.columnas)) {
    if (col !== null) mapaInverso[col] = campo;
  }

  const filasVista = filas.slice(mapeo.filaInicioDatos, mapeo.filaInicioDatos + 4);
  const filasValidas = filas.slice(mapeo.filaInicioDatos).filter((f) => {
    const colDesc = mapeo.columnas.descripcion;
    return colDesc !== null && f[colDesc] !== null && f[colDesc] !== undefined && String(f[colDesc]).trim() !== '';
  }).length;

  const cabeceras = Array.from({ length: totalColumnas }, (_, c) => `
    <th>
      <select class="import-mapa" data-col="${c}">
        ${CAMPOS_MAPEO.map(([v, e]) => `<option value="${v}"${mapaInverso[c] === v ? ' selected' : ''}>${e}</option>`).join('')}
      </select>
    </th>`).join('');

  // Las fotos van en su propia columna, al principio: así se ve de una que
  // cada una cae sobre el producto que le toca, antes de importar nada.
  const fotos = hoja.imagenesMuestra || {};
  const hayFotos = Object.keys(fotos).length > 0;

  const filasHtml = filasVista.map((f, i) => {
    const foto = fotos[mapeo.filaInicioDatos + i];
    const celdaFoto = hayFotos
      ? `<td class="celda-foto">${foto ? `<img src="${foto}" alt="" width="58" height="58" />` : '<span class="sin-foto">—</span>'}</td>`
      : '';
    return `<tr>${celdaFoto}${
      Array.from({ length: totalColumnas }, (_, c) => `<td>${escapar(truncar(f[c], 40))}</td>`).join('')}</tr>`;
  }).join('');

  return `
    <div class="tarjeta import-hoja" data-hoja="${indice}">
      <div class="import-hoja-cab">
        <label><span>Categoría</span><input type="text" class="import-categoria" value="${escapar(hoja.nombre)}" /></label>
        <label class="check"><input type="checkbox" class="import-inventario" /> Son productos propios de Clic Control (llevar inventario)</label>
        <label class="check"><input type="checkbox" class="import-descontinuar" /> Descontinuar los que ya no vengan en la lista</label>
        ${hoja.conImagenes ? '<label class="check"><input type="checkbox" class="import-fotos" checked /> Traer las fotos del Excel</label>' : ''}
        <button class="mini destacado" data-accion="revisar-hoja" data-hoja="${indice}">Ver qué cambiaría (${filasValidas} productos)</button>
        <span class="import-resultado"></span>
      </div>
      <div class="import-informe"></div>
      <p class="ayuda">Elegí en cada columna qué es (o "ignorar"). Se muestran las primeras filas como ejemplo${
        hayFotos ? ', con la foto que trae cada una' : ''}.</p>
      <div class="tabla-envoltura"><table>
        <thead><tr>${hayFotos ? '<th class="th-foto">Foto</th>' : ''}${cabeceras}</tr></thead>
        <tbody>${filasHtml}</tbody>
      </table></div>
    </div>`;
}

/** Qué va a pasar (o qué pasó) al cruzar la lista con el catálogo. */
function informeImportacion(inf, { aplicado = false } = {}) {
  const lista = (titulo, filas, pintar, clase = '') => {
    if (!filas.length) return '';
    const muestra = filas.slice(0, 8);
    return `<div class="informe-grupo ${clase}">
      <h4>${escapar(titulo)} · ${filas.length}</h4>
      <ul>${muestra.map((f) => `<li>${pintar(f)}</li>`).join('')}
      ${filas.length > muestra.length ? `<li class="mas">…y ${filas.length - muestra.length} más</li>` : ''}</ul>
    </div>`;
  };

  const nombre = (f) => escapar(`${f.referencia ? `${f.referencia} · ` : ''}${truncar(f.descripcion, 48)}`);

  const cuerpo = [
    lista(aplicado ? 'Agregados' : 'Se van a agregar', inf.nuevos,
      (f) => `${nombre(f)} <b>${fmtDinero(f.precio)}</b>`, 'nuevo'),

    lista(aplicado ? 'Actualizados' : 'Se van a actualizar', inf.actualizados, (f) =>
      `${nombre(f)}${f.precioAntes !== f.precioDespues
        ? ` <s>${fmtDinero(f.precioAntes)}</s> <b>${fmtDinero(f.precioDespues)}</b>`
        : ` <em>(${escapar(f.campos.join(', '))})</em>`}`, 'actualizado'),

    lista('Ajustes de inventario', inf.ajustesStock,
      (f) => `${nombre(f)} <b>${escapar(f.de)} → ${escapar(f.a)}</b>`, 'actualizado'),

    lista('Ya no vienen en la lista', inf.ausentes, (f) =>
      `${nombre(f)}${Number(f.stock) ? ` <em>(quedan ${escapar(f.stock)} en bodega)</em>` : ''}`, 'ausente'),

    inf.sinCambios.length
      ? `<div class="informe-grupo"><h4>Sin cambios · ${inf.sinCambios.length}</h4></div>`
      : '',
  ].join('');

  const nada = !inf.nuevos.length && !inf.actualizados.length && !inf.ausentes.length;

  return `<div class="informe ${aplicado ? 'aplicado' : ''}">
    ${nada
      ? '<p class="ayuda" style="margin:0">Esta lista no cambia nada: todo está igual que en el catálogo.</p>'
      : cuerpo}
    ${inf.fotos
      ? `<p class="ayuda" style="margin:8px 0 0">Se cargaron <b>${inf.fotos} fotos</b> del Excel.${
          inf.fotosConservadas ? ` Otras ${inf.fotosConservadas} se dejaron como estaban, porque esos productos ya tenían foto propia.` : ''}</p>`
      : ''}
    ${inf.duplicadosEnArchivo
      ? `<p class="ayuda" style="margin:8px 0 0">Se ignoraron ${inf.duplicadosEnArchivo} fila(s) repetidas dentro del archivo.</p>`
      : ''}
    ${!aplicado && inf.ausentes.length
      ? '<p class="ayuda" style="margin:8px 0 0">Los que ya no vienen <b>no se borran</b>: pueden estar en cotizaciones anteriores. Marcá la casilla de arriba si querés que dejen de aparecer al cotizar.</p>'
      : ''}
  </div>`;
}

function vistaImportacion() {
  return `
    <button class="volver" data-accion="cancelar-importacion">← Productos</button>
    <p class="ayuda" style="margin-bottom:16px">
      Revisá el mapeo de columnas de cada hoja antes de importar — quedó adivinado, pero confirmalo.
      Cada hoja se importa por separado.
    </p>
    ${estado.importacion.hojas.map((h, i) => tarjetaHojaImportacion(h, i)).join('')}
  `;
}

/* ─────────── Vistas ─────────── */

async function pintar() {
  const contenedor = $('#contenido');
  const v = estado.vista;

  // Revisión de un Excel recién analizado, antes de importarlo
  if (estado.importacion) {
    $('#titulo-vista').textContent = 'Importar lista de precios';
    contenedor.innerHTML = vistaImportacion();
    return;
  }

  // Ficha de un producto del catálogo
  if (estado.productoAbierto) {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const id = estado.productoAbierto;
      const p = await api(`/productos/${id}`);
      const movimientos = p.maneja_inventario ? (await api(`/movimientos_stock?producto_id=${id}`)).filas : [];
      $('#titulo-vista').textContent = p.descripcion;
      contenedor.innerHTML = detalleProducto(p, movimientos);
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Ficha de un cliente
  if (estado.clienteAbierto) {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const id = estado.clienteAbierto;
      const [c, cot, abo, cob, cit, not] = await Promise.all([
        api(`/clientes/${id}`),
        api(`/cotizaciones?cliente_id=${id}`),
        api(`/abonos?cliente_id=${id}`),
        api(`/cobros?cliente_id=${id}`),
        api(`/citas?cliente_id=${id}`),
        api(`/notas?cliente_id=${id}`),
      ]);
      $('#titulo-vista').textContent = c.nombre;
      contenedor.innerHTML = detalleCliente(c, {
        cotizaciones: cot.filas, abonos: abo.filas, cobros: cob.filas,
        citas: cit.filas, notas: not.filas,
      });
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Ficha de una cotización (tiene prioridad sobre todo lo demás)
  if (estado.cotizacionAbierta) {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const id = estado.cotizacionAbierta;
      const [cot, { filas }, itemsResp] = await Promise.all([
        api(`/cotizaciones/${id}`),
        api(`/abonos?cotizacion_id=${id}`),
        api(`/cotizaciones/${id}/items`),
      ]);
      $('#titulo-vista').textContent = 'Cotización';
      contenedor.innerHTML = detalleCotizacion(cot, filas, itemsResp.filas, itemsResp.totales);
      $('#buscar-catalogo')?.focus();
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  $('#titulo-vista').textContent = estado.vistaAsistente?.titulo || TITULOS[v] || v;

  // Resultado devuelto por Ari (tiene prioridad sobre la vista fija)
  if (estado.vistaAsistente) {
    const { entidad, columnas, filas } = estado.vistaAsistente;
    contenedor.innerHTML = tabla(entidad, columnas, filas, { vacio: 'La consulta no devolvió resultados.' });
    return;
  }

  if (v === 'inicio') {
    const r = estado.resumen;
    if (!r) { contenedor.innerHTML = '<div class="vacio">Cargando…</div>'; return; }
    const c = r.contadores;

    const metricas = `<div class="metricas">
      ${metrica(c.citasHoy, 'Citas hoy')}
      ${metrica(c.recordatorios, 'Pendientes')}
      ${metrica(c.cotizaciones, 'Cotizaciones')}
      ${metrica(c.clientes, 'Clientes')}
      ${metrica(fmtDinero(c.porCobrar), 'Por cobrar', 'dinero')}
      ${metrica(fmtDinero(c.saldoCotizado), 'Saldo cotizado', 'dinero')}
    </div>`;

    contenedor.innerHTML = metricas
      + bloque('Agenda de hoy', lineaTiempo(r.citasHoy))
      + (r.vencidos.length
        ? bloque('⚠ Vencidos', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'], r.vencidos))
        : '')
      + (r.cobrosVencidos.length
        ? bloque('⚠ Cobros vencidos', tabla('cobros', ['vence_en', 'concepto', 'cliente', 'monto'], r.cobrosVencidos))
        : '')
      + bloque('Tareas pendientes', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'],
        r.pendientesHoy, { vacio: 'Sin tareas para hoy.' }))
      + bloque('Próximas citas', tabla('citas', ['inicio', 'titulo', 'cliente', 'lugar'], r.proximasCitas));
    return;
  }

  if (v === 'ajustes') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      contenedor.innerHTML = vistaAjustes(await api('/ajustes'));
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Catálogo de productos: tiene buscador y botones propios (importar, agregar)
  if (v === 'productos') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const filtros = new URLSearchParams();
      if (estado.buscarProductos) filtros.set('texto', estado.buscarProductos);
      if (estado.verDescontinuados) filtros.set('incluir_inactivos', '1');
      const { filas } = await api(`/productos?${filtros}`);

      // Cuántos hay descontinuados, para no ofrecer un filtro que no sirve.
      const { filas: todos } = await api('/productos?incluir_inactivos=1&limite=300');
      const descontinuados = todos.filter((p) => !p.activo).length;

      const barra = `<div class="barra-productos">
        <input type="search" id="buscar-productos" placeholder="Buscar por referencia, descripción, categoría…" value="${escapar(estado.buscarProductos)}" />
        <button class="mini" data-accion="importar-lista">Importar lista de precios</button>
        <button class="mini" data-accion="alternar-nuevo-producto">${estado.nuevoProducto ? 'Cancelar' : '+ Agregar producto'}</button>
        ${descontinuados ? `<button class="mini${estado.verDescontinuados ? ' destacado' : ''}" data-accion="alternar-descontinuados">${
          estado.verDescontinuados ? 'Ocultar descontinuados' : `Ver descontinuados (${descontinuados})`}</button>` : ''}
        <span class="gestor-fotos"></span>
      </div>`;

      contenedor.innerHTML = barra
        + (estado.nuevoProducto ? formularioNuevoProducto() : '')
        + (estado.verDescontinuados
          ? '<p class="ayuda">Los descontinuados son los que dejaron de venir en la lista del proveedor. Siguen guardados con su historial; para volver a usarlos, abrilos y marcá «Disponible en el catálogo».</p>'
          : '')
        + tabla('productos', ['categoria', 'referencia', 'descripcion', 'stock', 'precio_cliente'], filas,
          { vacio: 'Todavía no hay productos en el catálogo. Importá una lista de precios o agregá uno a mano.' });
      $('#buscar-productos')?.focus();

      // El botón de achicar fotos sólo aparece si hay algo que achicar, y se
      // consulta aparte para no demorar la lista mientras se mide el disco.
      api('/productos/fotos').then(({ fotos }) => {
        const pesadas = fotos.filter((f) => f.bytes > PESO_SANO);
        const hueco = $('.gestor-fotos');
        if (!hueco || !pesadas.length) return;
        const sobra = pesadas.reduce((s, f) => s + f.bytes, 0);
        hueco.innerHTML = `<button class="mini" data-accion="achicar-fotos" title="Las deja todas de ${LADO} píxeles, que es lo que se ve en una cotización">Achicar ${pesadas.length} foto${
          pesadas.length === 1 ? '' : 's'} pesada${pesadas.length === 1 ? '' : 's'} (${pesoLegible(sobra)})</button>`;
      }).catch(() => {});
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  const CONSULTAS = {
    agenda: { entidad: 'citas', filtros: 'rango=proximos', columnas: ['inicio', 'titulo', 'cliente', 'lugar', 'estado'] },
    clientes: { entidad: 'clientes', filtros: '', columnas: ['nombre', 'empresa', 'telefono', 'email'] },
    cotizaciones: { entidad: 'cotizaciones', filtros: '', columnas: ['creado_en', 'titulo', 'cliente', 'monto', 'abonado', 'saldo', 'estado'] },
    cobros: { entidad: 'cobros', filtros: '', columnas: ['vence_en', 'concepto', 'cliente', 'monto', 'estado'] },
    recordatorios: { entidad: 'recordatorios', filtros: '', columnas: ['vence_en', 'texto', 'cliente', 'prioridad', 'estado'] },
  }[v];

  if (!CONSULTAS) { contenedor.innerHTML = '<div class="vacio">Vista desconocida.</div>'; return; }

  contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    const { filas } = await api(`/${CONSULTAS.entidad}?${CONSULTAS.filtros}`);
    contenedor.innerHTML = tabla(CONSULTAS.entidad, CONSULTAS.columnas, filas);
  } catch (e) {
    contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
  }
}

const metrica = (valor, rotulo, clase = '') => `
  <div class="metrica ${clase}${!clase && Number(valor) === 0 ? '' : ''}">
    <div class="valor">${escapar(valor)}</div>
    <div class="rotulo">${escapar(rotulo)}</div>
  </div>`;

/** Aviso fijo mientras se está dictando una cotización. */
function pintarEnCurso() {
  const q = estado.resumen?.enCurso;
  const barra = $('#en-curso');
  barra.hidden = !q;
  if (!q) return;

  $('#en-curso-titulo').textContent = q.titulo;
  const partes = [
    q.cliente,
    `${q.n_items} ${q.n_items === 1 ? 'renglón' : 'renglones'}`,
    fmtDinero(q.totales?.total ?? q.monto, q.moneda),
  ].filter(Boolean);
  $('#en-curso-detalle').textContent = partes.join(' · ');
}

async function refrescarResumen() {
  try {
    estado.resumen = await api('/resumen');
    $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const c = estado.resumen.contadores;
    $$('[data-badge]').forEach((el) => {
      const n = c[el.dataset.badge];
      el.textContent = n ? String(n) : '';
    });
    pintarEnCurso();
  } catch (e) {
    avisar(e.message, true);
  }
}

async function refrescarTodo() {
  await refrescarResumen();
  await pintar();
}

/* ══════════════════════════════════════════════════════════════════
   Conversación con Ari
   ══════════════════════════════════════════════════════════════════ */

/* ─────────── Hoja deslizante de conversación (celular) ─────────── */

const esCelular = () => window.matchMedia('(max-width: 900px)').matches;

function abrirHoja({ enfocarTexto = false } = {}) {
  if (!esCelular()) {
    if (enfocarTexto) $('#texto').focus();
    return;
  }
  $('.voz').classList.add('abierta');
  $('#telon').classList.add('visible');
  $('.fabs').classList.add('oculto');
  if (enfocarTexto) setTimeout(() => $('#texto').focus(), 280);
  requestAnimationFrame(() => { $('#conversacion').scrollTop = $('#conversacion').scrollHeight; });
}

function cerrarHoja() {
  $('.voz').classList.remove('abierta');
  $('#telon').classList.remove('visible');
  $('.fabs').classList.remove('oculto');
  $('#texto').blur();
}

function burbuja(clase, html) {
  const div = document.createElement('div');
  div.className = `burbuja ${clase}`;
  div.innerHTML = html;
  $('#conversacion').append(div);
  $('#conversacion').scrollTop = $('#conversacion').scrollHeight;
  return div;
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;

  $('#texto').value = '';
  abrirHoja();
  burbuja('yo', escapar(texto));

  const cargando = burbuja('ari', '<div class="pensando"><i></i><i></i><i></i></div>');

  try {
    const r = await api('/asistente', {
      method: 'POST',
      body: { texto, historial: estado.historial },
    });

    const hechos = (r.acciones || []).length
      ? `<div class="hechos">${r.acciones.map((a) => `<div class="hecho">✓ ${escapar(a.detalle)}</div>`).join('')}</div>`
      : '';
    cargando.innerHTML = `<p>${escapar(r.respuesta)}</p>${hechos}`;
    $('#conversacion').scrollTop = $('#conversacion').scrollHeight;

    estado.historial.push({ rol: 'user', texto }, { rol: 'assistant', texto: r.respuesta });
    estado.historial = estado.historial.slice(-8);

    // Si Ari consultó algo, el dashboard muestra el resultado.
    if (r.vista) {
      estado.vistaAsistente = r.vista;
      const nav = $(`.nav-item[data-vista="${r.vista.entidad === 'citas' ? 'agenda' : r.vista.entidad}"]`);
      $$('.nav-item').forEach((b) => b.classList.remove('activo'));
      nav?.classList.add('activo');
    }
    if (r.huboCambios) await refrescarResumen();
    await pintar();

    // En manos libres el micrófono se reabre al terminar de hablar, para
    // poder seguir dictando renglones sin volver a tocar el teléfono.
    hablar(r.respuesta, () => {
      if (manosLibres() && VOZ_DISPONIBLE && !escuchando) {
        setTimeout(() => { if (manosLibres() && !escuchando) alternarMicrofono(); }, 400);
      }
    });

    // Si pediste ver algo, en celular la hoja se aparta para dejar el
    // resultado a la vista; la respuesta queda en la conversación.
    if (r.vista && esCelular()) setTimeout(cerrarHoja, 1500);
  } catch (e) {
    cargando.className = 'burbuja ari error';
    cargando.innerHTML = escapar(e.message);
  }
}

const manosLibres = () => $('#manos-libres')?.checked;

/* ─────────── Texto a voz ─────────── */

let vozPreferida = null;
function cargarVoces() {
  const voces = speechSynthesis.getVoices();
  vozPreferida =
    voces.find((v) => /es-(CO|MX|US)/i.test(v.lang) && /google|neural|premium/i.test(v.name))
    || voces.find((v) => /^es/i.test(v.lang))
    || null;
}
if ('speechSynthesis' in window) {
  cargarVoces();
  speechSynthesis.onvoiceschanged = cargarVoces;
}

/**
 * Lee la respuesta en voz alta. `alTerminar` corre cuando se calló —o de
 * inmediato si la voz está apagada—, que es cuando el modo manos libres puede
 * volver a escuchar sin grabarse a sí misma.
 */
function hablar(texto, alTerminar) {
  let yaSiguio = false;
  const seguir = () => {
    if (yaSiguio) return;
    yaSiguio = true;
    if (alTerminar) alTerminar();
  };

  if (!$('#tts').checked || !('speechSynthesis' in window) || !texto) {
    seguir();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = vozPreferida?.lang || 'es-CO';
  if (vozPreferida) u.voice = vozPreferida;
  u.rate = 1.04;
  u.pitch = 1;
  u.onend = seguir;
  u.onerror = seguir;

  // Hay navegadores —Safari en iPhone, o cualquiera sin voces instaladas—
  // que no disparan `onend`. Sin esta red, el manos libres se quedaría
  // esperando para siempre y habría que tocar el micrófono igual. Se estima
  // lo que tarda de leer y se sigue de largo si no avisó.
  const margen = 1500 + texto.length * 75;
  setTimeout(seguir, margen);

  speechSynthesis.speak(u);
}

/* ─────────── Voz a texto ─────────── */

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

// Los navegadores sólo entregan el micrófono en localhost o con HTTPS. Entrando
// por IP desde el celular (http://192.168...) la API desaparece, así que hay que
// distinguir "este navegador no puede" de "esta dirección no puede".
const CONTEXTO_SEGURO = window.isSecureContext !== false;
const VOZ_DISPONIBLE = Boolean(Reconocimiento) && CONTEXTO_SEGURO;

const MOTIVO_SIN_VOZ = !CONTEXTO_SEGURO
  ? 'El micrófono necesita una dirección segura (https). Por ahora escribile acá abajo.'
  : 'Este navegador no dicta por voz. Usá Chrome, Edge o Safari, o escribí acá abajo.';

// En pantallas táctiles no hay barra espaciadora que mencionar.
const PISTA_INICIAL = !VOZ_DISPONIBLE
  ? MOTIVO_SIN_VOZ
  : window.matchMedia('(pointer: coarse)').matches
    ? 'Tocá el micrófono para hablarle a Ari.'
    : 'Tocá el micrófono (o la barra espaciadora) para hablar.';

let reconocedor = null;
let escuchando = false;

// Manos libres: cuántos silencios seguidos se toleran antes de apagarlo solo.
const MAX_SILENCIOS = 3;
let silenciosSeguidos = 0;
let ultimoErrorVoz = null;

/** El micrófono existe dos veces: en el panel (escritorio) y flotante (celular). */
const marcarGrabando = (activo) =>
  ['#mic', '#fab-mic'].forEach((s) => $(s).classList.toggle('grabando', activo));

function iniciarVoz() {
  if (!VOZ_DISPONIBLE) {
    // No se desactivan los botones: tocarlos abre la conversación con el
    // teclado listo y explica por qué no hay voz. Un botón muerto no dice nada.
    ['#mic', '#fab-mic'].forEach((s) => {
      $(s).classList.add('sin-voz');
      $(s).title = MOTIVO_SIN_VOZ;
      $(s).setAttribute('aria-label', MOTIVO_SIN_VOZ);
    });
    $('#pista').textContent = MOTIVO_SIN_VOZ;
    // Sin micrófono el manos libres no tiene sentido: se esconde en vez de
    // quedar ahí prometiendo algo que no va a pasar.
    $('#switch-manos-libres').hidden = true;
    return;
  }

  reconocedor = new Reconocimiento();
  reconocedor.lang = 'es-CO';
  reconocedor.continuous = false;
  reconocedor.interimResults = true;
  reconocedor.maxAlternatives = 1;

  let acumulado = '';

  reconocedor.onstart = () => {
    escuchando = true;
    acumulado = '';
    marcarGrabando(true);
    $('#pista').textContent = 'Escuchando… hablá con naturalidad.';
  };

  reconocedor.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) acumulado += t;
      else parcial += t;
    }
    $('#texto').value = (acumulado + parcial).trim();
  };

  reconocedor.onerror = (e) => {
    // Un silencio en manos libres es normal —se está caminando de una pieza a
    // otra—, así que no interrumpe ni abre la hoja: se sigue escuchando.
    if (e.error === 'no-speech' && manosLibres()) return;

    ultimoErrorVoz = e.error;
    abrirHoja(); // que el aviso sea visible aunque la hoja estuviera cerrada
    $('#pista').textContent = {
      'not-allowed': 'Necesito permiso para usar el micrófono.',
      'no-speech': 'No escuché nada. Probá de nuevo.',
      'audio-capture': 'No encontré ningún micrófono.',
      network: 'Sin conexión para el reconocimiento de voz.',
    }[e.error] || `Error de micrófono: ${e.error}`;
  };

  reconocedor.onend = () => {
    escuchando = false;
    marcarGrabando(false);
    const texto = $('#texto').value.trim();

    if (texto) {
      silenciosSeguidos = 0;
      $('#pista').textContent = '';
      enviar(texto);
      return;
    }

    // Sin texto: en manos libres se vuelve a escuchar, pero no para siempre.
    // Si nadie dice nada varias veces seguidas el teléfono quedó guardado en
    // el bolsillo, y grabar sin parar sólo gasta batería.
    if (manosLibres() && !ultimoErrorVoz) {
      silenciosSeguidos += 1;
      if (silenciosSeguidos <= MAX_SILENCIOS) {
        $('#pista').textContent = 'Escuchando… decime el siguiente ítem.';
        setTimeout(() => { if (manosLibres() && !escuchando) alternarMicrofono(); }, 300);
        return;
      }
      $('#manos-libres').checked = false;
      silenciosSeguidos = 0;
      $('#pista').textContent = 'Apagué el manos libres porque no escuché nada. Tocá el micrófono para seguir.';
      return;
    }

    ultimoErrorVoz = null;
    if (!$('#pista').textContent.startsWith('Error') && !$('#pista').textContent.includes('permiso')) {
      $('#pista').textContent = PISTA_INICIAL;
    }
  };
}

let avisoVozMostrado = false;

function alternarMicrofono() {
  if (!VOZ_DISPONIBLE) {
    abrirHoja({ enfocarTexto: true });
    $('#pista').textContent = MOTIVO_SIN_VOZ;

    if (!avisoVozMostrado) {
      avisoVozMostrado = true;
      burbuja('ari aviso-voz', !CONTEXTO_SEGURO
        ? `<p><b>El micrófono no está disponible en esta dirección.</b></p>
           <p>Los navegadores sólo permiten grabar en <code>localhost</code> o en
           direcciones con <b>https</b> (candado). Estás entrando por
           <code>${escapar(location.host)}</code>, que va sin candado.</p>
           <p>Mientras tanto podés escribirme acá abajo: hago exactamente lo mismo.</p>`
        : `<p><b>Este navegador no puede dictar por voz.</b></p>
           <p>Probá con Chrome, Edge o Safari. Mientras tanto escribime acá abajo:
           hago exactamente lo mismo.</p>`);
    }
    return;
  }
  if (!reconocedor) return;
  if (escuchando) reconocedor.stop();
  else {
    speechSynthesis.cancel();
    try { reconocedor.start(); } catch { /* ya estaba activo */ }
  }
}

/* ══════════════════════════════════════════════════════════════════
   Eventos
   ══════════════════════════════════════════════════════════════════ */

$('#nav').addEventListener('click', (e) => {
  const boton = e.target.closest('.nav-item');
  if (!boton) return;
  $$('.nav-item').forEach((b) => b.classList.remove('activo'));
  boton.classList.add('activo');
  estado.vista = boton.dataset.vista;
  estado.vistaAsistente = null;
  estado.cotizacionAbierta = null;
  estado.clienteAbierto = null;
  estado.productoAbierto = null;
  estado.importacion = null;
  estado.nuevoProducto = false;
  estado.editando = false;
  cerrarHoja();
  pintar();
  $('#contenido').scrollTop = 0;
});

$('#contenido').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const { accion, entidad, id } = boton.dataset;

  if (accion === 'editar' || accion === 'cancelar-edicion') {
    estado.editando = accion === 'editar';
    await pintar();
    return;
  }
  if (accion === 'abrir-producto') {
    estado.productoAbierto = Number(id);
    estado.editando = false;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'cerrar-producto') {
    estado.productoAbierto = null;
    estado.vista = 'productos';
    estado.editando = false;
    $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'productos'));
    await pintar();
    return;
  }
  if (accion === 'cambiar-foto') {
    estado.subiendoFotoPara = Number(id);
    $('#input-foto').click();
    return;
  }
  if (accion === 'achicar-fotos') {
    const boton = e.target.closest('[data-accion="achicar-fotos"]');
    boton.disabled = true;
    try {
      const r = await achicarTodas((hechas, total) => {
        boton.textContent = `Achicando ${hechas + 1} de ${total}…`;
      });
      avisar(r.hechas
        ? `${r.hechas} fotos achicadas: ${pesoLegible(r.antes)} → ${pesoLegible(r.despues)}`
        : 'Las fotos ya estaban en su tamaño.');
      await pintar();
    } catch (err) {
      boton.disabled = false;
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'buscar-foto') {
    // Se abre una búsqueda de imágenes con lo que identifica al producto. La
    // foto no se elige sola: la mirás y la traés vos, que es lo único
    // sensato cuando va a terminar impresa en una oferta.
    const p = await api(`/productos/${id}`).catch(() => null);
    if (!p) return;
    const consulta = [p.referencia, p.marca, !p.referencia && truncar(p.descripcion, 60)]
      .filter(Boolean).join(' ');
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(consulta)}`, '_blank', 'noopener');
    avisar('Copiá la imagen que sirva y pegala en la ficha (o pegá su dirección).');
    return;
  }
  if (accion === 'importar-lista') {
    $('#input-excel').click();
    return;
  }
  if (accion === 'cancelar-importacion') {
    estado.importacion = null;
    await pintar();
    return;
  }
  if (accion === 'alternar-nuevo-producto') {
    estado.nuevoProducto = !estado.nuevoProducto;
    await pintar();
    return;
  }
  if (accion === 'alternar-descontinuados') {
    estado.verDescontinuados = !estado.verDescontinuados;
    await pintar();
    return;
  }
  // Importar es en dos tiempos: primero se muestra qué cambiaría, y sólo
  // después se aplica. Una lista de precios toca todo el catálogo, así que
  // conviene verlo antes que enterarse después.
  if (accion === 'revisar-hoja' || accion === 'aplicar-hoja') {
    const tarjeta = boton.closest('.import-hoja');
    const hoja = estado.importacion.hojas[Number(boton.dataset.hoja)];
    const categoria = tarjeta.querySelector('.import-categoria').value.trim();
    const manejaInventario = tarjeta.querySelector('.import-inventario').checked;
    const descontinuar = tarjeta.querySelector('.import-descontinuar').checked;

    const mapaColumnas = {};
    tarjeta.querySelectorAll('.import-mapa').forEach((sel) => {
      if (sel.value) mapaColumnas[sel.value] = Number(sel.dataset.col);
    });
    if (!('descripcion' in mapaColumnas)) {
      avisar('Elegí qué columna es la descripción antes de importar.', true);
      return;
    }

    const columna = (f, campo) => (mapaColumnas[campo] !== undefined ? f[mapaColumnas[campo]] : null);
    const filas = hoja.filas
      // El índice de fila se conserva: es lo que vincula cada producto con la
      // foto que el Excel tiene anclada a esa misma fila.
      .map((f, i) => ({
        fila: i,
        referencia: columna(f, 'referencia'),
        descripcion: f[mapaColumnas.descripcion],
        marca: columna(f, 'marca'),
        unidad: columna(f, 'unidad'),
        precio_canal: columna(f, 'precio_canal'),
        precio_constructor: columna(f, 'precio_constructor'),
        precio_cliente: columna(f, 'precio_cliente'),
        stock: columna(f, 'stock'),
      }))
      .slice(hoja.mapeo.filaInicioDatos)
      .filter((f) => f.descripcion !== null && f.descripcion !== undefined && String(f.descripcion).trim() !== '');

    const simular = accion === 'revisar-hoja';
    boton.disabled = true;
    boton.textContent = simular ? 'Comparando…' : 'Aplicando…';
    try {
      const traerFotos = tarjeta.querySelector('.import-fotos')?.checked ?? false;
      const inf = await api('/productos/importar', {
        method: 'POST',
        body: {
          categoria, filas, simular,
          maneja_inventario: manejaInventario,
          descontinuar_ausentes: descontinuar,
          // El archivo sólo se reenvía al aplicar, y sólo si hay fotos que traer.
          ...(!simular && traerFotos
            ? { traer_fotos: true, archivo_base64: estado.importacion.archivo, hoja: Number(boton.dataset.hoja) }
            : {}),
        },
      });
      tarjeta.querySelector('.import-informe').innerHTML = informeImportacion(inf, { aplicado: !simular });

      if (simular) {
        const hayCambios = inf.nuevos.length || inf.actualizados.length || (descontinuar && inf.ausentes.length);
        boton.disabled = !hayCambios;
        boton.dataset.accion = hayCambios ? 'aplicar-hoja' : 'revisar-hoja';
        boton.textContent = hayCambios ? 'Aplicar estos cambios' : 'Nada que cambiar';
      } else {
        boton.textContent = 'Aplicado ✓';
        tarjeta.querySelector('.import-resultado').textContent =
          `${inf.nuevos.length} nuevos · ${inf.actualizados.length} actualizados`;
        avisar(`"${categoria}": ${inf.nuevos.length} nuevos, ${inf.actualizados.length} actualizados`);

        // Las fotos del Excel entran tal cual las guardó el proveedor: algunas
        // pesan 200 KB. Se achican enseguida, sin que haya que pedirlo.
        if (inf.fotos) {
          tarjeta.querySelector('.import-resultado').textContent += ' · achicando fotos…';
          const r = await achicarTodas();
          tarjeta.querySelector('.import-resultado').textContent =
            `${inf.nuevos.length} nuevos · ${inf.actualizados.length} actualizados · ${inf.fotos} fotos${
              r.hechas ? ` (${pesoLegible(r.antes)} → ${pesoLegible(r.despues)})` : ''}`;
        }
      }
    } catch (err) {
      boton.disabled = false;
      boton.textContent = 'Reintentar';
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'abrir-cliente') {
    estado.clienteAbierto = Number(id);
    estado.editando = false;
    estado.cotizacionAbierta = null;
    estado.vistaAsistente = null;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'cerrar-cliente') {
    estado.clienteAbierto = null;
    estado.vista = 'clientes';
    estado.editando = false;
    $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'clientes'));
    await pintar();
    return;
  }
  if (accion === 'abrir-cotizacion') {
    estado.cotizacionAbierta = Number(id);
    estado.editando = false;
    estado.clienteAbierto = null;
    estado.vistaAsistente = null;
    estado.buscarCatalogo = '';
    estado.resultadosCatalogo = null;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'agregar-item') {
    const campoCant = $(`[data-cant-para="${id}"]`);
    const cantidad = Number(campoCant?.value) || 1;
    try {
      await api(`/cotizaciones/${estado.cotizacionAbierta}/items`, {
        method: 'POST',
        body: { producto_id: Number(id), cantidad },
      });
      avisar('Renglón agregado ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'borrar-item') {
    try {
      await api(`/cotizacion_items/${id}`, { method: 'DELETE' });
      avisar('Renglón quitado');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'porcentaje-item') {
    const texto = prompt('¿Qué porcentaje le aplico al precio? Ej: 15 para subirlo 15%, -10 para bajarlo 10%.');
    if (texto === null) return;
    const pct = Number(String(texto).replace(',', '.').replace('%', '').trim());
    if (!pct) return avisar('Ese porcentaje no es un número válido.', true);
    const actual = Number($(`input[data-item="${id}"][data-campo="precio_unitario"]`)?.value) || 0;
    try {
      await api(`/cotizacion_items/${id}`, {
        method: 'PATCH',
        body: { precio_unitario: Math.round(actual * (1 + pct / 100)) },
      });
      avisar(`Precio ${pct > 0 ? 'aumentado' : 'reducido'} ${Math.abs(pct)}% ✓`);
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'cerrar-cotizacion') {
    estado.cotizacionAbierta = null;
    estado.vista = 'cotizaciones';
    estado.editando = false;
    $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'cotizaciones'));
    await pintar();
    return;
  }

  try {
    if (accion === 'borrar-abono') {
      if (!confirm('¿Quitar este abono?')) return;
      await api(`/abonos/${id}`, { method: 'DELETE' });
      avisar('Abono eliminado');
      await refrescarResumen();
      await pintar();
      return;
    }
    if (accion === 'borrar-movimiento') {
      if (!confirm('¿Quitar este movimiento de inventario?')) return;
      await api(`/movimientos_stock/${id}`, { method: 'DELETE' });
      avisar('Movimiento eliminado');
      await pintar();
      return;
    }
    if (accion === 'estado') {
      await api(`/${entidad}/${id}`, { method: 'PATCH', body: { estado: boton.dataset.estado } });
      avisar('Actualizado ✓');
    } else if (accion === 'borrar') {
      if (!confirm('¿Borrar este registro definitivamente?')) return;
      await api(`/${entidad}/${id}`, { method: 'DELETE' });
      avisar('Registro eliminado');
    }
    // Si estábamos viendo un resultado de Ari, lo recargamos desde cero.
    estado.vistaAsistente = null;
    await refrescarTodo();
  } catch (err) {
    avisar(err.message, true);
  }
});

$('#contenido').addEventListener('submit', async (e) => {
  if (e.target.id === 'form-editar') {
    e.preventDefault();
    const { entidad, id } = e.target.dataset;
    const datos = Object.fromEntries(new FormData(e.target));
    // Las casillas sin marcar no aparecen en FormData: hay que agregarlas.
    e.target.querySelectorAll('input[type="checkbox"]').forEach((cb) => { datos[cb.name] = cb.checked ? 1 : 0; });

    // La cantidad disponible no es una columna: se guarda como el movimiento
    // que hace falta para llegar a ese número, y así queda en el historial.
    const objetivo = datos.stock_objetivo;
    delete datos.stock_objetivo;

    // Un campo vacío se guarda como nulo, no como cadena vacía.
    for (const k of Object.keys(datos)) {
      if (datos[k] === '') datos[k] = null;
      else if (k === 'monto') datos[k] = Number(datos[k]);
    }
    try {
      await api(`/${entidad}/${id}`, { method: 'PATCH', body: datos });

      if (entidad === 'productos' && datos.maneja_inventario && objetivo !== null && objetivo !== undefined && objetivo !== '') {
        const actual = Number((await api(`/productos/${id}`)).stock) || 0;
        const diferencia = Number(objetivo) - actual;
        if (diferencia) {
          await api('/movimientos_stock', {
            method: 'POST',
            body: { producto_id: Number(id), cantidad: diferencia, motivo: 'Cantidad ajustada a mano' },
          });
        }
      }
      estado.editando = false;
      avisar('Datos actualizados ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-nuevo-producto') {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    const manejaInventario = e.target.querySelector('input[name="maneja_inventario"]').checked;
    const stockInicial = Number(datos.stock_inicial) || 0;
    delete datos.stock_inicial; // no es una columna de productos: va aparte, como movimiento
    datos.maneja_inventario = manejaInventario ? 1 : 0;
    for (const k of Object.keys(datos)) {
      if (datos[k] === '') delete datos[k];
      else if (k.startsWith('precio_')) datos[k] = Number(datos[k]);
    }
    if (!datos.descripcion || !(Number(datos.precio_cliente) > 0)) {
      return avisar('Falta la descripción o el precio al cliente.', true);
    }
    try {
      const p = await api('/productos', { method: 'POST', body: datos });
      if (manejaInventario && stockInicial > 0) {
        await api('/movimientos_stock', {
          method: 'POST',
          body: { producto_id: p.id, cantidad: stockInicial, motivo: 'Inventario inicial' },
        });
      }
      estado.nuevoProducto = false;
      avisar('Producto agregado ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-ajustes') {
    e.preventDefault();
    try {
      await api('/ajustes', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      avisar('Datos de la empresa guardados ✓');
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-item-libre') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/cotizaciones/${e.target.dataset.id}/items`, {
        method: 'POST',
        body: {
          descripcion: d.descripcion,
          seccion: d.seccion || undefined,
          cantidad: Number(d.cantidad) || 1,
          precio_unitario: Number(d.precio_unitario) || 0,
        },
      });
      avisar('Renglón agregado ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-totales') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/cotizaciones/${e.target.dataset.id}`, {
        method: 'PATCH',
        body: {
          porcentaje_servicio: Number(d.porcentaje_servicio) || 0,
          porcentaje_iva: Number(d.porcentaje_iva) || 0,
          nivel_precio: d.nivel_precio,
        },
      });
      avisar('Totales actualizados ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-foto-url') {
    e.preventDefault();
    const url = new FormData(e.target).get('url');
    if (!url) return avisar('Pegá la dirección de la imagen.', true);
    try {
      // La baja el servidor (muchos sitios no dejan que la lea el navegador),
      // y una vez que es propia se la achica acá como a todas las demás.
      const p = await api(`/productos/${e.target.dataset.id}/foto`, { method: 'POST', body: { imagen_url: url } });
      await achicarGuardada({ id: p.id, foto: p.foto, bytes: p.bytes }).catch(() => null);
      avisar('Foto cargada ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-ajuste-stock') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const cantidad = Number(d.cantidad);
    if (!cantidad) return avisar('La cantidad tiene que ser distinta de cero.', true);

    try {
      await api('/movimientos_stock', {
        method: 'POST',
        body: { producto_id: Number(e.target.dataset.id), cantidad, motivo: d.motivo || undefined },
      });
      avisar('Inventario actualizado ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id !== 'form-abono') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const monto = Number(d.monto);
  if (!(monto > 0)) return avisar('El abono tiene que ser mayor que cero.', true);

  try {
    await api('/abonos', {
      method: 'POST',
      body: {
        cotizacion_id: estado.cotizacionAbierta,
        monto,
        fecha: d.fecha || undefined,
        nota: d.nota || undefined,
      },
    });
    avisar('Abono registrado ✓');
    await refrescarResumen();
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// En celular el micrófono flotante se aparta mientras se hace scroll —si no,
// termina tapando montos y botones— y vuelve al detenerse.
let scrollTimer;
$('#contenido').addEventListener('scroll', () => {
  if (!esCelular() || $('.voz').classList.contains('abierta')) return;
  $('.fabs').classList.add('oculto');
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (!$('.voz').classList.contains('abierta')) $('.fabs').classList.remove('oculto');
  }, 550);
}, { passive: true });

// Buscadores (con una pequeña espera para no disparar una consulta por tecla).
let buscarProductosTimer;
let buscarCatalogoTimer;
$('#contenido').addEventListener('input', (e) => {
  if (e.target.id === 'buscar-productos') {
    estado.buscarProductos = e.target.value;
    clearTimeout(buscarProductosTimer);
    buscarProductosTimer = setTimeout(() => {
      if (estado.vista === 'productos' && !estado.productoAbierto) pintar();
    }, 300);
    return;
  }

  // Buscador del catálogo dentro de una cotización: sólo se repinta el
  // bloque de resultados, para no perder el foco ni lo escrito.
  if (e.target.id === 'buscar-catalogo') {
    estado.buscarCatalogo = e.target.value;
    clearTimeout(buscarCatalogoTimer);
    buscarCatalogoTimer = setTimeout(async () => {
      const q = estado.buscarCatalogo.trim();
      if (!q) {
        estado.resultadosCatalogo = null;
      } else {
        try {
          const { filas } = await api(`/productos?texto=${encodeURIComponent(q)}&limite=8`);
          estado.resultadosCatalogo = filas.slice(0, 8);
        } catch {
          estado.resultadosCatalogo = [];
        }
      }
      const contenedor = $('#buscar-catalogo')?.closest('.tarjeta');
      if (!contenedor) return;
      const nuevo = document.createElement('div');
      nuevo.innerHTML = buscadorDeProductos();
      const listaVieja = contenedor.querySelector('.resultados-catalogo, .ayuda');
      const listaNueva = nuevo.querySelector('.resultados-catalogo, .ayuda');
      if (listaVieja && listaNueva) listaVieja.replaceWith(listaNueva);
      else if (listaNueva) contenedor.append(listaNueva);
    }, 280);
  }
});

// Si se cambia el mapeo o alguna opción después de revisar, la comparación que
// se está mostrando ya no vale: se vuelve a pedir antes de dejar aplicarla.
$('#contenido').addEventListener('change', (e) => {
  const tarjeta = e.target.closest('.import-hoja');
  if (!tarjeta) return;
  const boton = tarjeta.querySelector('[data-accion="aplicar-hoja"]');
  if (!boton) return;
  boton.dataset.accion = 'revisar-hoja';
  boton.disabled = false;
  boton.textContent = 'Ver qué cambiaría';
  tarjeta.querySelector('.import-informe').innerHTML = '';
});

// Edición directa de cantidad y precio en la tabla de renglones.
$('#contenido').addEventListener('change', async (e) => {
  const campo = e.target.closest('input[data-item]');
  if (!campo) return;
  const valor = Number(campo.value);
  if (!(valor >= 0)) return avisar('Ese valor no es válido.', true);
  try {
    await api(`/cotizacion_items/${campo.dataset.item}`, {
      method: 'PATCH',
      body: { [campo.dataset.campo]: valor },
    });
    await refrescarResumen();
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Subir una lista de precios (.xlsx): se lee en el navegador y se manda a
// analizar; nada de la plata del negocio pasa por un tercero.
$('#input-excel').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  avisar('Leyendo el archivo…');
  try {
    const archivo_base64 = await archivoABase64(archivo);
    const { hojas } = await api('/productos/analizar', { method: 'POST', body: { archivo_base64 } });
    if (!hojas.length) return avisar('Ese Excel no tiene hojas con datos.', true);
    // Se guarda el archivo: al importar se vuelve a mandar para sacarle las
    // fotos, que no se traen al analizar porque pesan y ahí no hacen falta.
    estado.importacion = { hojas, archivo: archivo_base64 };
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Pegar una imagen copiada de la web directo en la ficha del producto.
document.addEventListener('paste', async (e) => {
  const zona = $('.zona-foto');
  if (!zona || !estado.productoAbierto) return;

  const archivo = [...(e.clipboardData?.items || [])]
    .find((i) => i.type.startsWith('image/'))?.getAsFile();
  if (!archivo) return; // se pegó texto: que siga su curso normal

  e.preventDefault();
  try {
    const imagen_base64 = await encogerOTalCual(archivo);
    await api(`/productos/${estado.productoAbierto}/foto`, { method: 'POST', body: { imagen_base64 } });
    avisar('Foto pegada ✓');
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Foto de un producto puntual (se sube a public/uploads/productos/).
$('#input-foto').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo || !estado.subiendoFotoPara) return;
  try {
    const { dataUrl, bytes, bytesAntes } = await encoger(archivo);
    await api(`/productos/${estado.subiendoFotoPara}/foto`, { method: 'POST', body: { imagen_base64: dataUrl } });
    avisar(bytesAntes > bytes * 1.5
      ? `Foto actualizada ✓ (achicada de ${pesoLegible(bytesAntes)} a ${pesoLegible(bytes)})`
      : 'Foto actualizada ✓');
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Botones del aviso de cotización en curso
$('#en-curso').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const q = estado.resumen?.enCurso;
  if (!q) return;

  if (boton.dataset.accion === 'ver-en-curso') {
    estado.cotizacionAbierta = q.id;
    estado.clienteAbierto = null;
    estado.productoAbierto = null;
    estado.vistaAsistente = null;
    estado.editando = false;
    $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'cotizaciones'));
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }

  if (boton.dataset.accion === 'finalizar-en-curso') {
    try {
      await api('/cotizacion-en-curso', { method: 'POST', body: {} });
      avisar('Cotización finalizada ✓');
      await refrescarTodo();
    } catch (err) {
      avisar(err.message, true);
    }
  }
});

$('#mic').addEventListener('click', alternarMicrofono);

// Botones flotantes de celular
$('#fab-mic').addEventListener('click', () => { abrirHoja(); alternarMicrofono(); });
$('#fab-teclado').addEventListener('click', () => abrirHoja({ enfocarTexto: true }));
$('#cerrar-hoja').addEventListener('click', cerrarHoja);

// Los ajustes viven en el pie de la barra, fuera de la navegación principal:
// se tocan una vez y no se vuelven a mirar.
$('.enlace-ajustes').addEventListener('click', async () => {
  estado.vista = 'ajustes';
  estado.vistaAsistente = null;
  estado.cotizacionAbierta = null;
  estado.clienteAbierto = null;
  estado.productoAbierto = null;
  estado.importacion = null;
  estado.editando = false;
  $$('.nav-item').forEach((b) => b.classList.remove('activo'));
  cerrarHoja();
  await pintar();
  $('#contenido').scrollTop = 0;
});

$('#salir').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
});
$('#telon').addEventListener('click', cerrarHoja);

$('#enviar').addEventListener('click', () => enviar($('#texto').value));
$('#texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviar($('#texto').value);
});
$('#btn-refrescar').addEventListener('click', () => {
  estado.vistaAsistente = null;
  refrescarTodo();
  avisar('Actualizado');
});

document.addEventListener('keydown', (e) => {
  // Barra espaciadora = hablar (si no estás escribiendo)
  if (e.code === 'Space' && document.activeElement !== $('#texto') && !e.repeat) {
    e.preventDefault();
    alternarMicrofono();
  }
  if (e.key === 'Escape') cerrarHoja();
});

// Al girar el teléfono o pasar a escritorio, la hoja vuelve a su sitio.
window.addEventListener('resize', () => { if (!esCelular()) cerrarHoja(); });

/* ─────────── Arranque ─────────── */

(async function arrancar() {
  iniciarVoz();
  if (VOZ_DISPONIBLE) $('#pista').textContent = PISTA_INICIAL;

  try {
    const s = await api('/estado');
    $('#estado-modelo').textContent = `modelo · ${s.modelo}`;
    if (s.conAcceso) $('#salir').hidden = false;
    if (!s.vozLista) {
      burbuja('ari error', 'Falta configurar <b>ANTHROPIC_API_KEY</b> en el archivo <code>.env</code> del servidor.');
    }
  } catch { /* el servidor dirá */ }

  await refrescarTodo();
  setInterval(refrescarResumen, 60_000);
})();
