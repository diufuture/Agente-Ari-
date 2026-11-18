/**
 * El contenido de las fichas técnicas: un objeto por referencia del catálogo.
 *
 * Esto NO lo escribe el sistema solo. Cada ficha se armó con lo que dice la
 * propia lista de precios (la fuente más confiable: es la descripción que la
 * empresa ya usa de su propio producto) y, donde hacía falta completar algo
 * que la lista no dice, con los parámetros típicos del protocolo (ZigBee
 * 2.4 GHz, WiFi 2.4/5 GHz…) — nunca con un número específico inventado para
 * ESE modelo puntual, como un amperaje o una certificación que nadie
 * confirmó.
 *
 * `confianza`:
 *   'confirmado' — todo lo numérico sale de la lista de precios o de una
 *                  ficha real. Se puede mandar tal cual.
 *   'estandar'   — se completó con parámetros típicos de ese tipo de
 *                  dispositivo, no de esta referencia puntual. El PDF lo
 *                  avisa al pie; conviene confirmarlo contra el fabricante
 *                  antes de una instalación donde el dato sea crítico.
 *
 * Para agregar o corregir un producto: se edita acá y se corre
 * `node scripts/generar-fichas.mjs`, que rearma todos los PDF de una.
 */

const PIE = 'ClickControl · Automatización Inteligente · Seguridad · Audio & Video | www.clickcontrol.com.co';

// Las condiciones comerciales son la misma política para todo el catálogo:
// se escriben una vez y se repiten, en vez de copiarlas en cada producto.
const CONDICIONES_ESTANDAR = [
  'Garantía: 1 año contra defectos de fábrica desde la fecha de instalación.',
  'Instalación: no incluida en el precio. Se recomienda personal técnico certificado.',
  'Soporte: Colombia, remoto y en sitio según cobertura del proyecto.',
  'Entrega: según cronograma de obra y disponibilidad de inventario.',
  'Pago: a convenir con el representante comercial.',
  'Los precios no incluyen IVA salvo que se indique lo contrario en la cotización.',
];

const COMPATIBLE_ZIGBEE = ['App ClickControl', 'Alexa', 'Google Home', 'Gateway ZigBee CC'];
const COMPATIBLE_WIFI = ['App ClickControl', 'Alexa', 'Google Home', 'Red WiFi 2.4 GHz'];

const SECTORES_HOGAR = [
  { titulo: 'Hogar Inteligente', texto: 'Control desde la app, por voz o de forma automática, integrado con el resto de dispositivos ClickControl.' },
  { titulo: 'Edificios Residenciales', texto: 'Un dispositivo por unidad o por zona común, gestionado desde una sola plataforma para todo el edificio.' },
  { titulo: 'Hotelería y Hospitalidad', texto: 'Automatización de habitaciones y áreas comunes, integrable con el sistema de gestión del hotel.' },
  { titulo: 'Oficinas y Comercio', texto: 'Control por horario y ocupación, pensado para ahorro operativo y cumplimiento de normas de eficiencia.' },
];

// Nota de confianza estándar para protocolo ZigBee, reutilizada donde la
// lista de precios no da el detalle exacto del rango o la frecuencia.
const ZIGBEE_GENERICO = [
  ['Protocolo', 'ZigBee 3.0 (HA) · 2.4 GHz'],
  ['Alcance típico', 'Hasta 30 m en interiores, según obstáculos'],
];

