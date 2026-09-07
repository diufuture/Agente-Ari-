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
  buscarCotizaciones: '',  // texto del buscador de cotizaciones
  nuevoProducto: false,    // el formulario de alta manual de producto está abierto
  subiendoFotoPara: null,  // id del producto al que se le está por asignar una foto
  subiendoGaleriaPara: null, // id del producto al que se le están agregando fotos de más
  cotizandoProducto: null, // id del producto al que se le está poniendo cantidad para meterlo en la cotización en curso
  itemEditando: null,      // id del renglón de cotización abierto para editar
  nuevoCliente: false,     // el formulario de alta manual de cliente está abierto
  citaEditando: null,      // id de la cita abierta para editar en la agenda
  verHechos: false,        // en Pendientes, ver los que ya se marcaron como hechos
  verHistorialCot: false,  // en Cotizaciones, ver las cerradas en vez de las abiertas
  filtroEstadoCot: null,   // 'pendiente' | 'aprobada' | null (todas)
  filtroPortal: 'pendiente', // en Tienda, qué registros mostrar
  portalClaveAbierta: null, // id del registro del portal al que se le está restableciendo la clave
  clienteCotizaciones: null, // {id, nombre} cuando se miran las de un cliente puntual
  recordatorioEditando: null, // id del pendiente abierto para corregir
  tipoProducto: null,      // filtro del catálogo por tipo (Display, Switch EU…)
  tiposConocidos: [],      // los tipos ya usados, para sugerirlos al editar
  subiendoFichaPara: null, // id del producto al que se le va a adjuntar la ficha
  subiendoOferta: false,   // formulario para subir una cotización ya hecha en PDF
  subiendoPdfPara: null,   // id de la cotización a la que se le va a adjuntar el PDF
  viendoListas: false,     // pantalla de listas de precios conectadas en línea
  pruebaLista: null,       // resultado de probar una dirección, antes de conectarla
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

/* ─────────── Visor de PDF ─────────── */

/**
 * Muestra un PDF adentro de la aplicación, con su botón de cerrar.
 *
 * Abrirlos con target="_blank" funciona en el navegador, pero en la
 * aplicación instalada en el teléfono el PDF se toma la pantalla entera sin
 * barra de direcciones ni botón de volver: no quedaba forma de salir salvo
 * cerrar la aplicación y volver a entrar.
 *
 * Se apila un estado en el historial para que el gesto de "atrás" del
 * teléfono también lo cierre, que es lo que uno intenta primero.
 */
// Si el visor apiló su entrada en el historial. Se lleva acá y no leyendo
// history.state, porque history.back() tarda en aplicarse: al abrir y cerrar
// rápido, el estado leído todavía era el viejo y el gesto de atrás dejaba de
// funcionar.
let visorEnHistorial = false;

/* ------------------------------------------------------------------ */
/* Abrir y cerrar una ficha, y el gesto de "atrás" del celular         */
/* ------------------------------------------------------------------ */

// Las fichas (una cotización, un cliente, un producto) se abren encima de su
// lista, pero para el navegador seguían siendo la misma página. En el celular
// eso se notaba feo: al deslizar para volver atrás no había nada que deshacer,
// así que la aplicación instalada se recargaba desde cero y aparecía el
// inicio. La cotización que se estaba mirando se perdía y había que ir a
// buscarla de nuevo.
//
// Anotando la ficha en el historial, "atrás" hace lo que uno espera: cierra la
// ficha y deja la lista de donde salió.
let fichaEnHistorial = false;

function anotarFichaEnHistorial() {
  if (fichaEnHistorial) return;
  history.pushState({ fichaAri: true }, '');
  fichaEnHistorial = true;
}

/** A qué lista vuelve cada ficha, y con qué botón de la barra encendido. */
const LISTA_DE_FICHA = [
  ['cotizacionAbierta', 'cotizaciones'],
  ['clienteAbierto', 'clientes'],
  ['productoAbierto', 'productos'],
];

/**
 * Cierra la ficha abierta y vuelve a su lista.
 *
 * Con `desdeHistorial` viene del gesto de atrás: el navegador ya sacó la
 * entrada, así que sólo hay que cerrar. Si lo pidió un botón de la pantalla,
 * primero se deshace esa entrada —y el propio historial vuelve acá— para que
 * el historial no quede con pasos de más que después habría que apretar dos
 * veces.
 */
async function cerrarFicha({ desdeHistorial = false } = {}) {
  const abierta = LISTA_DE_FICHA.find(([clave]) => estado[clave]);
  if (!abierta) return;

  if (!desdeHistorial && fichaEnHistorial) {
    history.back();
    return;
  }
  fichaEnHistorial = false;

  const [clave, vista] = abierta;
  estado[clave] = null;
  estado.vista = vista;
  estado.editando = false;
  $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));
  await pintar();
}

/* ------------------------------------------------------------------ */
/* La cotización en PDF                                                */
/* ------------------------------------------------------------------ */

/**
 * Pasa una foto a JPEG.
 *
 * Las fotos de los productos se guardan en WEBP porque pesa mucho menos, pero
 * el formato PDF no sabe leer WEBP. El único que puede convertirlas es el
 * navegador —ya las tiene dibujadas en pantalla—, así que se dibujan en un
 * lienzo sobre fondo blanco (las de catálogo suelen venir con el fondo
 * transparente, que en JPG saldría negro) y se leen de vuelta como JPG.
 */
function aJpeg(direccion) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const lienzo = document.createElement('canvas');
        lienzo.width = img.naturalWidth || 1;
        lienzo.height = img.naturalHeight || 1;
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, 0, 0);
        resolve(lienzo.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(null);   // una foto que no se pudo convertir no frena la oferta
      }
    };
    img.onerror = () => resolve(null);
    img.src = direccion;
  });
}

/** Arma el PDF de una cotización y lo devuelve como archivo. */
async function pdfDeCotizacion(cot) {
  const [{ filas: items = [] }, aj] = await Promise.all([
    api(`/cotizaciones/${cot.id}/items`),
    api('/ajustes'),
  ]);

  // El logo viaja por el mismo camino que las fotos: también hay que
  // convertirlo, y también es el navegador el único que puede.
  // Sólo una vez por imagen, aunque el producto se repita en varios renglones.
  const direcciones = [...new Set([aj.logo, ...items.map((i) => i.foto)].filter(Boolean))];
  const fotos = {};
  await Promise.all(direcciones.map(async (d) => {
    const jpeg = await aJpeg(d);
    if (jpeg) fotos[d] = jpeg;
  }));

  const r = await fetch(`/api/cotizaciones/${cot.id}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fotos }),
  });
  if (!r.ok) {
    const { error } = await r.json().catch(() => ({}));
    throw new Error(error || 'No pude armar el PDF.');
  }

  const blob = await r.blob();
  const nombre = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1]
    || `Cotizacion-${cot.id}.pdf`;
  return new File([blob], nombre, { type: 'application/pdf' });
}

/**
 * Deja la cotización en manos del dueño del teléfono.
 *
 * Hay un solo camino a propósito. Durante un rato hubo dos botones —"Guardar
 * PDF" y "Enviar por WhatsApp"— y en el celular terminaban abriendo la misma
 * pantalla: el menú de compartir del sistema ya deja elegir entre guardar el
 * archivo o mandarlo por WhatsApp, así que el segundo botón no agregaba nada
 * y sólo hacía dudar cuál apretar.
 *
 * Ese menú es además el único camino para adjuntar un archivo a WhatsApp: los
 * enlaces de wa.me sólo saben mandar texto. Donde no existe (el computador),
 * el PDF se baja como cualquier descarga.
 */
async function guardarPdfDeCotizacion(cot) {
  const archivo = await pdfDeCotizacion(cot);

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: archivo.name });
      return { compartido: true };
    } catch (err) {
      // Cerrar el menú a propósito no es un error que haya que mostrar.
      if (err?.name === 'AbortError') return { cancelado: true };
    }
  }

  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { bajado: true };
}

function abrirVisorPdf(url, titulo = 'Documento') {
  const visor = $('#visor-pdf');
  $('#visor-titulo').textContent = titulo;
  $('#visor-aparte').hidden = false;
  $('#visor-aparte').href = url;
  $('#visor-marco').src = url;
  // Instalada en el celular (ícono agregado a la pantalla de inicio), un PDF
  // abierto adentro no tiene el botón nativo de compartir — ni Safari ni el
  // visor de por sí dan esa opción ahí. El botón "Compartir" usa la hoja de
  // compartir del propio celular (WhatsApp, Mail, Guardar en Archivos...),
  // que sí funciona instalada. Sólo se muestra donde el navegador lo soporta.
  const compartir = $('#visor-compartir');
  compartir.hidden = !navigator.share;
  compartir.dataset.url = new URL(url, location.origin).href;
  compartir.dataset.titulo = titulo;
  visor.hidden = false;
  document.body.classList.add('con-visor');
  if (!visorEnHistorial) {
    history.pushState({ visorPdf: true }, '');
    visorEnHistorial = true;
  }
}

function cerrarVisorPdf({ desdeHistorial = false } = {}) {
  const visor = $('#visor-pdf');
  if (visor.hidden) return;
  visor.hidden = true;
  // Se descarga el documento: dejarlo cargado gasta memoria y en el teléfono
  // puede seguir sonando si el PDF trae algo incrustado.
  $('#visor-marco').src = 'about:blank';
  document.body.classList.remove('con-visor');
  if (desdeHistorial) {
    visorEnHistorial = false;
  } else if (visorEnHistorial) {
    visorEnHistorial = false;
    history.back();
  }
}

/**
 * Muestra un PDF armado al vuelo —no uno guardado en el servidor— en una
 * pestaña de verdad, no en el visor propio.
 *
 * Adentro de un `<iframe>`, Safari en iPhone no pagina ni deja hacer scroll:
 * muestra sólo la parte de arriba y ahí se corta, así que con una cotización
 * de varios renglones no se ven ni los de más abajo ni el total. Fuera del
 * marco, en su propia pestaña, el mismo Safari sí sabe mostrar un PDF entero
 * con su lector nativo. Por eso este camino no reusa `abrirVisorPdf`.
 *
 * La pestaña se abre YA, en el mismo instante del toque —`window.open` sin
 * esperar nada—: hacerlo después de un `await`, aunque sea corto, ya no
 * cuenta como gesto del usuario y el navegador la bloquea como si fuera
 * publicidad. Se le pone la dirección real recién cuando el PDF está listo.
 */
async function verPdfGenerado(cot, titulo) {
  const ventana = window.open('', '_blank');
  try {
    const archivo = await pdfDeCotizacion(cot);
    const url = URL.createObjectURL(archivo);
    if (ventana) {
      ventana.location = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      // El navegador bloqueó la pestaña igual: queda el otro camino.
      URL.revokeObjectURL(url);
      throw new Error('El navegador bloqueó la ventana. Probá con «Guardar PDF».');
    }
  } catch (err) {
    ventana?.close();
    throw err;
  }
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
  tienda: 'Tienda',
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
  cotizado: 'Cotizado', notas: 'Detalle', foto: '', tipo: 'Tipo',
  n_cotizaciones: 'Ofertas', por_cobrar: 'Por cobrar',
};

/**
 * Cómo se lee cada estado en pantalla.
 *
 * En la base el tercer estado de una cotización se llama `rechazada` desde
 * siempre, y así se queda —cambiarle el nombre obligaría a tocar los datos ya
 * guardados—. Pero «rechazada» suena a que el cliente dijo que no, y casi
 * nunca es eso: lo normal es que se cotizó y no volvió a saberse. En pantalla
 * dice **no aprobada**, que es lo que de verdad pasó.
 */
const ROTULO_ESTADO = { rechazada: 'no aprobada' };
const rotuloDeEstado = (e) => ROTULO_ESTADO[e] || e;

/**
 * La rueda de estados de una cotización, tocando la pastilla.
 *
 * Son tres y no dos: una oferta que no se aprobó no vuelve a estar pendiente
 * —pendiente es la que todavía se está esperando—. La que se cotizó y quedó
 * ahí es **no aprobada**, y no cuenta para lo cotizado ni para el saldo del
 * cliente, pero sigue guardada y sigue apareciendo entre lo que se le
 * presentó.
 */
const SIGUIENTE_ESTADO_COT = { pendiente: 'aprobada', aprobada: 'rechazada', rechazada: 'pendiente' };

/** Columnas de plata: van alineadas a la derecha, con los números en columna. */
const COLUMNAS_DINERO = new Set(['monto', 'cotizado', 'abonado', 'saldo', 'precio_canal', 'precio_constructor', 'precio_cliente']);

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
      return fmtDinero(v, fila.moneda);
    case 'abonado':
      // En un cliente sin cotizaciones no hay "$ 0 abonado": no hay nada.
      return fila.n_cotizaciones === 0 ? '<span style="color:var(--texto-3)">—</span>' : fmtDinero(v, fila.moneda);
    case 'precio_cliente':
    case 'precio_canal':
    case 'precio_constructor':
      return v === null || v === undefined ? '—' : fmtDinero(v);
    case 'descripcion':
      return `<span title="${escapar(v ?? '')}">${escapar(truncar(v, 70))}</span>`;
    case 'notas':
      // El detalle de una cita se va agregando por voz y puede tener varias
      // líneas; en la lista se muestra el principio y el resto al pasar encima.
      return v
        ? `<span title="${escapar(v)}" style="color:var(--texto-2)">${escapar(truncar(v, 48))}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'foto':
      // La uña del producto, para reconocerlo de un vistazo sin abrirlo.
      return v
        ? `<img class="mini-foto" src="${escapar(v)}" alt="" width="38" height="38" loading="lazy" />`
        : '<span class="mini-foto vacia"></span>';
    case 'tipo':
      return v
        ? `<span class="etiqueta-tipo">${escapar(v)}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'stock':
      return fila.maneja_inventario
        ? `<span style="${Number(v) <= 0 ? 'color:var(--alerta);font-weight:600' : ''}">${escapar(v)}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'cantidad':
      return `<span style="color:${Number(v) > 0 ? 'var(--verde)' : 'var(--alerta)'};font-weight:600">${Number(v) > 0 ? '+' : ''}${escapar(v)}</span>`;
    case 'cliente':
      // El cliente es por lo que uno busca todo: va resaltado en todas las
      // pantallas, para encontrarlo de un vistazo sin leer renglón por renglón.
      return v ? `<span class="es-cliente">${escapar(v)}</span>` : '<span style="color:var(--texto-3)">—</span>';
    case 'cotizado':
      // En la lista de clientes: cuánto se le cotizó en total. Un cliente sin
      // cotizaciones muestra un guión, no "$ 0", que se lee como una deuda.
      return Number(v) ? fmtDinero(v) : '<span style="color:var(--texto-3)">—</span>';
    case 'saldo': {
      // Un cliente al que nunca se le cotizó no está "saldado": no hay nada.
      if (fila.n_cotizaciones !== undefined && !fila.n_cotizaciones) {
        return '<span style="color:var(--texto-3)">—</span>';
      }
      const saldado = Number(v) <= 0;
      return `<span style="color:${saldado ? 'var(--verde)' : 'var(--ambar)'};font-weight:600">${
        saldado ? 'saldada' : fmtDinero(v, fila.moneda)}</span>`;
    }
    // Cuántas ofertas tiene un cliente, a la vista en la lista: antes había
    // que abrir el cajón y entrar a "Ofertas" para enterarse de un número.
    case 'n_cotizaciones':
      return v
        ? `<span class="cont-ofertas">${escapar(v)}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'por_cobrar':
      return Number(v) > 0
        ? `<span style="color:var(--ambar);font-weight:600">${fmtDinero(v, fila.moneda)}</span>`
        : '<span style="color:var(--texto-3)">—</span>';
    case 'fecha':
      return escapar(fmtFecha(v));
    case 'estado':
    case 'prioridad':
      return `<span class="pastilla ${escapar(v)}">${escapar(rotuloDeEstado(v))}</span>`;
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

/**
 * Qué se puede hacer con una fila de una lista.
 *
 * Se arma una sola vez y se pinta de dos maneras: como hilera de botones al
 * costado —que es lo que cabe en el computador— y como cajón que asoma al
 * deslizar el renglón, que es lo que sirve en el celular. Tenerlo escrito una
 * sola vez es lo que evita que las dos terminen ofreciendo cosas distintas.
 */
function accionesDeFila(entidad, f) {
  const acciones = [];
  const dinero = { cobros: 'Pagado' };

  // La oferta en PDF, a un toque desde la lista: estando con el cliente
  // enfrente no se puede andar entrando a la ficha para llegar al archivo.
  // La mayoría de las cotizaciones no tienen un PDF guardado —se arman con
  // renglones, no se suben ya hechas—, así que sin este segundo camino la
  // lista casi nunca mostraba nada: había que entrar a cada una para verla.
  if (entidad === 'cotizaciones' && f.archivo) {
    acciones.push({
      accion: 'ver-pdf', rotulo: '📄 PDF', corto: 'PDF', icono: ICONO_DOC, tono: 'editar',
      clase: 'pdf', href: f.archivo, titulo: 'Abrir la oferta en PDF',
      datos: { titulo: f.titulo || 'Cotización' },
    });
  } else if (entidad === 'cotizaciones' && Number(f.n_items) > 0) {
    acciones.push({
      accion: 'ver-pdf-cot', rotulo: '📄 PDF', corto: 'PDF', icono: ICONO_DOC, tono: 'editar',
      clase: 'pdf', titulo: 'Ver la oferta en PDF',
      datos: { titulo: f.titulo || 'Cotización' },
    });
  }
  if (entidad === 'cotizaciones') {
    acciones.push({ accion: 'abrir-cotizacion', rotulo: 'Abrir y editar', corto: 'Abrir',
      icono: ICONO_LAPIZ, tono: 'editar', clase: 'destacado' });
  }
  if (entidad === 'clientes') {
    acciones.push({ accion: 'abrir-cliente', rotulo: 'Ver ficha', corto: 'Ficha',
      icono: ICONO_OJO, tono: 'editar', clase: 'destacado' });
    if (f.n_cotizaciones) {
      acciones.push({ accion: 'cotizaciones-de', rotulo: `Cotizaciones (${f.n_cotizaciones})`,
        corto: 'Ofertas', icono: ICONO_DOC, tono: 'editar', datos: { nombre: f.nombre } });
    }
  }
  if (entidad === 'productos') {
    // Con una cotización abierta, el catálogo se vuelve la forma más rápida de
    // armarla: se va tocando ➕ producto por producto y se pone la cantidad,
    // sin dictar nada. Para veinte renglones es mucho menos trabajo que
    // nombrarlos uno por uno, y no se equivoca de referencia.
    if (estado.resumen?.enCurso) {
      acciones.push({ accion: 'cotizar-producto', rotulo: '➕ Cotizar', corto: 'Cotizar',
        icono: ICONO_MAS, tono: 'ok', clase: 'destacado',
        titulo: `Agregarlo a «${estado.resumen.enCurso.titulo}»` });
    }
    acciones.push({ accion: 'abrir-producto', rotulo: 'Ver', corto: 'Ver',
      icono: ICONO_OJO, tono: 'editar', clase: 'destacado' });
    // La ficha técnica, a un toque desde la lista: si ya está cargada, no hay
    // que entrar al producto para llegar a ella.
    if (f.ficha) {
      acciones.push({ accion: 'ver-pdf', rotulo: '📄 Ficha', corto: 'Ficha', icono: ICONO_DOC, tono: 'editar',
        clase: 'pdf', href: f.ficha, titulo: 'Abrir la ficha técnica', datos: { titulo: f.ficha_nombre || 'Ficha técnica' } });
    }
  }
  if (entidad in NUEVO_ESTADO && f.estado === 'pendiente') {
    const rotulo = dinero[entidad] || 'Listo';
    acciones.push({ accion: 'estado', rotulo, corto: rotulo, icono: ICONO_CHECK, tono: 'ok',
      datos: { entidad, estado: NUEVO_ESTADO[entidad] } });
  }
  // En un pendiente, lo que falta es poder corregirlo; "Listo" ya lo saca de la
  // lista, así que borrar sólo tiene sentido entre los que ya se hicieron.
  if (entidad === 'recordatorios') {
    acciones.push({ accion: 'editar-recordatorio', rotulo: 'Editar', corto: 'Editar',
      icono: ICONO_LAPIZ, tono: 'editar', clase: 'destacado' });
  }
  if (!(entidad === 'recordatorios' && f.estado === 'pendiente')) {
    acciones.push({ accion: 'borrar', rotulo: 'Borrar', corto: 'Borrar', icono: ICONO_CANECA,
      tono: 'borrar', clase: 'peligro', datos: { entidad } });
  }
  return acciones.map((a) => ({ ...a, id: f.id }));
}

const datosDeAccion = (a, id) => [`data-accion="${a.accion}"`, `data-id="${id}"`]
  .concat(Object.entries(a.datos || {}).map(([k, v]) => `data-${k}="${escapar(v)}"`))
  .join(' ');

/** Un botón de la hilera del costado. */
function botonDeAccion(a) {
  const clases = `mini${a.clase ? ` ${a.clase}` : ''}`;
  const titulo = a.titulo ? ` title="${escapar(a.titulo)}"` : '';
  return a.href
    ? `<a class="${clases}" href="${escapar(a.href)}" target="_blank" rel="noopener" ${
        datosDeAccion(a, a.id)}${titulo}>${a.rotulo}</a>`
    : `<button class="${clases}" ${datosDeAccion(a, a.id)}${titulo}>${escapar(a.rotulo)}</button>`;
}

/** Las mismas acciones, en el cajón que asoma al deslizar. */
function cajonDeAcciones(lista) {
  return `<div class="cot-cajon">${lista.map((a) => {
    const dentro = `${a.icono}<span>${escapar(a.corto)}</span>`;
    const atributos = `${datosDeAccion(a, a.id)}${a.titulo ? ` title="${escapar(a.titulo)}"` : ''}`;
    return a.href
      ? `<a class="cajon-btn ${a.tono}" href="${escapar(a.href)}" target="_blank" rel="noopener" ${atributos}>${dentro}</a>`
      : `<button class="cajon-btn ${a.tono}" ${atributos}>${dentro}</button>`;
  }).join('')}</div>`;
}

// Ancho del cajón: cada botón mide 66 y el marco suma 12. El número tiene que
// salir de acá y no del CSS, porque el guion también lo mide para saber hasta
// dónde corre el renglón.
const anchoDeCajon = (lista) => lista.length * 66 + 12;

function tabla(entidad, columnas, filas, { vacio, compacta = false, debajoDe = null } = {}) {
  if (!filas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Nada por acá</strong>${escapar(vacio || 'Pedíselo a Ari por voz y aparece de inmediato.')}
    </div></div>`;
  }

  const cabeceras = columnas.map((c) =>
    `<th${COLUMNAS_DINERO.has(c) ? ' class="num"' : ''}>${ENCABEZADOS[c] ?? c}</th>`).join('');

  const cuerpo = filas.map((f) => {
    const celdas = columnas.map((c, i) => {
      // En clientes la columna que manda es el nombre; en el resto, la segunda.
      const destacada = entidad === 'clientes' ? i === 0 : i === 1;
      const clases = [COLUMNAS_DINERO.has(c) ? 'num' : '', destacada ? 'principal-col' : ''].filter(Boolean).join(' ');
      // data-rotulo alimenta el ::before que muestra el nombre de la columna
      // cuando la tabla se apila como ficha en pantallas angostas.
      return `<td${clases ? ` class="${clases}"` : ''} data-rotulo="${ENCABEZADOS[c] ?? c}">${celda(c, f)}</td>`;
    }).join('');

    // La oferta en PDF, a un toque desde la lista: estando con el cliente
    // enfrente no se puede andar entrando a la ficha para llegar al archivo.
    // Sólo aparece si esa cotización tiene uno cargado.
    const lista = accionesDeFila(entidad, f);

    const acciones = `<td class="num acciones">
      <div class="acciones-fila">${
        (compacta ? lista.filter((a) => a.accion === 'ver-pdf' || a.accion === 'ver-pdf-cot') : lista)
          .map((a) => botonDeAccion(a)).join('')}</div>
      ${!compacta && lista.length
        ? `<button class="mini mas solo-angosto" data-accion="mas-opciones" aria-label="Más opciones">⋯</button>`
        : ''}
    </td>`;

    // El mismo puñado de acciones, del otro lado del renglón, para llegar a
    // ellas deslizando en el celular en vez de con una hilera de botones.
    const cajon = compacta || !lista.length ? '' : `<td class="td-cajon">${cajonDeAcciones(lista)}</td>`;

    // Un renglón que se abre debajo del que se tocó, sin sacar a nadie de la
    // lista: es donde se pone la cantidad para mandar el producto a la
    // cotización que se está armando.
    const intercalado = debajoDe ? debajoDe(f) : '';

    return `<tr${cajon ? ` class="deslizable" style="--cajon:${anchoDeCajon(lista)}px"` : ''}>${
      celdas}${acciones}${cajon}</tr>${
      intercalado ? `<tr class="fila-editor"><td colspan="${columnas.length + 2}">${intercalado}</td></tr>` : ''}`;
  }).join('');

  return `<div class="tarjeta"><div class="tabla-envoltura"><table>
    <thead><tr>${cabeceras}<th class="num"></th></tr></thead>
    <tbody>${cuerpo}</tbody>
  </table></div></div>`;
}

