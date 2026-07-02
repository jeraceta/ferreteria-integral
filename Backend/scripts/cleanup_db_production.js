// Backend/scripts/cleanup_db_production.js
const pool = require("../db");

async function cleanupDatabase() {
  console.log("----------------------------------------------------------------");
  console.log("🧹 INICIANDO SCRIPT DE LIMPIEZA DE BASE DE DATOS PARA PRODUCCIÓN");
  console.log("----------------------------------------------------------------\n");

  let connection;
  try {
    connection = await pool.getConnection();

    // 1. Verificar si existe el usuario Administrador con ID 6
    const [usuarios] = await connection.query("SELECT id, username, nombre, rol FROM usuarios WHERE id = 6");
    if (usuarios.length === 0) {
      console.error("❌ ERROR CRÍTICO: No se encontró al usuario Administrador con ID 6 en la tabla 'usuarios'.");
      console.error("La operación ha sido cancelada para evitar dejar el sistema sin un administrador principal.");
      connection.release();
      process.exit(1);
    }
    const adminUser = usuarios[0];
    console.log(`👤 Confirmado: Se conservará al Administrador: ${adminUser.nombre} (@${adminUser.username}) con ID 6.\n`);

    // 2. Obtener la lista de todas las tablas existentes en la base de datos
    const [tablesResult] = await connection.query("SHOW TABLES");
    const dbTables = tablesResult.map(row => Object.values(row)[0]);

    // 3. Definir la lista de todas las tablas posibles a limpiar (tanto singulares como plurales)
    const tablesToClean = [
      "detalle_ventas", "detalle_venta", "venta_pagos", "ventas",
      "detalle_compras", "detalle_compra", "compras",
      "detalle_devoluciones", "devoluciones", "motivos_devolucion",
      "detalle_presupuestos", "presupuestos",
      "cierres_diarios",
      "ajustes_stock_detalle", "ajustes_stock", "movimientos_inventario",
      "cxc_abonos", "cxc_cuentas",
      "cxp_abonos", "cxp_cuentas",
      "stock_depositos", "productos",
      "proveedores", "clientes"
    ];

    // 4. Desactivar validación de llaves foráneas
    console.log("🔒 Desactivando validación de llaves foráneas...");
    await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

    const cleanedTables = [];
    const skippedTables = [];

    // 5. Truncar tablas existentes
    for (const table of tablesToClean) {
      if (dbTables.includes(table)) {
        await connection.query(`TRUNCATE TABLE \`${table}\``);
        cleanedTables.push(table);
      } else {
        skippedTables.push(table);
      }
    }
    console.log("✅ Tablas transaccionales y catálogos vaciados correctamente.");

    // 6. Eliminar todos los usuarios excepto el Administrador con ID 6
    console.log("👤 Limpiando usuarios de prueba...");
    const [deleteResult] = await connection.query("DELETE FROM usuarios WHERE id != 6");
    await connection.query("ALTER TABLE usuarios AUTO_INCREMENT = 7");
    console.log(`✅ Usuarios de prueba eliminados: ${deleteResult.affectedRows}`);

    // 7. Reactivar validación de llaves foráneas
    console.log("🔓 Reactivando validación de llaves foráneas...");
    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log("\n----------------------------------------------------------------");
    console.log("🎉 ¡LIMPIEZA COMPLETADA CON ÉXITO!");
    console.log("----------------------------------------------------------------");
    console.log(`Tablas vaciadas (${cleanedTables.length}):`, cleanedTables.join(", "));
    if (skippedTables.length > 0) {
      console.log(`Tablas omitidas (no existen en la base de datos) (${skippedTables.length}):`, skippedTables.join(", "));
    }
    console.log(`Administrador conservado: ID 6 - ${adminUser.nombre} (${adminUser.rol})`);
    console.log("----------------------------------------------------------------\n");

  } catch (error) {
    console.error("\n❌ OCURRIÓ UN ERROR DURANTE LA LIMPIEZA:");
    console.error(error.message);
    
    // Asegurarse de volver a activar las llaves foráneas ante cualquier error
    try {
      if (connection) {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");
      }
    } catch (_) {}
    
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    pool.end();
  }
}

cleanupDatabase();
