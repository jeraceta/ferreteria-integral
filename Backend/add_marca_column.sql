-- add_marca_column.sql
-- Añade la columna 'marca' a la tabla de productos.

USE ferreteria;
ALTER TABLE productos ADD COLUMN marca VARCHAR(100) NULL AFTER nombre;
