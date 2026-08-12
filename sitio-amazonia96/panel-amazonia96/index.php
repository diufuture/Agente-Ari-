<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
panel_requerir_sesion();
require_once __DIR__ . '/../conexion.php';

$pdo = amazonia96_conexion();

$pagina = max(1, (int)($_GET['pagina'] ?? 1));
$porPagina = 20;
$offset = ($pagina - 1) * $porPagina;

$torreFiltro = trim((string)($_GET['torre'] ?? ''));
$textoFiltro = trim((string)($_GET['q'] ?? ''));

$condiciones = [];
$parametros = [];
if ($torreFiltro !== '') {
    $condiciones[] = 'torre = :torre';
    $parametros['torre'] = $torreFiltro;
}
if ($textoFiltro !== '') {
    $condiciones[] = '(nombre_cliente LIKE :texto OR apartamento LIKE :texto OR tecnico LIKE :texto)';
    $parametros['texto'] = '%' . $textoFiltro . '%';
}
$dondeSql = $condiciones ? ('WHERE ' . implode(' AND ', $condiciones)) : '';

$sentenciaConteo = $pdo->prepare("SELECT COUNT(*) AS total FROM entregas_amazonia96 $dondeSql");
$sentenciaConteo->execute($parametros);
$total = (int)$sentenciaConteo->fetchColumn();

$sentencia = $pdo->prepare(
    "SELECT * FROM entregas_amazonia96 $dondeSql ORDER BY creado_en DESC LIMIT :limite OFFSET :offset"
);
foreach ($parametros as $clave => $valor) {
    $sentencia->bindValue(':' . $clave, $valor);
}
$sentencia->bindValue(':limite', $porPagina, PDO::PARAM_INT);
$sentencia->bindValue(':offset', $offset, PDO::PARAM_INT);
$sentencia->execute();
$registros = $sentencia->fetchAll();

$totalPaginas = max(1, (int)ceil($total / $porPagina));

function promedioCalificacion(array $registro): float
{
    $valores = [
        (int)$registro['calif_puntualidad'],
        (int)$registro['calif_atencion'],
        (int)$registro['calif_claridad'],
        (int)$registro['calif_funcionamiento'],
    ];
    return round(array_sum($valores) / count($valores), 1);
}

function conservarFiltros(array $extra = []): string
{
    $parametros = array_merge([
        'torre' => $_GET['torre'] ?? '',
        'q' => $_GET['q'] ?? '',
    ], $extra);
    $parametros = array_filter($parametros, static fn($v) => $v !== '');
    return http_build_query($parametros);
}
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel de entregas · Amazonía 96</title>
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
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  header h1 { font-size: 1.1rem; margin: 0; }
  header a { color: #fff; text-decoration: none; font-size: 0.85rem; opacity: 0.9; }
  main { max-width: 1100px; margin: 1.5rem auto; padding: 0 1rem 3rem; }
  .barra {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    align-items: center;
  }
  .barra input {
    padding: 0.5rem 0.7rem;
    border: 1px solid #d7dde1;
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .barra button, .barra a.boton {
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    border: 1px solid #0f4c5c;
    background: #0f4c5c;
    color: #fff;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: none;
  }
  .barra a.boton.secundario { background: #fff; color: #0f4c5c; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(15, 76, 92, 0.08);
  }
  th, td { padding: 0.6rem 0.7rem; text-align: left; font-size: 0.85rem; border-bottom: 1px solid #eef1f3; }
  th { background: #f0f4f5; color: #52606d; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.03em; }
  tr:last-child td { border-bottom: none; }
  .si { color: #1f7a3d; font-weight: 700; }
  .no { color: #b83b1e; font-weight: 700; }
  .paginacion { display: flex; gap: 0.5rem; margin-top: 1rem; align-items: center; font-size: 0.85rem; }
  .paginacion a { color: #0f4c5c; text-decoration: none; }
  .vacio { padding: 2rem; text-align: center; color: #52606d; background: #fff; border-radius: 10px; }
</style>
</head>
<body>
<header>
  <h1>Panel de entregas · Amazonía 96</h1>
  <nav>
    <a href="exportar-csv.php?<?= htmlspecialchars(conservarFiltros(), ENT_QUOTES) ?>">Exportar CSV</a>
    &nbsp;·&nbsp;
    <a href="logout.php">Salir</a>
  </nav>
</header>
<main>
  <form class="barra" method="get">
    <input type="text" name="torre" placeholder="Torre" value="<?= htmlspecialchars($torreFiltro, ENT_QUOTES) ?>">
    <input type="text" name="q" placeholder="Buscar cliente, apto o técnico" value="<?= htmlspecialchars($textoFiltro, ENT_QUOTES) ?>">
    <button type="submit">Filtrar</button>
    <a class="boton secundario" href="index.php">Limpiar</a>
  </form>

  <?php if (!$registros): ?>
    <div class="vacio">No hay registros que coincidan con el filtro.</div>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <th>Fecha entrega</th>
        <th>Cliente</th>
        <th>Torre/Apto</th>
        <th>Técnico</th>
        <th>Alexa</th>
        <th>Hub</th>
        <th>Calificación</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($registros as $registro): ?>
      <tr>
        <td><?= htmlspecialchars($registro['fecha_entrega'], ENT_QUOTES) ?></td>
        <td><?= htmlspecialchars($registro['nombre_cliente'], ENT_QUOTES) ?></td>
        <td><?= htmlspecialchars($registro['torre'] . ' / ' . $registro['apartamento'], ENT_QUOTES) ?></td>
        <td><?= htmlspecialchars($registro['tecnico'], ENT_QUOTES) ?></td>
        <td class="<?= $registro['alexa_configurada'] ? 'si' : 'no' ?>"><?= $registro['alexa_configurada'] ? '✓' : '✗' ?></td>
        <td class="<?= $registro['hub_configurado'] ? 'si' : 'no' ?>"><?= $registro['hub_configurado'] ? '✓' : '✗' ?></td>
        <td>★ <?= promedioCalificacion($registro) ?>/5</td>
        <td><a href="ver.php?id=<?= (int)$registro['id'] ?>">Ver</a></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <?php if ($totalPaginas > 1): ?>
  <div class="paginacion">
    <?php for ($p = 1; $p <= $totalPaginas; $p++): ?>
      <?php if ($p === $pagina): ?>
        <strong><?= $p ?></strong>
      <?php else: ?>
        <a href="index.php?<?= htmlspecialchars(conservarFiltros(['pagina' => (string)$p]), ENT_QUOTES) ?>"><?= $p ?></a>
      <?php endif; ?>
    <?php endfor; ?>
  </div>
  <?php endif; ?>
  <?php endif; ?>
</main>
</body>
</html>
