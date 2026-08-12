# Constancia de entrega y calificación · Amazonía 96

Reemplaza el Google Forms del acta de entrega por un formulario propio en tu
sitio, que guarda cada registro (datos del cliente, ítems entregados,
calificación por estrellas y firma) en una base de datos MySQL de tu cPanel,
y te deja un panel privado para consultarlos.

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| `acta-entrega-amazonia96.html` | El formulario público que llena el cliente. |
| `guardar-acta-amazonia96.php` | Recibe el formulario, lo valida y lo guarda. |
| `gracias-amazonia96.html` | Página de agradecimiento tras enviar. |
| `crear-tabla-amazonia96.sql` | Crea la tabla en tu base de datos (una sola vez). |
| `config.example.php` | Plantilla de configuración (base de datos, clave del panel, correo de aviso). |
| `conexion.php` | Conexión a la base de datos, usada por los demás archivos. |
| `generar-clave.php` | Genera el hash de la clave del panel (bórralo después de usarlo). |
| `firmas/` | Carpeta donde se guardan las firmas (no accesible por internet). |
| `panel-amazonia96/` | Panel privado para ver, filtrar y exportar los registros. |

## Pasos para publicarlo en cPanel

### 1. Crear la base de datos

1. En cPanel, entra a **Bases de datos MySQL®**.
2. Crea una base de datos, por ejemplo `amazonia96` (quedará con el prefijo de
   tu cuenta, ej. `clickcon_amazonia96`).
3. Crea un usuario de MySQL con una contraseña segura, y **agrégalo a la base
   de datos** con todos los privilegios.
4. Anota el host (casi siempre `localhost`), el nombre de la base, el usuario
   y la contraseña: los vas a necesitar en el paso 3.

### 2. Crear la tabla

1. Abre **phpMyAdmin** desde cPanel y entra a la base de datos que creaste.
2. Ve a la pestaña **SQL**, pega el contenido de `crear-tabla-amazonia96.sql`
   y ejecútalo. Esto crea la tabla `entregas_amazonia96` donde queda cada
   registro.

### 3. Subir los archivos

1. En **Administrador de archivos** (o por FTP), sube **todo el contenido**
   de esta carpeta a donde quieras que viva, por ejemplo
   `public_html/amazonia96/`.
2. Duplica `config.example.php`, renombra la copia a `config.php` (misma
   carpeta) y rellena `db_host`, `db_name`, `db_user`, `db_pass` con los
   datos del paso 1, y `correo_aviso` con el correo donde quieres recibir el
   aviso de cada entrega.

### 4. Generar la clave del panel

1. Abre en el navegador `https://clickcontrol.co/amazonia96/generar-clave.php`
   (ajusta la ruta si subiste los archivos a otra carpeta).
2. Escribe la clave que quieras usar para entrar al panel y dale **Generar**.
3. Copia el texto que empieza por `$2y$...` y pégalo en `config.php`, en
   `panel_password_hash` (reemplazando el valor de ejemplo).
4. **Borra `generar-clave.php` del servidor.** Ya cumplió su función; si se
   queda, cualquiera podría generarse una clave nueva.

### 5. Probar

1. Abre `https://clickcontrol.co/amazonia96/acta-entrega-amazonia96.html`,
   llena el formulario de prueba (incluida la firma) y envíalo.
2. Deberías caer en la página de agradecimiento y recibir el correo de aviso.
3. Abre `https://clickcontrol.co/amazonia96/panel-amazonia96/login.php`,
   entra con la clave que definiste, y confirma que el registro de prueba
   aparece con su firma.

## Cómo se usa en el día a día

Después de la visita de entrega, le compartes al cliente el enlace del
formulario (`acta-entrega-amazonia96.html`) por WhatsApp o correo, para que
lo llene desde el celular ahí mismo. Tú consultas todo lo entregado, con
firma incluida, desde `panel-amazonia96/`, protegido con tu clave.

## Personalizar el diseño

Los colores viven como variables al inicio del `<style>` de
`acta-entrega-amazonia96.html` (`--color-primario`, `--color-acento`, etc.):
cámbialos por los de tu marca. Si quieres un logo en vez del texto "Clic
Control" del encabezado, reemplaza ese bloque por una etiqueta `<img>`
apuntando al logo que subas junto a los demás archivos.

## Notas de seguridad

- `config.php` (con tus contraseñas reales) nunca se debe subir a un
  repositorio público; el `.htaccess` incluido además bloquea que alguien lo
  abra directo desde el navegador.
- Las firmas se guardan en `firmas/`, que el `.htaccess` de esa carpeta
  bloquea por completo: solo se ven a través del panel, con tu clave.
- El panel se frena solo 10 minutos después de 8 intentos de clave fallidos
  seguidos.
- El formulario tiene un campo oculto "trampa para bots": si algo lo llena
  (un humano nunca lo ve), el envío se descarta en silencio sin guardar nada.
