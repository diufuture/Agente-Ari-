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
  vista: 'cargando',   // cargando | acceso | catalogo
  usuario: null,
  modoAcceso: 'login',  // login | registro
  catalogo: [],
  buscar: '',
  filtroTipo: '',
  carrito: new Map(),   // producto_id -> {producto, cantidad}
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
  const { filas } = await api('/catalogo');
  estado.catalogo = filas;
}

/* ─────────── Pantalla de acceso: login o registro ─────────── */

function vistaAcceso() {
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

function tiposDisponibles() {
  return [...new Set(estado.catalogo.map((p) => p.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
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

function tarjetaProducto(p) {
  const enCarrito = estado.carrito.get(p.id);
  const foto = p.fotos?.[0];
  return `
    <div class="producto">
      <div class="producto-foto">
        ${foto
          ? `<img src="${escapar(foto)}" alt="" loading="lazy" />`
          : '<span class="sin-foto">Sin foto</span>'}
      </div>
      <div class="producto-cuerpo">
        ${p.tipo ? `<span class="etiqueta">${escapar(p.tipo)}</span>` : ''}
        <p class="producto-desc">${escapar(p.descripcion)}</p>
        ${p.referencia ? `<p class="producto-ref">Ref. ${escapar(p.referencia)}</p>` : ''}
        <p class="producto-precio">${fmtDinero(p.precio)}</p>
        ${enCarrito
          ? `<div class="cantidad-en-carrito">
               <button data-accion="restar" data-id="${p.id}">−</button>
               <span>${enCarrito.cantidad}</span>
               <button data-accion="sumar" data-id="${p.id}">+</button>
             </div>`
          : `<button class="btn-agregar" data-accion="agregar" data-id="${p.id}">Agregar al pedido</button>`}
      </div>
    </div>`;
}

function vistaCatalogo() {
  const tipos = tiposDisponibles();
  const filas = catalogoFiltrado();
  return `
    <div class="barra-catalogo">
      <input type="search" id="buscar" placeholder="Buscar por nombre, referencia…" value="${escapar(estado.buscar)}" />
      ${tipos.length ? `<select id="filtro-tipo">
        <option value="">Todos los tipos</option>
        ${tipos.map((t) => `<option value="${escapar(t)}"${t === estado.filtroTipo ? ' selected' : ''}>${escapar(t)}</option>`).join('')}
      </select>` : ''}
    </div>
    <div class="grilla-productos">
      ${filas.length ? filas.map(tarjetaProducto).join('') : '<p class="vacio">No hay productos que coincidan con la búsqueda.</p>'}
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
        <button data-accion="restar" data-id="${producto.id}">−</button>
        <span>${cantidad}</span>
        <button data-accion="sumar" data-id="${producto.id}">+</button>
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
  $('#telon').classList.remove('visible');
}

function agregar(id, delta) {
  const p = estado.catalogo.find((x) => x.id === id);
  if (!p) return;
  const actual = estado.carrito.get(id);
  const cantidad = (actual?.cantidad ?? 0) + delta;
  if (cantidad <= 0) estado.carrito.delete(id);
  else estado.carrito.set(id, { producto: p, cantidad });
}

/* ─────────── Cabecera y render general ─────────── */

function pintarCabecera() {
  $('#cab-acciones').innerHTML = estado.vista === 'catalogo' && estado.usuario
    ? `<span class="quien-soy">Hola, ${escapar(estado.usuario.nombre)}</span>
       <button class="btn-carrito" id="mostrar-carrito">
         🛒 <em class="carrito-badge" hidden>0</em>
       </button>
       <button class="mini" id="cerrar-sesion">Salir</button>`
    : '';
  $('#carrito').hidden = !(estado.vista === 'catalogo' && estado.usuario);
}

function pintar() {
  pintarCabecera();
  const app = $('#app');
  if (estado.vista === 'cargando') { app.innerHTML = '<div class="cargando">Cargando…</div>'; return; }
  if (estado.vista === 'acceso') { app.innerHTML = vistaAcceso(); return; }
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
  const boton = e.target.closest('[data-accion], button, #cerrar-carrito, #mostrar-carrito, #cerrar-sesion, #enviar-pedido, #telon');
  if (!boton) return;

  if (boton.id === 'ir-registro' || boton.dataset.accion === 'ir-registro') {
    estado.modoAcceso = 'registro'; pintar(); return;
  }
  if (boton.id === 'ir-login' || boton.dataset.accion === 'ir-login') {
    estado.modoAcceso = 'login'; pintar(); return;
  }
  if (boton.id === 'cerrar-sesion') {
    await api('/logout', { method: 'POST' });
    estado.usuario = null; estado.carrito.clear(); estado.vista = 'acceso'; estado.modoAcceso = 'login';
    pintar();
    return;
  }
  if (boton.id === 'mostrar-carrito') { abrirCarrito(); return; }
  if (boton.id === 'cerrar-carrito' || boton.id === 'telon') { cerrarCarrito(); return; }

  const accion = boton.dataset.accion;
  const id = Number(boton.dataset.id);
  if (accion === 'agregar' || accion === 'sumar') { agregar(id, 1); pintar(); return; }
  if (accion === 'restar') { agregar(id, -1); pintar(); return; }

  if (boton.id === 'enviar-pedido') {
    if (!estado.carrito.size) { avisar('Agregá al menos un producto.', true); return; }
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const items = [...estado.carrito.values()].map(({ producto, cantidad }) => ({ producto_id: producto.id, cantidad }));
      await api('/pedido', { method: 'POST', body: { items, notas: $('#carrito-notas-txt').value.trim() } });
      estado.carrito.clear();
      $('#carrito-notas-txt').value = '';
      cerrarCarrito();
      pintar();
      avisar('¡Pedido enviado! Te contactamos para coordinar. ✓');
    } catch (err) {
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
document.addEventListener('change', (e) => {
  if (e.target.id === 'filtro-tipo') { estado.filtroTipo = e.target.value; pintar(); }
});

arrancar();