/**
 * Un bloque con su título.
 *
 * Con `clave` se vuelve plegable: el título pasa a ser un botón que abre y
 * cierra, y queda recordado en ese teléfono. Sirve para el tablero, donde no
 * siempre se quieren ver las tres listas a la vez.
 */
function bloque(titulo, contenido, { clave = null, cuantos = null } = {}) {
  if (!clave) {
    return `<section class="bloque">
      <h2 class="bloque-titulo">${escapar(titulo)}</h2>
      ${contenido}
    </section>`;
  }

  const abierto = localStorage.getItem(`plegado:${clave}`) !== '1';
  return `<details class="bloque plegable" data-clave="${escapar(clave)}"${abierto ? ' open' : ''}>
    <summary class="bloque-titulo">
      <span class="flecha" aria-hidden="true">▸</span>
      ${escapar(titulo)}
      ${cuantos !== null ? `<em class="cuantos">${cuantos}</em>` : ''}
    </summary>
    ${contenido}
  </details>`;
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

/**
 * La agenda, como fichas y no como tabla.
 *
 * El detalle de una reunión —qué hay que llevar, qué se va a tratar— es lo
 * más importante que tiene, y en una celda de tabla salía cortado a los
 * cuarenta y pico de caracteres. Acá va entero, con sus saltos de línea, que
 * es como se dictó.
 */
function vistaAgenda(citas) {
  if (!citas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Agenda libre</strong>Pedísela a Ari por voz: «agendame mañana a las 3 visita a El Tornillo».
    </div></div>`;
  }

  const hoyStr = new Date().toLocaleDateString('sv-SE');

  return citas.map((c) => {
    const dia = String(c.inicio || '').slice(0, 10);
    const hora = String(c.inicio || '').split('T')[1]?.slice(0, 5) || '';
    const esHoy = dia === hoyStr;

    if (c.id === estado.citaEditando) {
      return `<div class="cita-ficha editando">${formularioEdicion('citas', c)}</div>`;
    }

    // Editar y Borrar vivían siempre a la vista, dos botones más entre las
    // citas del día. Ahora quedan en el mismo cajón que el resto de las
    // listas: se llega deslizando la ficha hacia la izquierda, o con ⋯.
    const acciones = [
      { accion: 'editar-cita', corto: 'Editar', icono: ICONO_LAPIZ, tono: 'editar', id: c.id,
        titulo: 'Editar esta cita' },
    ];
    if (c.estado === 'pendiente') {
      acciones.push({ accion: 'estado', corto: 'Listo', icono: ICONO_CHECK, tono: 'ok', id: c.id,
        titulo: 'Marcarla como hecha', datos: { entidad: 'citas', estado: 'completada' } });
    }
    acciones.push({ accion: 'borrar', corto: 'Borrar', icono: ICONO_CANECA, tono: 'borrar', id: c.id,
      titulo: 'Borrar esta cita', datos: { entidad: 'citas' } });

    return `<div class="cita-item deslizable" style="--cajon:${anchoDeCajon(acciones)}px">
      ${cajonDeAcciones(acciones)}
      <div class="cita-ficha${esHoy ? ' es-hoy' : ''}">
        <div class="cita-cuando">
          <strong>${escapar(esHoy ? 'Hoy' : fmtFecha(dia))}</strong>
          <span>${escapar(hora)}</span>
        </div>
        <div class="cita-cuerpo">
          <h3>${escapar(c.titulo)}</h3>
          <p class="cita-quien">${c.cliente ? `<span class="es-cliente">${escapar(c.cliente)}</span>` : ''}${
            c.cliente && c.lugar ? ' · ' : ''}${escapar(c.lugar || '')}${
            !c.cliente && !c.lugar ? 'Sin cliente ni lugar' : ''}</p>
          ${c.notas
            ? `<div class="cita-detalle">${escapar(c.notas)}</div>`
            : '<p class="cita-sin-detalle">Sin detalle. Decile a Ari «agregale a esta reunión que…» o deslizá para editar.</p>'}
        </div>
        <div class="cita-acciones">
          <span class="pastilla ${escapar(c.estado)}">${escapar(c.estado)}</span>
          <button class="mini mas" data-accion="mas-opciones" title="Editar o borrar esta cita"
                  aria-label="Más opciones">⋯</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ─────────── Renglones de una cotización ─────────── */

/** La tabla de ítems, agrupada por sección como en el formato impreso. */
/** El nombre corto de un renglón: la ficha técnica va en las líneas de abajo. */
const primeraLineaDe = (texto) => String(texto ?? '').split('\n')[0].trim();

/**
 * El renglón abierto para editar.
 *
 * Lo que trae un producto del catálogo es su nombre genérico —"Interruptor 2
 * canales"— y muchas veces en la oferta hay que llamarlo como lo conoce el
 * cliente. Se cambia acá, y sólo en esta cotización: el catálogo no se toca.
 */
function filaEditorItem(it) {
  return `<tr class="fila-editor"><td colspan="6">
    <form class="form-item" data-id="${it.id}">
      <label class="ancho"><span>Descripción — la primera línea es el nombre; lo de abajo sale como ficha técnica</span>
        <textarea name="descripcion" rows="3" required>${escapar(it.descripcion)}</textarea></label>
      <label><span>Referencia</span>
        <input name="referencia" type="text" value="${escapar(it.referencia || '')}" /></label>
      <label><span>Marca</span>
        <input name="marca" type="text" value="${escapar(it.marca || '')}" /></label>
      <label><span>Sección</span>
        <input name="seccion" type="text" list="lista-secciones" value="${escapar(it.seccion || '')}"
               placeholder="Iluminación, Mano de obra…" /></label>
      <label><span>Área (opcional)</span>
        <input name="area" type="text" list="lista-areas" value="${escapar(it.area || '')}"
               placeholder="Sala, Cocina, Habitación…" /></label>
      <div class="form-acciones">
        <button type="submit">Guardar renglón</button>
        <button type="button" class="mini" data-accion="cancelar-item">Cancelar</button>
      </div>
    </form>
  </td></tr>`;
}

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

    // Abierto para editar: el renglón se despliega en un formulario con todo
    // lo que va impreso, incluido el texto largo de la ficha técnica.
    if (it.id === estado.itemEditando) {
      return `${cabecera}${filaEditorItem(it)}`;
    }

    return `${cabecera}
      <tr>
        <td data-rotulo="Referencia" class="col-ref">${escapar(it.referencia || '—')}</td>
        <td data-rotulo="Descripción" class="principal-col" title="${escapar(it.descripcion)}">
          ${escapar(truncar(primeraLineaDe(it.descripcion), 60))}
          ${it.area ? `<em class="area-item">${escapar(it.area)}</em>` : ''}
          ${it.marca ? `<em class="marca-item">${escapar(it.marca)}</em>` : ''}
          ${it.producto_id && !it.foto
            ? '<em class="falta-foto" title="Este producto no tiene foto: va a salir vacío en el PDF">sin foto</em>'
            : ''}
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
          <button class="mini" data-accion="editar-item" data-id="${it.id}"
                  title="Cambiarle el nombre, la sección o el área" aria-label="Editar renglón">✎</button>
          <button class="mini" data-accion="porcentaje-item" data-id="${it.id}"
                  title="Subirle o bajarle un porcentaje" aria-label="Ajustar por porcentaje">%</button>
          <button class="mini peligro" data-accion="borrar-item" data-id="${it.id}"
                  title="Quitar este renglón" aria-label="Quitar renglón">✕</button>
        </div></td>
      </tr>`;
  }).join('');

  // Para no volver a escribir a mano lo que ya se usó en esta cotización.
  const sugerencias = (campo) => [...new Set(items.map((i) => i[campo]).filter(Boolean))]
    .map((v) => `<option value="${escapar(v)}"></option>`).join('');

  return `<div class="tarjeta"><div class="tabla-envoltura"><table class="tabla-items">
    <thead><tr>
      <th>Ref.</th><th>Descripción</th><th class="num">Cant.</th>
      <th class="num">Vr. unit.</th><th class="num">Vr. total</th><th class="num"></th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
  <datalist id="lista-secciones">${sugerencias('seccion')}</datalist>
  <datalist id="lista-areas">${sugerencias('area')}</datalist>
  </div>`;
}

/** Subtotal, servicio, IVA y total, con los porcentajes editables. */
const NOMBRE_NIVEL = { canal: 'Canal', constructor: 'Constructor', cliente: 'Cliente final' };

function totalesYAjustes(cot, totales) {
  const nivel = cot.nivel_precio || 'cliente';
  return `
    <div class="tarjeta">
      <form class="form-totales" id="form-totales" data-id="${cot.id}">
        <label><span>Servicio %</span>
          <input name="porcentaje_servicio" type="number" min="0" step="0.1" value="${escapar(cot.porcentaje_servicio ?? 0)}" /></label>
        <label><span>IVA %</span>
          <input name="porcentaje_iva" type="number" min="0" step="0.1" value="${escapar(cot.porcentaje_iva ?? 0)}" /></label>
        <button type="submit">Aplicar</button>
      </form>

      ${/* El selector de precios no va acá sino en Editar: tenerlo en dos
            lugares hacía dudar cuál manda. Se deja dicho cuál está en uso, con
            el camino para cambiarlo. */ ''}
      <p class="ayuda" style="margin:12px 0 0">
        Armada con precios de <b>${escapar(NOMBRE_NIVEL[nivel] || nivel)}</b>.
        Para cambiarlos, <b>Editar</b> → «Precios que se usan».
      </p>

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
        ${/* Cuál botón de PDF aparece depende de la oferta:

              · Con un PDF cargado, «Ver el PDF» abre ese archivo. Es lo que
                hace falta con una oferta que se armó por fuera.
              · Sin uno cargado pero con renglones, «Ver» arma el PDF al
                vuelo y lo muestra —sin guardarlo ni mandarlo a ningún
                lado—, y junto va «Guardar PDF» para cuando sí hace falta
                guardarlo o mandarlo por WhatsApp. Sin renglones no hay
                nada que mostrar todavía, así que ninguno de los dos sale.

              La página imprimible («Ver» de antes, la de /imprimir) se fue:
              hacía lo mismo que Guardar PDF pero peor, y en el celular
              instalado no abría nada. Este «Ver» es otro: no navega a
              ningún lado, arma el PDF y lo enseña. */ ''}
        <div class="ficha-acciones">
          <span class="pastilla ${escapar(cot.estado)}">${escapar(rotuloDeEstado(cot.estado))}</span>
          ${cot.archivo
            ? `<a class="mini destacado" href="${escapar(cot.archivo)}" target="_blank" rel="noopener"
                  data-titulo="${escapar(cot.archivo_nombre || cot.titulo)}">Ver el PDF</a>`
            : ''}
          ${!cot.archivo && items.length
            ? `<button class="mini" data-accion="ver-pdf-cot" data-id="${cot.id}"
                  data-titulo="${escapar(cot.titulo)}">Ver</button>`
            : ''}
          ${items.length
            ? `<button class="mini${cot.archivo ? '' : ' destacado'}" data-accion="guardar-pdf">Guardar PDF</button>`
            : ''}
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

    ${bloque('Oferta en PDF', `
      <div class="tarjeta">
        <div class="adjunto">
          ${cot.archivo ? `
            <div class="adjunto-icono">PDF</div>
            <div class="adjunto-texto">
              <strong>${escapar(cot.archivo_nombre || 'cotizacion.pdf')}</strong>
              <span>Es la oferta que ve el cliente. El botón «Ver el PDF» de arriba abre ésta.</span>
            </div>
            <div class="acciones-fila">
              <button class="mini" data-accion="subir-pdf" data-id="${cot.id}">Reemplazar</button>
              <button class="mini peligro" data-accion="quitar-pdf" data-id="${cot.id}">Quitar</button>
            </div>`
          : `
            <div class="adjunto-texto">
              <strong>Sin PDF adjunto</strong>
              <span>Si la cotización la armaste por fuera, subí el PDF acá y seguila desde el sistema:
              cliente, valor, abonos y saldo funcionan igual, con renglones o sin ellos.</span>
            </div>
            <div class="acciones-fila">
              <button class="mini destacado" data-accion="subir-pdf" data-id="${cot.id}">Subir el PDF</button>
            </div>`}
        </div>
      </div>`)}

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
  citas: [
    { n: 'titulo', e: 'Asunto', req: true, ancho: true },
    { n: 'inicio', e: 'Cuándo', tipo: 'datetime-local' },
    { n: 'duracion_min', e: 'Duración (minutos)', tipo: 'number' },
    { n: 'lugar', e: 'Lugar' },
    { n: 'estado', e: 'Estado', opciones: ['pendiente', 'completada', 'cancelada'] },
    // De qué se trata y qué hay que llevar. Es lo que se va agregando por voz.
    { n: 'notas', e: 'Detalle — de qué se trata, qué hay que llevar', area: true, ancho: true, filas: 5 },
  ],
  recordatorios: [
    { n: 'texto', e: 'Qué hay que hacer', req: true, area: true, ancho: true },
    { n: 'vence_en', e: 'Para cuándo', tipo: 'date' },
    { n: 'prioridad', e: 'Prioridad', opciones: ['alta', 'media', 'baja'] },
    { n: 'estado', e: 'Estado', opciones: ['pendiente', 'completada', 'cancelada'] },
  ],
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
    { n: 'estado', e: 'Estado', opciones: ['pendiente', 'aprobada', 'rechazada'] },
    // Con qué lista de precios está armada. Cambiarla vuelve a ponerle precio
    // a los renglones que ya están, así que una oferta hecha a cliente final
    // pasa a constructor sin rehacerla. Va acá, en el formulario de edición,
    // porque es donde uno la busca: antes vivía al final de la tarjeta de
    // totales, después de toda la tabla de renglones, y no se encontraba.
    { n: 'nivel_precio', e: 'Precios que se usan',
      opciones: [['cliente', 'Cliente final'], ['constructor', 'Constructor'], ['canal', 'Canal']] },
    { n: 'moneda', e: 'Moneda' },
    { n: 'validez', e: 'Validez de la oferta' },
    // Si quedan vacíos se imprime el representante de los datos de la empresa.
    { n: 'representante', e: 'Representante de ventas (si no, el de ⚙ Datos de la empresa)' },
    { n: 'representante_telefono', e: 'Teléfono del representante' },
    { n: 'representante_email', e: 'Correo del representante', tipo: 'email' },
    { n: 'descripcion', e: 'Descripción', area: true, ancho: true },
    { n: 'condiciones', e: 'Condiciones comerciales (van impresas)', area: true, ancho: true },
  ],
  productos: [
    { n: 'descripcion', e: 'Descripción', req: true, area: true, ancho: true },
    // Cómo se llama en la jerga del negocio: Display, Switch EU, Switch US.
    // Es por lo que se filtra el catálogo cuando hay que mostrar algo puntual.
    { n: 'tipo', e: 'Tipo (Display, Switch EU, Switch US…)', lista: 'lista-tipos' },
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
    { n: 'notas', e: 'Notas / características adicionales (se ven en el catálogo público)', area: true, ancho: true },
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
    // Una opción puede ser el valor a secas, o el par [valor, cómo se lee]:
    // "cliente" a secas no dice mucho, "Cliente final" sí.
    const control = c.opciones
      ? `<select name="${c.n}">${c.opciones
          .map((o) => {
            const [v, e] = Array.isArray(o) ? o : [o, o];
            return `<option value="${escapar(v)}"${String(v) === String(valor) ? ' selected' : ''}>${escapar(e)}</option>`;
          }).join('')}</select>`
      : c.area
        ? `<textarea name="${c.n}" rows="${c.filas || 2}">${escapar(valor)}</textarea>`
        : `<input name="${c.n}" type="${c.tipo || 'text'}" value="${escapar(valor)}"${
            c.lista ? ` list="${c.lista}"` : ''}${c.req ? ' required' : ''} />`;
    return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
  }).join('');

  return `
    <div class="tarjeta" style="margin-bottom:26px">
      <form class="form-editar" id="form-editar" data-entidad="${entidad}" data-id="${fila.id}">
        ${campos}
        ${entidad === 'productos' ? `<datalist id="lista-tipos">${
          (estado.tiposConocidos || []).map((t) => `<option value="${escapar(t)}"></option>`).join('')}</datalist>` : ''}
        <div class="form-acciones">
          <button type="submit">Guardar cambios</button>
          <button type="button" class="secundario" data-accion="cancelar-edicion">Cancelar</button>
          ${/* Una oferta que se abrió por error o que quedó mal armada no tenía
                cómo salir de la lista, y quedaba estorbando para siempre. */ ''}
          ${entidad === 'cotizaciones'
            ? '<button type="button" class="peligro" data-accion="eliminar-cotizacion">Eliminar cotización</button>'
            : ''}
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
  // No se suma acá: "por cobrar" no es sólo los cobros sueltos de este
  // cliente, también lleva el saldo de sus cotizaciones aprobadas —igual que
  // en la pantalla de Cobros—, y eso ya viene calculado desde el servidor.
  const porCobrar = Number(c.por_cobrar) || 0;

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
/**
 * Un nombre corto para encabezar la ficha de un producto.
 *
 * En este catálogo la descripción es un párrafo entero —"Cámara Wi-Fi
 * Inteligente 2MP: vigila tu hogar o negocio…"—, no un nombre corto más una
 * ficha técnica aparte. Puesta entera como título (`<h2>`) se volvía una
 * pared de letra grande y en negrita que ocupaba toda la pantalla. Acá se
 * corta en el primer punto o dos puntos que aparezca en un largo razonable
 * —que suele ser justo donde termina el nombre y empieza la explicación—, o
 * si no hay ninguno, en el primer tramo que entre en un título. La
 * descripción completa se sigue mostrando, una sola vez, más abajo y a
 * tamaño de párrafo.
 */
function nombreCortoDeProducto(descripcion, limite = 70) {
  const texto = String(descripcion ?? '').trim();
  const corte = texto.search(/[:.]\s|\s[-—]\s/);
  if (corte > 0 && corte <= limite) return texto.slice(0, corte);
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, limite).trim()}…`;
}

/** Las fotos de más de un producto, ya el arreglo (llegan como JSON en texto). */
function fotosExtra(p) {
  try { return JSON.parse(p.fotos_extra || '[]'); } catch { return []; }
}

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
            <h2>${escapar(nombreCortoDeProducto(p.descripcion))}</h2>
            <p>${p.tipo ? `<span class="etiqueta-tipo">${escapar(p.tipo)}</span> ` : ''}${
              [p.categoria, p.referencia, p.marca].filter(Boolean).map(escapar).join(' · ') || 'Sin categoría'}
              ${p.maneja_inventario ? '<span class="pastilla propio">propio</span>' : '<span class="pastilla">catálogo proveedor</span>'}</p>
          </div>
        </div>
        <div class="ficha-acciones">
          ${p.ficha
            ? `<a class="mini destacado" href="${escapar(p.ficha)}" target="_blank" rel="noopener"
                  data-titulo="${escapar(p.ficha_nombre || 'Ficha técnica')}">📄 Ficha técnica</a>`
            : ''}
          <button class="mini destacado" data-accion="editar">Editar datos</button>
        </div>
      </div>

      <div class="ficha-cifras ${p.maneja_inventario ? 'cuatro' : 'tres'}">
        <div><span>Canal</span><strong>${p.precio_canal ? fmtDinero(p.precio_canal) : '—'}</strong></div>
        <div><span>Constructor</span><strong>${p.precio_constructor ? fmtDinero(p.precio_constructor) : '—'}</strong></div>
        <div><span>Cliente final</span><strong class="ok">${fmtDinero(p.precio_cliente)}</strong></div>
        ${p.maneja_inventario ? `<div><span>Stock</span><strong class="${stockBajo ? 'alerta' : 'ok'}">${p.stock}</strong></div>` : ''}
      </div>

      <p class="ficha-desc">${escapar(p.descripcion)}</p>
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

    ${bloque('Más fotos (para el catálogo público)', `
      <div class="tarjeta" data-id="${p.id}">
        <p class="ayuda" style="margin:0 0 12px">
          La foto de arriba es la principal; estas son las que se suman en la
          <b>tienda</b> para que el cliente vea el producto de cerca antes de pedirlo.
        </p>
        <div class="galeria-fotos">
          ${fotosExtra(p).map((url) => `
            <div class="galeria-foto">
              <img src="${escapar(url)}" alt="" loading="lazy" />
              <button class="mini peligro" data-accion="quitar-foto-galeria" data-id="${p.id}" data-url="${escapar(url)}">Quitar</button>
            </div>`).join('')}
          <button class="galeria-agregar" data-accion="agregar-foto-galeria" data-id="${p.id}">
            + Agregar<br>foto${fotosExtra(p).length ? '' : 's'}</button>
        </div>
      </div>`)}

    ${bloque('Ficha técnica', `
      <div class="tarjeta">
        <div class="adjunto">
          ${p.ficha ? `
            <div class="adjunto-icono">PDF</div>
            <div class="adjunto-texto">
              <strong>${escapar(p.ficha_nombre || 'ficha.pdf')}</strong>
              <span>La hoja de datos del fabricante, para consultarla o mandársela al cliente.</span>
            </div>
            <div class="acciones-fila">
              <a class="mini destacado" href="${escapar(p.ficha)}" target="_blank" rel="noopener"
                 data-titulo="${escapar(p.ficha_nombre || p.descripcion)}">Ver</a>
              <button class="mini" data-accion="subir-ficha" data-id="${p.id}">Reemplazar</button>
              <button class="mini peligro" data-accion="quitar-ficha" data-id="${p.id}">Quitar</button>
            </div>`
          : `
            <div class="adjunto-texto">
              <strong>Sin ficha técnica</strong>
              <span>Subí el PDF del fabricante y queda pegado a este producto.</span>
            </div>
            <div class="acciones-fila">
              <button class="mini destacado" data-accion="subir-ficha" data-id="${p.id}">Subir la ficha</button>
            </div>`}
        </div>
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

