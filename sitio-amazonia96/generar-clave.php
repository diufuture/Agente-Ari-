<?php
declare(strict_types=1);

// Ejecuta este archivo UNA sola vez desde el navegador para generar el hash
// de tu clave del panel, cópialo en config.php como 'panel_password_hash',
// y luego BORRA este archivo del servidor: nadie más debe poder generarte
// una clave nueva.

$hash = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['clave'])) {
    $hash = password_hash((string)$_POST['clave'], PASSWORD_DEFAULT);
}
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Generar clave del panel</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 3rem auto; padding: 0 1rem; }
  input { padding: 0.5rem; width: 100%; box-sizing: border-box; margin-bottom: 0.75rem; }
  button { padding: 0.5rem 1rem; }
  pre { background: #f4f7f8; padding: 1rem; border-radius: 8px; word-break: break-all; white-space: pre-wrap; }
  .aviso { color: #9c2c1e; font-weight: 700; }
</style>
</head>
<body>
<h1>Generar clave del panel de entregas</h1>
<form method="post">
  <label for="clave">Escribe la clave que quieres usar para entrar al panel</label>
  <input type="password" id="clave" name="clave" required>
  <button type="submit">Generar</button>
</form>
<?php if ($hash !== ''): ?>
  <p>Copia este valor completo en <code>config.php</code>, en <code>panel_password_hash</code>:</p>
  <pre><?= htmlspecialchars($hash, ENT_QUOTES) ?></pre>
<?php endif; ?>
<p class="aviso">Importante: borra este archivo (generar-clave.php) del servidor después de usarlo.</p>
</body>
</html>
