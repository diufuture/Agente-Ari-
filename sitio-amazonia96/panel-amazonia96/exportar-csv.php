<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
panel_requerir_sesion();
require_once __DIR__ . '/../conexion.php';

$pdo = amazonia96_conexion();

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

$sentencia = $pdo->prepare("SELECT * FROM entregas_amazonia96 $dondeSql ORDER BY creado_en DESC");
$sentencia->execute($parametros);
$registros = $sentencia->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="entregas-amazonia96.csv"');

$salida = fopen('php://output', 'w');
fputs($salida, "\xEF\xBB\xBF"); // BOM para que Excel abra bien los acentos
fputcsv($salida, [
    'ID', 'Guardado el', 'Cliente', 'Torre', 'Apartamento', 'Teléfono', 'Correo',
    'Fecha entrega', 'Técnico',
    'Alexa entregada', 'Alexa configurada', 'Hub entregado', 'Hub configurado',
    'Puntualidad', 'Atención', 'Claridad', 'Funcionamiento', 'Promedio',
    'Comentarios', 'IP',
]);

foreach ($registros as $registro) {
    $promedio = round((
        (int)$registro['calif_puntualidad'] +
        (int)$registro['calif_atencion'] +
        (int)$registro['calif_claridad'] +
        (int)$registro['calif_funcionamiento']
    ) / 4, 1);

    fputcsv($salida, [
        $registro['id'],
        $registro['creado_en'],
        $registro['nombre_cliente'],
        $registro['torre'],
        $registro['apartamento'],
        $registro['telefono'],
        $registro['correo'],
        $registro['fecha_entrega'],
        $registro['tecnico'],
        $registro['alexa_entregada'] ? 'Sí' : 'No',
        $registro['alexa_configurada'] ? 'Sí' : 'No',
        $registro['hub_entregado'] ? 'Sí' : 'No',
        $registro['hub_configurado'] ? 'Sí' : 'No',
        $registro['calif_puntualidad'],
        $registro['calif_atencion'],
        $registro['calif_claridad'],
        $registro['calif_funcionamiento'],
        $promedio,
        $registro['comentarios'],
        $registro['ip_registro'],
    ]);
}

fclose($salida);
exit;
