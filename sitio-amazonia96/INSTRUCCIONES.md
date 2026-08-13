# Acta de Conformidad · Amazonía 96

Reemplaza el Google Forms de calificación por un formulario propio, con el
mismo estilo visual y el mismo mecanismo que ya usas en
`agendamiento-amazonia96.html`: un solo archivo HTML (sin dependencias, todo
incrustado) que envía los datos a Google Apps Script, y éste los guarda en
una hoja de Google Sheets y te avisa por correo.

## Archivo

`calificacion-amazonia96.html` — es lo único que hay que subir. Contiene el
CSS, el JavaScript y el logo (base64), igual que el formulario de
agendamiento.

## ⚠️ Qué estaba fallando (y por qué)

El formulario se quedaba en "Enviando…" sin hacer nada porque el Apps
Script que recibía los datos no los estaba leyendo bien: llegaban con
nombres de campo (`Nombre`, `Apto`, `Cal Claridad`…) que ese script no
reconocía, y por eso el correo que llegaba mostraba puros `undefined`. La
hoja real donde vive el histórico es **"Acta Entrega"**, pestaña **"Form
Responses 1"**, con las columnas del Google Forms viejo — no coincide con
lo que el script esperaba.

La solución (`codigo-apps-script.gs.txt`, en esta misma carpeta) no toca
"Form Responses 1" ni el histórico: crea su **propia pestaña nueva**,
`Respuestas Web`, con sus propios encabezados, la primera vez que alguien
envía el formulario nuevo. Así los dos sistemas conviven sin pisarse.

## Publicarlo

1. Sube `calificacion-amazonia96.html` a `public_html/` en tu cPanel, junto
   a `agendamiento-amazonia96.html`.
2. Abre la hoja de cálculo **"Acta Entrega"** (la del Google Forms viejo) →
   **Extensiones → Apps Script**.
3. Borra todo el código que haya ahí (probablemente sea el que genera los
   correos con "undefined") y pega completo el contenido de
   `codigo-apps-script.gs.txt`.
4. Guarda. Luego **Implementar → Administrar implementaciones** → ícono de
   lápiz sobre la implementación de tipo "Aplicación web" → en "Versión"
   elige **Nueva versión** → Implementar.
   Si no existe ninguna implementación de tipo "Aplicación web" todavía,
   créala con **Implementar → Nueva implementación**: tipo *Aplicación
   web*, ejecutar como *Yo*, acceso *Cualquier usuario*.
   **Este paso de crear una versión nueva es obligatorio** — guardar el
   código solo no actualiza el enlace `/exec` que ya está en uso.
5. Copia la URL que termina en `/exec`. El formulario ya trae esta (real,
   verificada — la anterior nunca existió de verdad):
   `https://script.google.com/macros/s/AKfycbxcF_A6tCjTaM84fAQLKyLKeLRe1Xl2uI1aZnNjEjWmm_GSUUnuH43JNgw05bX-dETO/exec`
   Si alguna vez vuelves a crear una implementación nueva (no una "nueva
   versión" de la misma, sino otra desde cero) la URL cambia: ábreme el
   archivo `calificacion-amazonia96.html`, busca `var API_URL =` (cerca del
   final, dentro del `<script>`) y reemplázala — o dímela y la actualizo yo.
6. Abre `https://clickcontrol.co/calificacion-amazonia96.html`, llena un
   registro de prueba de principio a fin (incluida la sección de
   conformidad) y confirma tres cosas: que aparece la fila nueva en la
   pestaña **"Respuestas Web"**, que te llega el correo de aviso a
   `ari.bravob18@gmail.com`, y que llega el correo bonito a la dirección
   de correo que pusiste en la prueba.

## Qué pide el formulario

- **Sección 1 — Datos**: nombre, apartamento, correo, y una casilla opcional
  de suscripción a novedades.
- **Sección 2 — Alexa**: si se entregó y si quedó bien configurada, con un
  campo de observaciones que solo aparece si hay algún problema.
- **Sección 3 — Hub e interruptores**: lo mismo para el Hub y para las luces
  o interruptores.
- **Sección 4 — Capacitación**: 4 calificaciones por estrellas (claridad,
  dominio del técnico, atención, satisfacción general).
- **Sección 5 — Conformidad**: la declaración de conformidad, con
  observaciones si el cliente no queda 100% conforme.
- Al final, las mismas tarjetas de productos y el botón de WhatsApp que
  tiene el formulario de agendamiento, como gancho de venta.

El botón de enviar permanece deshabilitado hasta que todos los campos
obligatorios estén completos. Al enviar, si todo sale bien se reemplaza el
formulario por una pantalla de agradecimiento, sin salir de la página.

## Nota sobre el logo

El logo que lleva incrustado se recortó de una captura de pantalla que me
pasaste (buena calidad, pero no es el archivo fuente original). Si tienes a
mano el PNG original del logo (el mismo que usa `agendamiento-amazonia96.html`),
pásamelo y lo cambio por ese para que quede con la máxima nitidez.

## Personalizar

Los colores, tipografías y el resto del sistema visual están definidos como
variables CSS al inicio del `<style>` — son exactamente los mismos que usa
el resto de clickcontrol.co, así que no deberías necesitar tocarlos.
