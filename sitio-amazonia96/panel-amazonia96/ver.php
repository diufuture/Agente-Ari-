<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
panel_requerir_sesion();
require_once __DIR__ . '/../conexion.php';

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
if (!$id) {
    http_response_code(400);
    exit('Registro inválido.');
}

$pdo = amazonia96_conexion();
$sentencia = $pdo->prepare('SELECT * FROM entregas_amazonia96 WHERE id = :id');
$sentencia->execute(['id' => $id]);
$registro = $sentencia->fetch();

if (!$registro) {
    http_response_code(404);
    exit('No se encontró el registro.');
}

$categorias = [
    'calif_puntualidad' => 'Puntualidad de la visita',
    'calif_atencion' => 'Atención del técnico',
    'calif_claridad' => 'Claridad de la explicación',
    'calif_funcionamiento' => 'Funcionamiento del sistema',
];
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrega #<?= (int)$registro['id'] ?> · Amazonía 96</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #f4f7f8;
    color: #1f2933;
  }
  header {
    background: #0f4c5c;
    color: #fff;
    padding: 1.1rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  header a { color: #fff; text-decoration: none; font-size: 0.85rem; }
  main { max-width: 640px; margin: 1.5rem auto; padding: 0 1rem 3rem; }
  .tarjeta {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(15, 76, 92, 0.08);
    padding: 1.5rem;
    margin-bottom: 1rem;
  }
  .tarjeta h2 { font-size: 0.95rem; color: #0f4c5c; margin: 0 0 0.75rem; }
  dl { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.4rem 0.75rem; margin: 0; font-size: 0.9rem; }
  dt { color: #52606d; }
  dd { margin: 0; }
  .si { color: #1f7a3d; font-weight: 700; }
  .no { color: #b83b1e; font-weight: 700; }
  .estrellas-vista span { color: #cfd8dc; font-size: 1.1rem; }
  .estrellas-vista span.activa { color: #e36414; }
  img.firma { max-width: 100%; border: 1px solid #d7dde1; border-radius: 8px; background: #fff; }
  .comentario { white-space: pre-wrap; }
</style>
</head>
<body>
<header>
  <span>Entrega #<?= (int)$registro['id'] ?></span>
  <a href="index.php">&larr; Volver al listado</a>
</header>
<main>
  <div class="tarjeta">
    <h2>Cliente</h2>
    <dl>
      <dt>Nombre</dt><dd><?= htmlspecialchars($registro['nombre_cliente'], ENT_QUOTES) ?></dd>
      <dt>Torre / Apto</dt><dd><?= htmlspecialchars($registro['torre'] . ' / ' . $registro['apartamento'], ENT_QUOTES) ?></dd>
      <dt>Teléfono</dt><dd><?= htmlspecialchars($registro['telefono'], ENT_QUOTES) ?></dd>
      <dt>Correo</dt><dd><?= htmlspecialchars((string)($registro['correo'] ?? '—'), ENT_QUOTES) ?></dd>
    </dl>
  </div>

  <div class="tarjeta">
    <h2>Entrega</h2>
    <dl>
      <dt>Fecha</dt><dd><?= htmlspecialchars($registro['fecha_entrega'], ENT_QUOTES) ?></dd>
      <dt>Técnico</dt><dd><?= htmlspecialchars($registro['tecnico'], ENT_QUOTES) ?></dd>
      <dt>Alexa entregada</dt><dd class="<?= $registro['alexa_entregada'] ? 'si' : 'no' ?>"><?= $registro['alexa_entregada'] ? 'Sí' : 'No' ?></dd>
      <dt>Alexa configurada</dt><dd class="<?= $registro['alexa_configurada'] ? 'si' : 'no' ?>"><?= $registro['alexa_configurada'] ? 'Sí' : 'No' ?></dd>
      <dt>Hub entregado</dt><dd class="<?= $registro['hub_entregado'] ? 'si' : 'no' ?>"><?= $registro['hub_entregado'] ? 'Sí' : 'No' ?></dd>
      <dt>Hub configurado</dt><dd class="<?= $registro['hub_configurado'] ? 'si' : 'no' ?>"><?= $registro['hub_configurado'] ? 'Sí' : 'No' ?></dd>
    </dl>
  </div>

  <div class="tarjeta">
    <h2>Calificación</h2>
    <dl>
      <?php foreach ($categorias as $campo => $etiqueta): $valor = (int)$registro[$campo]; ?>
        <dt><?= htmlspecialchars($etiqueta, ENT_QUOTES) ?></dt>
        <dd class="estrellas-vista">
          <?php for ($i = 1; $i <= 5; $i++): ?>
            <span class="<?= $i <= $valor ? 'activa' : '' ?>">★</span>
          <?php endfor; ?>
          (<?= $valor ?>/5)
        </dd>
      <?php endforeach; ?>
    </dl>
    <?php if (!empty($registro['comentarios'])): ?>
      <h2 style="margin-top:1rem">Comentarios</h2>
      <p class="comentario"><?= htmlspecialchars($registro['comentarios'], ENT_QUOTES) ?></p>
    <?php endif; ?>
  </div>

  <div class="tarjeta">
    <h2>Firma del cliente</h2>
    <img class="firma" src="ver-firma.php?id=<?= (int)$registro['id'] ?>" alt="Firma del cliente">
  </div>

  <div class="tarjeta">
    <h2>Registro</h2>
    <dl>
      <dt>Guardado el</dt><dd><?= htmlspecialchars($registro['creado_en'], ENT_QUOTES) ?></dd>
      <dt>IP</dt><dd><?= htmlspecialchars((string)($registro['ip_registro'] ?? '—'), ENT_QUOTES) ?></dd>
    </dl>
  </div>
</main>
</body>
</html>
