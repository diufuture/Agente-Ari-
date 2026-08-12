<?php
declare(strict_types=1);

function amazonia96_config(): array
{
    $archivoConfig = __DIR__ . '/config.php';
    if (!file_exists($archivoConfig)) {
        http_response_code(500);
        die('Falta config.php. Copia config.example.php como config.php y completa tus datos (ver INSTRUCCIONES.md).');
    }
    return require $archivoConfig;
}

function amazonia96_conexion(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $config = amazonia96_config();
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']);
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}