/** @type {Record<string, object>} */
export const FICHAS = {
  /* ───────────────────────── Sensores y Hub ───────────────────────── */

  'CLICK ITAG01': {
    nombre: 'iTag — Localizador Inteligente Bluetooth',
    subtitulo: 'Bluetooth · Compatible con Buscar de Apple · IPX resistente al agua',
    resumen: 'El iTag CLICK iTag01 es un localizador Bluetooth compacto y resistente al agua que se vincula en segundos al celular —compatible con la red Buscar de Apple— para ubicar llaves, mochila, bicicleta o mascota. En modo perdido activa una alarma de 80 dB que guía hasta encontrar el objeto.',
    destacados: [
      { valor: '40m', etiqueta: 'alcance', sub: 'Bluetooth' },
      { valor: '80dB', etiqueta: 'alarma sonora', sub: 'Modo perdido' },
      { valor: '6', etiqueta: 'meses', sub: 'Duración batería' },
    ],
    specs: [
      ['Conectividad', 'Bluetooth (compatible con red "Buscar" de Apple)'],
      ['Alcance Bluetooth', 'Hasta 40 metros'],
      ['Alarma', '80 dB, activable en modo perdido'],
      ['Batería', 'Hasta 6 meses de duración'],
      ['Resistencia', 'Resistente al agua'],
      ['App', 'Compatible con Buscar de Apple (iOS)'],
    ],
    caracteristicas: [
      { titulo: 'Vinculación en Segundos', texto: 'Se empareja con el celular sin pasos complicados, listo para usarse de inmediato.' },
      { titulo: 'Alarma de 80 dB', texto: 'Si se pierde, una alarma sonora fuerte ayuda a ubicarlo por el sonido.' },
      { titulo: 'Diseño Compacto', texto: 'Cabe en un llavero, mochila o collar de mascota sin estorbar.' },
      { titulo: 'Resistente al Agua', texto: 'Soporta el uso diario a la intemperie sin dañarse con la lluvia o el sudor.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: ['App Buscar (Apple)', 'iOS'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'CLICK ITAG03': {
    nombre: 'iTag Mini — Localizador Inteligente Ultra Compacto',
    subtitulo: 'Bluetooth · Compatible con Buscar de Apple · IP65',
    resumen: 'El iTag Mini CLICK iTag03 es la versión ultra compacta del localizador Bluetooth ClickControl, pensada para llevar a todas partes. Se vincula en segundos al celular —compatible con Buscar de Apple—, con batería reemplazable de hasta 8 meses y resistencia al agua IP65.',
    destacados: [
      { valor: 'IP65', etiqueta: 'resistencia', sub: 'Agua y polvo' },
      { valor: '80dB', etiqueta: 'alarma sonora', sub: 'Modo perdido' },
      { valor: '8', etiqueta: 'meses', sub: 'Duración batería' },
    ],
    specs: [
      ['Conectividad', 'Bluetooth (compatible con red "Buscar" de Apple)'],
      ['Alarma', '80 dB, activable en modo perdido'],
      ['Batería', 'Reemplazable, hasta 8 meses de duración'],
      ['Resistencia', 'IP65 (agua y polvo)'],
      ['App', 'Compatible con Buscar de Apple (iOS)'],
    ],
    caracteristicas: [
      { titulo: 'Ultra Compacto', texto: 'La versión más pequeña de la línea iTag, ideal para llaveros y bolsos.' },
      { titulo: 'Batería Reemplazable', texto: 'No se descarta al agotarse: se le cambia la batería y sigue funcionando.' },
      { titulo: 'IP65', texto: 'Resiste salpicaduras, lluvia y polvo del uso diario.' },
      { titulo: 'Alarma de 80 dB', texto: 'Guía hasta el objeto perdido con una alarma sonora audible a distancia.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: ['App Buscar (Apple)', 'iOS'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'CLICK GW018': {
    nombre: 'Gateway Multi-Protocolo ZigBee + Bluetooth',
    subtitulo: 'ZigBee 3.0 · Bluetooth 5.0 · Mesh',
    resumen: 'El Gateway CLICK GW018 es el cerebro central del hogar inteligente: conecta y controla en un solo punto todos los dispositivos ZigBee 3.0, Bluetooth 5.0 y Mesh, con instalación simple y funcionamiento estable las 24 horas, en un diseño compacto que se adapta a cualquier espacio.',
    destacados: [
      { valor: '3', etiqueta: 'protocolos', sub: 'ZigBee+BLE+Mesh' },
      { valor: '24/7', etiqueta: 'operación', sub: 'Funcionamiento continuo' },
    ],
    specs: [
      ['Protocolos', 'ZigBee 3.0 + Bluetooth 5.0 + Mesh'],
      ...ZIGBEE_GENERICO,
      ['Alimentación', 'USB o adaptador de pared (según presentación)'],
      ['Instalación', 'Conexión directa, sin cableado adicional'],
      ['App de gestión', 'App ClickControl (iOS y Android)'],
    ],
    advertencia: 'La alimentación exacta (voltaje del adaptador) y la capacidad máxima de dispositivos por red no vienen especificadas en la lista de precios: confirmar con el proveedor antes de dimensionar un proyecto grande.',
    caracteristicas: [
      { titulo: 'Hub Multi-Protocolo', texto: 'Unifica ZigBee, Bluetooth y Mesh en un solo equipo: menos hubs, menos cableado, menos costo de instalación.' },
      { titulo: 'Núcleo del Ecosistema', texto: 'Centraliza interruptores, sensores y demás dispositivos ZigBee en un único punto de control.' },
      { titulo: 'Diseño Compacto', texto: 'Se adapta a cualquier espacio del proyecto sin necesitar tablero eléctrico dedicado.' },
      { titulo: 'Funcionamiento 24/7', texto: 'Pensado para operar de forma estable todo el día, todos los días.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK GW015': {
    nombre: 'Gateway ZigBee',
    subtitulo: 'ZigBee 3.0',
    resumen: 'El Gateway CLICK GW015 centraliza y controla todos los dispositivos ZigBee del proyecto desde un solo hub, con conexión rápida y estable. Carcasa resistente, fácil de instalar y pensado para funcionar todo el día sin interrupciones — el punto de partida para automatizar cualquier espacio.',
    destacados: [
      { valor: '1', etiqueta: 'protocolo', sub: 'ZigBee 3.0' },
      { valor: '24/7', etiqueta: 'operación', sub: 'Funcionamiento continuo' },
    ],
    specs: [
      ['Protocolo', 'ZigBee 3.0 (HA)'],
      ...ZIGBEE_GENERICO,
      ['Carcasa', 'Resistente, para uso continuo'],
      ['App de gestión', 'App ClickControl (iOS y Android)'],
    ],
    advertencia: 'La alimentación exacta y la capacidad máxima de dispositivos por red no vienen especificadas en la lista de precios: confirmar con el proveedor antes de dimensionar un proyecto grande.',
    caracteristicas: [
      { titulo: 'Punto de Partida ZigBee', texto: 'La base para empezar a automatizar: conecta interruptores, sensores y demás dispositivos ZigBee del proyecto.' },
      { titulo: 'Conexión Rápida y Estable', texto: 'Pensado para no perder dispositivos ni tener que re-emparejar seguido.' },
      { titulo: 'Instalación Sencilla', texto: 'Sin cableado especial: se conecta y queda listo en minutos.' },
      { titulo: 'Uso Continuo', texto: 'Carcasa resistente para funcionar todo el día, todos los días.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK SB4': {
    nombre: 'Interruptor ZigBee 4 Módulos',
    subtitulo: 'ZigBee · 4 canales · 10A/canal · 100-240V',
    resumen: 'El Interruptor CLICK SB4 controla hasta 4 circuitos de luces o equipos de forma independiente desde el celular o por voz. Soporta hasta 10A por canal, funciona con 100-240V y tiene un alcance ZigBee de 30 metros. Instalación sencilla en cualquier caja eléctrica estándar.',
    destacados: [
      { valor: '4', etiqueta: 'canales', sub: 'Independientes' },
      { valor: '10A', etiqueta: 'por canal', sub: 'Carga máxima' },
      { valor: '100-240V', etiqueta: 'alimentación', sub: 'Universal' },
      { valor: '30m', etiqueta: 'alcance', sub: 'ZigBee' },
    ],
    specs: [
      ['Canales', '4 circuitos independientes'],
      ['Carga máxima', '10 A por canal'],
      ['Voltaje', '100-240V AC'],
      ['Protocolo / RF', 'ZigBee · 2.4 GHz · 30 m'],
      ['Instalación', 'Caja eléctrica estándar'],
      ['Control', 'App, voz o pulsador físico local'],
    ],
    advertencia: 'Confirmar con el proveedor si el canal soporta carga inductiva/motor o sólo resistiva (LED, incandescente) antes de conectar equipos que no sean iluminación.',
    caracteristicas: [
      { titulo: '4 Circuitos Independientes', texto: 'Controla hasta 4 zonas o equipos distintos desde un solo módulo, sin multiplicar puntos de instalación.' },
      { titulo: 'Control por Voz y App', texto: 'Se maneja desde el celular o por comandos de voz, además del control físico local.' },
      { titulo: 'Instalación Estándar', texto: 'Entra en cualquier caja eléctrica común, sin modificaciones especiales.' },
      { titulo: 'Red ZigBee en Malla', texto: 'Cada unidad extiende la cobertura de la red ZigBee del proyecto, actuando como repetidor.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'CLICK DM2': {
    nombre: 'Dimmer ZigBee 2 Módulos',
    subtitulo: 'ZigBee · 2 canales · 10A · 100-240V',
    resumen: 'El Dimmer CLICK DM2 regula la intensidad de las luces con un toque o desde la app, creando el ambiente adecuado en cada momento. Soporta hasta 10A, funciona con 100-240V y tiene un alcance de 30 metros. Fácil de instalar y compatible con el sistema ZigBee ClickControl.',
    destacados: [
      { valor: '2', etiqueta: 'canales', sub: 'Dimmer' },
      { valor: '10A', etiqueta: 'carga', sub: 'Máxima' },
      { valor: '100-240V', etiqueta: 'alimentación', sub: 'Universal' },
      { valor: '30m', etiqueta: 'alcance', sub: 'ZigBee' },
    ],
    specs: [
      ['Canales', '2 canales de regulación'],
      ['Carga máxima', '10 A'],
      ['Voltaje', '100-240V AC'],
      ['Protocolo / RF', 'ZigBee · 2.4 GHz · 30 m'],
      ['Control', 'App, voz o pulsador físico local'],
    ],
    advertencia: 'Como todo dimmer ZigBee de este tipo, sólo es compatible con cargas LED regulables (dimmables). Confirmar con el proveedor la carga mínima por canal antes de instalar con pocas luminarias.',
    caracteristicas: [
      { titulo: 'Regulación de 2 Canales', texto: 'Ajusta la intensidad de dos circuitos de forma independiente desde un solo módulo.' },
      { titulo: 'Ambientes a un Toque', texto: 'Cambia de brillo desde la app o con un pulsador físico, sin instalar interruptores especiales.' },
      { titulo: 'Instalación Sencilla', texto: 'Compatible con caja eléctrica estándar, sin modificar acabados.' },
      { titulo: 'Integración ZigBee', texto: 'Se suma a la red ZigBee del proyecto y funciona junto al resto de dispositivos ClickControl.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: [...COMPATIBLE_ZIGBEE, 'LED Dimmable'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'CLICK CU2': {
    nombre: 'Controlador de Cortinas ZigBee',
    subtitulo: 'ZigBee · 100-240V · Control de motor',
    resumen: 'El Controlador de Cortinas CLICK CU2 abre y cierra cortinas o persianas automáticamente desde el celular, por voz o con un horario programado. Funciona con 100-240V y tiene un alcance ZigBee de 30 metros.',
    destacados: [
      { valor: '100-240V', etiqueta: 'alimentación', sub: 'Universal' },
      { valor: '30m', etiqueta: 'alcance', sub: 'ZigBee' },
    ],
    specs: [
      ['Función', 'Apertura y cierre de cortinas/persianas motorizadas'],
      ['Voltaje', '100-240V AC'],
      ['Protocolo / RF', 'ZigBee · 2.4 GHz · 30 m'],
      ['Control', 'App, voz o programación horaria'],
    ],
    advertencia: 'Requiere un motor de cortina compatible; el amperaje máximo que soporta el controlador no viene especificado en la lista de precios. Confirmar compatibilidad de motor con el proveedor antes de cotizar la instalación.',
    caracteristicas: [
      { titulo: 'Apertura Automática', texto: 'Abre y cierra cortinas o persianas sin necesidad de operarlas a mano.' },
      { titulo: 'Programación por Horario', texto: 'Se puede dejar programado para que abra al amanecer o cierre al anochecer, por ejemplo.' },
      { titulo: 'Control por Voz', texto: 'Se integra con asistentes de voz para manejarlo sin tocar ningún botón.' },
      { titulo: 'Red ZigBee', texto: 'Funciona junto al resto de dispositivos ZigBee ClickControl del proyecto.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK HS03': {
    nombre: 'Sensor de Humedad ZigBee',
    subtitulo: 'ZigBee · A batería',
    resumen: 'El Sensor de Humedad CLICK HS03 monitorea la humedad de cualquier ambiente en tiempo real y envía alertas directo al celular. Diseño compacto, batería de larga duración y fácil instalación en pared o superficie — ideal para cuidar espacios sensibles a la humedad.',
    destacados: [
      { valor: 'RT', etiqueta: 'monitoreo', sub: 'Tiempo real' },
    ],
    specs: [
      ...ZIGBEE_GENERICO,
      ['Alimentación', 'Batería (tipo y duración no especificados por el proveedor)'],
      ['Instalación', 'Pared o superficie, sin cableado'],
      ['Alertas', 'Notificación al celular vía app'],
    ],
    advertencia: 'El proveedor no especifica el tipo y duración exacta de la batería, ni el rango de humedad medible. Confirmar antes de cotizar un proyecto donde ese dato sea determinante.',
    caracteristicas: [
      { titulo: 'Monitoreo en Tiempo Real', texto: 'Muestra la humedad del ambiente al instante desde la app.' },
      { titulo: 'Alertas Automáticas', texto: 'Avisa al celular apenas la humedad sale del rango esperado.' },
      { titulo: 'Sin Cableado', texto: 'Se instala en pared o superficie con batería, sin necesidad de corriente.' },
      { titulo: 'Diseño Compacto', texto: 'Discreto, no interfiere con la decoración del espacio.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK WL08': {
    nombre: 'Sensor de Agua Inteligente ZigBee',
    subtitulo: 'ZigBee · A batería',
    resumen: 'El Sensor de Agua CLICK WL08 detecta fugas o encharcamientos al instante y avisa antes de que se conviertan en un problema costoso. Compacto y discreto, funciona con batería de larga duración.',
    destacados: [
      { valor: 'RT', etiqueta: 'detección', sub: 'Al instante' },
    ],
    specs: [
      ...ZIGBEE_GENERICO,
      ['Alimentación', 'Batería (tipo y duración no especificados por el proveedor)'],
      ['Instalación', 'Superficie, junto al punto de riesgo (bajo lavamanos, tanque, etc.)'],
      ['Alertas', 'Notificación al celular vía app'],
    ],
    advertencia: 'El proveedor no especifica el tipo y duración exacta de la batería, ni el grado de protección IP del sensor. Confirmar antes de instalarlo en zonas con agua estancada permanente.',
    caracteristicas: [
      { titulo: 'Detección al Instante', texto: 'Avisa apenas detecta agua donde no debería haberla.' },
      { titulo: 'Evita Daños Costosos', texto: 'Una fuga detectada a tiempo es mucho más barata que una reparación después del daño.' },
      { titulo: 'Compacto y Discreto', texto: 'Se instala junto al punto de riesgo sin llamar la atención.' },
      { titulo: 'Batería de Larga Duración', texto: 'No requiere corriente ni mantenimiento frecuente.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK DS4': {
    nombre: 'Sensor de Puerta y Ventana ZigBee',
    subtitulo: 'ZigBee · A batería · LED de conexión',
    resumen: 'El Sensor de Puerta y Ventana CLICK DS4 avisa al instante cuándo se abre una puerta o ventana, estando donde se esté. Indicador LED de conexión, carcasa resistente y batería de larga duración — seguridad simple y efectiva para hogar o negocio.',
    destacados: [
      { valor: 'RT', etiqueta: 'aviso', sub: 'Al abrir' },
    ],
    specs: [
      ...ZIGBEE_GENERICO,
      ['Alimentación', 'Batería (tipo y duración no especificados por el proveedor)'],
      ['Indicador', 'LED de estado de conexión'],
      ['Instalación', 'Adhesivo o tornillo, sobre marco de puerta/ventana'],
    ],
    advertencia: 'El proveedor no especifica el tipo y duración exacta de la batería. Confirmar antes de un proyecto con muchas unidades, para calcular reemplazos.',
    caracteristicas: [
      { titulo: 'Aviso Inmediato', texto: 'Notifica al celular apenas se abre la puerta o ventana monitoreada.' },
      { titulo: 'LED de Conexión', texto: 'Muestra de un vistazo si el sensor sigue conectado a la red.' },
      { titulo: 'Carcasa Resistente', texto: 'Pensada para uso diario, sin desgastarse con el movimiento de la puerta.' },
      { titulo: 'Instalación sin Cableado', texto: 'Se pega o atornilla en minutos, sin tocar la instalación eléctrica.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_ZIGBEE,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  'CLICK IRRF': {
    nombre: 'Control Universal Inteligente IR + RF',
    subtitulo: 'Infrarrojo + RF · Alcance 10m · 360°',
    resumen: 'El Control Universal CLICK IRRF convierte el celular en el control remoto de toda la casa —aires acondicionados, TV, luces, ventiladores y más— desde una sola app. Aprende y replica hasta 20 controles remotos, con alcance de 10 metros y cobertura de 360°. Compatible con iOS y Android.',
    destacados: [
      { valor: '20', etiqueta: 'controles', sub: 'Memorizables' },
      { valor: '10m', etiqueta: 'alcance', sub: 'IR/RF' },
      { valor: '360°', etiqueta: 'cobertura', sub: 'Sin punto ciego' },
    ],
    specs: [
      ['Tecnología', 'Infrarrojo (IR) + Radiofrecuencia (RF)'],
      ['Capacidad', 'Hasta 20 controles remotos aprendidos'],
      ['Alcance', '10 metros'],
      ['Cobertura', '360°'],
      ['App', 'iOS y Android'],
    ],
    caracteristicas: [
      { titulo: 'Aprende Cualquier Control', texto: 'Copia la señal de hasta 20 controles remotos distintos: aire, TV, equipo de sonido, ventilador.' },
      { titulo: 'Un Solo Punto de Control', texto: 'Reemplaza todos los controles remotos de la casa por una sola app en el celular.' },
      { titulo: 'Cobertura 360°', texto: 'No hace falta apuntar: emite en todas direcciones desde su ubicación.' },
      { titulo: 'Escenas Combinadas', texto: 'Se puede combinar con otros dispositivos ClickControl en una sola escena, como "modo cine".' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: ['App ClickControl', 'iOS', 'Android'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'CLICK WCP01': {
    nombre: 'Cámara WiFi Inteligente 2MP',
    subtitulo: 'WiFi · 2MP · Giro 360°/90° · Visión nocturna 10m',
    resumen: 'La Cámara CLICK WCP01 vigila el hogar o negocio desde donde se esté, con video en vivo, audio bidireccional y giro motorizado 360°/90° para no perder detalle. Detecta movimiento y avisa al instante, con grabación en tarjeta SD de hasta 128GB y visión nocturna de hasta 10 metros.',
    destacados: [
      { valor: '2MP', etiqueta: 'resolución', sub: 'Video' },
      { valor: '360°/90°', etiqueta: 'giro', sub: 'Horizontal/vertical' },
      { valor: '10m', etiqueta: 'visión nocturna', sub: 'Alcance' },
      { valor: '128GB', etiqueta: 'tarjeta SD', sub: 'Máximo' },
    ],
    specs: [
      ['Resolución', '2 MP'],
      ['Conectividad', 'WiFi'],
      ['Giro', '360° horizontal / 90° vertical, motorizado'],
      ['Audio', 'Bidireccional'],
      ['Detección de movimiento', 'Sí, con aviso al celular'],
      ['Grabación', 'Tarjeta microSD, hasta 128 GB'],
      ['Visión nocturna', 'Hasta 10 metros'],
    ],
    advertencia: 'La banda WiFi exacta (2.4 GHz, o 2.4+5 GHz) y el grado de resistencia a la intemperie (interior/exterior) no vienen especificados en la lista de precios. Confirmar con el proveedor antes de instalarla a la intemperie.',
    caracteristicas: [
      { titulo: 'Video en Vivo desde Cualquier Lugar', texto: 'Se conecta por WiFi y permite ver el video en tiempo real desde el celular, estés donde estés.' },
      { titulo: 'Giro Motorizado', texto: '360° horizontal y 90° vertical: cubre todo el espacio sin puntos ciegos.' },
      { titulo: 'Audio Bidireccional', texto: 'Escucha y habla a través de la cámara, útil para hablarle a quien esté del otro lado.' },
      { titulo: 'Detección de Movimiento', texto: 'Avisa al instante al celular cuando detecta actividad frente a la cámara.' },
    ],
    sectores: SECTORES_HOGAR,
    compatibleCon: COMPATIBLE_WIFI,
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'estandar',
    pie: PIE,
  },

  /* ───────────────────────── Redes WiFi (Huawei) ───────────────────────── */
  // Los números de esta sección salen de dos fuentes: lo que ya trae la
  // propia lista de precios (que en este renglón es casi un recorte de la
  // ficha del fabricante) y la ficha pública de Huawei para el mismo modelo,
  // consultada aparte para completar lo que faltaba. Por eso quedan como
  // 'confirmado': no es un producto genérico, es un equipo real e
  // identificable con documentación oficial.

  AP160: {
    nombre: 'Access Point Huawei AP160 — WiFi 6 de Pared',
    subtitulo: 'WiFi 6 (802.11ax) · 86×86mm · 1.775 Gbps',
    resumen: 'El Access Point Huawei AP160 es un equipo WiFi 6 (802.11ax) de pared, formato 86×86mm de sólo 8mm de espesor, pensado para instalarse sobre una caja eléctrica existente o expuesta. Transmite simultáneamente en 2.4 GHz y 5 GHz, con antena inteligente y hasta 128 usuarios conectados.',
    destacados: [
      { valor: '1.775', etiqueta: 'Gbps', sub: 'Tasa combinada' },
      { valor: '128', etiqueta: 'usuarios máx.', sub: '48 recomendados' },
      { valor: '15m', etiqueta: 'cobertura', sub: 'Óptima' },
      { valor: '20dBm', etiqueta: 'potencia', sub: 'Transmisión' },
    ],
    specs: [
      ['Estándar WiFi', '802.11ax (WiFi 6)'],
      ['Radio', 'Dual-radio: 2.4 GHz + 5 GHz simultáneo'],
      ['Tasa máxima combinada', '1.775 Gbps'],
      ['Usuarios', '48 recomendados · 128 máximo'],
      ['Potencia de transmisión', '20 dBm'],
      ['Antena', 'Inteligente (smart antenna)'],
      ['Cobertura óptima', '15 metros'],
      ['Formato', 'Placa de pared 86×86 mm, 8 mm de espesor'],
      ['Instalación', 'Sobre caja eléctrica expuesta o embutida (mín. 35mm de fondo)'],
      ['Puertos', '1× GE uplink + 1× GE downlink'],
      ['Seguridad', 'WPA3-SAE, WPA2/WPA-PSK, 802.1X, DTLS'],
      ['Gestión', 'Modo Fit, Fat o nube — app HUAWEI eKit'],
    ],
    caracteristicas: [
      { titulo: 'Diseño de Pared Ultra Delgado', texto: 'Sólo 8mm de espesor: reemplaza una placa de toma existente sin obra civil adicional.' },
      { titulo: 'WiFi 6 Dual-Band', texto: 'Transmite en 2.4 y 5 GHz al mismo tiempo, con hasta 1.775 Gbps combinados.' },
      { titulo: 'Antena Inteligente', texto: 'Ajusta la dirección de la señal según dónde estén los dispositivos conectados.' },
      { titulo: 'Gestión Flexible', texto: 'Se administra en modo local (Fit/Fat) o desde la nube, con la app HUAWEI eKit.' },
    ],
    sectores: [
      { titulo: 'Oficinas y Coworking', texto: 'Cobertura WiFi 6 discreta, sin equipos visibles sobre el escritorio.' },
      { titulo: 'Hotelería Económica', texto: 'Una unidad por habitación, instalada sobre la toma existente.' },
      { titulo: 'Comercio y Retail', texto: 'Cobertura confiable para punto de venta y clientes, sin cablear de más.' },
      { titulo: 'Edificios Residenciales', texto: 'WiFi de alto desempeño por apartamento o área común.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'Controlador WAC Huawei', 'Gestión en la nube'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AP361: {
    nombre: 'Access Point Huawei AP361 — WiFi 6 de Techo PoE',
    subtitulo: 'WiFi 6 (802.11ax) · PoE 802.3af · 128 usuarios',
    resumen: 'El Access Point Huawei AP361 es un equipo de techo WiFi 6 (802.11ax) alimentado por PoE, con radio dual 2.4/5 GHz y tasa combinada de 1.775 Gbps. Pensado para interiores con densidad media de usuarios: oficinas, hospitales, comercio y hotelería.',
    destacados: [
      { valor: '1.775', etiqueta: 'Gbps', sub: 'Tasa combinada' },
      { valor: '128', etiqueta: 'usuarios máx.', sub: '80 recomendados' },
      { valor: '18m', etiqueta: 'cobertura', sub: 'Óptima' },
      { valor: '8.8W', etiqueta: 'consumo', sub: 'PoE 802.3af' },
    ],
    specs: [
      ['Estándar WiFi', '802.11ax (WiFi 6)'],
      ['Radio', 'Dual-radio: 2.4 GHz (2×2) + 5 GHz (2×2)'],
      ['Tasa máxima combinada', '1.775 Gbps'],
      ['Usuarios', '80 recomendados · 128 máximo'],
      ['Potencia de transmisión', '20 dBm'],
      ['Alimentación', 'PoE 802.3af, consumo máx. 8.8 W'],
      ['Cobertura óptima', '18 metros'],
      ['Montaje', 'Pared, techo o riel-T'],
      ['Dimensiones', 'Ø180 mm × 35 mm · 0.45 kg'],
      ['Temperatura de operación', '0°C a +40°C · 5%-95% humedad, sin condensación'],
      ['Puertos', '1× GE (con entrada PoE)'],
      ['Seguridad', 'WPA3, WPA2, WEP, WIDS/WIPS, DTLS'],
    ],
    caracteristicas: [
      { titulo: 'Alimentado por PoE', texto: 'Un solo cable de red lo alimenta y lo conecta: no necesita toma eléctrica cerca.' },
      { titulo: 'WiFi 6 de Alta Densidad', texto: 'Pensado para 80 usuarios recomendados por unidad, hasta 128 en el límite.' },
      { titulo: 'Montaje Versátil', texto: 'Se instala en pared, techo o riel-T, según el espacio disponible.' },
      { titulo: 'Rango de Temperatura Amplio', texto: 'Opera de 0°C a 40°C con humedad hasta 95%, sin condensación.' },
    ],
    sectores: [
      { titulo: 'Oficinas y Coworking', texto: 'Cobertura de techo para salas de reunión y puestos de trabajo abiertos.' },
      { titulo: 'Hospitales y Clínicas', texto: 'Conectividad estable para personal, pacientes y equipos médicos conectados.' },
      { titulo: 'Comercio y Retail', texto: 'Cobertura pareja en locales medianos, sin cables visibles.' },
      { titulo: 'Hotelería Económica', texto: 'Una unidad por piso o por zona común, alimentada por el mismo cable de red.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'Controlador WAC Huawei', 'Switch PoE 802.3af'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AP271E: {
    nombre: 'Access Point Huawei AP271E — WiFi 7 de Pared',
    subtitulo: 'WiFi 7 (802.11be) · 3.57 Gbps · 256 usuarios',
    resumen: 'El Access Point Huawei AP271E es un equipo de pared WiFi 7 (802.11be), con 2.5GE de subida y 4 puertos GE de bajada. Alcanza hasta 3.57 Gbps combinados en 2.4 y 5 GHz, con soporte para 256 usuarios y gestión local o en la nube vía app HUAWEI eKit.',
    destacados: [
      { valor: '3.57', etiqueta: 'Gbps', sub: 'Tasa combinada' },
      { valor: '256', etiqueta: 'usuarios máx.', sub: '80 recomendados' },
      { valor: '5', etiqueta: 'puertos', sub: '1× 2.5GE + 4× GE' },
      { valor: '20m', etiqueta: 'cobertura', sub: 'Óptima' },
    ],
    specs: [
      ['Estándar WiFi', '802.11be (WiFi 7)'],
      ['Radio', 'Dual-radio: 2.4 GHz (2×2) + 5 GHz (2×2)'],
      ['Tasa máxima combinada', '3.57 Gbps (688 Mbps @2.4GHz + 2.88 Gbps @5GHz)'],
      ['Usuarios', '80 recomendados · 256 máximo'],
      ['Potencia de transmisión', '23 dBm'],
      ['Puertos', '1× 2.5GE uplink + 4× GE downlink'],
      ['Ancho de banda', '160 MHz, modulación 4096-QAM'],
      ['Cobertura óptima', '20 metros'],
      ['Formato', 'Placa de pared, multi-puerto'],
      ['Gestión', 'Local (EasyWeb/WAC) o nube — app HUAWEI eKit / SNC'],
      ['Seguridad', 'WPA3, WPA2, 802.1X'],
    ],
    caracteristicas: [
      { titulo: 'WiFi 7 de Última Generación', texto: 'El estándar más reciente, con velocidades muy por encima de WiFi 6, ideal para proyectos que quieren quedar listos a futuro.' },
      { titulo: 'Múltiples Puertos Cableados', texto: 'Cinco puertos Ethernet en un solo equipo: sirve también como punto de red para dispositivos cableados de la habitación.' },
      { titulo: 'Alta Capacidad de Usuarios', texto: 'Hasta 256 usuarios conectados, pensado para zonas de alta ocupación.' },
      { titulo: 'Diseño Discreto de Pared', texto: 'Se instala como una placa de pared, sin equipos visibles adicionales.' },
    ],
    sectores: [
      { titulo: 'Hotelería', texto: 'Una unidad por habitación: WiFi de última generación más puertos de red para TV, teléfono o consola.' },
      { titulo: 'Hospitales y Clínicas', texto: 'Alta capacidad de usuarios y puertos cableados para equipos médicos.' },
      { titulo: 'Comercio y Oficinas', texto: 'Cobertura de nueva generación para espacios con muchos dispositivos conectados.' },
      { titulo: 'Educación', texto: 'Soporta alta densidad de estudiantes conectados simultáneamente por aula.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'Controlador WAC Huawei', 'HUAWEI SNC (nube)'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AP661: {
    nombre: 'Access Point Huawei AP661 — WiFi 6 Tri-Banda Alta Densidad',
    subtitulo: 'WiFi 6 (802.11ax) · Tri-banda · Hasta 1536 usuarios',
    resumen: 'El Access Point Huawei AP661 es un equipo WiFi 6 tri-banda de alta densidad: transmite en 2.4 GHz, 5 GHz (2×2) y 5 GHz (4×4) al mismo tiempo, alcanzando hasta 6.575 Gbps combinados. Pensado para espacios con muchísimos usuarios conectados a la vez: oficinas grandes, colegios, estadios.',
    destacados: [
      { valor: '6.575', etiqueta: 'Gbps', sub: 'Tasa combinada' },
      { valor: '1536', etiqueta: 'usuarios máx.', sub: '300 recomendados' },
      { valor: '3', etiqueta: 'radios', sub: 'Tri-banda' },
      { valor: '26dBm', etiqueta: 'potencia', sub: 'Transmisión' },
    ],
    specs: [
      ['Estándar WiFi', '802.11ax (WiFi 6)'],
      ['Radio', 'Tri-banda: 2.4 GHz (2×2) + 5 GHz (2×2) + 5 GHz (4×4)'],
      ['Tasa máxima combinada', '6.575 Gbps'],
      ['Usuarios', '300 recomendados · 1536 máximo'],
      ['Ancho de banda', '160 MHz'],
      ['Potencia de transmisión', '26 dBm'],
      ['Antena', 'Inteligente, integrada, señal siempre activa'],
      ['Conectividad', 'USB, BLE integrado'],
      ['Garantía del fabricante', '2 años'],
    ],
    caracteristicas: [
      { titulo: 'Tri-Banda de Alta Capacidad', texto: 'Tres radios trabajando a la vez reparten mejor la carga que un equipo dual-band tradicional.' },
      { titulo: 'Hasta 1536 Usuarios', texto: 'Pensado para espacios masivos: auditorios, estadios, campus universitarios.' },
      { titulo: 'Antenas Inteligentes', texto: 'Señal siempre activa y bien dirigida, sin importar dónde estén los dispositivos.' },
      { titulo: '2 Años de Garantía', texto: 'Respaldo directo del fabricante por dos años, más que el estándar de la línea.' },
    ],
    sectores: [
      { titulo: 'Educación', texto: 'Auditorios y salones grandes con cientos de estudiantes conectados a la vez.' },
      { titulo: 'Estadios y Eventos', texto: 'Alta densidad de usuarios en espacios abiertos de gran capacidad.' },
      { titulo: 'Oficinas Corporativas', texto: 'Pisos completos con alta ocupación simultánea.' },
      { titulo: 'Centros de Convenciones', texto: 'Picos de usuarios conectados durante ferias y eventos.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'Controlador WAC Huawei', 'HUAWEI SNC (nube)'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AP761: {
    nombre: 'Access Point Huawei AP761 — WiFi 6 Exterior IP68',
    subtitulo: 'WiFi 6 (802.11ax) · Exterior · IP68 · -40°C a 65°C',
    resumen: 'El Access Point Huawei AP761 es un equipo WiFi 6 para exteriores, con protección IP68 contra agua y polvo, antenas direccionales integradas y rango de temperatura industrial de -40°C a 65°C. Ideal para cobertura al aire libre: fachadas, patios, zonas comunes exteriores.',
    destacados: [
      { valor: 'IP68', etiqueta: 'protección', sub: 'Agua y polvo' },
      { valor: '1201', etiqueta: 'Mbps', sub: 'Máx. @5GHz' },
      { valor: '-40 a 65°C', etiqueta: 'temperatura', sub: 'Rango industrial' },
      { valor: '6kA', etiqueta: 'protección', sub: 'Contra sobretensión' },
    ],
    specs: [
      ['Estándar WiFi', '802.11 b/g/n/ax (2.4GHz) · a/n/ac/ax (5GHz)'],
      ['Tasa máxima', '574 Mbps @2.4GHz · 1201 Mbps @5GHz'],
      ['Antena', 'Direccional integrada: 65° horizontal, 10 dBi (2.4GHz) / 11 dBi (5GHz)'],
      ['Protección ambiental', 'IP68 (agua y polvo)'],
      ['Temperatura de operación', '-40°C a +65°C (grado industrial)'],
      ['Protección eléctrica', 'Pararrayos 6 kA en puertos Ethernet'],
      ['Puertos', '1× GE uplink + 1× GE downlink, con entrada PoE'],
      ['Funciones avanzadas', 'MU-MIMO, BSS coloring, TWT (ahorro de energía)'],
      ['Gestión', 'Fit, Fat o nube'],
    ],
    caracteristicas: [
      { titulo: 'Diseñado para Exteriores', texto: 'IP68 y rango de temperatura industrial: resiste lluvia, sol directo y climas extremos.' },
      { titulo: 'Antenas Direccionales', texto: 'Cobertura enfocada hacia donde se necesita, con buena ganancia en ambas bandas.' },
      { titulo: 'Protegido contra Rayos', texto: 'Pararrayos de 6 kA en los puertos Ethernet, pensado para instalación expuesta.' },
      { titulo: 'Ahorro de Energía (TWT)', texto: 'Reduce el consumo de los dispositivos conectados que lo soportan.' },
    ],
    sectores: [
      { titulo: 'Zonas Comunes Exteriores', texto: 'Patios, terrazas y piscinas de conjuntos residenciales u hoteles.' },
      { titulo: 'Campus e Industria', texto: 'Cobertura entre edificios o en plantas a la intemperie.' },
      { titulo: 'Fachadas Comerciales', texto: 'WiFi para clientes en zonas exteriores de centros comerciales.' },
      { titulo: 'Proyectos Rurales', texto: 'Rango de temperatura amplio para climas extremos de calor o frío.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'Controlador WAC Huawei', 'Switch PoE'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AR180: {
    nombre: 'Router Huawei AR180 — WiFi 7 Empresarial',
    subtitulo: 'WiFi 7 (802.11be) · 3.6 Gbps · 100 terminales',
    resumen: 'El Router Huawei AR180 es un equipo empresarial WiFi 7 (802.11be) con velocidad combinada de hasta 3.6 Gbps, pensado para redes pequeñas y medianas: hasta 8 puntos de acceso gestionados, 9 dispositivos administrados y 100 terminales conectados, con control de aplicaciones incorporado.',
    destacados: [
      { valor: '3.6', etiqueta: 'Gbps', sub: 'WiFi 7 combinado' },
      { valor: '100', etiqueta: 'terminales', sub: 'Conectados' },
      { valor: '8', etiqueta: 'APs', sub: 'Gestionados' },
      { valor: '13W', etiqueta: 'consumo', sub: 'Máximo' },
    ],
    specs: [
      ['Estándar WiFi', '802.11be (WiFi 7)'],
      ['Velocidad combinada', 'Hasta 3.6 Gbps (0.69 Gbps @2.4GHz + 2.88 Gbps @5GHz)'],
      ['Túneles IPSec', '8'],
      ['APs gestionados', '8'],
      ['Dispositivos gestionados', '9'],
      ['Terminales conectados', '100'],
      ['Ancho de banda de salida', '2 Gbps'],
      ['Rendimiento VPN', '200 Mbps'],
      ['Puertos', '4× GE eléctricos + 1× 2.5GE eléctrico'],
      ['Consumo máximo', '13 W'],
      ['Mesh', 'Hasta 8 equipos, descubrimiento automático a 20 m'],
      ['Control de aplicaciones', 'Identifica más de 500 aplicaciones (bloquear, priorizar, limitar)'],
    ],
    caracteristicas: [
      { titulo: 'WiFi 7 en un Router Empresarial', texto: 'Combina la velocidad más reciente con funciones de gestión de red que un router doméstico no tiene.' },
      { titulo: 'VPN y Seguridad Incluidas', texto: 'Hasta 8 túneles IPSec para conectar sedes u oficinas remotas de forma segura.' },
      { titulo: 'Control de Aplicaciones', texto: 'Reconoce más de 500 aplicaciones y permite priorizar, limitar o bloquear cada una.' },
      { titulo: 'Red Mesh hasta 8 Equipos', texto: 'Se combina con otros equipos de la serie para cubrir espacios más grandes.' },
    ],
    sectores: [
      { titulo: 'Oficinas Pequeñas y Medianas', texto: 'Router principal con gestión de aplicaciones y hasta 8 APs adicionales.' },
      { titulo: 'Sucursales', texto: 'VPN IPSec para conectar de forma segura con la oficina central.' },
      { titulo: 'Comercio', texto: 'Control de qué aplicaciones consumen el ancho de banda de la red.' },
      { titulo: 'Hogar Inteligente de Alta Gama', texto: 'WiFi 7 con funciones de red profesionales para proyectos residenciales exigentes.' },
    ],
    compatibleCon: ['App HUAWEI eKit', 'HUAWEI SNC (nube)', 'Access Points Huawei serie AP'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'S220S-24P4J': {
    nombre: 'Switch Huawei S220S-24P4J — 24 Puertos PoE+ Administrable',
    subtitulo: 'Capa 2 · 24×PoE+ · 4×2.5GE SFP · 400W PoE',
    resumen: 'El Switch Huawei S220S-24P4J es un switch administrable de capa 2 con 24 puertos 10/100/1000BASE-T PoE+ y 4 puertos 2.5GE SFP, con presupuesto PoE de 400W. Pensado para redes de pequeña y mediana empresa que necesitan alimentar cámaras, access points y teléfonos IP desde el mismo switch.',
    destacados: [
      { valor: '24', etiqueta: 'puertos PoE+', sub: '10/100/1000' },
      { valor: '400W', etiqueta: 'presupuesto PoE', sub: 'Total' },
      { valor: '4', etiqueta: 'puertos SFP', sub: '2.5GE' },
      { valor: '68', etiqueta: 'Gbps', sub: 'Capacidad conmutación' },
    ],
    specs: [
      ['Puertos', '24× 10/100/1000BASE-T (PoE+) + 4× 2.5GE SFP'],
      ['Presupuesto PoE', '400 W'],
      ['Capacidad de conmutación', '68 Gbit/s'],
      ['Tasa de reenvío', '51 Mpps'],
      ['Capa', 'Capa 2 administrable'],
      ['Seguridad', 'Prevención de ataques DoS, DHCP snooping'],
      ['Redundancia', 'ERPS, STP, RSTP'],
      ['Dimensiones', '43.6 × 442 × 220 mm'],
      ['Garantía del fabricante', '2 años'],
    ],
    caracteristicas: [
      { titulo: '24 Puertos PoE+', texto: 'Alimenta cámaras IP, access points y teléfonos IP directamente desde el switch, sin fuentes aparte.' },
      { titulo: '400W de Presupuesto PoE', texto: 'Suficiente para alimentar los 24 puertos con equipos de consumo moderado a la vez.' },
      { titulo: 'Puertos SFP de 2.5GE', texto: 'Cuatro puertos de mayor velocidad para conectar el switch al resto de la red o a un servidor.' },
      { titulo: 'Redundancia de Red', texto: 'Soporta ERPS, STP y RSTP para que la red siga funcionando si un enlace falla.' },
    ],
    sectores: [
      { titulo: 'Oficinas', texto: 'Switch central alimentando teléfonos IP y access points por PoE.' },
      { titulo: 'Educación', texto: 'Redes de campus con cámaras y access points alimentados desde el mismo switch.' },
      { titulo: 'Hotelería', texto: 'Distribución de red y PoE para cámaras y access points por planta.' },
      { titulo: 'Videovigilancia', texto: 'Alimenta y conecta hasta 24 cámaras IP PoE desde un solo equipo.' },
    ],
    compatibleCon: ['Access Points Huawei serie AP', 'Cámaras IP PoE', 'Teléfonos IP PoE'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  AR720: {
    nombre: 'Router Huawei AR720 — Empresarial 700 Usuarios',
    subtitulo: 'Router 1U · 700 terminales · Firewall + IPS integrados',
    resumen: 'El Router Huawei AR720 integra ruteo, conmutación, VPN y seguridad en un equipo compacto de montaje en rack 1U. Soporta hasta 700 terminales conectados, con firewall, IPS y antivirus incorporados, pensado como equipo de borde para pequeñas y medianas empresas.',
    destacados: [
      { valor: '700', etiqueta: 'terminales', sub: 'Conectados' },
      { valor: '4Gbps', etiqueta: 'ancho de banda', sub: 'Salida' },
      { valor: '10', etiqueta: 'puertos', sub: '2 WAN + 8 LAN' },
      { valor: '33W', etiqueta: 'consumo', sub: 'Máximo' },
    ],
    specs: [
      ['Procesador', 'ARM64 de 4 núcleos'],
      ['Rendimiento de reenvío', '9 a 25 Mpps'],
      ['Terminales conectados', 'Hasta 700'],
      ['Ancho de banda de salida', '4 Gbit/s'],
      ['Puertos', '2× GE Combo WAN + 8× GE LAN + 2× USB + 2× SIC'],
      ['Seguridad integrada', 'Firewall, IPS, antivirus'],
      ['Alimentación', '100-240V AC · 50/60Hz'],
      ['Consumo máximo', '33 W'],
      ['Formato', 'Rack 1U · 43.6 × 442 × 220 mm'],
    ],
    caracteristicas: [
      { titulo: 'Todo en un Equipo', texto: 'Ruteo, switching, VPN y seguridad en un solo dispositivo de montaje en rack.' },
      { titulo: 'Seguridad Integrada', texto: 'Firewall, IPS y antivirus incluidos, sin necesitar un equipo aparte.' },
      { titulo: 'Hasta 700 Terminales', texto: 'Dimensionado para la red completa de una empresa mediana.' },
      { titulo: 'Puertos Expandibles', texto: 'Módulos SIC para agregar interfaces adicionales según el proyecto.' },
    ],
    sectores: [
      { titulo: 'Oficinas Medianas', texto: 'Equipo de borde único para toda la red corporativa.' },
      { titulo: 'Sucursales', texto: 'Conexión segura entre sedes con VPN y firewall incorporados.' },
      { titulo: 'Educación', texto: 'Red de campus con seguridad perimetral integrada.' },
      { titulo: 'Comercio', texto: 'Punto de red seguro para varias tiendas o sucursales.' },
    ],
    compatibleCon: ['Access Points Huawei serie AP', 'Switches Huawei serie S', 'HUAWEI SNC (nube)'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },

  'S380-L4T1T': {
    nombre: 'Gateway Multi-Servicio Huawei S380-L4T1T',
    subtitulo: 'Gateway · 32 APs gestionados · 8 Gbps conmutación',
    resumen: 'El Gateway Multi-Servicio Huawei S380-L4T1T combina ruteo y gestión de hasta 32 access points en un equipo compacto de 1U sin ventilador. Con 1 puerto WAN y 4 LAN Gigabit, capacidad de conmutación de 8 Gbps y hasta 200 usuarios, es la puerta de entrada típica de una red pequeña o mediana con varios puntos WiFi.',
    destacados: [
      { valor: '32', etiqueta: 'APs', sub: 'Gestionados' },
      { valor: '200', etiqueta: 'usuarios', sub: 'Máximo' },
      { valor: '8Gbps', etiqueta: 'conmutación', sub: 'Capacidad' },
      { valor: '5', etiqueta: 'puertos', sub: '1 WAN + 4 LAN' },
    ],
    specs: [
      ['APs gestionados', 'Hasta 32'],
      ['Usuarios', 'Hasta 200 (según el proyecto)'],
      ['Capacidad de conmutación', '8 Gbit/s'],
      ['Tasa de reenvío', 'Subida 300 Kpps · Bajada 420 Kpps'],
      ['Ancho de banda de salida', '1 Gbit/s'],
      ['Puertos', '1× GE WAN + 4× GE LAN'],
      ['Formato', 'Rack 1U, sin ventilador (disipación natural)'],
      ['Dimensiones', '35 × 210 × 130 mm · 0.8 kg'],
    ],
    caracteristicas: [
      { titulo: 'Gestiona hasta 32 Access Points', texto: 'Punto único para administrar toda la red WiFi del proyecto, desde un solo equipo.' },
      { titulo: 'Sin Ventilador', texto: 'Disipación natural: funciona en silencio y sin partes móviles que fallen con el tiempo.' },
      { titulo: 'Compacto', texto: 'Formato 1U liviano, fácil de instalar en un rack pequeño o gabinete.' },
      { titulo: 'Puerta de Entrada de la Red', texto: 'Concentra el ruteo y la gestión de WiFi en un solo punto de la instalación.' },
    ],
    sectores: [
      { titulo: 'Edificios Residenciales', texto: 'Gestión centralizada del WiFi de varios pisos o torres desde un solo equipo.' },
      { titulo: 'Hotelería', texto: 'Administración de los access points de todas las habitaciones desde un punto.' },
      { titulo: 'Oficinas', texto: 'Puerta de entrada de la red con gestión de todos los puntos WiFi del piso.' },
      { titulo: 'Comercio', texto: 'Red WiFi de varias tiendas o puntos de venta gestionada centralmente.' },
    ],
    compatibleCon: ['Access Points Huawei serie AP', 'HUAWEI SNC (nube)'],
    condiciones: CONDICIONES_ESTANDAR,
    confianza: 'confirmado',
    pie: PIE,
  },
};

export { CONDICIONES_ESTANDAR, PIE };
