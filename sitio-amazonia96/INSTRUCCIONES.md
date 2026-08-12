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

## Publicarlo

1. Sube `calificacion-amazonia96.html` a `public_html/` en tu cPanel, junto
   a `agendamiento-amazonia96.html`.
2. Verifica que la hoja de cálculo **"Calificaciones Amazonía 96"**, pestaña
   **"Respuestas"**, tenga estas columnas (en este orden o con estos
   encabezados exactos, que es lo que usa el Apps Script para ubicar cada
   dato):

   ```
   Nombre, Apto, Correo, Alexa Entrega, Alexa Funciona, Obs Alexa,
   Hub Funciona, Obs Hub, Switches Funciona, Obs Switches,
   Cal Claridad, Cal Dominio, Cal Atencion, Cal General,
   Conformidad, Obs Conformidad, Newsletter
   ```

3. El formulario ya apunta al Apps Script existente:
   `https://script.google.com/macros/s/AKfycbxN44YkL9dIZR2Zw3hY-QlCo25gluvmLZUrtteh2jZvg0mhw7cZfMEGshnLrOT-7g5q/exec`
   Si alguna vez vuelves a implementar (Deploy) ese Apps Script y cambia la
   URL, actualiza la constante `API_URL` al inicio del `<script>` del
   archivo HTML.
4. Abre `https://clickcontrol.co/calificacion-amazonia96.html`, llena un
   registro de prueba de principio a fin (incluida la sección de
   conformidad) y confirma que aparece la fila nueva en la hoja de cálculo
   y que te llega el correo de aviso.

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
