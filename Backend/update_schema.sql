-- update_schema.sql

USE ferreteria;

-- 1. TABLA DE DEPOSITOS
CREATE TABLE IF NOT EXISTS depositos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT
);

-- 2. DATOS INICIALES PARA DEPOSITOS
INSERT INTO depositos (id, nombre, descripcion) VALUES (1, 'Principal', 'Depósito principal de mercancía disponible para la venta.')
ON DUPLICATE KEY UPDATE nombre = nombre;
INSERT INTO depositos (id, nombre, descripcion) VALUES (2, 'Dañado', 'Depósito para productos dañados o defectuosos.')
ON DUPLICATE KEY UPDATE nombre = nombre;


-- 3. TABLA DE STOCK POR DEPOSITO
-- Gestiona el stock de cada producto en múltiples depósitos.
CREATE TABLE IF NOT EXISTS stock_depositos (
    id_producto INT NOT NULL,
    id_deposito INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id_producto, id_deposito),
    FOREIGN KEY (id_producto) REFERENCES productos(id),
    FOREIGN KEY (id_deposito) REFERENCES depositos(id)
);

-- 4. TABLA DE MOTIVOS DE DEVOLUCIÓN
CREATE TABLE IF NOT EXISTS motivos_devolucion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    motivo VARCHAR(255) NOT NULL,
    descripcion TEXT
);

-- 5. DATOS INICIALES PARA MOTIVOS DE DEVOLUCIÓN
INSERT INTO motivos_devolucion (motivo) VALUES 
('Producto equivocado'),
('Defecto de fábrica'),
('Dañado en transporte'),
('No cumple expectativas'),
('Otro');

-- 6. TABLA DE DEVOLUCIONES (Cabecera de la devolución)
CREATE TABLE IF NOT EXISTS devoluciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_venta INT NOT NULL,
    id_cliente INT NOT NULL,
    id_motivo INT NOT NULL,
    comentario TEXT,
    fecha_devolucion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_venta) REFERENCES ventas(id),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id),
    FOREIGN KEY (id_motivo) REFERENCES motivos_devolucion(id)
);

-- 7. TABLA DETALLE DEVOLUCION (Líneas de la devolución)
CREATE TABLE IF NOT EXISTS detalle_devoluciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_devolucion INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (id_devolucion) REFERENCES devoluciones(id),
    FOREIGN KEY (id_producto) REFERENCES productos(id)
);

-- 8. MODIFICAR LA TABLA VENTAS PARA INCLUIR ESTADO Y DATOS DE DEVOLUCIÓN
ALTER TABLE ventas
ADD COLUMN estado ENUM('completada', 'devuelta', 'anulada') NOT NULL DEFAULT 'completada',
ADD COLUMN id_motivo_devolucion INT NULL,
ADD COLUMN comentario_devolucion TEXT NULL,
ADD FOREIGN KEY (id_motivo_devolucion) REFERENCES motivos_devolucion(id);

-- 9. MODIFICAR LA TABLA MOVIMIENTOS_INVENTARIO PARA INCLUIR 'DEVOLUCION'
ALTER TABLE movimientos_inventario MODIFY COLUMN tipo_movimiento 
ENUM('COMPRA', 'VENTA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'DEVOLUCION') NOT NULL;

-- 10. TRANSFERIR STOCK INICIAL DE LA TABLA 'PRODUCTOS' A 'STOCK_DEPOSITOS'
-- Esto solo se ejecutará si la tabla stock_depositos está vacía para evitar duplicados.
INSERT INTO stock_depositos (id_producto, id_deposito, cantidad)
SELECT id, 1, stock -- Asumimos que todo el stock inicial va al depósito 'Principal' (ID 1)
FROM productos p
WHERE NOT EXISTS (
    SELECT 1 FROM stock_depositos sd WHERE sd.id_producto = p.id
);

-- 11. ELIMINAR LA COLUMNA 'STOCK' DE LA TABLA 'PRODUCTOS'
-- Se comenta para no ser destructivo, pero es la práctica recomendada.
-- ALTER TABLE productos DROP COLUMN stock;

-- Mensaje de éxito
-- SELECT 'Esquema de base de datos actualizado correctamente.' AS resultado;
