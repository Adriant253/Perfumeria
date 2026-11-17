-- ============================================================================
--  recuperacion_contrasena.sql
--  Enlaces de "olvidé mi contraseña" de la tienda Lumière Perfumería.
--
--  Cómo funciona (ver api/sesion.php):
--    1. El usuario escribe su correo en pages/login.html y pide el enlace.
--    2. La API crea un token al azar de 64 caracteres, guarda SOLO su hash
--       sha256 (nunca el token en claro), con 30 minutos de vigencia.
--    3. Con el enlace (?token=...) el usuario entra a pages/recuperar.html y
--       escribe su contraseña nueva.
--    4. Al guardarla, la fila queda marcada con `usado_en` (un solo uso) y se
--       borran las sesiones abiertas de esa cuenta.
--
--  Ejecutar en phpMyAdmin (pestaña SQL) o desde la consola:
--    C:\xampp\mysql\bin\mysql.exe -u root perfumeria_db < recuperacion_contrasena.sql
-- ============================================================================

USE perfumeria_db;

CREATE TABLE IF NOT EXISTS `recuperacion_contrasena` (
  `id`         int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expira_en`  datetime NOT NULL,
  `usado_en`   timestamp NULL DEFAULT NULL,
  `creado_en`  timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_recuperacion_usuario` (`usuario_id`),
  KEY `idx_recuperacion_expira` (`expira_en`),
  CONSTRAINT `fk_recuperacion_usuario` FOREIGN KEY (`usuario_id`)
      REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
