// --- Controlador de Ventas ---
// Maneja la lógica de negocio para registrar ventas y consultas relacionadas.

const pool = require("../db"); // Corregido: Ruta relativa a '../db'

/**
 * @description Procesa una nueva venta. Es una transacción: si algo falla,
 * se revierte todo para no corromper los datos.
 * @type {import('express').RequestHandler}
 */
const procesarVenta = async (req, res, next) => {
  let connection;
  try {
    const { datosVenta, detalle } = req.body;
    
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 🔒 BLOQUEO DE SEGURIDAD: Prevenir ventas si el Cierre Z del día ya se realizó.
    const [cierreHoy] = await connection.execute(
      `SELECT id FROM cierres_diarios WHERE DATE(fecha_cierre) = CURDATE() LIMIT 1`
    );

    if (cierreHoy.length > 0) {
      const err = new Error("No se pueden registrar ventas: Ya se generó el Cierre Z de hoy.");
      err.status = 403; // Forbidden
      throw err;
    }
    
    const dv = datosVenta || {};
    const items = detalle || [];
    const permitirStockNegativo = dv.permitirStockNegativo || false;

    // El ID del vendedor se toma del token de autenticación para mayor seguridad.
    const vendedorId = req.user.id; 

    // 🔍 VALIDACIÓN: Cliente
    const [clienteExiste] = await connection.execute("SELECT id FROM clientes WHERE id = ?", [dv.clienteId || 1]);
    if (clienteExiste.length === 0) {
        const err = new Error(`El cliente con ID ${dv.clienteId || 1} no existe.`);
        err.status = 400;
        throw err;
    }

    // 1. Registrar la cabecera de la venta
    const [ventaResult] = await connection.execute(
      `INSERT INTO ventas (id_cliente, id_usuario, subtotal, impuesto, total, tasa_bcv, metodo_pago, estado_cierre) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [
        dv.clienteId || 1,
        vendedorId, // Usar el ID del vendedor autenticado
        dv.subtotal || 0,
        dv.impuesto || 0,
        dv.total || 0,
        dv.tasaBcv || 0,
        dv.metodoPago || 'Efectivo'
      ]
    );
    const id_venta = ventaResult.insertId;

    // 2. Procesar cada producto del detalle
    for (const item of items) {
      // 🔍 VALIDACIÓN DE STOCK + BLOQUEO DE FILA para concurrencia
      const [stockActual] = await connection.execute(
        "SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1 FOR UPDATE",
        [item.productoId]
      );
      const stockDisponible = stockActual[0]?.cantidad || 0;

      if (!permitirStockNegativo && stockDisponible < item.cantidad) {
        const [producto] = await connection.execute("SELECT nombre FROM productos WHERE id = ?", [item.productoId]);
        const nombreProducto = producto[0]?.nombre || `ID ${item.productoId}`;
        const err = new Error(`Stock insuficiente para "${nombreProducto}". Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`);
        err.status = 400;
        throw err;
      }

      // 2a. Insertar en detalle_ventas
      await connection.execute(
        `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)`,
        [id_venta, item.productoId, item.cantidad, item.precioUnitario]
      );

      // 2b. Registrar el movimiento de inventario (Kardex)
      const comentarioMovimiento = `Venta #${id_venta}`;
      await connection.execute(
        `INSERT INTO movimientos_inventario (id_producto, id_deposito, tipo_movimiento, cantidad, referencia_id, referencia_tabla, comentario)
         VALUES (?, 1, 'VENTA', ?, ?, 'ventas', ?)`,
        [item.productoId, item.cantidad * -1, id_venta, comentarioMovimiento]
      );

      // 2c. Actualizar el stock en el depósito principal
      await connection.execute(
        `UPDATE stock_depositos SET cantidad = cantidad - ? WHERE id_producto = ? AND id_deposito = 1`,
        [item.cantidad, item.productoId]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, id_venta: id_venta, message: "Venta procesada con éxito" });

  } catch (error) {
    if (connection) await connection.rollback();
    // Pasamos el error al siguiente middleware para manejo centralizado
    next(error); 
  } finally {
    if (connection) connection.release();
  }
};


/**
 * @description Obtiene la última tasa de cambio (BCV) registrada en una venta.
 * @type {import('express').RequestHandler}
 */
const obtenerUltimaTasa = async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            `SELECT tasa_bcv FROM ventas WHERE tasa_bcv > 0 ORDER BY fecha_venta DESC LIMIT 1`
        );
        const tasa = rows.length > 0 ? rows[0].tasa_bcv : 0;
        res.json({ tasa_bcv: tasa });
    } catch (error) {
        console.error("Error al obtener la última tasa de cambio:", error);
        next(error);
    }
};

module.exports = { 
  procesarVenta, 
  obtenerUltimaTasa 
};
