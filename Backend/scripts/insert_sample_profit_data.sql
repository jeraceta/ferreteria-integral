-- Script para insertar datos de prueba para el reporte de Ganancias por Categoría
-- Asegúrate de que la base de datos 'ferreteria' esté seleccionada (USE ferreteria;)

-- Insertar una venta de ejemplo (si no hay ninguna o se quiere una nueva)
-- Asumiendo que el 'Cliente Prueba Principal' tiene id=1 y hay un usuario con id=1
INSERT INTO ventas (id_cliente, numero_factura, total_neto, total_bruto, metodo_pago)
VALUES (1, CONCAT('FACT-PROFIT-', UNIX_TIMESTAMP()), 10.00, 11.50, 'Efectivo');

SET @last_venta_id = LAST_INSERT_ID();

-- Insertar detalle de venta para el producto 'Clavos de 2 Pulgadas' (id=1, categoría=1)
-- Asumiendo que el producto 'Clavos de 2 Pulgadas' tiene id=1
-- precio_venta = 2.50, precio_costo = 1.50 (de setup_database.sql)
-- Cantidad vendida: 4 unidades
INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal)
VALUES (@last_venta_id, 1, 4, 2.50, 10.00);

-- Puedes agregar más ventas y productos/categorías si lo deseas para tener más datos en el gráfico.

-- Ejemplo adicional para otra categoría si existiera (ej: id_categoria = 2 'Materiales de Construcción', producto id=2 'Cemento Portland')
-- INSERT INTO ventas (id_cliente, numero_factura, total_neto, total_bruto, metodo_pago)
-- VALUES (1, CONCAT('FACT-PROFIT-2-', UNIX_TIMESTAMP()), 70.00, 80.50, 'Tarjeta');
-- SET @last_venta_id_2 = LAST_INSERT_ID();
-- INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal)
-- VALUES (@last_venta_id_2, 2, 2, 35.00, 70.00);
