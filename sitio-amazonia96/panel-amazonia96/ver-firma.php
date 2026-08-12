<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
panel_requerir_sesion();
require_once __DIR__ . '/../conexion.php';

$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
if (!$id) {
    http_response_code(400);
    exit;
}

$pdo = amazonia96_conexion();
$sentencia = $pdo->prepare('SELECT firma_ruta FROM entregas_amazonia96 WHERE id = :id');
$sentencia->execute(['id' => $id]);
$fila = $sentencia->fetch();
if (!$fila) {
    http_response_code(404);
    exit;
}

$carpetaFirmas = realpath(__DIR__ . '/../firmas');
$rutaReal = realpath(__DIR__ . '/../' . $fila['firma_ruta']);
if ($carpetaFirmas === false || $rutaReal === false || strncmp($rutaReal, $carpetaFirmas, strlen($carpetaFirmas)) !== 0) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/png');
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
readfile($rutaReal);
