/* ══════════════════════════════════════════════════════════════════
   Catálogo público · Clic Control
   Página aparte del panel de Ari: no comparte sesión ni código con él.
   Quien la abre puede ser cualquiera de la calle, hasta que se registra,
   lo aprueban, y entra con SU propia cuenta.
   ══════════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const fmtDinero = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** '2026-08-07 10:00:00' -> '7 de ago.' */
function fechaCorta(v) {
  const f = String(v ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

const ETIQUETA_ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'No aprobada' };

async function api(ruta, opciones = {}) {
  const r = await fetch(`/api/portal${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(datos.error || `Error ${r.status}`);
    err.estado = datos.estado;
    throw err;
  }
  return datos;
}

const estado = {
  vista: 'cargando',   // cargando | acceso | catalogo | pedidos
  usuario: null,        // { nombre, email, nivel_precio } o, para el dueño mirando desde el panel, { esAdmin: true, nombre, nivel_precio }
  modoAcceso: 'login',  // login | registro | olvide
  catalogo: [],
  buscar: '',
  filtroTipo: '',
  carrito: new Map(),    // producto_id -> {producto, cantidad}
  detalle: null,         // id del producto abierto en la ficha, o null
  fotoActual: new Map(), // producto_id -> índice de la foto que se está mostrando
  pedidos: null,         // se trae la primera vez que se abre "Mis pedidos"
};

function avisar(texto, esError = false) {
  // Uno a la vez: un segundo aviso que llegara antes de que el primero
  // terminara de desaparecer los dejaba superpuestos, los dos en el mismo
  // lugar de la pantalla, y el que se leía era el viejo.
  $$('.toast').forEach((t) => t.remove());
  const div = document.createElement('div');
  div.className = `toast${esError ? ' error' : ''}`;
  div.textContent = texto;
  document.body.append(div);
  requestAnimationFrame(() => div.classList.add('mostrar'));
  setTimeout(() => { div.classList.remove('mostrar'); setTimeout(() => div.remove(), 250); }, 3200);
}

/* ─────────── Arranque: ¿quién sos? ─────────── */

async function arrancar() {
  try {
    const u = await api('/quien-soy');
    estado.usuario = u;
    estado.vista = 'catalogo';
    await cargarCatalogo();
  } catch {
    estado.vista = 'acceso';
  }
  pintar();
}

async function cargarCatalogo() {
  const nivel = estado.usuario?.esAdmin ? `?nivel=${encodeURIComponent(estado.usuario.nivel_precio)}` : '';
  const { filas } = await api(`/catalogo${nivel}`);
  estado.catalogo = filas;
}

/* ─────────── Pantalla de acceso: login, registro u olvidé mi clave ─────────── */

function vistaAcceso() {
  if (estado.modoAcceso === 'olvide') {
    return `
      <div class="caja-acceso">
        <h1>Recuperar tu contraseña</h1>
        <p class="ayuda">
          Acá no se manda ningún correo automático: escribí el correo con el que te
          registraste y le avisamos al equipo para que te ayude a entrar de nuevo.
        </p>
        <form id="form-olvide">
          <label><span>Correo</span><input name="email" type="email" required autocomplete="email" /></label>
          <button class="btn-primario ancho" type="submit">Avisarle al equipo</button>
        </form>
        <p class="cambiar-modo">¿Ya te acordaste? <button data-accion="ir-login">Iniciá sesión</button></p>
      </div>`;
  }
  if (estado.modoAcceso === 'login') {
    return `
      <div class="caja-acceso">
        <h1>Entrá a tu catálogo</h1>
        <p class="ayuda">Con el correo y la contraseña que usaste al registrarte.</p>
        <form id="form-login">
          <label><span>Correo</span><input name="email" type="email" required autocomplete="email" /></label>
          <label><span>Contraseña</span><input name="clave" type="password" required autocomplete="current-password" /></label>
          <button class="btn-primario ancho" type="submit">Entrar</button>
        </form>
        <p class="cambiar-modo">¿No tenés cuenta? <button data-accion="ir-registro">Registrate acá</button></p>
        <p class="cambiar-modo"><button data-accion="ir-olvide">¿Olvidaste tu contraseña?</button></p>
      </div>`;
  }
  return `
    <div class="caja-acceso">
      <h1>Pedí acceso al catálogo</h1>
      <p class="ayuda">
        Te registrás, y en cuanto lo aprobemos —con el precio que te corresponde—
        vas a poder ver el catálogo completo y armar tu pedido.
      </p>
      <form id="form-registro">
        <label><span>Nombre</span><input name="nombre" required autocomplete="name" /></label>
        <label><span>Empresa (opcional)</span><input name="empresa" autocomplete="organization" /></label>
        <label><span>Teléfono</span><input name="telefono" type="tel" autocomplete="tel" /></label>
        <label><span>Correo</span><input name="email" type="email" required autocomplete="email" /></label>
        <label><span>Contraseña</span><input name="clave" type="password" required minlength="6" autocomplete="new-password" /></label>
        <button class="btn-primario ancho" type="submit">Pedir acceso</button>
      </form>
      <p class="cambiar-modo">¿Ya tenés cuenta? <button data-accion="ir-login">Iniciá sesión</button></p>
    </div>`;
}

/* ─────────── Catálogo ─────────── */

// Un ícono por tipo, adivinado por palabras clave —los tipos los escribe el
// dueño a mano al cargar el catálogo (Display, Switch EU, Key look…), así
// que no hay una lista cerrada de antemano: se reconoce el que más se parece
// y, si ninguno encaja, queda uno genérico. Es sólo estético: nunca cambia
// qué filtra ni qué se agrega.
const ICONOS_TIPO = [
  [/display|pantalla/i, '🖥️'],
  [/switch|interruptor/i, '🔌'],
  [/key|look|cerradura|lock|chapa/i, '🔒'],
  [/luz|light|bombill|foco|lámp/i, '💡'],
  [/sensor|hub|detector/i, '📡'],
  [/sound|bocina|parlante|audio|música|speaker/i, '🔊'],
  [/wifi|wi-fi/i, '📶'],
  [/cámara|camera|cctv|video/i, '📷'],
  [/termostato|clima|aire/i, '🌡️'],
  [/cortina|persiana|motor|toldo/i, '🪟'],
  [/riego|jardín|irrigación/i, '🌱'],
  [/gateway|puerta de enlace|central/i, '🧩'],
];
const iconoDeTipo = (tipo) => ICONOS_TIPO.find(([re]) => re.test(tipo))?.[1] ?? '📦';

// Los tipos con cuántos productos tiene cada uno, para filtrar de un solo
// toque —como en Productos, dentro del panel—, en vez de un desplegable que
// hay que abrir y volver a cerrar para cada intento.
function tiposDisponibles() {
  const cuenta = new Map();
  for (const p of estado.catalogo) {
    if (!p.tipo) continue;
    cuenta.set(p.tipo, (cuenta.get(p.tipo) || 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

function catalogoFiltrado() {
  const q = estado.buscar.trim().toLowerCase();
  return estado.catalogo.filter((p) => {
    if (estado.filtroTipo && p.tipo !== estado.filtroTipo) return false;
    if (!q) return true;
    return [p.descripcion, p.referencia, p.marca, p.categoria, p.tipo]
      .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
  });
}

/** Puntos para pasar de una foto a otra, sólo si el producto tiene más de una. */
function puntosDeFotos(p, idxActual) {
  if ((p.fotos?.length ?? 0) < 2) return '';
  return `<div class="foto-puntos">
    ${p.fotos.map((_, i) => `<button type="button" class="punto${i === idxActual ? ' activo' : ''}"
      data-accion="foto-punto" data-id="${p.id}" data-indice="${i}" aria-label="Foto ${i + 1} de ${p.fotos.length}"></button>`).join('')}
  </div>`;
}

/** El bloque de "cuántos llevo" — antes de agregar, con cantidad elegible; ya agregado, con +/−. */
function controlCantidad(p, enCarrito, botonAgregar) {
  // El dueño mirando desde el panel no tiene cuenta de cliente: no hay
  // pedido que armar acá, sólo catálogo para revisar.
  if (estado.usuario?.esAdmin) return '';
  if (enCarrito) {
    return `<div class="cantidad-en-carrito">
      <button type="button" data-accion="restar" data-id="${p.id}">−</button>
      <span>${enCarrito.cantidad}</span>
      <button type="button" data-accion="sumar" data-id="${p.id}">+</button>
    </div>`;
  }
  return `<div class="agregar-fila">
    <div class="cant-elegir">
      <button type="button" data-accion="pre-restar" data-id="${p.id}" aria-label="Menos">−</button>
      <input type="number" class="cant-input" data-id="${p.id}" value="1" min="1" inputmode="numeric" aria-label="Cantidad" />
      <button type="button" data-accion="pre-sumar" data-id="${p.id}" aria-label="Más">+</button>
    </div>
    <button type="button" class="${botonAgregar.clase}" data-accion="${botonAgregar.accion}" data-id="${p.id}">${botonAgregar.texto}</button>
  </div>`;
}

function tarjetaProducto(p) {
  const enCarrito = estado.carrito.get(p.id);
  const idx = estado.fotoActual.get(p.id) || 0;
  const foto = p.fotos?.[idx] ?? p.fotos?.[0];
  return `
    <div class="producto">
      <div class="producto-foto" data-accion="ver-detalle" data-id="${p.id}">
        ${foto ? `<img src="${escapar(foto)}" alt="" loading="lazy" />` : '<span class="sin-foto">Sin foto</span>'}
        ${puntosDeFotos(p, idx)}
      </div>
      <div class="producto-cuerpo">
        ${p.tipo ? `<span class="etiqueta">${iconoDeTipo(p.tipo)} ${escapar(p.tipo)}</span>` : ''}
        <p class="producto-desc" data-accion="ver-detalle" data-id="${p.id}">${escapar(p.descripcion)}</p>
        ${p.referencia ? `<p class="producto-ref">Ref. ${escapar(p.referencia)}</p>` : ''}
        <p class="producto-precio">${fmtDinero(p.precio)}</p>
        ${controlCantidad(p, enCarrito, { accion: 'agregar', clase: 'btn-agregar', texto: 'Agregar' })}
      </div>
    </div>`;
}

function vistaCatalogo() {
  const tipos = tiposDisponibles();
  const filas = catalogoFiltrado();
  return `
    <div class="barra-catalogo">
      <input type="search" id="buscar" placeholder="Buscar por nombre, referencia…" value="${escapar(estado.buscar)}" />
    </div>
    ${tipos.length ? `<div class="filtros-tipo">
      <button type="button" class="chip${estado.filtroTipo ? '' : ' activo'}" data-accion="filtrar-tipo" data-tipo="">Todos <em>${estado.catalogo.length}</em></button>
      ${tipos.map(([t, n]) => `<button type="button" class="chip${estado.filtroTipo === t ? ' activo' : ''}"
        data-accion="filtrar-tipo" data-tipo="${escapar(t)}">${iconoDeTipo(t)} ${escapar(t)} <em>${n}</em></button>`).join('')}
    </div>` : ''}
    <div class="grilla-productos">
      ${filas.length ? filas.map(tarjetaProducto).join('') : '<p class="vacio">No hay productos que coincidan con la búsqueda.</p>'}
    </div>`;
}

/* ─────────── Ficha del producto ─────────── */

function vistaDetalle() {
  const p = estado.catalogo.find((x) => x.id === estado.detalle);
  if (!p) return '';
  const enCarrito = estado.carrito.get(p.id);
  const idx = estado.fotoActual.get(p.id) || 0;
  const foto = p.fotos?.[idx] ?? p.fotos?.[0];
  return `
    <div class="detalle-cuerpo">
      <div class="detalle-foto">
        ${foto ? `<img src="${escapar(foto)}" alt="" />` : '<span class="sin-foto">Sin foto</span>'}
        ${puntosDeFotos(p, idx)}
      </div>
      <div class="detalle-datos">
        ${p.tipo ? `<span class="etiqueta">${iconoDeTipo(p.tipo)} ${escapar(p.tipo)}</span>` : ''}
        <h2>${escapar(p.descripcion)}</h2>
        <table class="detalle-tabla">
          ${p.referencia ? `<tr><td>Referencia</td><td>${escapar(p.referencia)}</td></tr>` : ''}
          ${p.marca ? `<tr><td>Marca</td><td>${escapar(p.marca)}</td></tr>` : ''}
          ${p.categoria ? `<tr><td>Categoría</td><td>${escapar(p.categoria)}</td></tr>` : ''}
          ${p.unidad ? `<tr><td>Unidad</td><td>${escapar(p.unidad)}</td></tr>` : ''}
        </table>
        ${p.caracteristicas ? `<p class="detalle-caracteristicas">${escapar(p.caracteristicas)}</p>` : ''}
        ${p.ficha ? `<a class="mini" href="${escapar(p.ficha)}" target="_blank" rel="noopener">📄 Ver ficha técnica</a>` : ''}
        <p class="producto-precio grande">${fmtDinero(p.precio)}</p>
        ${controlCantidad(p, enCarrito, { accion: 'agregar-y-cerrar', clase: 'btn-primario ancho', texto: 'Agregar al pedido' })}
      </div>
    </div>`;
}

function abrirDetalle(id) {
  estado.detalle = id;
  pintarDetalle();
  $('#detalle').classList.add('abierto');
  $('#telon').classList.add('visible');
}
function cerrarDetalle() {
  $('#detalle').classList.remove('abierto');
  if (!$('#carrito').classList.contains('abierto')) $('#telon').classList.remove('visible');
  estado.detalle = null;
}
function pintarDetalle() {
  if (estado.detalle) $('#detalle-contenido').innerHTML = vistaDetalle();
}

/* ─────────── Mis pedidos ─────────── */

async function irAPedidos() {
  estado.vista = 'pedidos';
  pintar();
  try {
    const { filas } = await api('/mis-pedidos');
    estado.pedidos = filas;
  } catch (err) {
    estado.pedidos = [];
    avisar(err.message, true);
  }
  pintar();
}

function vistaPedidos() {
  if (!estado.pedidos) return '<div class="cargando">Cargando…</div>';
  if (!estado.pedidos.length) {
    return '<p class="vacio">Todavía no mandaste ningún pedido. Armalo desde el catálogo.</p>';
  }
  return `<div class="lista-pedidos">
    ${estado.pedidos.map((p) => `
      <div class="pedido-fila">
        <div>
          <strong>${escapar(p.titulo)}</strong>
          <span>${fechaCorta(p.creado_en)}</span>
        </div>
        <span class="pastilla-pedido ${escapar(p.estado)}">${escapar(ETIQUETA_ESTADO[p.estado] || p.estado)}</span>
        <b>${fmtDinero(p.monto)}</b>
        <a class="mini" href="/imprimir/cotizacion/${p.id}" target="_blank" rel="noopener">Ver cotización</a>
      </div>`).join('')}
  </div>`;
}

/* ─────────── Carrito ─────────── */

function totalCarrito() {
  let t = 0;
  for (const { producto, cantidad } of estado.carrito.values()) t += producto.precio * cantidad;
  return t;
}

function pintarCarrito() {
  const items = [...estado.carrito.values()];
  $('#carrito-items').innerHTML = items.length ? items.map(({ producto, cantidad }) => `
    <div class="carrito-item">
      <div>
        <strong>${escapar(producto.descripcion)}</strong>
        <span>${fmtDinero(producto.precio)} c/u</span>
      </div>
      <div class="carrito-item-cant">
        <button type="button" data-accion="restar" data-id="${producto.id}">−</button>
        <span>${cantidad}</span>
        <button type="button" data-accion="sumar" data-id="${producto.id}">+</button>
      </div>
    </div>`).join('') : '<p class="vacio">Todavía no agregaste nada.</p>';
  $('#carrito-total').textContent = fmtDinero(totalCarrito());

  const boton = $('#mostrar-carrito');
  if (boton) {
    const n = items.reduce((s, i) => s + i.cantidad, 0);
    boton.querySelector('.carrito-badge').textContent = n;
    boton.querySelector('.carrito-badge').hidden = n === 0;
  }
}

function abrirCarrito() {
  $('#carrito').classList.add('abierto');
  $('#telon').classList.add('visible');
}
function cerrarCarrito() {
  $('#carrito').classList.remove('abierto');
  if (!$('#detalle').classList.contains('abierto')) $('#telon').classList.remove('visible');
}

function agregar(id, delta) {
  const p = estado.catalogo.find((x) => x.id === id);
  if (!p) return;
  const actual = estado.carrito.get(id);
  const cantidad = (actual?.cantidad ?? 0) + delta;
  if (cantidad <= 0) estado.carrito.delete(id);
  else estado.carrito.set(id, { producto: p, cantidad });
}

/** Repinta la grilla (y el carrito, y la ficha si está abierta) sin perder scroll ni foco. */
function refrescar() {
  pintar();
  pintarDetalle();
}

/* ─────────── Cabecera y render general ─────────── */

function pintarCabecera() {
  const logueado = Boolean(estado.usuario) && (estado.vista === 'catalogo' || estado.vista === 'pedidos');
  if (!logueado) {
    $('#cab-acciones').innerHTML = '';
    $('#carrito').hidden = true;
    return;
  }
  if (estado.usuario.esAdmin) {
    // El dueño mirando desde el panel: revisa cómo se ve, con el precio que
    // elija, pero no puede comprar —no hay carrito ni "Mis pedidos"— porque
    // esto no es una cuenta de cliente real.
    $('#cab-acciones').innerHTML = `
      <span class="quien-soy">👁️ Vista de administrador</span>
      <select id="nivel-admin" class="mini">
        <option value="canal"${estado.usuario.nivel_precio === 'canal' ? ' selected' : ''}>Precio canal</option>
        <option value="constructor"${estado.usuario.nivel_precio === 'constructor' ? ' selected' : ''}>Precio constructor</option>
        <option value="cliente"${estado.usuario.nivel_precio === 'cliente' ? ' selected' : ''}>Precio cliente final</option>
      </select>
      <a class="mini" href="/">Volver al panel</a>`;
    $('#carrito').hidden = true;
    return;
  }
  $('#cab-acciones').innerHTML = `
    <span class="quien-soy">Hola, ${escapar(estado.usuario.nombre)}</span>
    <button type="button" class="mini${estado.vista === 'catalogo' ? ' activo' : ''}" id="ver-catalogo">Catálogo</button>
    <button type="button" class="mini${estado.vista === 'pedidos' ? ' activo' : ''}" id="ver-pedidos">Mis pedidos</button>
    <button type="button" class="btn-carrito" id="mostrar-carrito">
      🛒 <em class="carrito-badge" hidden>0</em>
    </button>
    <button type="button" class="mini" id="cerrar-sesion">Salir</button>`;
  $('#carrito').hidden = estado.vista !== 'catalogo';
}

function pintar() {
  pintarCabecera();
  const app = $('#app');
  if (estado.vista === 'cargando') { app.innerHTML = '<div class="cargando">Cargando…</div>'; return; }
  if (estado.vista === 'acceso') { app.innerHTML = vistaAcceso(); return; }
  if (estado.vista === 'pedidos') { app.innerHTML = vistaPedidos(); return; }
  app.innerHTML = vistaCatalogo();
  pintarCarrito();
}

/* ─────────── Eventos ─────────── */

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'form-login') {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    try {
      await api('/login', { method: 'POST', body: { email: datos.email, clave: datos.clave } });
      estado.usuario = await api('/quien-soy');
      estado.vista = 'catalogo';
      await cargarCatalogo();
      pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (e.target.id === 'form-olvide') {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    try {
      const { mensaje } = await api('/olvide-clave', { method: 'POST', body: { email: datos.email } });
      avisar(mensaje);
      estado.modoAcceso = 'login';
      pintar();
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
  if (e.target.id === 'form-registro') {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    try {
      await api('/registro', {
        method: 'POST',
        body: { nombre: datos.nombre, empresa: datos.empresa, telefono: datos.telefono, email: datos.email, clave: datos.clave },
      });
      avisar('¡Listo! Tu pedido de acceso quedó registrado. Te avisamos apenas lo aprobemos.');
      estado.modoAcceso = 'login';
      pintar();
      $('#form-login [name="email"]').value = datos.email;
    } catch (err) {
      avisar(err.message, true);
    }
    return;
  }
});

document.addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion], button, #cerrar-carrito, #cerrar-detalle, #mostrar-carrito, #ver-catalogo, #ver-pedidos, #cerrar-sesion, #enviar-pedido, #telon');
  if (!boton) return;

  if (boton.dataset.accion === 'ir-registro') { estado.modoAcceso = 'registro'; pintar(); return; }
  if (boton.dataset.accion === 'ir-login') { estado.modoAcceso = 'login'; pintar(); return; }
  if (boton.dataset.accion === 'ir-olvide') { estado.modoAcceso = 'olvide'; pintar(); return; }
  if (boton.id === 'cerrar-sesion') {
    await api('/logout', { method: 'POST' });
    estado.usuario = null; estado.carrito.clear(); estado.pedidos = null;
    estado.vista = 'acceso'; estado.modoAcceso = 'login';
    pintar();
    return;
  }
  if (boton.id === 'ver-catalogo') { estado.vista = 'catalogo'; pintar(); return; }
  if (boton.id === 'ver-pedidos') { irAPedidos(); return; }
  if (boton.id === 'mostrar-carrito') { abrirCarrito(); return; }
  if (boton.id === 'cerrar-carrito') { cerrarCarrito(); return; }
  if (boton.id === 'cerrar-detalle') { cerrarDetalle(); return; }
  if (boton.id === 'telon') { cerrarCarrito(); cerrarDetalle(); return; }

  const accion = boton.dataset.accion;
  const id = Number(boton.dataset.id);

  if (accion === 'ver-detalle') { abrirDetalle(id); return; }

  if (accion === 'filtrar-tipo') { estado.filtroTipo = boton.dataset.tipo || ''; pintar(); return; }

  if (accion === 'foto-punto') {
    estado.fotoActual.set(id, Number(boton.dataset.indice) || 0);
    refrescar();
    return;
  }

  if (accion === 'pre-sumar' || accion === 'pre-restar') {
    const input = boton.closest('.producto, .detalle-cuerpo')?.querySelector('.cant-input');
    if (input) {
      const actual = Math.max(1, parseInt(input.value, 10) || 1);
      input.value = accion === 'pre-sumar' ? actual + 1 : Math.max(1, actual - 1);
    }
    return;
  }

  if (accion === 'agregar' || accion === 'agregar-y-cerrar') {
    const input = boton.closest('.producto, .detalle-cuerpo')?.querySelector('.cant-input');
    const cantidad = Math.max(1, parseInt(input?.value, 10) || 1);
    agregar(id, cantidad);
    if (accion === 'agregar-y-cerrar') { cerrarDetalle(); avisar('Agregado al pedido.'); }
    refrescar();
    return;
  }
  if (accion === 'sumar') { agregar(id, 1); refrescar(); return; }
  if (accion === 'restar') { agregar(id, -1); refrescar(); return; }

  if (boton.id === 'ver-cotizacion') {
    if (!estado.carrito.size) { avisar('Agregá al menos un producto para ver la cotización.', true); return; }
    // Igual que al mandar el pedido: se abre YA, antes del await, para que
    // no lo tome como un pop-up no pedido y lo bloquee.
    const previa = window.open('', '_blank');
    try {
      const items = [...estado.carrito.values()].map(({ producto, cantidad }) => ({ producto_id: producto.id, cantidad }));
      const { html } = await api('/vista-previa', { method: 'POST', body: { items, notas: $('#carrito-notas-txt').value.trim() } });
      if (previa) { previa.document.write(html); previa.document.close(); }
    } catch (err) {
      previa?.close();
      avisar(err.message, true);
    }
    return;
  }

  if (boton.id === 'enviar-pedido') {
    if (!estado.carrito.size) { avisar('Agregá al menos un producto.', true); return; }
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    // Se abre YA, antes del await: si se abre después, Safari (y el modo
    // instalado de varios celulares) lo toma como un pop-up no pedido por el
    // usuario y lo bloquea en silencio.
    const previa = window.open('', '_blank');
    try {
      const items = [...estado.carrito.values()].map(({ producto, cantidad }) => ({ producto_id: producto.id, cantidad }));
      const { cotizacion_id } = await api('/pedido', { method: 'POST', body: { items, notas: $('#carrito-notas-txt').value.trim() } });
      estado.carrito.clear();
      $('#carrito-notas-txt').value = '';
      cerrarCarrito();
      estado.pedidos = null;   // para que "Mis pedidos" la traiga de nuevo la próxima vez
      pintar();
      if (previa) {
        previa.location = `/imprimir/cotizacion/${cotizacion_id}`;
        avisar('¡Pedido enviado! Tu cotización se abrió en una pestaña nueva. ✓');
      } else {
        avisar('¡Pedido enviado! Mirá «Mis pedidos» para ver tu cotización. ✓');
      }
    } catch (err) {
      previa?.close();
      avisar(err.message, true);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Enviar pedido';
    }
  }
});

// Filtrar no repinta la pantalla entera: eso le arrancaría el foco al
// buscador en cada letra —el navegador crea un input nuevo cada vez que se
// reemplaza el HTML—. Sólo se actualiza la grilla de productos.
document.addEventListener('input', (e) => {
  if (e.target.id === 'buscar') {
    estado.buscar = e.target.value;
    $('.grilla-productos').innerHTML = catalogoFiltrado().length
      ? catalogoFiltrado().map(tarjetaProducto).join('')
      : '<p class="vacio">No hay productos que coincidan con la búsqueda.</p>';
  }
});

// Sólo existe en la vista de administrador: cambiar el nivel vuelve a traer
// el catálogo con los precios de ese nivel, para revisar los tres sin tener
// que ser tres cuentas distintas.
document.addEventListener('change', async (e) => {
  if (e.target.id === 'nivel-admin') {
    estado.usuario.nivel_precio = e.target.value;
    await cargarCatalogo();
    pintar();
  }
});

arrancar();
