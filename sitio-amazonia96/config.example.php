<?php
// 1. Copia este archivo y renombra la copia a "config.php" (en la misma carpeta).
// 2. Rellena los datos reales de tu base de datos de cPanel.
// 3. Genera la clave del panel con generar-clave.php (ver INSTRUCCIONES.md)
//    y pega aquí el resultado en 'panel_password_hash'.
// NUNCA subas config.php (con datos reales) a un repositorio público.

return [
    // cPanel > Bases de datos MySQL. El usuario y la base suelen llevar el
    // prefijo de tu cuenta, ej: "clickcon_amazonia96".
    'db_host' => 'localhost',
    'db_name' => 'clickcon_amazonia96',
    'db_user' => 'clickcon_amazonia96',
    'db_pass' => 'CAMBIA_ESTA_CLAVE',

    // Hash generado con generar-clave.php, para entrar al panel de registros.
    'panel_password_hash' => '$2y$10$REEMPLAZA_CON_EL_HASH_GENERADO',

    // A dónde se manda el aviso por correo cada vez que alguien registra una entrega.
    'correo_aviso' => 'gerencia@clickcontrol.co',
];
