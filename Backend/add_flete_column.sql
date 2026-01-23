-- add_flete_column.sql
USE ferreteria;
ALTER TABLE ventas ADD COLUMN monto_flete DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
