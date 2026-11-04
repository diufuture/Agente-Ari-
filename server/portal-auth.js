// Acceso del catálogo público: una cookie propia, separada por completo de la
// sesión del panel (auth.js). Que alguien esté aprobado para mirar precios no
// le da ni un centímetro de acceso a Clientes, Cotizaciones o el resto de
// Ari, y viceversa: la sesión del dueño no sirve para entrar a la tienda.
//
// Sin dependencias, como el resto: scrypt para las claves (viene en
// node:crypto, no hace falta bcrypt) y una cookie firmada con HMAC-SHA256,
// igual que la del panel.

import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';

const DIAS_SESION = 30;
const NOMBRE_COOKIE = 'ari_portal_sesion';

// Deriva del mismo secreto que usa el panel si existe (ARI_SECRETO o
// ARI_CLAVE); si no hay ninguno de los dos —instalación local sin
// contraseña—, se genera uno de arranque. Que sea distinto del de auth.js no
// hace falta: son cookies con nombre distinto, y una no vale para la otra
// aunque compartan la forma de firmarse.
const SECRETO =
  process.env.ARI_SECRETO ||
  (process.env.ARI_CLAVE
    ? createHmac('sha256', 'ari.sesion').update(process.env.ARI_CLAVE).digest('hex')
    : randomBytes(32).toString('hex'));

const firmar = (datos) => createHmac('sha256', `${SECRETO}:portal`).update(datos).digest('base64url');

function igualSeguro(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ */
/* Claves                                                              */
/* ------------------------------------------------------------------ */

export function hashClave(clave) {
  const sal = randomBytes(16).toString('hex');
  const derivada = scryptSync(String(clave), sal, 64).toString('hex');
  return `${sal}:${derivada}`;
}

export function claveValida(clave, hash) {
  const [sal, derivada] = String(hash ?? '').split(':');
  if (!sal || !derivada) return false;
  const intento = scryptSync(String(clave ?? ''), sal, 64).toString('hex');
  return igualSeguro(intento, derivada);
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export function crearToken(usuarioId) {
  const cuerpo = Buffer.from(
    JSON.stringify({ id: usuarioId, exp: Date.now() + DIAS_SESION * 86_400_000 }),
  ).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** Devuelve el id del usuario si el token es válido, o null. */
export function idDeToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const corte = token.lastIndexOf('.');
  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);
  if (!igualSeguro(firma, firmar(cuerpo))) return null;
  try {
    const { id, exp } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (typeof id !== 'number' || typeof exp !== 'number' || Date.now() >= exp) return null;
    return id;
  } catch {
    return null;
  }
}

export function leerCookie(req) {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const parte of crudo.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === NOMBRE_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

const esHttps = (req) =>
  req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);

export const cookieSesion = (req, token) =>
  `${NOMBRE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    DIAS_SESION * 86_400
  }${esHttps(req) ? '; Secure' : ''}`;

export const cookieBorrada = (req) =>
  `${NOMBRE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${esHttps(req) ? '; Secure' : ''}`;

/** El id del usuario logueado en la tienda, o null si no hay sesión válida. */
export const idDeSesion = (req) => idDeToken(leerCookie(req));

/* ------------------------------------------------------------------ */
/* Freno a los intentos por fuerza bruta — mismo criterio que el panel */
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
  if (Date.now() > r.hasta) { intentos.delete(ip); return false; }
  return r.n >= MAX_INTENTOS;
}

export function registrarFallo(ip) {
  const r = intentos.get(ip) ?? { n: 0, hasta: 0 };
  r.n += 1;
  r.hasta = Date.now() + CASTIGO_MS;
  intentos.set(ip, r);
  if (intentos.size > 5000) {
    const ahora = Date.now();
    for (const [k, v] of intentos) if (ahora > v.hasta) intentos.delete(k);
  }
}

export const limpiarIntentos = (ip) => intentos.delete(ip);
