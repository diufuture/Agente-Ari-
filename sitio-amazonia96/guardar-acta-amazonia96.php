<?php
declare(strict_types=1);

require __DIR__ . '/conexion.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: acta-entrega-amazonia96.html');
    exit;
}

function volverConError(string $mensaje): void
{
    $url = 'acta-entrega-amazonia96.html?error=' . rawurlencode($mensaje);
    header('Location: ' . $url, true, 303);
    exit;
}

// Honeypot: si un bot llenó este campo oculto, fingimos éxito sin guardar nada.
if (!empty($_POST['sitio_web'] ?? '')) {
    header('Location: gracias-amazonia96.html', true, 303);
    exit;
}

$texto = static function (string $campo, int $max = 150): string {
    return trim(mb_substr((string)($_POST[$campo] ?? ''), 0, $max));
};

$nombreCliente = $texto('nombre_cliente', 150);
$torre = $texto('torre', 20);
$apartamento = $texto('apartamento', 20);
$telefono = $texto('telefono', 30);
$correo = $texto('correo', 150);
$fechaEntrega = $texto('fecha_entrega', 10);
$tecnico = $texto('tecnico', 150);
$comentarios = trim(mb_substr((string)($_POST['comentarios'] ?? ''), 0, 2000));

if ($nombreCliente === '' || $torre === '' || $apartamento === '' || $telefono === '' || $fechaEntrega === '' || $tecnico === '') {
    volverConError('Falta completar campos obligatorios.');
}

if ($correo !== '' && !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
    volverConError('El correo no es válido.');
}

$fecha = DateTime::createFromFormat('Y-m-d', $fechaEntrega);
if (!$fecha || $fecha->format('Y-m-d') !== $fechaEntrega) {
    volverConError('La fecha de entrega no es válida.');
}

$alexaEntregada = isset($_POST['alexa_entregada']) ? 1 : 0;
$alexaConfigurada = isset($_POST['alexa_configurada']) ? 1 : 0;
$hubEntregado = isset($_POST['hub_entregado']) ? 1 : 0;
$hubConfigurado = isset($_POST['hub_configurado']) ? 1 : 0;

$calificaciones = [];
foreach (['calif_puntualidad', 'calif_atencion', 'calif_claridad', 'calif_funcionamiento'] as $campo) {
    $valor = filter_var($_POST[$campo] ?? '', FILTER_VALIDATE_INT);
    if ($valor === false || $valor < 1 || $valor > 5) {
        volverConError('Falta calificar alguna de las categorías (1 a 5 estrellas).');
    }
    $calificaciones[$campo] = $valor;
}

$firmaDatos = (string)($_POST['firma_datos'] ?? '');
if (!preg_match('/^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/', $firmaDatos, $coincidencia)) {
    volverConError('Falta la firma del cliente.');
}

$firmaBinaria = base64_decode($coincidencia[1], true);
if ($firmaBinaria === false || strlen($firmaBinaria) === 0 || strlen($firmaBinaria) > 2 * 1024 * 1024) {
    volverConError('La firma no se pudo procesar. Intenta firmar de nuevo.');
}

$info = @getimagesizefromstring($firmaBinaria);
if ($info === false || $info[2] !== IMAGETYPE_PNG) {
    volverConError('La firma no tiene un formato válido.');
}

$carpetaFirmas = __DIR__ . '/firmas';
if (!is_dir($carpetaFirmas) && !mkdir($carpetaFirmas, 0755, true) && !is_dir($carpetaFirmas)) {
    volverConError('No se pudo guardar la firma. Intenta de nuevo.');
}
$nombreArchivo = bin2hex(random_bytes(16)) . '.png';
$rutaCompleta = $carpetaFirmas . '/' . $nombreArchivo;
if (file_put_contents($rutaCompleta, $firmaBinaria) === false) {
    volverConError('No se pudo guardar la firma. Intenta de nuevo.');
}

try {
    $pdo = amazonia96_conexion();
    $sentencia = $pdo->prepare(
        'INSERT INTO entregas_amazonia96
            (nombre_cliente, torre, apartamento, telefono, correo, fecha_entrega, tecnico,
             alexa_entregada, alexa_configurada, hub_entregado, hub_configurado,
             calif_puntualidad, calif_atencion, calif_claridad, calif_funcionamiento,
             comentarios, firma_ruta, ip_registro)
         VALUES
            (:nombre_cliente, :torre, :apartamento, :telefono, :correo, :fecha_entrega, :tecnico,
             :alexa_entregada, :alexa_configurada, :hub_entregado, :hub_configurado,
             :calif_puntualidad, :calif_atencion, :calif_claridad, :calif_funcionamiento,
             :comentarios, :firma_ruta, :ip_registro)'
    );
    $sentencia->execute([
        'nombre_cliente' => $nombreCliente,
        'torre' => $torre,
        'apartamento' => $apartamento,
        'telefono' => $telefono,
        'correo' => $correo !== '' ? $correo : null,
        'fecha_entrega' => $fechaEntrega,
        'tecnico' => $tecnico,
        'alexa_entregada' => $alexaEntregada,
        'alexa_configurada' => $alexaConfigurada,
        'hub_entregado' => $hubEntregado,
        'hub_configurado' => $hubConfigurado,
        'calif_puntualidad' => $calificaciones['calif_puntualidad'],
        'calif_atencion' => $calificaciones['calif_atencion'],
        'calif_claridad' => $calificaciones['calif_claridad'],
        'calif_funcionamiento' => $calificaciones['calif_funcionamiento'],
        'comentarios' => $comentarios !== '' ? $comentarios : null,
        'firma_ruta' => 'firmas/' . $nombreArchivo,
        'ip_registro' => $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
} catch (Throwable $e) {
    @unlink($rutaCompleta);
    error_log('Amazonia96 - error guardando entrega: ' . $e->getMessage());
    volverConError('Ocurrió un error guardando el registro. Intenta de nuevo.');
}

$config = amazonia96_config();
$correoAviso = $config['correo_aviso'] ?? null;
if ($correoAviso) {
    $promedio = round(array_sum($calificaciones) / count($calificaciones), 1);
    $asunto = "Nueva entrega registrada - Amazonia 96 - Torre $torre Apto $apartamento";
    $cuerpo = "Se registró una nueva entrega y calificación.\n\n"
        . "Cliente: $nombreCliente\n"
        . "Torre: $torre - Apartamento: $apartamento\n"
        . "Teléfono: $telefono\n"
        . ($correo !== '' ? "Correo: $correo\n" : '')
        . "Fecha de entrega: $fechaEntrega\n"
        . "Técnico: $tecnico\n"
        . 'Alexa entregada: ' . ($alexaEntregada ? 'Sí' : 'No') . "\n"
        . 'Alexa configurada: ' . ($alexaConfigurada ? 'Sí' : 'No') . "\n"
        . 'Hub entregado: ' . ($hubEntregado ? 'Sí' : 'No') . "\n"
        . 'Hub configurado: ' . ($hubConfigurado ? 'Sí' : 'No') . "\n"
        . "Calificación promedio: $promedio / 5\n"
        . ($comentarios !== '' ? "Comentarios: $comentarios\n" : '')
        . "\nEl detalle completo, con la firma, está en el panel de registros.\n";
    $cabeceras = "From: no-responder@clickcontrol.co\r\nContent-Type: text/plain; charset=UTF-8";
    @mail($correoAviso, $asunto, $cuerpo, $cabeceras);
}

header('Location: gracias-amazonia96.html', true, 303);
exit;
