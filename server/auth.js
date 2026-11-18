// Acceso con usuario y contraseña.
//
// Se activa solo: si existe la variable de entorno ARI_CLAVE, la aplicación
// pide credenciales. Si no existe, queda abierta —cómodo para usarla en tu
// propio computador, donde nadie más llega—. En un servidor público
// ARI_CLAVE es obligatoria.
//
// Sin dependencias: la sesión es una cookie firmada con HMAC-SHA256.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const USUARIO = (process.env.ARI_USUARIO || 'admin').trim();
const CLAVE = (process.env.ARI_CLAVE || '').trim();
const DIAS_SESION = Number(process.env.ARI_DIAS_SESION) || 30;

/** Con clave configurada, la app exige iniciar sesión. */
export const authActiva = () => CLAVE.length > 0;

export const usuarioConfigurado = () => USUARIO;

// La firma deriva de la clave, así que cambiarla invalida todas las sesiones.
// ARI_SECRETO permite fijarla aparte si se quiere rotar una sin la otra.
const SECRETO =
  process.env.ARI_SECRETO ||
  (CLAVE ? createHmac('sha256', 'ari.sesion').update(CLAVE).digest('hex') : randomBytes(32).toString('hex'));

const firmar = (datos) => createHmac('sha256', SECRETO).update(datos).digest('base64url');

/** Compara sin filtrar información por el tiempo que tarda. */
function igualSeguro(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function credencialesCorrectas(usuario, clave) {
  // Se evalúan ambas siempre, para no revelar cuál de las dos falló.
  const u = igualSeguro(usuario, USUARIO);
  const c = igualSeguro(clave, CLAVE);
  return u && c;
}

export function crearToken() {
  const cuerpo = Buffer.from(
    JSON.stringify({ u: USUARIO, exp: Date.now() + DIAS_SESION * 86_400_000 }),
  ).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function tokenValido(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const corte = token.lastIndexOf('.');
  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);
  if (!igualSeguro(firma, firmar(cuerpo))) return false;
  try {
    const { u, exp } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    // Si cambió el usuario configurado, las sesiones viejas dejan de valer.
    return u === USUARIO && typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Token para que otros sistemas escriban en la agenda                 */
/* ------------------------------------------------------------------ */

/**
 * El formulario de agendamiento de la web avisa a Ari cada vez que alguien
 * toma un turno. Ese aviso no lo manda una persona con su sesión abierta: lo
 * manda un programa, así que no puede pasar por la pantalla de acceso.
 *
 * En vez de eso lleva un token fijo, que se configura en ARI_TOKEN_ENLACE y
 * se pega también del lado que avisa. Mientras esa variable no exista, la
 * puerta directamente no está: es mejor que quede cerrada por defecto y haya
 * que abrirla a propósito, y no al revés.
 *
 * El token vive en el servidor de quien avisa (el Apps Script de Google), no
 * en el navegador de nadie: si estuviera en la página, cualquiera que mirara
 * el código fuente podría escribir en la agenda.
 */
const TOKEN_ENLACE = (process.env.ARI_TOKEN_ENLACE || '').trim();

export const enlaceActivo = () => TOKEN_ENLACE.length >= 16;

/** ¿Este pedido trae el token del enlace? Acepta `Authorization: Bearer …`. */
export function tokenEnlaceValido(req) {
  if (!enlaceActivo()) return false;
  const cabecera = String(req.headers.authorization || '');
  const enviado = cabecera.startsWith('Bearer ')
    ? cabecera.slice(7).trim()
    : String(req.headers['x-ari-token'] || '').trim();
  return igualSeguro(enviado, TOKEN_ENLACE);
}

/* ------------------------------------------------------------------ */
/* Token para leer el resumen desde afuera (un widget, un atajo…)      */
/* ------------------------------------------------------------------ */

/**
 * El mismo problema que el enlace de arriba, al revés: acá no escribe nadie,
 * sólo lee las tarjetas del panel de Inicio —por cobrar, pendientes, próximas
 * citas—, para poder armar un widget de Atajos en la Mac o algo parecido.
 *
 * Token aparte del de arriba a propósito: uno sólo lee, el otro puede escribir
 * en la agenda, y no tiene por qué filtrarse el mismo secreto para las dos
 * cosas. Se configura en ARI_TOKEN_RESUMEN.
 */
const TOKEN_RESUMEN = (process.env.ARI_TOKEN_RESUMEN || '').trim();

export const resumenActivo = () => TOKEN_RESUMEN.length >= 16;

/** ¿Este pedido trae el token del resumen? Acepta `Authorization: Bearer …`. */
export function tokenResumenValido(req) {
  if (!resumenActivo()) return false;
  const cabecera = String(req.headers.authorization || '');
  const enviado = cabecera.startsWith('Bearer ')
    ? cabecera.slice(7).trim()
    : String(req.headers['x-ari-token'] || '').trim();
  return igualSeguro(enviado, TOKEN_RESUMEN);
}

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

const NOMBRE_COOKIE = 'ari_sesion';

export function leerCookie(req) {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const parte of crudo.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === NOMBRE_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** `Secure` sólo cuando la petición llegó por HTTPS, para no romper el uso local. */
const esHttps = (req) =>
  req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);

export const cookieSesion = (req, token) =>
  `${NOMBRE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    DIAS_SESION * 86_400
  }${esHttps(req) ? '; Secure' : ''}`;

export const cookieBorrada = (req) =>
  `${NOMBRE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${esHttps(req) ? '; Secure' : ''}`;

/** ¿Esta petición trae una sesión válida? */
export const sesionValida = (req) => !authActiva() || tokenValido(leerCookie(req));

/* ------------------------------------------------------------------ */
/* Freno a los intentos por fuerza bruta                               */
/* ------------------------------------------------------------------ */

const intentos = new Map();
const MAX_INTENTOS = 8;
const CASTIGO_MS = 10 * 60_000;

export function origen(req) {
  const reenviado = req.headers['x-forwarded-for'];
  if (typeof reenviado === 'string' && reenviado) return reenviado.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocido';
}

export function bloqueado(ip) {
  const r = intentos.get(ip);
  if (!r) return false;
  if (Date.now() > r.hasta) {
    intentos.delete(ip);
    return false;
  }
  return r.n >= MAX_INTENTOS;
}

export function registrarFallo(ip) {
  const r = intentos.get(ip) ?? { n: 0, hasta: 0 };
  r.n += 1;
  r.hasta = Date.now() + CASTIGO_MS;
  intentos.set(ip, r);
  // Evita que el mapa crezca sin límite en un servidor expuesto.
  if (intentos.size > 5000) {
    const ahora = Date.now();
    for (const [k, v] of intentos) if (ahora > v.hasta) intentos.delete(k);
  }
}

export const limpiarIntentos = (ip) => intentos.delete(ip);
