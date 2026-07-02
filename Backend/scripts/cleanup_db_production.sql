-- ====================================================================
-- SCRIPT DE LIMPIEZA Y PUESTA EN PRODUCCIÓN - FERRETERÍA
-- ====================================================================
-- Este script vacía las tablas transaccionales y catálogos, y elimina
-- todos los usuarios de prueba excepto el Administrador con ID 6.

USE ferreteria;

-- PASO 1: Desactivar restricciones de llaves foráneas
SET FOREIGN_KEY_CHECKS = 0;

-- PASO 2: Vaciar tablas transaccionales e históricos
TRUNCATE TABLE detalle_ventas;
TRUNCATE TABLE detalle_ventas;
TRUNCATE TABLE venta_pagos;
TRUNCATE TABLE ventas;

TRUNCATE TABLE detalle_compras;
TRUNCATE TABLE detalle_compra;
TRUNCATE TABLE compras;

TRUNCATE TABLE detalle_devoluciones;
TRUNCATE TABLE devoluciones;
TRUNCATE TABLE motivos_devolucion;

TRUNCATE TABLE detalle_presupuestos;
TRUNCATE TABLE presupuestos;

TRUNCATE TABLE cierres_diarios;

TRUNCATE TABLE ajustes_stock_detalle;
TRUNCATE TABLE ajustes_stock;
TRUNCATE TABLE movimientos_inventario;

TRUNCATE TABLE cxc_abonos;
TRUNCATE TABLE cxc_cuentas;

TRUNCATE TABLE cxp_abonos;
TRUNCATE TABLE cxp_cuentas;

-- PASO 3: Vaciar catálogos de productos, almacenes, proveedores y clientes
TRUNCATE TABLE stock_depositos;
TRUNCATE TABLE productos;
TRUNCATE TABLE proveedores;
TRUNCATE TABLE clientes;

-- PASO 4: Eliminar usuarios de prueba y conservar sólo al Administrador con ID 6
-- NOTA: Se valida que exista el ID 6 para no dejar la tabla vacía
DELETE FROM usuarios WHERE id != 6;

-- Reiniciar el auto-increment de usuarios para que los nuevos inicien a partir de 7
ALTER TABLE usuarios AUTO_INCREMENT = 7;

-- PASO 5: Reactivar restricciones de llaves foráneas
SET FOREIGN_KEY_CHECKS = 1;

-- Mensaje de éxito
SELECT 'Limpieza de base de datos realizada con éxito. Administrador con ID 6 conservado.' AS Resultado;
