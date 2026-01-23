// Backend/services/inventario.service.js
const pool = require("../db");

/**
 * @typedef {Object} MovementData
 * @property {number} id_producto - El ID del producto.
 * @property {number} id_deposito - El ID del depósito afectado.
 * @property {number} cantidad - La cantidad a mover (positiva para entrada, negativa para salida).
 * @property {string} tipo_movimiento - Descripción del tipo de movimiento (ej: 'Venta', 'Devolucion', 'Traspaso').
 * @property {number} id_usuario - El ID del usuario que realiza el movimiento.
 * @property {mysql2.Connection} [connection] - Opcional: Una conexión de base de datos existente para usar dentro de una transacción externa.
 */

/**
 * Función maestra transaccional para actualizar el stock en un depósito específico
 * y registrar el movimiento en el historial.
 *
 * @param {MovementData} data - Objeto con los datos del movimiento.
 * @returns {Promise<void>}
 * @throws {Error} Si la operación falla, se lanzará un error.
 */
async function actualizarStockDeposito({
  id_producto,
  id_deposito,
  cantidad,
  tipo_movimiento,
  id_usuario,
  connection, // Permitir pasar una conexión externa para transacciones anidadas o de controlador
}) {
  let conn = connection;
  let isNewTransaction = false; // Bandera para saber si esta función inició la transacción

  try {
    // Si no se proporciona una conexión, obtenemos una del pool e iniciamos una nueva transacción.
    // Esto asegura que cada llamada individual a esta función sea transaccional por sí misma,
    // pero también permite que se integre en una transacción más grande si el controlador la maneja.
    if (!conn) {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      isNewTransaction = true;
      console.log("Transacción iniciada por actualizarStockDeposito.");
    }

    // 1. Actualizar stock_depositos (Upsert: INSERT ... ON DUPLICATE KEY UPDATE)
    const updateStockSql = `
      INSERT INTO stock_depositos (id_producto, id_deposito, stock_actual)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE stock_actual = stock_actual + VALUES(stock_actual);
    `;
    await conn.execute(updateStockSql, [id_producto, id_deposito, cantidad]);
    console.log(
      `Stock actualizado para producto ${id_producto} en depósito ${id_deposito} en cantidad ${cantidad}.`
    );

    // 2. Registrar el movimiento en movimientos_inventario
    const insertMovementSql = `
      INSERT INTO movimientos_inventario (id_producto, id_deposito, cantidad, tipo_movimiento, fecha_movimiento, id_usuario)
      VALUES (?, ?, ?, ?, NOW(), ?);
    `;
    await conn.execute(insertMovementSql, [
      id_producto,
      id_deposito,
      cantidad,
      tipo_movimiento,
      id_usuario,
    ]);
    console.log(
      `Movimiento registrado para producto ${id_producto}, tipo: ${tipo_movimiento}.`
    );

    // Si esta función inició la transacción, la confirmamos.
    if (isNewTransaction) {
      await conn.commit();
      console.log("Transacción confirmada por actualizarStockDeposito.");
    }
  } catch (error) {
    // Si esta función inició la transacción y hay un error, hacemos rollback.
    if (isNewTransaction && conn) {
      await conn.rollback();
      console.error(
        "Transacción revertida por actualizarStockDeposito debido a un error."
      );
    }
    console.error(
      `Error en actualizarStockDeposito para producto ${id_producto}, depósito ${id_deposito}:`,
      error.message
    );
    throw error; // Propagar el error para que el llamador pueda manejarlo.
  } finally {
    // Siempre liberar la conexión si fue obtenida por esta función.
    if (isNewTransaction && conn) {
      conn.release();
      console.log("Conexión liberada por actualizarStockDeposito.");
    }
  }
}

module.exports = {
  actualizarStockDeposito,
};