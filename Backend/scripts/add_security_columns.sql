-- =====================================================================
-- add_security_columns.sql
-- =====================================================================
-- Script de Alteración de Schema — Columnas de Seguridad
--
-- PROPÓSITO:
--   Agrega las columnas necesarias para el sistema de recuperación
--   de credenciales por preguntas de seguridad a la tabla `usuarios`.
--
-- INSTRUCCIONES:
--   Ejecuta este script UNA SOLA VEZ en tu base de datos MySQL/MariaDB.
--   Puedes usar phpMyAdmin, MySQL Workbench, HeidiSQL, o la terminal:
--   > mysql -u root -p ferreteria < scripts/add_security_columns.sql
--   (reemplaza "ferreteria" por el nombre real de tu base de datos)
--
-- COLUMNAS QUE SE AGREGAN:
--   - pregunta_seguridad: El texto de la pregunta elegida por el usuario
--   - respuesta_seguridad: El hash bcrypt de la respuesta (nunca en texto plano)
--
-- NOTA: Se permite NULL porque los usuarios existentes aún no la han configurado.
-- =====================================================================

-- Selecciona la base de datos correcta (ajusta el nombre si es diferente)
USE ferreteria;

-- Agrega la columna para guardar el texto de la pregunta de seguridad
ALTER TABLE usuarios 
  ADD COLUMN IF NOT EXISTS pregunta_seguridad VARCHAR(255) NULL 
  COMMENT 'Pregunta de seguridad elegida por el usuario para recuperar su acceso';

-- Agrega la columna para guardar el HASH de la respuesta (nunca texto plano)
ALTER TABLE usuarios 
  ADD COLUMN IF NOT EXISTS respuesta_seguridad VARCHAR(255) NULL 
  COMMENT 'Hash bcrypt de la respuesta normalizada (toLowerCase + trim)';

-- Verificación: muestra el resultado del cambio
DESCRIBE usuarios;

SELECT 'Script ejecutado correctamente. Columnas de seguridad agregadas.' AS resultado;