/* ─────────── Tema claro / oscuro ─────────── */

// La elección vive en este dispositivo, no en la base: es normal querer la
// aplicación oscura en el celular y clara en el computador, y guardarla en el
// servidor obligaría a que fuera igual en los dos.
const TEMAS = [
  ['auto', 'Automático', 'Sigue al celular o al computador'],
  ['claro', 'Claro', 'Siempre en claro'],
  ['oscuro', 'Oscuro', 'Siempre en oscuro'],
];

const temaElegido = () => {
  try { return localStorage.getItem('ari_tema') || 'auto'; } catch { return 'auto'; }
};

const oscuroDelSistema = () =>
  !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Escribe el tema en el <html>, que es lo que mira el CSS. */
function aplicarTema(elegido = temaElegido()) {
  document.documentElement.dataset.tema =
    elegido === 'auto' ? (oscuroDelSistema() ? 'oscuro' : 'claro') : elegido;
  // La barra de estado del celular también se pinta, o queda un borde del
  // color viejo arriba de todo.
  const color = getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim();
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute('content', color);
}

function guardarTema(elegido) {
  try { localStorage.setItem('ari_tema', elegido); } catch { /* sin espacio: al menos se aplica ahora */ }
  aplicarTema(elegido);
}

// Con "automático", seguir al sistema cuando cambia solo (por ejemplo al
// anochecer, si el teléfono lo tiene programado).
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (temaElegido() === 'auto') aplicarTema('auto');
  });
}

/* ─────────── Tienda: quién puede entrar al catálogo público ─────────── */

const ETIQUETA_NIVEL = { canal: 'Precio canal', constructor: 'Precio constructor', cliente: 'Precio cliente final' };

function vistaTienda(filas) {
  const filtro = (valor, rotulo) => `<button class="chip${estado.filtroPortal === valor ? ' activo' : ''}"
    data-accion="filtrar-portal" data-estado="${valor}">${rotulo}</button>`;

  const opcionesNivel = (actual) => ['canal', 'constructor', 'cliente']
    .map((n) => `<option value="${n}"${actual === n ? ' selected' : ''}>${ETIQUETA_NIVEL[n]}</option>`).join('');

  const filas_html = filas.length ? filas.map((u) => `
    <div class="tarjeta portal-fila">
      <div class="portal-datos">
        <strong>${escapar(u.nombre)}</strong>${u.empresa ? ` <span class="portal-empresa">· ${escapar(u.empresa)}</span>` : ''}
        <span class="portal-contacto">${escapar(u.email)}${u.telefono ? ` · ${escapar(u.telefono)}` : ''}</span>
        <span class="portal-fecha">Pidió acceso el ${escapar(fmtFecha(u.creado_en.slice(0, 10)))}</span>
        ${u.nivel_precio ? `<span class="pastilla aprobado">ve el ${escapar(ETIQUETA_NIVEL[u.nivel_precio] || u.nivel_precio).toLowerCase()}</span>` : ''}
        ${u.recuperar_clave_en ? `<span class="pastilla portal-recupera">🔑 Pidió recuperar su clave el ${escapar(fmtFecha(u.recuperar_clave_en.slice(0, 10)))}</span>` : ''}
      </div>

      <form class="portal-aprobar" data-id="${u.id}">
        <select name="nivel_precio" required>
          <option value="">Con qué precio lo dejo ver…</option>
          ${opcionesNivel(u.nivel_precio)}
        </select>
        <div class="portal-botones">
          <button type="submit" class="mini destacado">${u.estado === 'aprobado' ? 'Guardar nivel' : 'Aprobar'}</button>
          ${u.estado !== 'rechazado'
            ? `<button type="button" class="mini peligro" data-accion="rechazar-portal" data-id="${u.id}">Rechazar</button>` : ''}
          <button type="button" class="mini" data-accion="alternar-clave-portal" data-id="${u.id}">
            ${estado.portalClaveAbierta === u.id ? 'Cancelar' : 'Restablecer contraseña'}
          </button>
        </div>
      </form>

      ${estado.portalClaveAbierta === u.id ? `
        <form class="portal-clave-form" data-id="${u.id}">
          <input type="text" name="clave" placeholder="Contraseña nueva (mínimo 6 caracteres)"
                 minlength="6" required autocomplete="off" />
          <div class="portal-botones">
            <button type="button" class="mini" data-accion="generar-clave-portal" data-id="${u.id}">Generar una</button>
            <button type="submit" class="mini destacado">Guardar contraseña</button>
          </div>
        </form>` : ''}
    </div>`).join('') : `<div class="tarjeta"><div class="vacio">
      <strong>Nada por acá</strong>${
        estado.filtroPortal === 'pendiente' ? 'Nadie está esperando aprobación ahora mismo.' : 'No hay registros en este estado.'}
    </div></div>`;

  return `
    <p class="ayuda" style="margin:0 0 16px">
      Quien entra a <code>/tienda.html</code> se registra y queda <b>pendiente</b> hasta que
      lo aprobás acá, con el precio que le corresponde —canal, constructor o cliente final—.
      Sólo entonces puede mirar el catálogo y armar un pedido; el pedido llega como una
      cotización más, marcada «Desde el catálogo». El nivel y el estado de cualquiera se
      pueden cambiar cuando quieras, no sólo la primera vez; y si alguien se queda sin poder
      entrar, acá mismo se le pone una contraseña nueva —no hace falta la vieja—.
    </p>
    <div class="barra-productos">
      ${filtro('pendiente', 'Pendientes')}
      ${filtro('aprobado', 'Aprobados')}
      ${filtro('rechazado', 'Rechazados')}
      <a class="mini" href="/tienda.html" target="_blank" rel="noopener">Ver la tienda ↗</a>
    </div>
    <div class="portal-lista">${filas_html}</div>`;
}

