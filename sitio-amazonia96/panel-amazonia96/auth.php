<?php
declare(strict_types=1);

session_start();

function panel_config(): array
{
    static $config = null;
    if ($config === null) {
        require_once __DIR__ . '/../conexion.php';
        $config = amazonia96_config();
    }
    return $config;
}

function panel_requerir_sesion(): void
{
    if (empty($_SESSION['amazonia96_autenticado'])) {
        header('Location: login.php');
        exit;
    }
}
