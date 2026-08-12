-- Ejecutar una sola vez en phpMyAdmin (pestaña SQL) sobre la base de datos
-- que crees para este proyecto. Ver INSTRUCCIONES.md para el paso a paso.

CREATE TABLE IF NOT EXISTS entregas_amazonia96 (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nombre_cliente VARCHAR(150) NOT NULL,
  torre VARCHAR(20) NOT NULL,
  apartamento VARCHAR(20) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  correo VARCHAR(150) NULL,
  fecha_entrega DATE NOT NULL,
  tecnico VARCHAR(150) NOT NULL,
  alexa_entregada TINYINT(1) NOT NULL DEFAULT 0,
  alexa_configurada TINYINT(1) NOT NULL DEFAULT 0,
  hub_entregado TINYINT(1) NOT NULL DEFAULT 0,
  hub_configurado TINYINT(1) NOT NULL DEFAULT 0,
  calif_puntualidad TINYINT UNSIGNED NOT NULL,
  calif_atencion TINYINT UNSIGNED NOT NULL,
  calif_claridad TINYINT UNSIGNED NOT NULL,
  calif_funcionamiento TINYINT UNSIGNED NOT NULL,
  comentarios TEXT NULL,
  firma_ruta VARCHAR(255) NOT NULL,
  ip_registro VARCHAR(45) NULL,
  INDEX idx_fecha_entrega (fecha_entrega),
  INDEX idx_torre_apto (torre, apartamento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