function vistaAjustes(aj) {
  const campos = CAMPOS_AJUSTES.map((c) => {
    const valor = aj[c.n] ?? '';
    const control = c.area
      ? `<textarea name="${c.n}" rows="4">${escapar(valor)}</textarea>`
      : `<input name="${c.n}" type="${c.tipo || 'text'}" value="${escapar(valor)}" />`;
    return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
  }).join('');

  const actual = temaElegido();
  const opcionesTema = TEMAS.map(([clave, nombre, ayuda]) => `
    <button type="button" class="opcion-tema${clave === actual ? ' elegida' : ''}"
            data-accion="tema" data-tema="${clave}">
      <span class="muestra muestra-${clave}"></span>
      <strong>${nombre}</strong>
      <small>${ayuda}</small>
    </button>`).join('');

  return `
    ${bloque('Apariencia', `
      <div class="tarjeta">
        <p class="ayuda" style="margin:0 0 12px">
          Cómo se ve la aplicación. Queda guardado en este dispositivo, así que
          podés tenerla oscura en el celular y clara en el computador.
        </p>
        <div class="temas">${opcionesTema}</div>
      </div>`)}

    <p class="ayuda" style="margin:22px 0 16px">
      Lo de abajo encabeza y cierra las cotizaciones que imprimís. Se usa como
      punto de partida: cada cotización puede llevar su propia validez, sus
      propias condiciones y su propio representante si hace falta.
    </p>

    ${bloque('Logo de la empresa', `
      <div class="tarjeta">
        <div class="logo-ajuste">
          <div class="logo-vista">${aj.logo
            ? `<img src="${escapar(aj.logo)}" alt="Logo" />`
            : '<span class="foto-vacia">Sin logo</span>'}</div>
          <div class="logo-texto">
            <p class="ayuda" style="margin:0 0 10px">
              Va arriba a la izquierda de cada cotización impresa. Sirve un PNG con
              fondo transparente; se guarda a 600 píxeles de ancho como máximo.
            </p>
            <button class="mini destacado" data-accion="subir-logo">${aj.logo ? 'Cambiar logo' : 'Subir logo'}</button>
            ${aj.logo ? '<button class="mini peligro" data-accion="quitar-logo">Quitar</button>' : ''}
          </div>
        </div>
      </div>`)}

    ${bloque('Datos que van impresos', `
      <div class="tarjeta">
        <form class="form-editar" id="form-ajustes">
          ${campos}
          <div class="form-acciones"><button type="submit">Guardar</button></div>
        </form>
      </div>`)}

    ${bloque('Limpieza', `
      <div class="tarjeta">
        <p class="ayuda" style="margin:0 0 10px">
          Hasta hace poco, cada entrega agendada desde la web daba de alta un
          <b>cliente</b> con el nombre del residente. Ya no lo hace —los datos
          del residente quedan dentro de la cita, que es donde sirven—, pero
          los que se crearon antes siguen en la lista.
        </p>
        <p class="ayuda" style="margin:0 0 12px">
          Esto los saca. Sólo toca a los que no tienen nada más: ni
          cotizaciones, ni cobros, ni pendientes, ni citas cargadas a mano.
          <b>Las entregas no se pierden</b>: siguen en la agenda con el nombre,
          el teléfono y el correo del residente.
        </p>
        <button class="mini destacado" data-accion="limpiar-clientes-formulario">
          Revisar y quitar</button>
      </div>`)}

    ${/* En el computador esto se ve abajo a la izquierda; en el celular no hay
          barra lateral, y era el único lugar donde decía qué versión está
          corriendo. Después de subir una actualización es el dato que dice si
          el servidor la tomó o se quedó con la anterior. */ ''}
    <p class="ayuda" style="margin:22px 0 0; text-align:center">
      Versión <b>${escapar(VERSION.compilado || '—')}</b>${
        VERSION.interfaz ? ` · archivos ${escapar(VERSION.interfaz)}` : ''}${
        VERSION.modelo ? ` · modelo ${escapar(VERSION.modelo)}` : ''}
    </p>`;
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
        <label><span>Tipo (de la pestaña)</span><input type="text" class="import-tipo" value="${escapar(hoja.nombre)}" /></label>
        <label class="check"><input type="checkbox" class="import-inventario" /> Son productos propios de Clic Control (llevar inventario)</label>
        <label class="check"><input type="checkbox" class="import-descontinuar" /> Descontinuar los que ya no vengan en la lista</label>
        ${hoja.conImagenes ? `<label class="check"><input type="checkbox" class="import-fotos" checked /> Traer las fotos del Excel (${hoja.conImagenes})</label>` : ''}
        <button class="mini destacado" data-accion="revisar-hoja" data-hoja="${indice}">Ver qué cambiaría (${filasValidas} productos)</button>
        <span class="import-resultado"></span>
      </div>
      <div class="import-informe"></div>
      <p class="ayuda">Elegí en cada columna qué es (o "ignorar"). Se muestran las primeras filas como ejemplo${
        hayFotos ? ', con la foto que trae cada una' : ''}.</p>
      ${hoja.imagenesSinUbicar ? `<p class="ayuda aviso-fotos">⚠ ${hoja.imagenesSinUbicar} ${
        hoja.imagenesSinUbicar === 1 ? 'imagen del archivo no está anclada' : 'imágenes del archivo no están ancladas'
      } a ninguna fila, así que ${hoja.imagenesSinUbicar === 1 ? 'va' : 'van'} a quedar sin producto. En Excel, seleccioná
      la foto → clic derecho → «Tamaño y propiedades» → «Mover y cambiar de tamaño con las celdas», o subila a mano desde
      la ficha del producto.</p>` : ''}
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
    ${inf.sinFoto?.length
      ? `<div class="informe-grupo ausente" style="flex-basis:100%">
          <h4>Quedaron sin foto · ${inf.sinFoto.length}</h4>
          <ul>${inf.sinFoto.slice(0, 8).map((f) => `<li>${nombre(f)}</li>`).join('')}
          ${inf.sinFoto.length > 8 ? `<li class="mas">…y ${inf.sinFoto.length - 8} más</li>` : ''}</ul>
          <p class="ayuda" style="margin:6px 0 0">En el Excel no había una foto anclada a esa fila. Abrí cada
          producto y subila desde su ficha, o buscala en la web desde ahí mismo.</p>
        </div>`
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

/* ─────────── Listas de precios en línea ─────────── */

/**
 * Las hojas conectadas: en vez de exportar el Excel y subirlo, la lista se
 * edita donde ya está y el sistema la va a buscar.
 */
function vistaListas(listas, prueba) {
  const tarjetas = listas.length
    ? listas.map((l) => `
      <div class="tarjeta lista-online" data-id="${l.id}">
        <div class="lista-cab">
          <div>
            <h3>${escapar(l.nombre)}</h3>
            <p>${l.categoria ? `Categoría <b>${escapar(l.categoria)}</b> · ` : ''}${
              l.ultima
                ? `última vez ${escapar(fmtFecha(String(l.ultima).slice(0, 10)))}${
                    l.ultimoInforme ? ` · ${l.ultimoInforme.nuevos} nuevos, ${l.ultimoInforme.actualizados} actualizados` : ''}`
                : 'todavía no se ha traído'}</p>
          </div>
          <div class="acciones-fila">
            <button class="mini" data-accion="revisar-lista" data-id="${l.id}">Ver qué cambiaría</button>
            <button class="mini destacado" data-accion="sincronizar-lista" data-id="${l.id}">Traer ahora</button>
            <button class="mini peligro" data-accion="borrar-lista" data-id="${l.id}">Quitar</button>
          </div>
        </div>
        <p class="lista-url" title="${escapar(l.url)}">${escapar(truncar(l.url, 90))}</p>
        <label class="check"><input type="checkbox" class="lista-descontinuar" data-id="${l.id}"${
          l.descontinuarAusentes ? ' checked' : ''} /> Descontinuar los que dejen de venir en la hoja</label>
        <div class="lista-informe"></div>
      </div>`).join('')
    : '<div class="tarjeta"><div class="vacio"><strong>Ninguna lista conectada</strong>Pegá abajo la dirección de tu hoja y probala.</div></div>';

  const vista = prueba ? `
    <div class="tarjeta">
      <p class="ayuda" style="padding:16px 18px 0;margin:0">
        Llegaron <b>${prueba.totalFilas} filas</b> (${escapar(prueba.formato.toUpperCase())}${
          prueba.hoja ? ` · hoja «${escapar(prueba.hoja)}»` : ''}) y reconocí <b>${prueba.productos} productos</b>.
        Revisá que las columnas estén bien antes de conectarla.
      </p>
      <form class="form-editar" id="form-conectar-lista">
        <label><span>Nombre para reconocerla</span>
          <input name="nombre" type="text" required value="${escapar(prueba.hoja || 'Lista oficial')}" /></label>
        <label><span>Categoría de los productos</span>
          <input name="categoria" type="text" value="${escapar(prueba.hoja || '')}" /></label>
        <label><span>Tipo (para agrupar y filtrar)</span>
          <input name="tipo" type="text" value="${escapar(prueba.hoja || '')}" /></label>
        <label class="ancho check"><input name="manejaInventario" type="checkbox" value="1" />
          Son productos propios de Clic Control (llevar inventario)</label>
        <div class="form-acciones">
          <button type="submit">Conectar esta lista</button>
          <button type="button" class="mini" data-accion="cancelar-prueba">Cancelar</button>
        </div>
      </form>
      <div class="tabla-envoltura"><table class="tabla-muestra">
        <tbody>${prueba.muestra.map((f, i) => `<tr class="${i >= prueba.mapeo.filaInicioDatos ? 'es-dato' : 'es-encabezado'}">${
          f.map((c) => `<td>${escapar(truncar(c, 28))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="ayuda" style="padding:0 18px 16px;margin:0">${
        Object.entries(prueba.mapeo.columnas).filter(([, v]) => v !== null)
          .map(([k, v]) => `<b>${escapar(ENCABEZADOS[k] || k)}</b> = columna ${v + 1}`).join(' · ') || 'No reconocí ninguna columna.'}</p>
    </div>` : '';

  return `
    <button class="volver" data-accion="cerrar-listas">← Productos</button>
    <p class="ayuda" style="margin-bottom:16px">
      Conectá la hoja donde ya llevás la lista de precios y traela cuando quieras,
      sin exportar ni subir nada. Sirve Google Sheets, OneDrive o Dropbox: la hoja
      tiene que estar compartida por enlace o publicada.
      Lo que cargues acá a mano —fotos, notas, inventario— no se pisa nunca.
    </p>

    ${bloque('Conectar una hoja', `
      <div class="tarjeta">
        <form class="form-abono" id="form-probar-lista">
          <label class="ancho"><span>Dirección de la hoja</span>
            <input name="url" type="url" required
                   placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
          <button type="submit">Probar</button>
        </form>
      </div>`)}
    ${vista}
    ${bloque(`Listas conectadas · ${listas.length}`, tarjetas)}`;
}

/* ─────────── Vistas ─────────── */

async function pintar() {
  const contenedor = $('#contenido');
  const v = estado.vista;
  anotarDondeEstoy();

  // Revisión de un Excel recién analizado, antes de importarlo
  if (estado.importacion) {
    $('#titulo-vista').textContent = 'Importar lista de precios';
    contenedor.innerHTML = vistaImportacion();
    return;
  }

  // Hojas conectadas en línea
  if (estado.viendoListas) {
    $('#titulo-vista').textContent = 'Listas de precios en línea';
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const { listas } = await api('/listas');
      contenedor.innerHTML = vistaListas(listas, estado.pruebaLista);
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Ficha de un producto del catálogo
  if (estado.productoAbierto) {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const id = estado.productoAbierto;
      const p = await api(`/productos/${id}`);
      const movimientos = p.maneja_inventario ? (await api(`/movimientos_stock?producto_id=${id}`)).filas : [];
      $('#titulo-vista').textContent = nombreCortoDeProducto(p.descripcion);
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
      // El buscador del catálogo está abajo del todo, y enfocarlo arrastraba
      // la pantalla hasta él: la cotización se abría mostrando el final y
      // había que subir a mano cada vez. En el computador el foco sirve —se
      // empieza a escribir el producto de una— pero sin mover el scroll. En
      // el celular no se enfoca: además de correr la pantalla, levantaba el
      // teclado apenas se entraba a mirar una oferta.
      if (!esCelular()) $('#buscar-catalogo')?.focus({ preventScroll: true });
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
      + bloque('Agenda de hoy', lineaTiempo(r.citasHoy),
        { clave: 'hoy', cuantos: r.citasHoy.length })
      + (r.vencidos.length
        ? bloque('⚠ Vencidos', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'], r.vencidos),
          { clave: 'vencidos', cuantos: r.vencidos.length })
        : '')
      + (r.cobrosVencidos.length
        ? bloque('⚠ Cobros vencidos', tabla('cobros', ['vence_en', 'concepto', 'cliente', 'monto'], r.cobrosVencidos),
          { clave: 'cobros-vencidos', cuantos: r.cobrosVencidos.length })
        : '')
      + bloque('Pendientes por hacer', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'],
        r.pendientesHoy, { vacio: 'Nada pendiente. Pedíselo a Ari: «recordame llamar a Ruth el jueves».' }),
      { clave: 'pendientes', cuantos: r.pendientesHoy.length })
      + bloque('Próximas citas', tabla('citas', ['inicio', 'titulo', 'cliente', 'lugar'], r.proximasCitas),
        { clave: 'proximas', cuantos: r.proximasCitas.length });
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
      if (estado.tipoProducto) filtros.set('tipo', estado.tipoProducto);
      filtros.set('limite', '300');
      const [{ filas }, { filas: todos }, { tipos, sinTipo }] = await Promise.all([
        api(`/productos?${filtros}`),
        api('/productos?incluir_inactivos=1&limite=300'),
        api('/productos/tipos'),
      ]);

      // Cuántos hay descontinuados, para no ofrecer un filtro que no sirve.
      const descontinuados = todos.filter((p) => !p.activo).length;
      estado.tiposConocidos = tipos.map((t) => t.tipo);

      const barra = `<div class="barra-productos">
        <input type="search" id="buscar-productos" placeholder="Buscar por referencia, descripción, tipo…" value="${escapar(estado.buscarProductos)}" />
        <button class="mini" data-accion="importar-lista">Importar lista de precios</button>
        <button class="mini" data-accion="importar-fichas">Importar fichas técnicas</button>
        <button class="mini" data-accion="ver-listas">Listas en línea</button>
        <button class="mini" data-accion="alternar-nuevo-producto">${estado.nuevoProducto ? 'Cancelar' : '+ Agregar producto'}</button>
        ${descontinuados ? `<button class="mini${estado.verDescontinuados ? ' destacado' : ''}" data-accion="alternar-descontinuados">${
          estado.verDescontinuados ? 'Ocultar descontinuados' : `Ver descontinuados (${descontinuados})`}</button>` : ''}
        <span class="gestor-fotos"></span>
      </div>`;

      // Los tipos que ya se usaron, como filtros de un toque: es lo que sirve
      // cuando hay que mostrarle algo puntual a un cliente en el momento.
      const filtrosTipo = (tipos.length || sinTipo?.n) ? `<div class="filtros-tipo">
        ${tipos.length ? `<button class="chip${estado.tipoProducto ? '' : ' activo'}" data-accion="filtrar-tipo" data-tipo="">Todos</button>` : ''}
        ${tipos.map((t) => `<button class="chip${estado.tipoProducto === t.tipo ? ' activo' : ''}"
          data-accion="filtrar-tipo" data-tipo="${escapar(t.tipo)}">${escapar(t.tipo)} <em>${t.n}</em></button>`).join('')}
        ${sinTipo?.conCategoria
          ? `<button class="chip agrupar" data-accion="agrupar-por-categoria"
               title="Les pone como tipo el nombre de la pestaña con la que se importaron">↳ Agrupar ${sinTipo.conCategoria} sin tipo</button>`
          : ''}
      </div>` : '';

      contenedor.innerHTML = barra
        + filtrosTipo
        + avisoCotizacionEnCurso()
        + (estado.nuevoProducto ? formularioNuevoProducto() : '')
        + (estado.verDescontinuados
          ? '<p class="ayuda">Los descontinuados son los que dejaron de venir en la lista del proveedor. Siguen guardados con su historial; para volver a usarlos, abrilos y marcá «Disponible en el catálogo».</p>'
          : '')
        + tabla('productos', ['foto', 'tipo', 'referencia', 'descripcion', 'stock', 'precio_canal', 'precio_constructor', 'precio_cliente'], filas,
          {
            vacio: 'Todavía no hay productos en el catálogo. Importá una lista de precios o agregá uno a mano.',
            debajoDe: (p) => (estado.cotizandoProducto === p.id ? formularioCotizarProducto(p) : ''),
          });
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

  // Quién pidió entrar al catálogo, para aprobarlo o rechazarlo. Nadie ve un
  // precio hasta que este paso pasa por acá. Va ANTES del mapa de abajo a
  // propósito: 'tienda' no tiene entrada ahí, y el guardia que sigue
  // ("Vista desconocida") corta cualquier vista que no esté en ese mapa.
  if (v === 'tienda') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const { filas } = await api(`/portal/usuarios?estado=${estado.filtroPortal}`);
      contenedor.innerHTML = vistaTienda(filas);
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  const CONSULTAS = {
    agenda: { entidad: 'citas', filtros: 'rango=proximos', columnas: ['inicio', 'titulo', 'cliente', 'lugar', 'notas', 'estado'] },
    clientes: { entidad: 'clientes', filtros: '', columnas: ['nombre', 'telefono', 'email', 'n_cotizaciones', 'cotizado', 'abonado', 'saldo'] },
    cotizaciones: { entidad: 'cotizaciones', filtros: '', columnas: ['creado_en', 'titulo', 'cliente', 'monto', 'abonado', 'saldo', 'estado'] },
    cobros: { entidad: 'cobros', filtros: '', columnas: ['vence_en', 'concepto', 'cliente', 'monto', 'estado'] },
    recordatorios: { entidad: 'recordatorios', filtros: '', columnas: ['vence_en', 'texto', 'cliente', 'prioridad', 'estado'] },
  }[v];

  if (!CONSULTAS) { contenedor.innerHTML = '<div class="vacio">Vista desconocida.</div>'; return; }

  // La agenda va como fichas: el detalle de una reunión no entra en una celda.
  if (v === 'agenda') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const { filas } = await api('/citas?rango=proximos&limite=100');
      contenedor.innerHTML = vistaAgenda(filas);
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Los pendientes: marcar uno como listo lo saca de la lista, que es de lo
  // que sirve una lista de pendientes. Los hechos quedan guardados y se pueden
  // ver con el botón, pero no estorban.
  if (v === 'recordatorios') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const [{ filas: pendientes }, { filas: todos }] = await Promise.all([
        api('/recordatorios?estado=pendiente&limite=200'),
        api('/recordatorios?limite=200'),
      ]);
      const hechos = todos.filter((r) => r.estado !== 'pendiente');
      const lista = estado.verHechos ? hechos : pendientes;
      const editando = estado.recordatorioEditando
        ? todos.find((r) => r.id === estado.recordatorioEditando)
        : null;

      contenedor.innerHTML = `<div class="barra-productos">
          <button class="mini${estado.verHechos ? '' : ' destacado'}" data-accion="ver-pendientes">Pendientes (${pendientes.length})</button>
          ${hechos.length
            ? `<button class="mini${estado.verHechos ? ' destacado' : ''}" data-accion="ver-hechos">Ya hechos (${hechos.length})</button>`
            : ''}
        </div>`
        + (editando ? formularioEdicion('recordatorios', editando) : '')
        + tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'], lista,
          { vacio: estado.verHechos ? 'Todavía no marcaste ninguno como hecho.' : '¡Nada pendiente! Pedíselo a Ari: «recordame llamar a Ruth el jueves».' });
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Las cotizaciones, en renglones cortos y con buscador: con muchas ofertas
  // una tabla ancha se vuelve imposible de recorrer.
  if (v === 'cotizaciones') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const f = new URLSearchParams({ limite: '200' });
      if (estado.buscarCotizaciones) f.set('texto', estado.buscarCotizaciones);
      // Mirando un cliente puntual se ven todas, abiertas y cerradas: para
      // hacerle seguimiento hace falta el historial completo, no la mitad.
      if (estado.clienteCotizaciones) {
        f.set('cliente_id', estado.clienteCotizaciones.id);
        f.set('incluir_archivadas', '1');
      } else if (estado.verHistorialCot) {
        f.set('solo_archivadas', '1');
      }
      if (estado.filtroEstadoCot) f.set('estado', estado.filtroEstadoCot);
      const [{ filas }, { filas: cerradas }] = await Promise.all([
        api(`/cotizaciones?${f}`),
        api('/cotizaciones?solo_archivadas=1&limite=300'),
      ]);
      contenedor.innerHTML = barraCotizaciones(cerradas.length) + listaCotizaciones(filas);
      $('#titulo-vista').textContent = estado.clienteCotizaciones
        ? `Cotizaciones · ${estado.clienteCotizaciones.nombre}`
        : 'Cotizaciones';
      const buscador = $('#buscar-cotizaciones');
      if (buscador) {
        buscador.focus();
        buscador.setSelectionRange(buscador.value.length, buscador.value.length);
      }
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  // Los cobros se muestran junto al saldo de las cotizaciones aprobadas: una
  // oferta aprobada es una venta cerrada, y lo que falte de ella es cobranza.
  if (v === 'cobros') {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const [{ filas: pendientes, total }, { filas: todos }] = await Promise.all([
        api('/cobros/pendientes'),
        api('/cobros'),
      ]);
      contenedor.innerHTML = vistaCobros(pendientes, total, todos.filter((c) => c.estado !== 'pendiente'));
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    const { filas } = await api(`/${CONSULTAS.entidad}?${CONSULTAS.filtros}`);
    contenedor.innerHTML = (v === 'cotizaciones' ? barraCotizaciones() : '')
      + (v === 'clientes' ? barraClientes(filas) : '')
      + tabla(CONSULTAS.entidad, CONSULTAS.columnas, filas);
    if (estado.nuevoCliente) $('#form-nuevo-cliente input[name="nombre"]')?.focus();
  } catch (e) {
    contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
  }
}

/* ── Armar la cotización desde el catálogo ──
   Dictar sirve para uno o dos renglones sueltos; para veinte es más rápido
   ir tocando el catálogo. Con una cotización abierta, cada producto muestra
   un ➕ que abre este renglón: cantidad, el precio que le va a quedar según
   el nivel de esa cotización, y listo. La lista no se mueve, así se puede
   seguir cargando de corrido. */

/** Qué precio del catálogo le toca a esta cotización. */
const PRECIO_DEL_NIVEL = { canal: 'precio_canal', constructor: 'precio_constructor', cliente: 'precio_cliente' };

/**
 * Los botones flotantes del celular estorban mientras se pone la cantidad:
 * el micrófono queda parado justo encima de «Agregar». Con el renglón
 * abierto se esconden, igual que cuando se abre la conversación.
 */
const sincronizarFlotantes = () =>
  $('.fabs')?.classList.toggle('oculto', Boolean(estado.cotizandoProducto));

/**
 * Repinta sin perder de vista dónde estabas.
 *
 * `pintar()` rehace el contenido entero, y la lista vuelve al principio. Con
 * un catálogo de cincuenta productos eso obligaba a bajar de nuevo a buscar
 * el que se acababa de tocar: cargar una cotización de veinte renglones se
 * volvía media hora de andar bajando.
 *
 * Se guarda la posición, se repinta, y se vuelve. Después se lleva a la vista
 * el renglón que quedó abierto —sólo si hace falta—, porque al abrirse crece
 * unos píxeles y en el borde de la pantalla podría quedar cortado.
 */
async function pintarSinMoverse() {
  const caja = $('#contenido');
  const donde = caja?.scrollTop ?? 0;
  await pintar();
  if (caja) caja.scrollTop = donde;
  $('.fila-editor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function formularioCotizarProducto(p) {
  const q = estado.resumen?.enCurso;
  if (!q) return '';
  const nivel = q.nivel_precio || 'cliente';
  const precio = Number(p[PRECIO_DEL_NIVEL[nivel] ?? 'precio_cliente']) || 0;

  return `<form class="cotizar-producto" data-id="${p.id}">
    <label><span>Cantidad</span>
      ${/* step="any" y no step="1": con min="0.01" el navegador daría por
            inválido cualquier entero —los válidos serían 0.01, 1.01, 2.01…—
            y bloquearía el envío sin decir nada. Además las cantidades no
            siempre son enteras: hay metros de cable y horas de obra. */ ''}
      <input name="cantidad" type="number" inputmode="decimal" min="0.01" step="any" value="1"
             autofocus aria-label="Cantidad" /></label>
    <div class="cotizar-precio">
      <b>${fmtDinero(precio, q.moneda)}</b>
      <span>c/u · precio ${escapar(nivel)}</span>
    </div>
    <div class="cotizar-botones">
      <button type="submit" class="mini destacado">Agregar a la cotización</button>
      <button type="button" class="mini" data-accion="cancelar-cotizar">Cancelar</button>
    </div>
    ${precio <= 0
      ? '<p class="ayuda">Este producto no tiene precio para ese nivel: va a entrar en $ 0 y hay que ponérselo a mano en la cotización.</p>'
      : ''}
  </form>`;
}

/** El aviso de arriba del catálogo: qué se está armando y cómo agregarle. */
function avisoCotizacionEnCurso() {
  const q = estado.resumen?.enCurso;
  if (!q) return '';
  return `<p class="ayuda aviso-armando">
    Estás armando <b>${escapar(q.titulo)}</b>${q.cliente ? ` para <b class="es-cliente">${escapar(q.cliente)}</b>` : ''}.
    Tocá <b>➕ Cotizar</b> en cualquier producto para agregarlo sin dictar nada.
  </p>`;
}

/** Alta manual de un cliente, y el total de lo que mueve la cartera. */
function barraClientes(filas) {
  const suma = (campo) => filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);

  const formulario = estado.nuevoCliente ? bloque('Agregar cliente', `
    <div class="tarjeta">
      <form class="form-editar" id="form-nuevo-cliente">
        ${CAMPOS.clientes.map((c) => {
          const control = c.area
            ? `<textarea name="${c.n}" rows="2"></textarea>`
            : `<input name="${c.n}" type="${c.tipo || 'text'}"${c.req ? ' required' : ''} />`;
          return `<label class="${c.ancho ? 'ancho' : ''}"><span>${c.e}</span>${control}</label>`;
        }).join('')}
        <div class="form-acciones"><button type="submit">Guardar cliente</button></div>
      </form>
    </div>`) : '';

  return `<div class="barra-productos">
      <button class="mini destacado" data-accion="alternar-nuevo-cliente">${
        estado.nuevoCliente ? 'Cancelar' : '+ Agregar cliente'}</button>
    </div>
    ${formulario}
    ${filas.length ? `<div class="metricas">
      ${metrica(fmtDinero(suma('cotizado')), 'Total cotizado', 'dinero')}
      ${metrica(fmtDinero(suma('abonado')), 'Total abonado', 'dinero')}
      ${metrica(fmtDinero(suma('saldo')), 'Saldo total', 'dinero')}
      ${metrica(fmtDinero(suma('por_cobrar')), 'Por cobrar', 'dinero')}
    </div>
    <p class="ayuda" style="margin:2px 0 16px">
      <b>Saldo total</b> es lo que falta de las cotizaciones —el precio menos lo
      abonado—. <b>Por cobrar</b> es lo registrado aparte en Cobros, que suele
      salir de una oferta ya aprobada: por eso los dos números no tienen por qué
      coincidir.
    </p>` : ''}`;
}

/** Lo que está por cobrar, venga de un cobro suelto o de una oferta aprobada. */
function vistaCobros(pendientes, total, cerrados) {
  const hoyStr = new Date().toLocaleDateString('sv-SE');

  const filas = pendientes.map((c) => {
    const vencido = c.vence_en && String(c.vence_en).slice(0, 10) < hoyStr;
    return `<tr>
      <td data-rotulo="Vence" class="${vencido ? 'vencido' : ''}">${
        c.vence_en ? escapar(fmtFecha(String(c.vence_en).slice(0, 10))) : '—'}</td>
      <td data-rotulo="Concepto" class="principal-col">
        ${escapar(c.concepto || 'Cobro')}
        ${c.origen === 'cotizacion'
          ? `<em class="de-cotizacion">Cotización #${c.id} aprobada${
              c.abonado ? ` · abonado ${fmtDinero(c.abonado, c.moneda)} de ${fmtDinero(c.total, c.moneda)}` : ''}</em>`
          : ''}
      </td>
      <td data-rotulo="Cliente">${c.cliente ? `<span class="es-cliente">${escapar(c.cliente)}</span>` : '—'}</td>
      <td data-rotulo="Falta" class="num">${fmtDinero(c.monto, c.moneda)}</td>
      <td class="num acciones"><div class="acciones-fila">
        ${c.origen === 'cotizacion' && c.archivo
          ? `<a class="mini pdf" href="${escapar(c.archivo)}" target="_blank" rel="noopener"
                data-titulo="${escapar(c.concepto || 'Cotización')}" title="Abrir la oferta en PDF">📄 PDF</a>`
          : ''}
        ${c.origen === 'cotizacion'
          ? `<button class="mini destacado" data-accion="abrir-cotizacion" data-id="${c.id}">Abrir y abonar</button>`
          : `<button class="mini" data-accion="estado" data-entidad="cobros" data-id="${c.id}" data-estado="pagado">Pagado</button>
             <button class="mini peligro" data-accion="borrar" data-entidad="cobros" data-id="${c.id}">Borrar</button>`}
      </div></td>
    </tr>`;
  }).join('');

  const lista = pendientes.length
    ? `<div class="tarjeta"><div class="tabla-envoltura"><table>
        <thead><tr><th>Vence</th><th>Concepto</th><th>Cliente</th><th class="num">Falta</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div></div>`
    : `<div class="tarjeta"><div class="vacio">
        <strong>Nada por cobrar</strong>Las cotizaciones que apruebes aparecen acá con su saldo, sin tener que cargarlas de nuevo.
      </div></div>`;

  return `
    <div class="metricas">
      ${metrica(fmtDinero(total), 'Total por cobrar', 'dinero')}
      ${metrica(pendientes.filter((c) => c.origen === 'cotizacion').length, 'Cotizaciones aprobadas')}
      ${metrica(pendientes.filter((c) => c.origen === 'cobro').length, 'Cobros sueltos')}
    </div>
    ${bloque(`Por cobrar · ${pendientes.length}`, lista)}
    ${cerrados.length ? bloque('Ya cobrados', tabla('cobros', ['vence_en', 'concepto', 'cliente', 'monto', 'estado'], cerrados, { compacta: true })) : ''}`;
}

/**
 * El atajo para las ofertas que se arman por fuera: se sube el PDF ya hecho y
 * queda registrada, sin pasar por el armado renglón por renglón.
 */
/* El lápiz y la caneca del cajón que asoma al deslizar un renglón. Van
   dibujados acá y no como archivos aparte para no pedirle dos imágenes más al
   servidor por cada pantalla. */
/* Lo que devuelve /api/estado al arrancar, para poder mostrarlo en ajustes. */
const VERSION = { compilado: '', interfaz: '', modelo: '' };

const ICONO_LAPIZ = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-9.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>`;
const ICONO_CANECA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>`;
const ICONO_OJO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7c-1.2-2.9-5-7-10.5-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>`;
const ICONO_CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>`;
const ICONO_MAS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z"/></svg>`;
const ICONO_DOC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm2 16H8v-2h8v2Zm0-4H8v-2h8v2Zm-3-5V3.5L18.5 9H13Z"/></svg>`;

/**
 * Las cotizaciones, una por renglón corto.
 *
 * Con muchas ofertas la tabla ancha se vuelve imposible de recorrer, así que
 * a la vista quedan el asunto y el cliente, que es por lo que uno las busca;
 * el saldo y el estado van al costado, y el PDF a un toque.
 */
function listaCotizaciones(filas) {
  if (!filas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>${estado.buscarCotizaciones ? 'Ninguna coincide' : 'Todavía no hay cotizaciones'}</strong>${
        estado.buscarCotizaciones
          ? 'Probá con otra parte del nombre del cliente o del asunto.'
          : 'Pedísela a Ari, o subí una que ya tengas hecha en PDF.'}
    </div></div>`;
  }

  return `<div class="lista-cot">${filas.map((q) => {
    const saldado = Number(q.saldo) <= 0;
    const aprobada = q.estado === 'aprobada';
    // Detrás del renglón, a la derecha, quedan las acciones que se descubren
    // deslizando con el dedo, como en el correo del teléfono. Van en el papel
    // aunque no se vean: así se llega a ellas con el tabulador, sin dedo.
    const acciones = [
      { accion: 'abrir-cotizacion', corto: 'Editar', icono: ICONO_LAPIZ, tono: 'editar', id: q.id,
        titulo: 'Abrir esta cotización para editarla', datos: { editar: '1' } },
      { accion: 'borrar-cot', corto: 'Eliminar', icono: ICONO_CANECA, tono: 'borrar', id: q.id,
        titulo: 'Eliminar esta cotización' },
    ];
    return `<div class="cot-item deslizable" style="--cajon:${anchoDeCajon(acciones)}px">
      ${cajonDeAcciones(acciones)}
      <div class="cot-fila" data-accion="abrir-cotizacion" data-id="${q.id}" role="button" tabindex="0">
        <div class="cot-texto">
          <strong class="es-cliente">${escapar(q.cliente || 'Sin cliente')}</strong>
          <span>${q.origen === 'portal' ? '<span class="pastilla portal">🛒 Desde el catálogo</span> ' : ''}${escapar(q.titulo)}</span>
        </div>
        <div class="cot-cifra">
          <b class="total">${fmtDinero(q.monto, q.moneda)}</b>
          <span>total</span>
        </div>
        <div class="cot-cifra">
          <b class="${Number(q.abonado) > 0 ? 'ok' : 'nada'}">${
            Number(q.abonado) > 0 ? fmtDinero(q.abonado, q.moneda) : '—'}</b>
          <span>abonado</span>
        </div>
        <div class="cot-cifra">
          <b class="${saldado ? 'ok' : ''}">${saldado ? '—' : fmtDinero(q.saldo, q.moneda)}</b>
          <span>${saldado ? 'saldada' : 'por cobrar'}</span>
        </div>
        <div class="cot-botones">
          <button class="pastilla ${escapar(q.estado)} cambia" data-accion="alternar-estado-cot" data-id="${q.id}"
                  title="Tocá para pasarla a «${escapar(rotuloDeEstado(SIGUIENTE_ESTADO_COT[q.estado] || 'aprobada'))}»">${
                    escapar(rotuloDeEstado(q.estado))} ⇄</button>
          ${q.archivo
            ? `<a class="mini pdf" href="${escapar(q.archivo)}" target="_blank" rel="noopener"
                  data-titulo="${escapar(q.titulo)}" title="Abrir la oferta en PDF">📄</a>`
            : Number(q.n_items) > 0
              ? `<button class="mini pdf" data-accion="ver-pdf-cot" data-id="${q.id}"
                    data-titulo="${escapar(q.titulo)}" title="Ver la oferta en PDF">📄</button>`
              : ''}
          ${q.archivada
            ? `<button class="mini" data-accion="reabrir-cot" data-id="${q.id}">Reabrir</button>`
            : `<button class="mini${saldado && aprobada ? ' destacado' : ''}" data-accion="cerrar-cot" data-id="${q.id}"
                       title="${saldado ? 'Sacarla de la lista y dejarla en el historial' : 'Todavía falta cobrarla'}">Cerrar</button>`}
          <button class="mini mas" data-accion="mas-opciones" title="Editar o eliminar esta cotización"
                  aria-label="Más opciones">⋯</button>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function barraCotizaciones(cerradas = 0) {
  const buscador = `<input type="search" id="buscar-cotizaciones"
    placeholder="Buscar por cliente o por asunto…" value="${escapar(estado.buscarCotizaciones)}" />`;
  if (estado.clienteCotizaciones) {
    return `<div class="barra-productos">
      <button class="mini destacado" data-accion="quitar-filtro-cliente">← Todas las cotizaciones</button>
      <span class="filtro-cliente">Mostrando las de <b class="es-cliente">${
        escapar(estado.clienteCotizaciones.nombre)}</b>, abiertas y cerradas</span>
    </div>`;
  }

  const historial = cerradas
    ? `<button class="chip${estado.verHistorialCot ? ' activo' : ''}" data-accion="alternar-historial-cot">${
        estado.verHistorialCot ? '← Volver a las abiertas' : `Cerradas (${cerradas})`}</button>`
    : '';

  // Filtros por estado: es como se mira la lista de verdad —"qué tengo sin
  // aprobar", "qué me aprobaron"—, no leyendo renglón por renglón.
  const filtro = (valor, rotulo) =>
    `<button class="chip${estado.filtroEstadoCot === valor ? ' activo' : ''}"
             data-accion="filtrar-estado-cot" data-estado="${valor}">${rotulo}</button>`;

  const filtros = estado.verHistorialCot ? '' : `
    ${filtro('', 'Todas')}
    ${filtro('pendiente', 'Pendientes')}
    ${filtro('aprobada', 'Aprobadas')}
    ${filtro('rechazada', 'No aprobadas')}`;

  if (!estado.subiendoOferta) {
    return `<div class="barra-productos">
        ${buscador}
        <button class="mini" data-accion="alternar-subir-oferta">+ Cotización</button>
      </div>
      <div class="filtros-tipo">${filtros}${historial}</div>`;
  }

  return `<div class="barra-productos">
      ${buscador}
      <button class="mini" data-accion="alternar-subir-oferta">Cancelar</button>
    </div>
    <div class="filtros-tipo">${filtros}${historial}</div>
    ${bloque('Cotización nueva', `
      <div class="tarjeta">
        <p class="ayuda" style="padding:16px 18px 0;margin:0">
          Queda registrada con su cliente y su valor, para seguirle los abonos y el saldo.
          El PDF es opcional: si la armaste por fuera, subilo acá y se guarda tal cual;
          si no, después le agregás los renglones desde su ficha.
        </p>
        <form class="form-editar" id="form-subir-oferta">
          <label class="ancho"><span>Asunto</span>
            <input name="titulo" type="text" required placeholder="Automatización casa Sr. Jimmy" /></label>
          <label><span>Cliente</span>
            <input name="cliente" type="text" placeholder="Se crea si no existe" /></label>
          <label><span>Valor total</span>
            <input name="monto" type="number" min="0" step="1" required placeholder="6113158" /></label>
          <label><span>Vence</span><input name="vence_en" type="date" /></label>
          <label class="ancho"><span>Archivo PDF (opcional)</span>
            <input name="archivo" type="file" accept="application/pdf,.pdf" /></label>
          <div class="form-acciones"><button type="submit">Crear la cotización</button></div>
        </form>
      </div>`)}`;
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

async function enviar(texto, { porVoz = false } = {}) {
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

    // Teléfonos que sólo dan un dictado por carga de página: se les deja el
    // micrófono nuevo mientras se lee la respuesta, así la próxima orden sale
    // al primer toque en vez de morir sin oír.
    //
    // Va acá y no al final a propósito: si algo de lo que viene después
    // —repintar la pantalla, leer la respuesta en voz alta— llegara a fallar,
    // el micrófono tiene que quedar listo igual. Quedarse mudo por un tropiezo
    // de dibujo sería volver justo al problema que esto viene a resolver.
    if (porVoz && unaSolaSesionPorPagina) programarReinicioDeVoz();

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
        setTimeout(() => { if (manosLibres() && !escuchando && !arrancando) alternarMicrofono(); }, 400);
      }
    });

    // Si pediste ver algo por escrito, en celular la hoja se aparta para dejar
    // el resultado a la vista. Dictando NO: ahí se está en medio de una
    // seguidilla de órdenes, y que la hoja se cierre sola obliga a volver a
    // abrirla —y a buscar el micrófono— antes de cada frase.
    if (r.vista && esCelular() && !porVoz) setTimeout(cerrarHoja, 1500);
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

/* ── La casilla de «voz», que ahora se recuerda ── */

const LLAVE_VOZ = 'ari_voz';
const recordarVoz = (prendida) => {
  try { localStorage.setItem(LLAVE_VOZ, prendida ? '1' : '0'); } catch { /* sin espacio */ }
};

/**
 * ¿La voz de Ari arranca prendida?
 *
 * Lo que haya elegido el dueño del teléfono manda siempre. La primera vez, en
 * cambio, decide el aparato: en el iPhone la voz deja el micrófono sin poder
 * oír —abre y no transcribe— y hay que recargar la página para recuperarlo. Y
 * acá lo que se usa todo el día es dictar, no escuchar. Así que en el iPhone
 * arranca apagada, y la prende el que la quiera; en el computador, donde no
 * pasa nada de eso, sigue viniendo prendida como siempre.
 */
function vozAlAbrir() {
  try {
    const guardado = localStorage.getItem(LLAVE_VOZ);
    if (guardado === '1') return true;
    if (guardado === '0') return false;
  } catch { /* sin permiso para guardar: decide el aparato */ }
  return !ES_IOS;
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

  // Queda anotado que Ari usó el parlante. Si el próximo dictado abre y no
  // oye, esto es lo que permite señalar a la voz en vez de andar adivinando.
  ariHablo = true;
  speechSynthesis.speak(u);
}

/* ─────────── Voz a texto ─────────── */

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

// Los navegadores sólo entregan el micrófono en localhost o con HTTPS. Entrando
// por IP desde el celular (http://192.168...) la API desaparece, así que hay que
// distinguir "este navegador no puede" de "esta dirección no puede".
const CONTEXTO_SEGURO = window.isSecureContext !== false;
const VOZ_DISPONIBLE = Boolean(Reconocimiento) && CONTEXTO_SEGURO;

// El iPhone y el iPad son los que tienen la pelea entre la voz de Ari y el
// micrófono —y con ellos cualquier navegador que se les instale, porque
// adentro todos son el mismo Safari—. El iPad moderno se hace pasar por Mac,
// así que se lo reconoce por el dedo: un Mac de verdad no tiene pantalla
// táctil.
const ES_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
// Entre que se pide el micrófono y el navegador lo abre pasa un rato. Sin
// marcarlo, dos toques seguidos disparan dos arranques y el segundo aborta al
// primero.
let arrancando = false;
// Si el navegador nunca avisa que arrancó —o que terminó—, el estado queda
// trabado y el botón deja de responder. Este temporizador lo destraba.
let vigilante = null;
// Detecta la sesión que abre pero no oye: dice "Escuchando" y no llega audio.
let centinelaAudio = null;
let reintentoSordo = 0;
// Una vez que sí entró audio se apaga el aviso de arriba, pero puede pasar
// que ahí en adelante el navegador se cuelgue: la sesión queda "viva" para
// siempre, sin transcribir y sin avisar que terminó. Sin este techo, eso
// dejaba el micrófono grabando de mentiras hasta cerrar la aplicación.
let centinelaLargo = null;
const TECHO_SESION_MS = 20_000;
// Cuánto se le da a una sesión para que entre audio antes de darla por sorda.
// Si se abrió justo después de cortarle la voz a Ari, el teléfono venía
// reproduciendo y le cuesta más cambiar a grabar: ahí nacer sorda es lo
// esperable y no tiene sentido esperar tanto para rehacerla.
const MARGEN_SORDO = 4500;
const MARGEN_SORDO_TRAS_HABLAR = 1800;
let margenSordo = MARGEN_SORDO;

// La sesión MUDA: el audio abrió —`onaudiostart` llegó— y aun así no
// transcribe, no falla y no termina nunca. Es lo que hace el Safari del iPhone
// cuando Ari acaba de contestar en voz alta: el teléfono le entrega el
// micrófono al dictado sin haberle soltado el parlante a la voz, y lo que sale
// es una sesión de adorno.
//
// Va aparte del centinela de arriba a propósito: que el audio abra NO prueba
// que la sesión sirva, y dar por buena la sesión apenas llegaba
// `onaudiostart` era justo lo que dejaba pasar este caso.
let centinelaMudo = null;
// Un dictado sano que nadie contesta se cierra solo mucho antes: el navegador
// manda `no-speech` a los pocos segundos. Si a los nueve no llegó ni voz, ni
// error, ni cierre, la sesión está muerta.
const TECHO_MUDO_MS = 9_000;
// Pero una vez que este teléfono ya mostró que hace esto, no hay por qué
// volver a darle nueve segundos: se lo corta enseguida y se pasa antes al
// remedio que sirve. Vuelve a los nueve apenas un dictado se oiga bien.
const TECHO_MUDO_CORTO_MS = 3_500;
let huboSesionMuda = false;

// Lo que tarda el teléfono en soltar el parlante después de que se le corta la
// voz a Ari. Abrir el micrófono adentro de ese rato es lo que lo deja mudo.
const ESPERA_TRAS_HABLAR = 350;
// ¿Ari habló desde el último dictado que sí se oyó? Si el micrófono se muere
// justo después, la culpable es la voz —y la voz se puede apagar—.
let ariHablo = false;
let avisoVozApagada = false;
let avisoRecargar = false;
// Sesiones mudas seguidas. Una puede ser mala suerte; dos con la voz ya
// apagada quieren decir que el navegador quedó trabado y no hay nada que
// tocar acá adentro que lo arregle.
let sesionesMudasSeguidas = 0;
// Cada pedido de micrófono lleva número. El arranque que espera a que Ari se
// calle mira este número antes de abrir: si mientras tanto se volvió a tocar
// el botón, el pedido viejo se descarta en vez de abrir una sesión de más.
let fichaDeArranque = 0;

// Manos libres: cuántos silencios seguidos se toleran antes de apagarlo solo.
const MAX_SILENCIOS = 3;
let silenciosSeguidos = 0;
let ultimoErrorVoz = null;

/** El micrófono existe dos veces: en el panel (escritorio) y flotante (celular). */
const marcarGrabando = (activo) =>
  ['#mic', '#fab-mic'].forEach((s) => $(s).classList.toggle('grabando', activo));

function iniciarVoz() {
  $('#tts').checked = vozAlAbrir();
  $('#tts').addEventListener('change', () => recordarVoz($('#tts').checked));

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

  // La instancia se crea recién al empezar cada dictado, no acá: ver
  // crearReconocedor().
}

/**
 * Arma una sesión de dictado nueva.
 *
 * Antes había UNA sola instancia, creada al abrir la aplicación y reusada para
 * siempre. En el celular eso rompía el segundo dictado: la sesión anterior
 * seguía reteniendo el micrófono, y la nueva abría —decía "Escuchando"— pero
 * no le llegaba audio, ni transcribía, ni terminaba nunca. Al rato el sistema
 * soltaba el micrófono por su cuenta y volvía a andar solo, que es justo lo
 * que se veía.
 *
 * Con una instancia por sesión, la anterior se aborta y se tira, y el
 * micrófono queda libre para la siguiente.
 */
function crearReconocedor() {
  const r = new Reconocimiento();
  r.lang = 'es-CO';
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;

  let acumulado = '';
  // Prueba de vida de verdad: entró voz, o entró texto. Sólo esto apaga los
  // dos centinelas y da la sesión por buena —y de paso absuelve a la voz de
  // Ari, porque si se está oyendo es que no estorbó—.
  const daSenalesDeVida = () => {
    clearTimeout(centinelaAudio);
    clearTimeout(centinelaMudo);
    reintentoSordo = 0;
    sesionesMudasSeguidas = 0;
    huboSesionMuda = false;
    ariHablo = false;
  };

  r.onstart = () => {
    escuchando = true;
    arrancando = false;
    clearTimeout(vigilante);
    acumulado = '';
    marcarGrabando(true);
    $('#pista').textContent = 'Escuchando… hablá con naturalidad.';

    // El techo largo: si esta sesión no terminó por su cuenta —ni con
    // resultado, ni con error, ni cerrándose— en veinte segundos, se corta a
    // la fuerza. Sin esto, una sesión que el navegador abandona a medio
    // camino se queda "escuchando" en la pantalla para siempre, y ningún
    // toque posterior lograba nada porque `reconocedor` seguía apuntando a
    // esa sesión muerta. Va contra `r` y no contra la variable de más
    // arriba, para no cortar una sesión más nueva si ésta ya se reemplazó.
    clearTimeout(centinelaLargo);
    centinelaLargo = setTimeout(() => {
      if (reconocedor !== r) return;
      escuchando = false;
      arrancando = false;
      marcarGrabando(false);
      soltarMicrofono();
      $('#pista').textContent = 'El micrófono se quedó pegado. Tocalo de nuevo para seguir.';
    }, TECHO_SESION_MS);

    // Si el navegador dice que arrancó pero no abre el audio, la sesión nació
    // sorda: se queda ahí para siempre, sin transcribir y sin cerrarse. Se le
    // da un margen corto y se rehace con una instancia limpia.
    clearTimeout(centinelaAudio);
    centinelaAudio = setTimeout(() => {
      if (!escuchando) return;
      recuperarDeSesionMuerta();
    }, margenSordo);
  };

  // Que el audio abra sólo descarta la sesión SORDA; todavía puede salir muda.
  // Por eso acá no se levanta la vigilancia: se cambia una por la otra.
  r.onaudiostart = () => {
    clearTimeout(centinelaAudio);
    clearTimeout(centinelaMudo);
    centinelaMudo = setTimeout(() => {
      if (reconocedor !== r) return;
      recuperarDeSesionMuerta();
    }, huboSesionMuda ? TECHO_MUDO_CORTO_MS : TECHO_MUDO_MS);
  };
  // Esto sí: que el navegador oiga voz es prueba de que la sesión sirve.
  r.onspeechstart = daSenalesDeVida;

  r.onresult = (e) => {
    daSenalesDeVida();
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) acumulado += t;
      else parcial += t;
    }
    $('#texto').value = (acumulado + parcial).trim();
  };

  r.onerror = (e) => {
    clearTimeout(centinelaAudio);
    clearTimeout(centinelaMudo);
    // Un silencio en manos libres es normal —se está caminando de una pieza a
    // otra—, así que no interrumpe ni abre la hoja: se sigue escuchando.
    if (e.error === 'no-speech' && manosLibres()) return;

    // "aborted" no es un problema del usuario: es lo que dice el navegador
    // cuando una sesión de dictado se corta para empezar otra. Pasa siempre
    // que se vuelve a tocar el micrófono enseguida, sobre todo en el celular.
    // Mostrarlo como error dejaba el aviso pegado y parecía que se había roto.
    if (e.error === 'aborted') {
      escuchando = false;
      arrancando = false;
      marcarGrabando(false);
      return;
    }

    ultimoErrorVoz = e.error;
    escuchando = false;
    arrancando = false;
    marcarGrabando(false);
    abrirHoja(); // que el aviso sea visible aunque la hoja estuviera cerrada
    $('#pista').textContent = {
      'not-allowed': 'Necesito permiso para usar el micrófono.',
      'no-speech': 'No escuché nada. Probá de nuevo.',
      'audio-capture': 'No encontré ningún micrófono.',
      network: 'Sin conexión para el reconocimiento de voz.',
    }[e.error] || `Error de micrófono: ${e.error}`;
  };

  r.onend = () => {
    r.yaTermino = true;
    escuchando = false;
    arrancando = false;
    clearTimeout(vigilante);
    clearTimeout(centinelaAudio);
    clearTimeout(centinelaMudo);
    marcarGrabando(false);

    // El micrófono se suelta ACÁ, apenas termina el dictado, y no al abrir el
    // siguiente. Soltarlo recién al abrir el siguiente parece lo mismo pero no
    // lo es: se aborta la sesión vieja y se arranca la nueva en el mismo
    // instante, y el teléfono todavía no alcanzó a soltar el audio, así que la
    // nueva nace sorda —dice "Escuchando" y no le llega nada— hasta que el
    // sistema se desocupa solo unos segundos después. Soltándolo acá, el
    // micrófono queda libre mientras Ari contesta y habla, que es justo el rato
    // en que uno está esperando para volver a hablarle.
    if (reconocedor === r) setTimeout(soltarMicrofono, 0);

    const texto = $('#texto').value.trim();

    if (texto) {
      silenciosSeguidos = 0;
      $('#pista').textContent = '';
      enviar(texto, { porVoz: true });
      return;
    }

    // Sin texto: en manos libres se vuelve a escuchar, pero no para siempre.
    // Si nadie dice nada varias veces seguidas el teléfono quedó guardado en
    // el bolsillo, y grabar sin parar sólo gasta batería.
    if (manosLibres() && !ultimoErrorVoz) {
      silenciosSeguidos += 1;
      if (silenciosSeguidos <= MAX_SILENCIOS) {
        $('#pista').textContent = 'Escuchando… decime el siguiente ítem.';
        setTimeout(() => { if (manosLibres() && !escuchando && !arrancando) alternarMicrofono(); }, 300);
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

  return r;
}

/**
 * Suelta el micrófono de la sesión anterior y la tira.
 *
 * `abort()` corta ya; `stop()` se queda esperando resultados y en el celular
 * puede no soltar nunca. Además se le quitan los manejadores: una instancia
 * vieja que todavía dispare eventos pisaría el estado de la nueva.
 */
/**
 * El micrófono abrió y no sirvió: ni oyó, ni falló, ni cerró.
 *
 * Lo primero es devolver el botón. Quedarse en rojo diciendo "Escuchando" es
 * lo peor que puede pasar, porque no hay nada que tocar que lo arregle y la
 * aplicación parece rota.
 *
 * Después, la causa. Si Ari acababa de hablar, en el iPhone la culpa es de la
 * voz casi siempre: el teléfono no alcanza a soltar el parlante, y de ahí en
 * adelante todos los dictados abren sin oír nada —que es por qué sólo tomaba
 * UNA orden y había que cerrar y volver a abrir el programa—. Apagarle la voz
 * es feo, pero es lo único que hace volver el micrófono, y se dice por qué:
 * un ajuste que se apaga solo y en silencio es peor que la falla.
 */
/* ── Recargar sin perder la charla ──
   Recargar es lo único que destraba el audio del iPhone, y hasta ahora
   significaba cerrar la aplicación y volver a entrar: se perdía de vista todo
   lo hablado. Los datos nunca estuvieron en riesgo —viven en el servidor,
   incluida la cotización en curso—, pero la conversación sí, y es donde uno
   está mirando qué le pidió a Ari. Se guarda de este lado y se repone del
   otro, así recargar deja de doler. */
const LLAVE_CHARLA = 'ari_charla';
const LLAVE_CHARLA_HISTORIAL = 'ari_charla_historial';
const LLAVE_LISTO_DICTAR = 'ari_listo_dictar';

function recargarConservandoCharla({ listo = false } = {}) {
  try {
    const copia = $('#conversacion').cloneNode(true);
    // Los avisos de la falla y el "pensando" a medias no tienen por qué
    // reaparecer del otro lado: quedaron resueltos con la recarga misma.
    copia.querySelectorAll('.aviso-voz, .error').forEach((b) => b.remove());
    copia.querySelectorAll('.pensando').forEach((p) => p.closest('.burbuja')?.remove());
    sessionStorage.setItem(LLAVE_CHARLA, copia.innerHTML);
    sessionStorage.setItem(LLAVE_CHARLA_HISTORIAL, JSON.stringify(estado.historial));
    if (listo) sessionStorage.setItem(LLAVE_LISTO_DICTAR, '1');
  } catch { /* sin espacio: se recarga igual, aunque sea sin la charla */ }
  location.reload();
}

/** Repone la conversación del otro lado de la recarga. */
function restaurarCharla() {
  let html = null;
  let historial = null;
  let listo = false;
  try {
    html = sessionStorage.getItem(LLAVE_CHARLA);
    historial = sessionStorage.getItem(LLAVE_CHARLA_HISTORIAL);
    listo = sessionStorage.getItem(LLAVE_LISTO_DICTAR) === '1';
    sessionStorage.removeItem(LLAVE_CHARLA);
    sessionStorage.removeItem(LLAVE_CHARLA_HISTORIAL);
    sessionStorage.removeItem(LLAVE_LISTO_DICTAR);
  } catch { /* no había nada guardado */ }
  if (!html) return null;

  $('#conversacion').innerHTML = html;
  try { estado.historial = JSON.parse(historial) || []; } catch { /* sigue sin memoria */ }
  $('#conversacion').scrollTop = $('#conversacion').scrollHeight;
  return { listo };
}

/* ── Teléfonos de un solo dictado por carga ──
   Hay iPhones donde el dictado anda UNA vez y no vuelve más: ni cambiando de
   instancia, ni soltando el micrófono, ni apagándole la voz a Ari. Lo único
   que lo revive es recargar la página. Antes eso significaba cerrar la
   aplicación a mano después de cada orden.
   Cuando se detecta uno de esos teléfonos queda anotado, y de ahí en adelante
   la página se renueva sola apenas Ari termina de contestar —mientras uno lee
   la respuesta, que es el rato muerto—, así el micrófono siempre está nuevo
   para la orden siguiente y no hay nada que cerrar ni volver a abrir. */
const LLAVE_UNA_POR_PAGINA = 'ari_mic_una_por_pagina';
let unaSolaSesionPorPagina = (() => {
  try { return localStorage.getItem(LLAVE_UNA_POR_PAGINA) === '1'; } catch { return false; }
})();

function anotarTelefonoDeUnSoloDictado() {
  if (!ES_IOS || unaSolaSesionPorPagina) return;
  unaSolaSesionPorPagina = true;
  try { localStorage.setItem(LLAVE_UNA_POR_PAGINA, '1'); } catch { /* sin espacio */ }
}

function programarReinicioDeVoz(intento = 0) {
  if (escuchando || arrancando) return;
  $('#pista').textContent = 'Dejando el micrófono listo para la próxima orden…';
  setTimeout(() => {
    // Si en el ínterin se puso a dictar o a escribir, no se le mueve el piso.
    if (escuchando || arrancando || $('#texto').value.trim()) {
      $('#pista').textContent = PISTA_INICIAL;
      return;
    }
    // Y si Ari todavía está leyendo la respuesta, se le deja terminar:
    // recargar en el medio le corta la frase por la mitad.
    if ('speechSynthesis' in window && speechSynthesis.speaking && intento < 20) {
      programarReinicioDeVoz(intento + 1);
      return;
    }
    recargarConservandoCharla({ listo: true });
  }, intento === 0 ? 1400 : 400);
}

function recuperarDeSesionMuerta() {
  escuchando = false;
  arrancando = false;
  marcarGrabando(false);
  soltarMicrofono();
  sesionesMudasSeguidas += 1;
  huboSesionMuda = true;
  // Este teléfono ya mostró que no da dos dictados en la misma carga: de acá
  // en más se le renueva la página sola entre orden y orden.
  anotarTelefonoDeUnSoloDictado();

  if (ariHablo && $('#tts').checked) {
    $('#tts').checked = false;
    recordarVoz(false);   // que siga apagada la próxima vez que abra
    ariHablo = false;
    reintentoSordo = 0;
    abrirHoja();
    $('#pista').textContent = 'Apagué la voz de Ari para poder seguir oyéndote. Tocá el micrófono y seguí.';
    if (!avisoVozApagada) {
      avisoVozApagada = true;
      burbuja('ari aviso-voz', `<p><b>Apagué la voz de Ari.</b></p>
        <p>En el iPhone, cuando Ari contesta en voz alta, el teléfono se queda
        con el audio y el micrófono abre sin oír nada. Por eso te tomaba una
        sola orden y después había que cerrar y volver a abrir la aplicación.</p>
        <p>Sin la voz podés dictarle una orden atrás de otra. Si la querés de
        vuelta, prendé <b>voz</b> acá arriba.</p>`);
    }
    return;
  }

  // Una sola sesión muda puede ser mala suerte: se rehace una vez sola.
  if (sesionesMudasSeguidas < 2 && reintentoSordo < 1) {
    reintentoSordo += 1;
    $('#pista').textContent = 'Reintentando abrir el micrófono…';
    setTimeout(() => empezarAEscuchar(), 400);
    return;
  }

  reintentoSordo = 0;
  abrirHoja();
  $('#pista').textContent = 'El micrófono abrió pero no entregó audio. '
    + 'Tocalo otra vez, o escribime acá abajo.';

  // Ya se le apagó la voz y el micrófono sigue sin oír: el navegador se quedó
  // con el audio trabado, y desde adentro de la página no hay nada más que
  // hacer. Recargar lo destraba —es lo mismo que cerrar y volver a abrir la
  // aplicación, que es lo que había que hacer a mano hasta ahora—.
  if (!avisoRecargar) {
    avisoRecargar = true;
    burbuja('ari aviso-voz', `<p><b>El micrófono sigue sin oír.</b></p>
      <p>El teléfono se quedó con el audio trabado y desde acá adentro no hay
      forma de destrabarlo. Recargando vuelve a oír enseguida: no se pierde
      nada —ni lo guardado, ni esta conversación, ni la cotización en curso—.</p>
      <p><button class="mini destacado" data-accion="recargar-app">Recargar y seguir dictando</button></p>`);
  }
}

function soltarMicrofono() {
  clearTimeout(centinelaLargo);
  clearTimeout(centinelaMudo);
  if (!reconocedor) return;
  const viejo = reconocedor;
  reconocedor = null;
  viejo.onstart = null;
  viejo.onaudiostart = null;
  viejo.onspeechstart = null;
  viejo.onresult = null;
  viejo.onerror = null;
  viejo.onend = null;
  // `abort()` es para la sesión que quedó colgada. Si ya terminó sola, no hay
  // nada que abortar, y hacerlo igual es meterle mano al audio del teléfono
  // justo después de que lo soltó —otra manera de dejárselo trabado—.
  if (!viejo.yaTermino) {
    try { viejo.abort(); } catch { /* ya estaba suelto */ }
  }
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
  if (escuchando) {
    detenerMicrofono();
    return;
  }

  // Tocarlo mientras está abriendo ya no se ignora. Ignorarlo dejaba el botón
  // muerto hasta tres segundos cuando el arranque se colgaba —que es
  // exactamente cuando uno lo vuelve a tocar—. Se tira ese intento y se abre
  // uno nuevo, todavía adentro del toque, que es como el iPhone lo permite.
  if (arrancando) {
    arrancando = false;
    soltarMicrofono();
  }

  // Tocar el micrófono es empezar de nuevo: lo que haya fallado antes no
  // tiene por qué seguir estorbando.
  ultimoErrorVoz = null;
  reintentoSordo = 0;
  empezarAEscuchar();
}

/**
 * Abre el micrófono.
 *
 * Tres cosas importan acá, y las tres son por el celular:
 *
 * 1. `start()` se llama YA, dentro del mismo toque que lo pidió. En el iPhone
 *    el micrófono sólo se entrega si el pedido sale del gesto del usuario;
 *    aplazarlo aunque sea una décima con un temporizador rompe esa cadena y la
 *    sesión abre sorda —dice "Escuchando" y no le llega audio—.
 *
 * 2. La excepción a lo anterior es cuando Ari venía hablando. Ahí el teléfono
 *    tiene el audio puesto en reproducir, y abrir el dictado en ese mismo
 *    instante da una sesión muda pase lo que pase: el gesto no sirve de nada
 *    si el aparato no tiene el micrófono para dar. Se prefiere esperar ese
 *    respiro —son milésimas— a abrir a tiempo una sesión que no va a oír.
 *
 * 3. Cada sesión estrena instancia, y la anterior se suelta antes. Reusar la
 *    misma dejaba el micrófono tomado por la sesión vieja: el segundo dictado
 *    no transcribía ni terminaba nunca, y volvía a andar solo recién cuando el
 *    sistema soltaba el micrófono por su cuenta, un rato después.
 */
function empezarAEscuchar(intento = 0) {
  if (escuchando) return;
  const ficha = ++fichaDeArranque;

  // La voz de Ari y el micrófono se pelean el audio del teléfono. Cortarle la
  // voz no alcanza: el aparato tarda un momento en pasar de reproducir a
  // grabar, y el dictado que arranca DENTRO de ese momento nace mudo —abre,
  // dice "Escuchando" y no transcribe nunca—. Antes se abría igual y sólo se
  // acortaba el plazo para darlo por perdido; ahora se espera ese momento y
  // recién después se abre, que es lo que evita la falla en vez de detectarla.
  const hayVoz = 'speechSynthesis' in window;
  const veniaHablando = hayVoz && (speechSynthesis.speaking || speechSynthesis.pending);
  if (hayVoz) speechSynthesis.cancel();
  margenSordo = veniaHablando ? MARGEN_SORDO_TRAS_HABLAR : MARGEN_SORDO;

  soltarMicrofono();          // suelta y tira la sesión anterior

  if (!veniaHablando) {
    // El caso de siempre: `start()` sale dentro del mismo toque que lo pidió,
    // que es como el iPhone entrega el micrófono.
    abrirSesionDeVoz(intento);
    return;
  }

  // Ari venía hablando: se le corta y se le da al teléfono ese respiro. El
  // botón ya se pinta, para que el toque se sienta atendido y nadie lo golpee
  // tres veces creyendo que no pasó nada.
  arrancando = true;
  marcarGrabando(true);
  $('#pista').textContent = 'Un momento, que se calle Ari…';
  clearTimeout(vigilante);
  vigilante = setTimeout(() => {
    // Si mientras tanto se volvió a tocar el micrófono, este pedido ya no vale.
    if (ficha !== fichaDeArranque) return;
    abrirSesionDeVoz(intento);
  }, ESPERA_TRAS_HABLAR);
}

/** Crea la sesión y la abre. Sale de `empezarAEscuchar`, que decide el cuándo. */
function abrirSesionDeVoz(intento = 0) {
  reconocedor = crearReconocedor();
  arrancando = true;

  try {
    reconocedor.start();
  } catch {
    // Todavía ocupado. Con instancia nueva casi no pasa, pero si pasa se
    // espera un momento y se prueba otra vez en vez de quedar mudo.
    arrancando = false;
    if (intento < 2) {
      soltarMicrofono();
      setTimeout(() => empezarAEscuchar(intento + 1), 250);
      return;
    }
    marcarGrabando(false);
    $('#pista').textContent = 'El micrófono quedó ocupado un momento. Tocalo de nuevo.';
    return;
  }

  // Si el navegador no avisa que arrancó, se destraba solo: sin esto el botón
  // queda sin responder hasta recargar la página.
  clearTimeout(vigilante);
  vigilante = setTimeout(() => {
    if (!escuchando) {
      arrancando = false;
      marcarGrabando(false);
      soltarMicrofono();
    }
  }, 3000);
}

/** Cierra la sesión de dictado, y se asegura de que cierre de verdad. */
function detenerMicrofono() {
  clearTimeout(centinelaAudio);
  clearTimeout(centinelaMudo);
  // Si había un arranque esperando a que Ari se callara, queda anulado: se
  // pidió parar, no arrancar tarde.
  fichaDeArranque += 1;
  // Si no hay sesión pero igual se cree "escuchando" —el navegador abandonó
  // el reconocedor sin avisar con onend ni onerror, algo que pasa de verdad—
  // no hay nada que detener, pero tampoco hay que dejar el botón mudo para
  // siempre: se destraba acá mismo, ya, sin esperar ningún aviso que no va a
  // llegar.
  if (!reconocedor) {
    escuchando = false;
    arrancando = false;
    marcarGrabando(false);
    return;
  }
  try { reconocedor.stop(); } catch { /* ya estaba detenido */ }
  // Hay navegadores que no llegan a avisar que terminaron. Si en medio
  // segundo no avisó, se corta a la fuerza para que el botón vuelva a andar.
  clearTimeout(vigilante);
  vigilante = setTimeout(() => {
    if (escuchando) {
      escuchando = false;
      arrancando = false;
      marcarGrabando(false);
      soltarMicrofono();
    }
  }, 600);
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
  estado.clienteCotizaciones = null;
  estado.clienteAbierto = null;
  estado.productoAbierto = null;
  estado.importacion = null;
  estado.nuevoProducto = false;
  estado.cotizandoProducto = null;
  estado.editando = false;
  cerrarHoja();
  sincronizarFlotantes();
  pintar();
  $('#contenido').scrollTop = 0;
});

/* ─────────── Deslizar un renglón de cotización ─────────── */
/*
 * En el teléfono no queda lugar para más botones en el renglón: ya están la
 * pastilla del estado, el PDF y Cerrar. Las demás acciones —editar, eliminar—
 * viven en un cajón detrás del renglón, que asoma al deslizarlo hacia la
 * izquierda, igual que en el correo. Eliminar estaba sólo adentro de la ficha,
 * en Editar, y ahí nadie la encontraba.
 *
 * El renglón es lo único que se mueve. El cajón está quieto debajo y lo tapa
 * el recorte del contenedor mientras el renglón está en su lugar.
 *
 * El gesto se escucha con los eventos del DEDO (touchstart/touchmove) y no con
 * los de puntero. Los de puntero andaban en el computador pero no en el
 * iPhone: adentro de una lista que se desplaza, Safari se queda con el gesto
 * apenas el dedo se mueve y le manda `pointercancel` a la página, así que el
 * renglón nunca alcanzaba a correrse. Con touchmove —y escuchándolo en modo no
 * pasivo— se le puede decir al navegador «este de acá es mío» en el momento
 * justo en que se sabe que el dedo va horizontal.
 *
 * El ratón sigue por eventos de puntero, que para eso sí sirven.
 */
let deslizando = null;
// Un arrastre no puede además abrir la cotización al levantar el dedo.
let recienArrastrado = null;

const anchoCajon = (item) => item.querySelector('.cot-cajon')?.offsetWidth || 0;

function cerrarCajones(menos = null) {
  $$('.deslizable.abierto').forEach((item) => {
    if (item !== menos) { item.classList.remove('abierto'); item.style.removeProperty('--x'); }
  });
}

// Dónde estaba la lista cuando se abrió el último cajón. Recorrerla lo cierra,
// pero abrirlo mueve el foco y eso solo ya dispara un scroll de un par de
// píxeles: sin esta marca, el cajón se cerraba en el mismo instante en que se
// abría.
let scrollAlAbrir = 0;

function abrirCajon(item) {
  cerrarCajones(item);
  item.classList.add('abierto');
  scrollAlAbrir = $('#contenido').scrollTop;
}

/** Arranca el seguimiento. Devuelve false si ahí no había nada que deslizar. */
function empezarDeslizado(objetivo, x, y) {
  // Un toque sobre el cajón abierto es para sus botones: si acá se cerrara,
  // el renglón volvería encima justo antes del clic y se lo llevaría puesto.
  if (objetivo.closest?.('.cot-cajon')) { deslizando = null; return false; }

  const item = objetivo.closest?.('.deslizable');
  if (!item) { deslizando = null; cerrarCajones(); return false; }

  deslizando = {
    item, x0: x, y0: y,
    base: item.classList.contains('abierto') ? -anchoCajon(item) : 0,
    decidido: false, abandonado: false,
  };
  return true;
}

/**
 * Sigue el dedo. Devuelve true cuando el gesto ya se dio por horizontal, que es
 * la señal para que quien llama frene lo que iba a hacer el navegador.
 */
function moverDeslizado(x, y) {
  if (!deslizando || deslizando.abandonado) return false;
  const dx = x - deslizando.x0;
  const dy = y - deslizando.y0;

  // Hasta no saber para dónde va el dedo no se mueve nada: si va vertical, es
  // que está recorriendo la lista y acá no pasó nada. Y una vez que se decidió
  // que era vertical no se vuelve a mirar, para no arrancar a la mitad.
  if (!deslizando.decidido) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return false;
    if (Math.abs(dx) <= Math.abs(dy)) { deslizando.abandonado = true; return false; }
    deslizando.decidido = true;
    deslizando.item.classList.add('arrastrando');
    cerrarCajones(deslizando.item);
  }

  const tope = anchoCajon(deslizando.item);
  deslizando.item.style.setProperty('--x', `${Math.max(-tope, Math.min(0, deslizando.base + dx))}px`);
  return true;
}

/**
 * Suelta el renglón donde quedó: abierto o de vuelta en su sitio.
 *
 * `conRaton` existe porque arrastrar con el ratón termina en un clic —el mismo
 * gesto abre el cajón y "toca" el renglón—, y ese clic hay que descartarlo. Con
 * el dedo no pasa: al frenar el touchmove el navegador ya no sintetiza el clic,
 * así que anotarlo dejaría al renglón sordo por un rato sin ninguna razón.
 */
function soltarDeslizado(x, conRaton = false) {
  if (!deslizando) return;
  const { item, base, x0, decidido } = deslizando;
  deslizando = null;

  item.style.removeProperty('--x');
  item.classList.remove('arrastrando');
  if (!decidido) return;

  const tope = anchoCajon(item);
  const donde = Math.max(-tope, Math.min(0, base + (x - x0)));
  // Pasada la tercera parte queda abierto; antes de eso se devuelve solo.
  if (donde < -tope / 3) abrirCajon(item);
  else item.classList.remove('abierto');

  if (conRaton) {
    recienArrastrado = item;
    setTimeout(() => { if (recienArrastrado === item) recienArrastrado = null; }, 400);
  }
}

/* Con el dedo */
const contenido = $('#contenido');

contenido.addEventListener('touchstart', (e) => {
  // Con dos dedos encima no es un deslizado: es un zoom, y no es nuestro.
  if (e.touches.length !== 1) { deslizando = null; return; }
  const t = e.touches[0];
  empezarDeslizado(e.target, t.clientX, t.clientY);
}, { passive: true });

contenido.addEventListener('touchmove', (e) => {
  if (!deslizando || e.touches.length !== 1) return;
  const t = e.touches[0];
  // Si es nuestro, se le corta el paso al navegador para que no aproveche el
  // mismo movimiento para desplazar la lista. Por eso este oyente NO es pasivo.
  if (moverDeslizado(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
}, { passive: false });

contenido.addEventListener('touchend', (e) => {
  soltarDeslizado(e.changedTouches[0]?.clientX ?? 0);
}, { passive: true });

contenido.addEventListener('touchcancel', () => {
  // Una llamada entrante, el centro de control… el gesto se corta: se devuelve
  // el renglón a su sitio sin abrir nada.
  if (deslizando) {
    deslizando.item.style.removeProperty('--x');
    deslizando.item.classList.remove('arrastrando');
  }
  deslizando = null;
}, { passive: true });

/* Con el ratón */
contenido.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;   // el dedo va por el camino de arriba
  if (e.button > 0) return;                // botón secundario
  if (empezarDeslizado(e.target, e.clientX, e.clientY)) deslizando.puntero = e.pointerId;
});

contenido.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || !deslizando || e.pointerId !== deslizando.puntero) return;
  const arranco = !deslizando.decidido;
  if (moverDeslizado(e.clientX, e.clientY) && arranco) {
    try { deslizando.item.setPointerCapture(e.pointerId); } catch { /* sin captura igual anda */ }
  }
});

const soltarConRaton = (e) => {
  if (e.pointerType === 'touch' || !deslizando || e.pointerId !== deslizando.puntero) return;
  soltarDeslizado(e.clientX, true);
};
contenido.addEventListener('pointerup', soltarConRaton);
contenido.addEventListener('pointercancel', soltarConRaton);

// Con el tabulador se llega a los botones del cajón aunque esté cerrado: si
// alguno recibe el foco, se abre, para que se vea dónde está parado.
contenido.addEventListener('focusin', (e) => {
  // Sólo cuando el foco cae DENTRO de un cajón. Antes también cerraba cuando
  // caía en cualquier otro lado, y eso se llevaba puesto el cajón que el botón
  // de al lado acababa de abrir: según el navegador, el foco llega después del
  // clic, no antes.
  const boton = e.target.closest('.cajon-btn');
  if (!boton) return;
  const item = boton.closest('.deslizable');
  if (item) abrirCajon(item);
});

// Sin dedo: las flechas abren y cierran el cajón del renglón que tenga el foco.
contenido.addEventListener('keydown', (e) => {
  const item = e.target.closest?.('.deslizable');
  if (!item || e.target.closest('.cajon-btn')) return;
  if (e.key === 'ArrowLeft') abrirCajon(item);
  else if (e.key === 'ArrowRight' || e.key === 'Escape') item.classList.remove('abierto');
  else return;
  e.preventDefault();
});

// Al recorrer la lista se cierra lo que haya quedado abierto. Un movimiento
// mínimo no cuenta: ése lo hace el navegador solo, acomodando el foco.
contenido.addEventListener('scroll', () => {
  if (!deslizando && Math.abs(contenido.scrollTop - scrollAlAbrir) > 8) cerrarCajones();
}, { passive: true });

/**
 * Pregunta y elimina una cotización, diciendo antes qué se lleva puesto.
 * La usan el botón de la ficha y el del cajón: es la misma decisión y no puede
 * avisar distinto según desde dónde se pida.
 */
async function eliminarCotizacionConAviso(id) {
  const cot = await api(`/cotizaciones/${id}`);

  // Se dice qué se lleva puesto ANTES de preguntar. Los abonos son plata
  // registrada: borrarlos sin nombrarlos sería lo peor que podría pasar acá.
  const abonos = Number(cot.abonado) || 0;
  const aviso = [
    `¿Eliminar la cotización #${cot.id} "${cot.titulo}"?`,
    cot.n_items ? `Se van sus ${cot.n_items} renglón(es).` : '',
    abonos > 0
      ? `⚠ Tiene ${fmtDinero(abonos, cot.moneda)} en abonos registrados, que también se borran.`
      : '',
    cot.estado === 'aprobada' ? 'Lo que había salido de bodega por esta oferta vuelve al inventario.' : '',
    'Esto no se puede deshacer.',
  ].filter(Boolean).join('\n\n');

  if (!confirm(aviso)) return false;

  const r = await api(`/cotizaciones/${cot.id}`, { method: 'DELETE' });
  avisar(r.devueltosAlInventario
    ? 'Cotización eliminada ✓ · el inventario volvió a su lugar'
    : 'Cotización eliminada ✓');
  return true;
}

$('#contenido').addEventListener('click', async (e) => {
  // Un enlace adentro de un renglón que también es botón —el PDF dentro de la
  // cotización— hace lo suyo y no abre el renglón. Se mira acá y no con
  // stopPropagation en el enlace, porque eso también le cortaría el paso al
  // visor de PDF, que escucha en el documento.
  if (e.target.closest('a[href]')) return;

  const renglon = e.target.closest('.deslizable');
  if (renglon && !e.target.closest('.cot-cajon')) {
    // El toque con el que se termina de deslizar no es un toque sobre el
    // renglón: si lo fuera, abrir el cajón abriría también la cotización.
    if (recienArrastrado === renglon) { recienArrastrado = null; return; }
    // Con el cajón abierto, tocar el renglón lo cierra. Es lo que uno intenta.
    if (renglon.classList.contains('abierto')) { cerrarCajones(); return; }
  }

  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const { accion, entidad, id } = boton.dataset;

  if (accion === 'editar' || accion === 'cancelar-edicion') {
    estado.editando = accion === 'editar';
    // El formulario de una cita se abre por cita, no con el mismo interruptor
    // que el resto de las fichas: sin esto, Cancelar en la agenda no cerraba
    // nada y el formulario se quedaba ahí.
    if (accion === 'cancelar-edicion') estado.citaEditando = null;
    await pintar();
    return;
  }

  if (accion === 'tema') {
    guardarTema(boton.dataset.tema);
    // Se marca la elegida a mano en vez de repintar toda la pantalla: repintar
    // haría saltar el scroll al principio justo cuando se está mirando esto.
    $$('.opcion-tema').forEach((b) => b.classList.toggle('elegida', b === boton));
    return;
  }

  if (accion === 'eliminar-cotizacion') {
    if (!estado.cotizacionAbierta) return;
    try {
      if (!await eliminarCotizacionConAviso(estado.cotizacionAbierta)) return;
      // La ficha que se estaba mirando ya no existe: hay que volver a la lista.
      fichaEnHistorial = false;
      estado.cotizacionAbierta = null;
      estado.vista = 'cotizaciones';
      estado.editando = false;
      $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'cotizaciones'));
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  // Los tres puntos abren el mismo cajón que el deslizado, para el que no
  // conoce el gesto o el teléfono no se lo toma.
  if (accion === 'mas-opciones') {
    const item = boton.closest('.deslizable');
    if (item.classList.contains('abierto')) cerrarCajones();
    else abrirCajon(item);
    return;
  }

  // La misma acción desde el cajón de la lista, sin entrar a la cotización.
  if (accion === 'borrar-cot') {
    try {
      if (!await eliminarCotizacionConAviso(Number(id))) { cerrarCajones(); return; }
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  // Ver la oferta sin entrar a la cotización: la arma al vuelo con lo que
  // tiene hoy y la muestra en una pestaña de verdad. No la guarda ni la manda
  // a ningún lado —para eso está "Guardar PDF"—, sólo mira.
  if (accion === 'ver-pdf-cot') {
    const original = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '…';
    try {
      await verPdfGenerado({ id: Number(id) }, boton.dataset.titulo || 'Cotización');
    } catch (err) {
      avisar(err.message, true);
    } finally {
      boton.disabled = false;
      boton.innerHTML = original;
    }
    return;
  }

  if (accion === 'guardar-pdf') {
    if (!estado.cotizacionAbierta) return;
    const rotulo = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Armando el PDF…';
    try {
      // Se relee la cotización en vez de guardarla al pintar: así el PDF sale
      // con lo último, aunque se hayan tocado renglones desde que se abrió.
      const cot = await api(`/cotizaciones/${estado.cotizacionAbierta}`);
      const r = await guardarPdfDeCotizacion(cot);
      // Cuando abre el menú del sistema no se sabe qué eligió: guardar,
      // mandar por WhatsApp, o nada. Por eso el aviso no promete ninguna
      // de las tres.
      if (r.cancelado) avisar('Listo, no se hizo nada.');
      else if (r.bajado) avisar('PDF guardado ✓');
      else avisar('Listo ✓');
    } catch (err) {
      avisar(err.message, true);
    } finally {
      boton.disabled = false;
      boton.textContent = rotulo;
    }
    return;
  }
  if (accion === 'abrir-producto') {
    anotarFichaEnHistorial();
    estado.productoAbierto = Number(id);
    estado.editando = false;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'cerrar-producto') {
    await cerrarFicha();
    return;
  }
  if (accion === 'cambiar-foto') {
    estado.subiendoFotoPara = Number(id);
    $('#input-foto').click();
    return;
  }
  if (accion === 'agregar-foto-galeria') {
    estado.subiendoGaleriaPara = Number(id);
    $('#input-foto-galeria').click();
    return;
  }
  if (accion === 'quitar-foto-galeria') {
    try {
      await api(`/productos/${id}/fotos`, { method: 'DELETE', body: { url: boton.dataset.url } });
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'editar-item') {
    estado.itemEditando = estado.itemEditando === Number(id) ? null : Number(id);
    await pintar();
    return;
  }
  if (accion === 'cancelar-item') {
    estado.itemEditando = null;
    await pintar();
    return;
  }
  if (accion === 'quitar-logo') {
    if (!confirm('¿Quitar el logo de las cotizaciones?')) return;
    try {
      await api('/ajustes/logo', { method: 'DELETE' });
      avisar('Logo quitado ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'subir-logo') {
    $('#input-logo').click();
    return;
  }
  if (accion === 'editar-cita') {
    estado.citaEditando = estado.citaEditando === Number(id) ? null : Number(id);
    await pintar();
    $(`#form-editar input[name="titulo"]`)?.focus();
    return;
  }
  if (accion === 'agrupar-por-categoria') {
    const boton = e.target.closest('[data-accion]');
    boton.disabled = true;
    boton.textContent = 'Agrupando…';
    try {
      const { etiquetados } = await api('/productos/tipos', { method: 'POST' });
      avisar(etiquetados
        ? `${etiquetados} productos agrupados por el nombre de su pestaña.`
        : 'No había ninguno para agrupar.');
      await pintar();
    } catch (err) {
      boton.disabled = false;
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'cotizaciones-de') {
    const b = e.target.closest('[data-accion]');
    estado.clienteCotizaciones = { id: Number(id), nombre: b.dataset.nombre };
    estado.clienteAbierto = null;
    estado.buscarCotizaciones = '';
    estado.vista = 'cotizaciones';
    $$('.nav-item').forEach((n) => n.classList.toggle('activo', n.dataset.vista === 'cotizaciones'));
    await pintar();
    return;
  }
  if (accion === 'quitar-filtro-cliente') {
    estado.clienteCotizaciones = null;
    await pintar();
    return;
  }
  if (accion === 'filtrar-portal') {
    estado.filtroPortal = e.target.closest('[data-accion]').dataset.estado || 'pendiente';
    await pintar();
    return;
  }
  if (accion === 'rechazar-portal') {
    if (!confirm('¿Rechazar este registro? No va a poder entrar al catálogo.')) return;
    try {
      await api(`/portal/usuarios/${id}/rechazar`, { method: 'POST', body: {} });
      avisar('Registro rechazado');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'alternar-clave-portal') {
    estado.portalClaveAbierta = estado.portalClaveAbierta === Number(id) ? null : Number(id);
    await pintar();
    return;
  }
  if (accion === 'generar-clave-portal') {
    // Fácil de leer y de dictar por teléfono: sin 0/O ni 1/l/I, que se
    // confunden al copiarla a mano.
    const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const clave = Array.from({ length: 8 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('');
    const input = boton.closest('.portal-clave-form')?.querySelector('[name="clave"]');
    if (input) { input.value = clave; input.type = 'text'; input.select(); }
    return;
  }
  if (accion === 'filtrar-estado-cot') {
    estado.filtroEstadoCot = e.target.closest('[data-accion]').dataset.estado || null;
    await pintar();
    return;
  }
  if (accion === 'alternar-historial-cot') {
    estado.verHistorialCot = !estado.verHistorialCot;
    await pintar();
    return;
  }
  if (accion === 'limpiar-clientes-formulario') {
    try {
      const { candidatos } = await api('/clientes-del-formulario');
      if (!candidatos.length) {
        avisar('No hay ninguno para quitar: la lista ya está limpia.');
        return;
      }
      // Se enumeran de verdad, no un "se van a borrar 8": ver los nombres es
      // lo único que permite darse cuenta de que uno no debería estar ahí.
      const nombres = candidatos.slice(0, 12).map((c) => `· ${c.nombre}`).join('\n');
      const resto = candidatos.length > 12 ? `\n… y ${candidatos.length - 12} más` : '';
      if (!confirm(`Se van a quitar ${candidatos.length} cliente(s) que había creado el formulario:\n\n${
        nombres}${resto}\n\nSus entregas quedan en la agenda, con el nombre y los datos del residente.\n\n¿Seguimos?`)) return;

      const r = await api('/clientes-del-formulario', { method: 'POST', body: {} });
      avisar(`Listo: ${r.borrados} cliente(s) fuera de la lista ✓`);
      await refrescarTodo();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'cotizar-producto') {
    // Tocarlo otra vez lo cierra: sirve de escape sin tener que apuntarle al
    // botón de cancelar.
    estado.cotizandoProducto = estado.cotizandoProducto === Number(id) ? null : Number(id);
    await pintarSinMoverse();
    sincronizarFlotantes();
    const campo = $('.cotizar-producto input[name="cantidad"]');
    if (campo) { campo.focus(); campo.select(); }
    return;
  }
  if (accion === 'cancelar-cotizar') {
    estado.cotizandoProducto = null;
    await pintarSinMoverse();
    sincronizarFlotantes();
    return;
  }
  if (accion === 'alternar-estado-cot') {
    const actual = await api(`/cotizaciones/${id}`);
    const nuevo = SIGUIENTE_ESTADO_COT[actual.estado] || 'aprobada';
    try {
      await api(`/cotizaciones/${id}`, { method: 'PATCH', body: { estado: nuevo } });
      avisar({
        aprobada: 'Marcada como aprobada ✓',
        rechazada: 'Queda como no aprobada. No suma al cotizado del cliente.',
        pendiente: 'Vuelve a estar pendiente',
      }[nuevo]);
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'cerrar-cot' || accion === 'reabrir-cot') {
    const cerrando = accion === 'cerrar-cot';
    try {
      await api(`/cotizaciones/${id}/cerrar`, { method: cerrando ? 'POST' : 'DELETE' });
      avisar(cerrando ? 'Cotización cerrada ✓ Queda en el historial.' : 'Vuelve a la lista.');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'ver-pendientes' || accion === 'ver-hechos') {
    estado.verHechos = accion === 'ver-hechos';
    estado.recordatorioEditando = null;
    await pintar();
    return;
  }
  if (accion === 'editar-recordatorio') {
    estado.recordatorioEditando = estado.recordatorioEditando === Number(id) ? null : Number(id);
    await pintar();
    $('#form-editar textarea, #form-editar input')?.focus();
    return;
  }
  if (accion === 'filtrar-tipo') {
    const t = e.target.closest('[data-accion]').dataset.tipo;
    estado.tipoProducto = t || null;
    await pintar();
    return;
  }
  if (accion === 'subir-ficha') {
    estado.subiendoFichaPara = Number(id);
    $('#input-ficha').click();
    return;
  }
  if (accion === 'quitar-ficha') {
    if (!confirm('¿Quitar la ficha técnica de este producto?')) return;
    try {
      await api(`/productos/${id}/ficha`, { method: 'DELETE' });
      avisar('Ficha quitada ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'alternar-nuevo-cliente') {
    estado.nuevoCliente = !estado.nuevoCliente;
    await pintar();
    return;
  }
  if (accion === 'alternar-subir-oferta') {
    estado.subiendoOferta = !estado.subiendoOferta;
    await pintar();
    return;
  }
  if (accion === 'subir-pdf') {
    estado.subiendoPdfPara = Number(id);
    $('#input-pdf').click();
    return;
  }
  if (accion === 'quitar-pdf') {
    if (!confirm('¿Quitar el PDF adjunto? La cotización se queda; sólo se borra el archivo.')) return;
    try {
      await api(`/cotizaciones/${id}/archivo`, { method: 'DELETE' });
      avisar('PDF quitado ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'ver-listas' || accion === 'cerrar-listas') {
    estado.viendoListas = accion === 'ver-listas';
    estado.pruebaLista = null;
    await pintar();
    return;
  }
  if (accion === 'cancelar-prueba') {
    estado.pruebaLista = null;
    await pintar();
    return;
  }
  if (accion === 'borrar-lista') {
    if (!confirm('¿Quitar esta lista? Los productos que ya trajo se quedan en el catálogo.')) return;
    try {
      await api(`/listas/${id}`, { method: 'DELETE' });
      avisar('Lista quitada ✓');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (accion === 'revisar-lista' || accion === 'sincronizar-lista') {
    const simular = accion === 'revisar-lista';
    const boton = e.target.closest('[data-accion]');
    const tarjeta = boton.closest('.lista-online');
    const antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = simular ? 'Comparando…' : 'Trayendo…';
    try {
      const inf = await api(`/listas/${id}/sincronizar`, { method: 'POST', body: { simular } });
      tarjeta.querySelector('.lista-informe').innerHTML = informeImportacion(inf, { aplicado: !simular });
      boton.textContent = antes;
      boton.disabled = false;
      if (!simular) {
        avisar(`${inf.nuevos.length} nuevos, ${inf.actualizados.length} actualizados`);
        await refrescarResumen();
      }
    } catch (err) {
      boton.textContent = antes;
      boton.disabled = false;
      tarjeta.querySelector('.lista-informe').innerHTML =
        `<p class="ayuda" style="color:var(--rojo);margin:8px 0 0">${escapar(err.message)}</p>`;
    }
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
  if (accion === 'importar-fichas') {
    $('#input-fichas').click();
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
    const tipo = tarjeta.querySelector('.import-tipo').value.trim();
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
          categoria, tipo, filas, simular,
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
    anotarFichaEnHistorial();
    estado.clienteAbierto = Number(id);
    estado.editando = false;
    estado.cotizacionAbierta = null;
    estado.vistaAsistente = null;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'cerrar-cliente') {
    await cerrarFicha();
    return;
  }
  if (accion === 'abrir-cotizacion') {
    anotarFichaEnHistorial();
    estado.cotizacionAbierta = Number(id);
    // Desde el cajón se pidió editarla: se abre con el formulario ya desplegado.
    estado.editando = boton.dataset.editar === '1';
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
    await cerrarFicha();
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
      // Borrar un cliente se lleva TODO lo suyo, así que primero se dice qué
      // es «todo» con números: un «¿seguro?» pelado no alcanza para algo que
      // no tiene vuelta atrás.
      if (entidad === 'clientes') {
        const arrastra = await api(`/clientes/${id}/arrastra`);
        const detalle = [
          [arrastra.cotizaciones, 'cotización', 'cotizaciones'],
          [arrastra.abonos, 'abono', 'abonos'],
          [arrastra.cobros, 'cobro', 'cobros'],
          [arrastra.citas, 'cita', 'citas'],
          [arrastra.recordatorios, 'pendiente', 'pendientes'],
          [arrastra.notas, 'nota', 'notas'],
        ].filter(([n]) => n > 0).map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);

        const aviso = detalle.length
          ? `Se va a borrar este cliente y todo lo suyo:\n\n· ${detalle.join('\n· ')}\n\n`
            + 'Lo que hubiera salido de bodega por sus cotizaciones aprobadas vuelve al inventario.\n\n'
            + 'Esto no se puede deshacer. ¿Seguimos?'
          : 'Este cliente no tiene nada cargado. ¿Borrarlo?';
        if (!confirm(aviso)) return;
      } else if (!confirm('¿Borrar este registro definitivamente?')) return;

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
  // Un producto del catálogo directo a la cotización que se está armando.
  if (e.target.classList.contains('cotizar-producto')) {
    e.preventDefault();
    const q = estado.resumen?.enCurso;
    if (!q) { avisar('No hay ninguna cotización abierta.', true); return; }

    const producto_id = Number(e.target.dataset.id);
    const cantidad = Number(new FormData(e.target).get('cantidad')) || 1;
    const boton = e.target.querySelector('button[type="submit"]');
    if (boton) { boton.disabled = true; boton.textContent = 'Agregando…'; }

    try {
      const item = await api(`/cotizaciones/${q.id}/items`, { method: 'POST', body: { producto_id, cantidad } });
      estado.cotizandoProducto = null;
      // El resumen primero: es de donde sale el total que se va a avisar y el
      // renglón de arriba, y sin refrescarlo mostraría el de antes.
      await refrescarResumen();
      const tot = estado.resumen?.enCurso?.totales;
      avisar(`Agregado: ${item.cantidad} × ${nombreCortoDeProducto(item.descripcion, 32)}${
        tot ? ` · total ${fmtDinero(tot.total, q.moneda)}` : ''} ✓`);
      await pintarSinMoverse();
      sincronizarFlotantes();
      // El buscador queda listo para el siguiente: cargando de a veinte
      // renglones, volver a tocarlo cada vez es la mitad del trabajo.
      const buscador = $('#buscar-productos');
      if (buscador && !esCelular()) { buscador.focus(); buscador.select(); }
    } catch (err) {
      avisar(err.message, true);
      if (boton) { boton.disabled = false; boton.textContent = 'Agregar a la cotización'; }
    }
    return;
  }

  // Aprobar un registro del portal, con el nivel de precio que le corresponde.
  if (e.target.classList.contains('portal-aprobar')) {
    e.preventDefault();
    const nivel_precio = new FormData(e.target).get('nivel_precio');
    if (!nivel_precio) { avisar('Elegí con qué precio lo vas a dejar ver.', true); return; }
    const idPortal = e.target.dataset.id;
    const boton = e.target.querySelector('button[type="submit"]');
    if (boton) { boton.disabled = true; boton.textContent = 'Aprobando…'; }
    try {
      await api(`/portal/usuarios/${idPortal}/aprobar`, { method: 'POST', body: { nivel_precio } });
      avisar('Cliente aprobado ✓ Ya puede entrar al catálogo.');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
      if (boton) { boton.disabled = false; boton.textContent = 'Aprobar'; }
    }
    return;
  }

  // Ponerle una contraseña nueva a alguien del portal —a mano, o la que
  // generó el botón de arriba—. No hace falta la vieja, y no cambia si
  // puede entrar o con qué precio: sólo la clave.
  if (e.target.classList.contains('portal-clave-form')) {
    e.preventDefault();
    const idPortal = e.target.dataset.id;
    const clave = new FormData(e.target).get('clave');
    const boton = e.target.querySelector('button[type="submit"]');
    if (boton) { boton.disabled = true; boton.textContent = 'Guardando…'; }
    try {
      await api(`/portal/usuarios/${idPortal}/clave`, { method: 'POST', body: { clave } });
      avisar('Contraseña actualizada ✓');
      estado.portalClaveAbierta = null;
      await pintar();
    } catch (err) {
      avisar(err.message, true);
      if (boton) { boton.disabled = false; boton.textContent = 'Guardar contraseña'; }
    }
    return;
  }

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
      const guardado = await api(`/${entidad}/${id}`, { method: 'PATCH', body: datos });

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
      estado.citaEditando = null;
      estado.recordatorioEditando = null;

      // Cambiar la lista de precios vuelve a ponerle precio a los renglones que
      // ya estaban: se dice cuántos cambiaron, y sobre todo cuáles NO, para que
      // un precio tocado a mano no parezca un olvido.
      const respetados = guardado?.renglonesRespetados ?? [];
      if (guardado?.renglonesActualizados) {
        avisar(`${guardado.renglonesActualizados} renglón(es) con el precio nuevo ✓`
          + (respetados.length
            ? ` · ${respetados.length} quedó(aron) como estaba(n): les escribiste el precio a mano`
            : ''));
      } else if (respetados.length) {
        avisar(`Guardado, pero no cambié precios: a esos ${respetados.length} renglón(es) les escribiste el precio a mano.`);
      } else {
        avisar('Datos actualizados ✓');
      }

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

  if (e.target.id === 'form-nuevo-cliente') {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    for (const k of Object.keys(datos)) if (datos[k] === '') delete datos[k];
    if (!datos.nombre) return avisar('El cliente necesita un nombre.', true);
    try {
      await api('/clientes', { method: 'POST', body: datos });
      estado.nuevoCliente = false;
      avisar('Cliente agregado ✓');
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
      const r = await api(`/cotizaciones/${e.target.dataset.id}`, {
        method: 'PATCH',
        body: {
          porcentaje_servicio: Number(d.porcentaje_servicio) || 0,
          porcentaje_iva: Number(d.porcentaje_iva) || 0,
        },
      });
      // Cambiar de lista de precios vuelve a poner precio a los renglones: hay
      // que decir cuántos cambiaron, y sobre todo cuáles NO, para que un
      // precio que se tocó a mano no parezca un olvido.
      const respetados = r.renglonesRespetados ?? [];
      if (r.renglonesActualizados) {
        avisar(`${r.renglonesActualizados} renglón(es) con el precio nuevo ✓`
          + (respetados.length
            ? ` · ${respetados.length} quedó(aron) como estaba(n): les escribiste el precio a mano`
            : ''));
      } else if (respetados.length) {
        avisar(`No cambié ningún precio: a esos ${respetados.length} renglón(es) les escribiste el precio a mano.`);
      } else {
        avisar('Totales actualizados ✓');
      }
      await refrescarResumen();
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-subir-oferta') {
    e.preventDefault();
    const datos = new FormData(e.target);
    const archivo = datos.get('archivo');
    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Subiendo…';
    try {
      // Primero la cotización, para tener el número al que pertenece el
      // archivo; después el PDF. Si el PDF falla, la cotización ya quedó
      // creada y se le puede adjuntar desde su ficha sin volver a cargar todo.
      const cot = await api('/cotizaciones', {
        method: 'POST',
        body: {
          titulo: datos.get('titulo'),
          cliente: datos.get('cliente') || undefined,
          monto: Number(datos.get('monto')) || 0,
          vence_en: datos.get('vence_en') || undefined,
          // Subir el archivo no significa habérsela mandado al cliente: nace
          // pendiente, y se marca como enviada cuando de verdad salga.
          estado: 'pendiente',
        },
      });
      if (archivo && archivo.size) {
        await api(`/cotizaciones/${cot.id}/archivo`, {
          method: 'POST',
          body: { archivo_base64: await aDataUrl(archivo), nombre: archivo.name },
        });
      }

      estado.subiendoOferta = false;
      estado.cotizacionAbierta = cot.id;
      avisar('Cotización creada ✓');
      await refrescarResumen();
      await pintar();
    } catch (err) {
      boton.disabled = false;
      boton.textContent = 'Crear la cotización';
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-probar-lista') {
    e.preventDefault();
    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Probando…';
    try {
      const url = new FormData(e.target).get('url');
      estado.pruebaLista = { ...await api('/listas/probar', { method: 'POST', body: { url } }), url };
      await pintar();
    } catch (err) {
      boton.disabled = false;
      boton.textContent = 'Probar';
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.id === 'form-conectar-lista') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api('/listas', {
        method: 'POST',
        body: {
          nombre: d.nombre,
          categoria: d.categoria,
          tipo: d.tipo,
          url: estado.pruebaLista.url,
          hoja: 0,
          manejaInventario: d.manejaInventario === '1',
          mapeo: estado.pruebaLista.mapeo,
        },
      });
      estado.pruebaLista = null;
      avisar('Lista conectada ✓ Ya podés traerla cuando quieras.');
      await pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

  if (e.target.classList.contains('form-item')) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/cotizacion_items/${e.target.dataset.id}`, { method: 'PATCH', body: d });
      estado.itemEditando = null;
      avisar('Renglón actualizado ✓');
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
let buscarCotizacionesTimer;
$('#contenido').addEventListener('input', (e) => {
  if (e.target.id === 'buscar-cotizaciones') {
    estado.buscarCotizaciones = e.target.value;
    clearTimeout(buscarCotizacionesTimer);
    buscarCotizacionesTimer = setTimeout(() => {
      if (estado.vista === 'cotizaciones' && !estado.cotizacionAbierta) pintar();
    }, 300);
    return;
  }

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
  // Descontinuar los ausentes es por lista y se recuerda: es la diferencia
  // entre una hoja que manda sobre el catálogo y una que sólo lo alimenta.
  const marca = e.target.closest('.lista-descontinuar');
  if (marca) {
    try {
      await api(`/listas/${marca.dataset.id}`, {
        method: 'PATCH',
        body: { descontinuarAusentes: marca.checked },
      });
      avisar(marca.checked
        ? 'Los que dejen de venir se van a descontinuar.'
        : 'Los que dejen de venir se van a conservar.');
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }

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

// Fotos de más para el catálogo público: se suben de a varias, una atrás de
// otra, para no obligar a repetir el toque por cada una.
$('#input-foto-galeria').addEventListener('change', async (e) => {
  const archivos = [...e.target.files];
  e.target.value = '';
  if (!archivos.length || !estado.subiendoGaleriaPara) return;
  const id = estado.subiendoGaleriaPara;
  try {
    for (const archivo of archivos) {
      const { dataUrl } = await encoger(archivo);
      await api(`/productos/${id}/fotos`, { method: 'POST', body: { imagen_base64: dataUrl } });
    }
    avisar(`${archivos.length > 1 ? `${archivos.length} fotos agregadas` : 'Foto agregada'} ✓`);
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// La ficha técnica del fabricante, pegada al producto.
$('#input-ficha').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo || !estado.subiendoFichaPara) return;
  try {
    await api(`/productos/${estado.subiendoFichaPara}/ficha`, {
      method: 'POST',
      body: { archivo_base64: await aDataUrl(archivo), nombre: archivo.name },
    });
    avisar('Ficha técnica cargada ✓');
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Muchas fichas de una: cada archivo se empareja con su producto por el
// nombre —sin la extensión—, que tiene que ser la referencia tal como está
// en el catálogo. Sirve para cargar de una vez lo que se armó por fuera.
$('#input-fichas').addEventListener('change', async (e) => {
  const archivos = [...e.target.files];
  e.target.value = '';
  if (!archivos.length) return;

  avisar(`Subiendo ${archivos.length} ficha(s)…`);
  try {
    const cuerpos = await Promise.all(archivos.map(async (archivo) => ({
      referencia: archivo.name.replace(/\.pdf$/i, ''),
      nombre: archivo.name,
      archivo_base64: await aDataUrl(archivo),
    })));
    const r = await api('/productos/fichas/lote', { method: 'POST', body: { archivos: cuerpos } });
    avisar(r.sinCoincidencia.length
      ? `${r.adjuntadas.length} pegada(s) ✓ · ${r.sinCoincidencia.length} sin producto que coincida: ${
          r.sinCoincidencia.join(', ')}`
      : `${r.adjuntadas.length} ficha(s) técnica(s) pegada(s) ✓`,
      Boolean(r.sinCoincidencia.length));
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// Adjuntar (o reemplazar) el PDF de una cotización desde su ficha.
$('#input-pdf').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo || !estado.subiendoPdfPara) return;
  try {
    await api(`/cotizaciones/${estado.subiendoPdfPara}/archivo`, {
      method: 'POST',
      body: { archivo_base64: await aDataUrl(archivo), nombre: archivo.name },
    });
    avisar('PDF adjuntado ✓');
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

// El logo de la empresa. Se achica igual que las fotos, pero a 600 píxeles:
// tiene que verse nítido arriba de la hoja, no es una uña de catálogo.
$('#input-logo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  try {
    const imagen_base64 = await encogerOTalCual(archivo, { lado: 600, calidad: 0.9 });
    await api('/ajustes/logo', { method: 'POST', body: { imagen_base64 } });
    avisar('Logo actualizado ✓');
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

// El único botón que vive dentro de la conversación: el de recargar cuando el
// audio del teléfono quedó trabado y no hay otra salida.
$('#conversacion').addEventListener('click', (e) => {
  if (e.target.closest('[data-accion="recargar-app"]')) recargarConservandoCharla();
});

// Marcar "manos libres" sin estar ya en una conversación no hacía nada por sí
// solo: sólo se usaba la próxima vez que el micrófono se abriera a mano.
// Quien lo prende espera que empiece a escuchar ya, como si hubiera tocado
// el micrófono — así que lo hace.
$('#manos-libres').addEventListener('change', () => {
  if (manosLibres() && VOZ_DISPONIBLE && !escuchando && !arrancando) alternarMicrofono();
});

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

// El piñón lleva a los ajustes. En el celular es el único camino: la barra de
// abajo no tiene lugar para ellos, así que antes no se podía ni poner el
// representante de ventas ni cambiar el logo desde el teléfono.
$('#btn-ajustes').addEventListener('click', () => {
  estado.vista = 'ajustes';
  estado.vistaAsistente = null;
  estado.cotizacionAbierta = null;
  estado.clienteAbierto = null;
  estado.productoAbierto = null;
  estado.editando = false;
  $$('.nav-item').forEach((b) => b.classList.remove('activo'));
  cerrarHoja();
  pintar();
  $('#contenido').scrollTop = 0;
});

/**
 * ¿El cursor está adentro de algo donde se escribe?
 *
 * Hace falta para no robarle la barra espaciadora a un formulario. Antes sólo
 * se perdonaba el cuadro del chat, así que en cualquier otro campo —el nombre
 * de un cliente, el asunto de una cotización, una descripción— el espacio se
 * lo comía el micrófono y las palabras quedaban pegadas.
 *
 * Van todos los campos, no sólo los de texto: en una casilla o un desplegable
 * la barra espaciadora ya tiene su trabajo, que es marcarla o abrirlo.
 */
const escribiendo = () => {
  const el = document.activeElement;
  return Boolean(el) && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
};

document.addEventListener('keydown', (e) => {
  // Barra espaciadora = hablar (si no estás escribiendo)
  if (e.code === 'Space' && !escribiendo() && !e.repeat) {
    e.preventDefault();
    alternarMicrofono();
  }
  if (e.key === 'Escape') {
    if (!$('#visor-pdf').hidden) cerrarVisorPdf();
    else cerrarHoja();
  }
});

// Los PDF propios se abren adentro, con su botón de cerrar. Los de afuera —o
// si alguien abre en pestaña nueva a propósito— siguen su curso normal.
document.addEventListener('click', (e) => {
  const enlace = e.target.closest('a[href]');
  if (!enlace || e.metaKey || e.ctrlKey || e.shiftKey) return;
  if (enlace.id === 'visor-aparte') return;

  const href = enlace.getAttribute('href') || '';
  if (!href.startsWith('/uploads/') || !href.split('?')[0].endsWith('.pdf')) return;

  e.preventDefault();
  abrirVisorPdf(href, enlace.dataset.titulo || 'Documento');
});

$('#visor-cerrar').addEventListener('click', () => cerrarVisorPdf());
$('#visor-compartir').addEventListener('click', (e) => {
  const { url, titulo } = e.currentTarget.dataset;
  // Si cancela la hoja de compartir, el navegador rechaza la promesa con
  // AbortError: no es un error real, no hay nada que avisar.
  navigator.share({ url, title: titulo }).catch(() => {});
});

// Que un bloque plegado siga plegado la próxima vez que se entre.
$('#contenido').addEventListener('toggle', (e) => {
  const det = e.target.closest('details.plegable');
  if (!det) return;
  localStorage.setItem(`plegado:${det.dataset.clave}`, det.open ? '0' : '1');
}, true);

// El gesto de "atrás" del teléfono cierra el visor en vez de salir de la app.
window.addEventListener('popstate', () => {
  // El visor de PDF va encima de todo, así que el primer "atrás" lo cierra a
  // él; el siguiente ya cierra la ficha.
  if (!$('#visor-pdf').hidden) {
    cerrarVisorPdf({ desdeHistorial: true });
    return;
  }
  if (fichaEnHistorial) cerrarFicha({ desdeHistorial: true });
});

// Al girar el teléfono o pasar a escritorio, la hoja vuelve a su sitio.
window.addEventListener('resize', () => { if (!esCelular()) cerrarHoja(); });

/* ─────────── Dónde se estaba ─────────── */
/*
 * Salir a ver un PDF y volver dejaba la aplicación en el tablero: el celular
 * descarga la pantalla mientras uno está afuera, y al volver la aplicación
 * arranca de cero, como si recién se abriera. Había que entrar otra vez a la
 * cotización, bajar y seguir. Se anota en qué se estaba —sólo en esta pestaña,
 * con sessionStorage— y al arrancar se vuelve ahí.
 */
const DONDE = 'ari-donde';

function anotarDondeEstoy() {
  try {
    sessionStorage.setItem(DONDE, JSON.stringify({
      vista: estado.vista,
      cotizacion: estado.cotizacionAbierta,
      cliente: estado.clienteAbierto,
      producto: estado.productoAbierto,
    }));
  } catch { /* en privado no deja escribir; no es grave */ }
}

/** Vuelve a donde estaba, si eso todavía existe. */
async function volverDondeEstaba() {
  let donde;
  try { donde = JSON.parse(sessionStorage.getItem(DONDE) || 'null'); } catch { return false; }
  if (!donde?.vista) return false;

  // Lo abierto puede haberse borrado desde otro lado: si ya no está, se vuelve
  // a la lista y no a una ficha en blanco.
  const sigueAhi = async (que, id) => {
    if (!id) return false;
    try { return Boolean((await api(`/${que}/${id}`))?.id); } catch { return false; }
  };

  estado.vista = donde.vista;
  if (await sigueAhi('cotizaciones', donde.cotizacion)) estado.cotizacionAbierta = donde.cotizacion;
  else if (await sigueAhi('clientes', donde.cliente)) estado.clienteAbierto = donde.cliente;
  else if (await sigueAhi('productos', donde.producto)) estado.productoAbierto = donde.producto;

  $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === estado.vista));
  return true;
}

/* ─────────── Arranque ─────────── */

(async function arrancar() {
  iniciarVoz();
  if (VOZ_DISPONIBLE) $('#pista').textContent = PISTA_INICIAL;

  // Si se llegó acá recargando para destrabar el micrófono, la conversación
  // vuelve donde estaba: la recarga tiene que sentirse un tropiezo, no un
  // volver a empezar.
  const vuelta = restaurarCharla();
  if (vuelta) {
    abrirHoja();
    $('#pista').textContent = vuelta.listo
      ? 'Micrófono nuevo. Tocalo y seguí dictando.'
      : 'Listo, el micrófono quedó libre. Tocalo y seguí dictando.';
  }

  try {
    const s = await api('/estado');
    // La versión de la interfaz al lado del modelo: si después de actualizar
    // el servidor este número no cambió, la pantalla se quedó con la anterior.
    VERSION.compilado = s.compilado || '';
    VERSION.interfaz = s.version || '';
    VERSION.modelo = s.modelo || '';
    $('#estado-modelo').textContent = `modelo · ${s.modelo}${s.version ? `\nversión · ${s.version}` : ''}`;
    $('#estado-modelo').style.whiteSpace = 'pre-line';

    // Archivos nuevos en disco pero Node corriendo los viejos: la pantalla
    // muestra botones que el servidor todavía no sabe atender.
    if (s.servidorViejo) {
      burbuja('ari error', `<p><b>El servidor quedó con la versión anterior.</b></p>
        <p>Los archivos nuevos ya están subidos, pero Node sigue corriendo el código de antes.
        Entrá a <b>cPanel → Setup Node.js App</b> y tocá <b>Restart</b>.</p>
        <p>Mientras tanto puede que algún botón nuevo dé error.</p>`);
    }
    if (s.conAcceso) $('#salir').hidden = false;
    if (!s.vozLista) {
      burbuja('ari error', 'Falta configurar <b>ANTHROPIC_API_KEY</b> en el archivo <code>.env</code> del servidor.');
    }
  } catch { /* el servidor dirá */ }

  await volverDondeEstaba();
  await refrescarTodo();
  setInterval(refrescarResumen, 60_000);
})();

