<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

if (!empty($_SESSION['amazonia96_autenticado'])) {
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $intentos = (int)($_SESSION['intentos'] ?? 0);
    $ultimoIntento = (int)($_SESSION['ultimo_intento'] ?? 0);

    if ($intentos >= 8 && (time() - $ultimoIntento) < 600) {
        $error = 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.';
    } else {
        $clave = (string)($_POST['clave'] ?? '');
        $config = panel_config();
        if ($clave !== '' && password_verify($clave, (string)($config['panel_password_hash'] ?? ''))) {
            session_regenerate_id(true);
            $_SESSION['amazonia96_autenticado'] = true;
            unset($_SESSION['intentos'], $_SESSION['ultimo_intento']);
            header('Location: index.php');
            exit;
        }
        $_SESSION['intentos'] = $intentos + 1;
        $_SESSION['ultimo_intento'] = time();
        $error = 'Clave incorrecta.';
    }
}
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Panel Amazonía 96</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #f4f7f8;
    color: #1f2933;
  }
  form {
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(15, 76, 92, 0.12);
    padding: 2rem;
    width: 100%;
    max-width: 320px;
  }
  h1 { font-size: 1.15rem; color: #0f4c5c; margin: 0 0 1.25rem; }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: #52606d; }
  input {
    width: 100%;
    padding: 0.6rem 0.7rem;
    border: 1px solid #d7dde1;
    border-radius: 8px;
    font-size: 1rem;
    margin-bottom: 1rem;
  }
  button {
    width: 100%;
    background: #0f4c5c;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.7rem;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
  }
  .error { background: #fdecea; color: #9c2c1e; border: 1px solid #f4c3bd; border-radius: 8px; padding: 0.6rem 0.75rem; margin-bottom: 1rem; font-size: 0.85rem; }
</style>
</head>
<body>
<form method="post">
  <h1>Panel de entregas · Amazonía 96</h1>
  <?php if ($error !== ''): ?>
    <div class="error"><?= htmlspecialchars($error, ENT_QUOTES) ?></div>
  <?php endif; ?>
  <label for="clave">Clave</label>
  <input type="password" id="clave" name="clave" required autofocus>
  <button type="submit">Entrar</button>
</form>
</body>
</html>
