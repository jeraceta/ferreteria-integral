const pool = require("../db");
const bcrypt = require("bcrypt");
const { actualizarStockDeposito } = require("../services/inventario.service");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { getEmpresaConfig } = require("../config/empresa");

// 1. OBTENER PRODUCTO POR ID
const obtenerProductoPorId = async (req, res, next) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT p.*, p.ubicacion, c.nombre as nombre_categoria, p.marca,
             (SELECT cantidad FROM stock_depositos WHERE id_producto = p.id AND id_deposito = 1) as stock_actual,
             (SELECT cantidad FROM stock_depositos WHERE id_producto = p.id AND id_deposito = 1) as stock_principal,
             (SELECT cantidad FROM stock_depositos WHERE id_producto = p.id AND id_deposito = 2) as stock_dañado,
             (SELECT cantidad FROM stock_depositos WHERE id_producto = p.id AND id_deposito = 3) as stock_inmovilizado
             FROM productos p 
             LEFT JOIN categorias c ON p.id_categoria = c.id
             WHERE p.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: `Producto ${id} no encontrado.` });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// 2. OBTENER TODOS LOS PRODUCTOS
const obtenerTodosLosProductos = async (req, res, next) => {
  let connection;
  try {
    const { modoCliente } = req.query;
    connection = await pool.getConnection();
    const [rows] = await connection.execute(`
            SELECT 
                p.id, 
                p.codigo, 
                p.nombre, 
                p.marca,
                p.descripcion,
                p.ubicacion,
                p.precio_venta, 
                p.precio_costo, 
                p.id_categoria,
                c.nombre as nombre_categoria, 
                sd.cantidad as stock_actual
            FROM productos p
            LEFT JOIN categorias c ON p.id_categoria = c.id
            JOIN stock_depositos sd ON p.id = sd.id_producto
            WHERE sd.id_deposito = 1
        `);

    let finalRows = rows;

    // Si se solicita el modo cliente, ocultamos datos sensibles y calculamos disponibilidad visual
    if (modoCliente === "true") {
      finalRows = rows.map((r) => {
        const { precio_costo, ubicacion, stock_actual, ...rest } = r;

        // Lógica de disponibilidad para el semáforo del cliente
        let disponibilidad = "agotado";
        const stockNum = parseInt(stock_actual || 0, 10);
        if (stockNum > 10) {
          disponibilidad = "disponible";
        } else if (stockNum > 0) {
          disponibilidad = "pocas";
        }

        return {
          ...rest,
          disponibilidad,
        };
      });
    }

    res.status(200).json(finalRows);
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Escenario A: Venta Estándar
 *
 * Esta función maneja el proceso de registrar una venta, verificando el stock disponible
 * en el depósito principal antes de restar la cantidad. Utiliza la función maestra
 * `actualizarStockDeposito` dentro de una transacción explícita gestionada por este controlador
 * para asegurar la atomicidad de la operación.
 *
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar el control al siguiente middleware.
 */
const realizarVenta = async (req, res, next) => {
  const { id_producto, cantidad_venta, id_usuario } = req.body;

  if (!id_producto || !cantidad_venta || cantidad_venta <= 0 || !id_usuario) {
    return res.status(400).json({
      success: false,
      error:
        "Datos de venta incompletos o inválidos. Asegúrate de proporcionar id_producto, cantidad_venta y id_usuario.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); // Iniciar transacción a nivel de controlador

    // Validar stock actual en el depósito principal (ID 1)
    // Usamos FOR UPDATE para bloquear la fila y evitar condiciones de carrera (Race Conditions)
    // si múltiples ventas intentan acceder al mismo producto simultáneamente.
    const [rows] = await connection.execute(
      "SELECT stock_actual FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1 FOR UPDATE",
      [id_producto],
    );

    const stockActual = rows.length > 0 ? rows[0].stock_actual : 0;

    if (stockActual < cantidad_venta) {
      await connection.rollback(); // Rollback si no hay stock suficiente
      return res.status(400).json({
        success: false,
        error: `Stock insuficiente para el producto ${id_producto}. Stock disponible: ${stockActual}.`,
      });
    }

    // Llamar a la función maestra de servicio para actualizar el stock.
    // Se le pasa la conexión para que opere dentro de la transacción existente.
    await actualizarStockDeposito({
      id_producto,
      id_deposito: 1, // Depósito Principal
      cantidad: -cantidad_venta, // Cantidad negativa para salida
      tipo_movimiento: "VENTA",
      id_usuario,
      connection,
    });

    await connection.commit(); // Confirmar la transacción si todo fue exitoso
    console.log(`Venta exitosa para producto ${id_producto}.`);
    res.status(200).json({
      success: true,
      message: "Venta registrada y stock actualizado.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback(); // Revertir la transacción en caso de cualquier error
      console.error(
        `Transacción de venta revertida debido a un error: ${error.message}`,
      );
    }
    next(error); // Pasar el error al siguiente middleware (manejador de errores global)
  } finally {
    if (connection) {
      connection.release(); // Siempre liberar la conexión
    }
  }
};

/**
 * Escenario B: Devoluciones Inteligentes
 *
 * Permite procesar devoluciones de productos, dirigiéndolos al depósito principal
 * si están en buen estado o al depósito de productos dañados si presentan defectos.
 * Cada operación de devolución se maneja como una transacción independiente a través
 * de `actualizarStockDeposito`.
 *
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar el control al siguiente middleware.
 */
const procesarDevolucionInteligente = async (req, res, next) => {
  const { id_producto, cantidad, estado_producto, id_usuario } = req.body; // estado_producto: 'bueno' o 'danado'

  if (
    !id_producto ||
    !cantidad ||
    cantidad <= 0 ||
    !estado_producto ||
    !id_usuario
  ) {
    return res.status(400).json({
      success: false,
      error:
        "Datos de devolución incompletos o inválidos. Debe ser 'bueno' o 'danado'.",
    });
  }

  let id_deposito_destino;
  let tipo_movimiento;

  if (estado_producto === "bueno") {
    id_deposito_destino = 1; // Depósito Principal
    tipo_movimiento = "DEVOLUCION_BUEN_ESTADO";
  } else if (estado_producto === "danado") {
    id_deposito_destino = 2; // Depósito de Dañados
    tipo_movimiento = "DEVOLUCION_DAÑADO";
  } else {
    return res.status(400).json({
      success: false,
      error: "Estado del producto inválido. Debe ser 'bueno' o 'danado'.",
    });
  }

  try {
    // La función maestra gestionará su propia transacción para esta operación simple.
    await actualizarStockDeposito({
      id_producto,
      id_deposito: id_deposito_destino,
      cantidad: cantidad, // Cantidad positiva para entrada
      tipo_movimiento,
      id_usuario,
      // No se pasa conexión, por lo que actualizarStockDeposito manejará su propia transacción
    });

    res.status(200).json({
      success: true,
      message: `Devolución de producto ${id_producto} (${estado_producto}) procesada correctamente.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Escenario C: Inmovilización / Cuarentena
 *
 * Esta función permite mover una cantidad específica de un producto del depósito
 * principal a un depósito de inmovilización (cuarentena). Esta operación es crítica
 * y debe ser atómica (ambos movimientos deben ocurrir o ninguno). Por ello,
 * se gestiona una única transacción a nivel de controlador que engloba las dos llamadas
 * a `actualizarStockDeposito`.
 *
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar el control al siguiente middleware.
 */
const moverAInmovilizado = async (req, res, next) => {
  const { id_producto, cantidad, id_usuario } = req.body;
  const DEPOSITO_PRINCIPAL = 1;
  const DEPOSITO_INMOVILIZADO = 3;

  if (!id_producto || !cantidad || cantidad <= 0 || !id_usuario) {
    return res.status(400).json({
      success: false,
      error:
        "Datos de inmovilización incompletos o inválidos. Asegúrate de proporcionar id_producto, cantidad y id_usuario.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); // Iniciar una única transacción para ambos movimientos

    // 1. Restar del Depósito Principal (ID 1)
    // Es crucial validar que hay suficiente stock antes de intentar moverlo.
    const [rows] = await connection.execute(
      "SELECT stock_actual FROM stock_depositos WHERE id_producto = ? AND id_deposito = ? FOR UPDATE",
      [id_producto, DEPOSITO_PRINCIPAL],
    );

    const stockActualPrincipal = rows.length > 0 ? rows[0].stock_actual : 0;

    if (stockActualPrincipal < cantidad) {
      await connection.rollback(); // Rollback si no hay stock suficiente en el origen
      return res.status(400).json({
        success: false,
        error: `Stock insuficiente en el depósito principal para inmovilizar ${cantidad} unidades del producto ${id_producto}. Stock disponible: ${stockActualPrincipal}.`,
      });
    }

    await actualizarStockDeposito({
      id_producto,
      id_deposito: DEPOSITO_PRINCIPAL,
      cantidad: -cantidad, // Salida del depósito principal
      tipo_movimiento: "INMOVILIZACION_SALIDA",
      id_usuario,
      connection, // Pasar la conexión para que use la transacción existente
    });

    // 2. Sumar al Depósito Inmovilizado (ID 3)
    await actualizarStockDeposito({
      id_producto,
      id_deposito: DEPOSITO_INMOVILIZADO,
      cantidad: cantidad, // Entrada al depósito inmovilizado
      tipo_movimiento: "INMOVILIZACION_ENTRADA",
      id_usuario,
      connection, // Pasar la conexión para que use la transacción existente
    });

    await connection.commit(); // Confirmar ambos movimientos
    console.log(`Producto ${id_producto} movido a inmovilizado.`);
    res.status(200).json({
      success: true,
      message: `Se han movido ${cantidad} unidades del producto ${id_producto} al depósito de inmovilización.`,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback(); // Revertir ambos movimientos si algo falla
      console.error(
        `Transacción de inmovilización revertida debido a un error: ${error.message}`,
      );
    }
    next(error);
  } finally {
    if (connection) {
      connection.release(); // Liberar la conexión
    }
  }
};

// Función para obtener todas las categorías
async function obtenerTodasLasCategorias() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT id, nombre FROM categorias ORDER BY nombre ASC",
    );
    return rows;
  } finally {
    connection.release();
  }
}

// 3. CREAR NUEVO PRODUCTO
const crearProducto = async (req, res, next) => {
  let connection;
  try {
    // Adaptamos la función para recibir (req, res, next). Ahora extraemos los datos de req.body,
    // lo que soluciona el problema de que las variables llegaran undefined. También cambiamos
    // los "throw" por "res.status(400)" para que el servidor no se apague si falta un dato.
    const datos = req.body;

    // Desestructuración con valores por defecto (Tu escudo protector)
    const {
      codigo,
      nombre,
      marca = null,
      descripcion = "",
      precio_venta = 0,
      precio_costo = 0,
      id_categoria = null,
      stock = 0,
      stock_minimo = 2,
      ubicacion = "Sin ubicación", // <-- ¡El nuevo campo de ubicación en estanterla!
    } = datos;

    // Validación básica para evitar el crash
    if (!codigo || !nombre) {
      // En lugar de throw, respondemos con error 400
      return res.status(400).json({
        message: "El código y el nombre del producto son obligatorios.",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. VALIDACIÓN: Verificar si el código ya existe
    const [existe] = await connection.execute(
      "SELECT id FROM productos WHERE codigo = ?",
      [codigo],
    );
    if (existe.length > 0) {
      // Devolvemos un error 400 en lugar de crashear
      return res
        .status(400)
        .json({ message: `El código ${codigo} ya está registrado.` });
    }

    // Lógica de INSERT con todas las columnas correctas
    const sqlProd = `
      INSERT INTO productos 
      (codigo, nombre, marca, descripcion, precio_venta, precio_costo, id_categoria, stock_minimo, stock, ubicacion) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [resProd] = await connection.execute(sqlProd, [
      codigo,
      nombre,
      marca,
      descripcion,
      precio_venta,
      precio_costo,
      id_categoria,
      stock_minimo,
      stock,
      ubicacion,
    ]);

    const nuevoId = resProd.insertId;

    // Insertar Stock en los depósitos correspondientes
    const sqlStock =
      "INSERT INTO stock_depositos (id_producto, id_deposito, cantidad) VALUES (?, ?, ?)";
    await connection.execute(sqlStock, [nuevoId, 1, stock]); // Depósito Principal
    await connection.execute(sqlStock, [nuevoId, 2, 0]); // Depósito Dañado
    await connection.execute(sqlStock, [nuevoId, 3, 0]); // Depósito Inmovilizado

    await connection.commit();

    // RESPUESTA FINAL: Enviamos un 201 (Created) con el ID del nuevo producto
    res
      .status(201)
      .json({ id: nuevoId, message: "Producto creado exitosamente" });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error); // Pasamos cualquier otro error al manejador global de Express
  } finally {
    if (connection) connection.release();
  }
};

// La función para procesar ventas ha sido movida a ventas.controller.js

// 5. OBTENER STOCK CRÍTICO
async function obtenerStockCritico() {
  const [rows] = await pool.execute(`
        SELECT p.id, p.codigo, p.nombre, sd.cantidad as stock_actual,
        (5 - sd.cantidad) as unidades_faltantes,
        ((5 - sd.cantidad) * p.precio_costo) as inversion_reposicion
        FROM productos p
        JOIN stock_depositos sd ON p.id = sd.id_producto
        WHERE sd.id_deposito = 1 AND sd.cantidad <= 5
        ORDER BY sd.cantidad ASC
    `);
  return rows;
}

async function obtenerInventarioCritico() {
  const [rows] = await pool.execute(`
        SELECT 
            p.codigo,
            p.nombre,
            sd.cantidad AS stock_actual,
            p.stock_minimo
        FROM productos p
        JOIN stock_depositos sd ON p.id = sd.id_producto
        WHERE sd.id_deposito = 1 AND sd.cantidad <= p.stock_minimo
        ORDER BY stock_actual ASC
    `);
  return rows;
}

// 6. PROCESAR COMPRA
async function procesarNuevaCompra(datosCompra, detallesProductos) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const facturaReferencia =
      datosCompra.numeroFactura || `COMP-INT-${Date.now()}`;

    const [compraResult] = await connection.execute(
      `INSERT INTO compras (id_proveedor, total_bruto, metodo_pago, numero_factura_proveedor) 
             VALUES (?, ?, ?, ?)`,
      [
        datosCompra.proveedorId,
        datosCompra.total || 0,
        datosCompra.metodoPago || "Efectivo",
        facturaReferencia,
      ],
    );
    const id_compra = compraResult.insertId;

    for (const det of detallesProductos) {
      const subtotalLinea = det.cantidad * det.costoUnitario;

      // Insertar detalle de compra
      await connection.execute(
        `INSERT INTO detalle_compra (id_compra, id_producto, cantidad, costo_unitario, subtotal) 
                 VALUES (?, ?, ?, ?, ?)`,
        [
          id_compra,
          det.productoId,
          det.cantidad,
          det.costoUnitario,
          subtotalLinea,
        ],
      );

      // 🔄 ACTUALIZAR PRECIO_COSTO automáticamente con el nuevo costo del proveedor
      // Esto permite que el sistema refleje cambios de precios del proveedor
      await connection.execute(
        `UPDATE productos SET precio_costo = ? WHERE id = ?`,
        [det.costoUnitario, det.productoId],
      );

      // Bloquear fila de stock y actualizar
      await connection.execute(
        "SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1 FOR UPDATE",
        [det.productoId],
      );
      await connection.execute(
        `UPDATE stock_depositos SET cantidad = cantidad + ? WHERE id_producto = ? AND id_deposito = 1`,
        [det.cantidad, det.productoId],
      );

      // Registrar movimiento de inventario
      await connection.execute(
        `INSERT INTO movimientos_inventario (id_producto, id_deposito, tipo_movimiento, cantidad, referencia_id, referencia_tabla, comentario)
                 VALUES (?, 1, 'COMPRA', ?, ?, 'compras', ?)`,
        [
          det.productoId,
          det.cantidad,
          id_compra,
          `Entrada por factura: ${facturaReferencia}. Costo actualizado a ${det.costoUnitario}`,
        ],
      );
    }
    await connection.commit();
    return { success: true, id_compra };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// 7. GANANCIAS DE LA TIENDA
async function obtenerGananciasTienda(fechaInicio, fechaFin) {
  let query = `
        SELECT COUNT(DISTINCT v.id) as total_ventas,
        IFNULL(SUM(dv.cantidad * dv.precio_unitario), 0) as ingresos_totales,
        IFNULL(SUM(dv.cantidad * p.precio_costo), 0) as costo_mercancia,
        IFNULL((SUM(dv.cantidad * dv.precio_unitario) - SUM(dv.cantidad * p.precio_costo)), 0) as utilidad_neta
        FROM ventas v
        JOIN detalle_ventas dv ON v.id = dv.id_venta
        JOIN productos p ON dv.id_producto = p.id`;

  const whereConditions = [];
  const params = [];

  if (fechaInicio && fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) BETWEEN ? AND ?`);
    params.push(fechaInicio, fechaFin);
  } else if (fechaInicio) {
    whereConditions.push(`DATE(v.fecha_venta) >= ?`);
    params.push(fechaInicio);
  } else if (fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) <= ?`);
    params.push(fechaFin);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(" AND ")}`;
  }

  const [rows] = await pool.execute(query, params);
  return rows[0];
}

// 8. VENTAS POR VENDEDOR (COMISIONES)
async function obtenerVentasPorVendedor(
  fechaInicio,
  fechaFin,
  porcentajeComision = 5,
) {
  // Asegurarse que el valor es un número, si no, usar el default.
  const comisionValue = parseFloat(porcentajeComision) || 5;
  const params = [comisionValue]; // El primer parámetro siempre es la comisión

  let query = `
        SELECT 
            u.id as usuario_id, 
            u.nombre as vendedor,
            COUNT(v.id) as cantidad_ventas,
            IFNULL(SUM(v.total), 0) as total_ventas_brutas,
            (IFNULL(SUM(v.total), 0) * ? / 100) as comision
        FROM usuarios u
        LEFT JOIN ventas v ON u.id = v.id_usuario`;

  if (fechaInicio && fechaFin) {
    query += ` AND DATE(v.fecha_venta) BETWEEN ? AND ?`;
    params.push(fechaInicio, fechaFin); // Los siguientes son las fechas
  }

  query += ` 
        GROUP BY u.id, u.nombre
        ORDER BY total_ventas_brutas DESC`;

  const [rows] = await pool.execute(query, params);
  return rows;
}

async function obtenerVentasPorMetodoPago(fechaInicio, fechaFin) {
  const params = [];
  let query = `
        SELECT
            vp.metodo_pago,
            COUNT(DISTINCT v.id) AS cantidad_transacciones,
            IFNULL(SUM(vp.monto_pago), 0) AS total_recaudado
        FROM ventas v
        JOIN venta_pagos vp ON v.id = vp.id_venta
    `;

  const whereConditions = [];
  if (fechaInicio && fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) BETWEEN ? AND ?`);
    params.push(fechaInicio, fechaFin);
  } else if (fechaInicio) {
    whereConditions.push(`DATE(v.fecha_venta) >= ?`);
    params.push(fechaInicio);
  } else if (fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) <= ?`);
    params.push(fechaFin);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(" AND ")}`;
  }

  query += `
        GROUP BY vp.metodo_pago
        ORDER BY total_recaudado DESC
    `;

  const [rows] = await pool.execute(query, params);
  return rows;
}
async function registrarUsuario(datos) {
  const connection = await pool.getConnection();
  try {
    // Encriptamos la clave (10 salt rounds es el estándar)
    const saltRounds = 10;
    const hashedPw = await bcrypt.hash(datos.password, saltRounds);

    const [res] = await connection.execute(
      `INSERT INTO usuarios (username, password, nombre, rol) VALUES (?, ?, ?, ?)`,
      [datos.username, hashedPw, datos.nombre, datos.rol || "vendedor"],
    );
    return { id: res.insertId, username: datos.username };
  } finally {
    connection.release();
  }
}
// En inventario.controller.js
// OBTENER TODOS LOS USUARIOS
async function obtenerUsuarios() {
  const [rows] = await pool.execute(
    "SELECT id, username, nombre, rol, created_at FROM usuarios",
  );
  return rows;
}

// ACTUALIZAR USUARIO (Cambiar nombre, rol, etc.)
async function actualizarUsuario(id, datos) {
  const [result] = await pool.execute(
    `UPDATE usuarios SET username = ?, nombre = ?, rol = ? WHERE id = ?`,
    [datos.username, datos.nombre, datos.rol, id],
  );
  return result.affectedRows > 0;
}

// ELIMINAR UN USUARIO
async function eliminarUsuario(id) {
  const [result] = await pool.execute("DELETE FROM usuarios WHERE id = ?", [
    id,
  ]);
  return result.affectedRows > 0;
}

// OBTENER TOP 10 PRODUCTOS MÁS VENDIDOS POR RANGO DE FECHA
async function obtenerProductosMasVendidos(fechaInicio, fechaFin) {
  const params = [];
  let query = `
        SELECT
            p.nombre AS producto,
            p.codigo,
            SUM(dv.cantidad) AS cantidad_vendida,
            SUM(dv.cantidad * dv.precio_unitario) AS total_generado
        FROM detalle_ventas dv
        JOIN productos p ON dv.id_producto = p.id
        JOIN ventas v ON dv.id_venta = v.id
    `;

  const whereConditions = [];
  if (fechaInicio && fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) BETWEEN ? AND ?`);
    params.push(fechaInicio, fechaFin);
  } else if (fechaInicio) {
    whereConditions.push(`DATE(v.fecha_venta) >= ?`);
    params.push(fechaInicio);
  } else if (fechaFin) {
    whereConditions.push(`DATE(v.fecha_venta) <= ?`);
    params.push(fechaFin);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(" AND ")}`;
  }

  query += `
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY cantidad_vendida DESC
        LIMIT 10
    `;

  const [rows] = await pool.execute(query, params);
  return rows;
}
// FUNCIÓN DE LOGIN
async function loginUsuario(username, password) {
  const [rows] = await pool.execute(
    `SELECT id, username, password, nombre, rol FROM usuarios WHERE username = ?`,
    [username],
  );

  if (rows.length === 0) {
    // Throwing an error is better for the route handler's try...catch block
    const err = new Error("Usuario no encontrado");
    err.status = 404;
    throw err;
  }

  const usuario = rows[0];

  // Verificar la contraseña
  const passwordMatch = await bcrypt.compare(password, usuario.password);

  if (!passwordMatch) {
    const err = new Error("Credenciales inválidas");
    err.status = 401;
    throw err;
  }

  // Return only non-sensitive data
  const { password: pw, ...user } = usuario;
  return user;
}
// 8. OBTENER KARDEX (Historial de movimientos de un producto)
async function obtenerKardexProducto(idProducto) {
  const connection = await pool.getConnection();
  try {
    const [producto] = await connection.execute(
      `SELECT id, codigo, nombre, precio_venta, precio_costo 
             FROM productos WHERE id = ?`,
      [idProducto],
    );

    if (producto.length === 0) {
      throw new Error("Producto no encontrado");
    }

    await connection.beginTransaction();

    const [stockActual] = await connection.execute(
      `SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1`,
      [idProducto],
    );

    const [movimientos] = await connection.execute(
      `SELECT 
                m.id,
                m.tipo_movimiento,
                m.cantidad,
                m.fecha_movimiento,
                m.referencia_id,
                m.referencia_tabla,
                m.comentario,
                CASE 
                    WHEN m.referencia_tabla = 'ventas' THEN 
                        (SELECT CONCAT('Venta #', v.id, ' - Cliente: ', c.razon_social) 
                         FROM ventas v 
                         LEFT JOIN clientes c ON v.id_cliente = c.id 
                         WHERE v.id = m.referencia_id)
                    WHEN m.referencia_tabla = 'compras' THEN 
                        (SELECT CONCAT('Compra #', c.id, ' - Proveedor: ', p.nombre) 
                         FROM compras c 
                         LEFT JOIN proveedores p ON c.id_proveedor = p.id 
                         WHERE c.id = m.referencia_id)
                    ELSE m.comentario
                END as descripcion,
                CASE 
                    WHEN m.tipo_movimiento IN ('COMPRA', 'AJUSTE_ENTRADA', 'DEVOLUCION_CLIENTE') THEN 'ENTRADA'
                    WHEN m.tipo_movimiento IN ('VENTA', 'AJUSTE_SALIDA', 'DEVOLUCION_PROVEEDOR') THEN 'SALIDA'
                    ELSE 'AJUSTE'
                END as tipo_operacion
            FROM movimientos_inventario m
            WHERE m.id_producto = ?
            ORDER BY m.fecha_movimiento ASC`,
      [idProducto],
    );

    let stockAcumulado = 0;
    const movimientosConStock = movimientos.map((mov) => {
      const stockAntes = stockAcumulado;
      stockAcumulado += parseFloat(mov.cantidad);
      return {
        ...mov,
        stock_antes: stockAntes,
        stock_despues: stockAcumulado,
      };
    });

    await connection.commit();

    return {
      producto: producto[0],
      stock_actual: stockActual[0]?.cantidad || 0,
      total_movimientos: movimientos.length,
      movimientos: movimientosConStock.reverse(),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// FUNCIONES DE APOYO RESTANTES

async function procesarAjusteInventario(datos) {
  const { id_producto, id_deposito, cantidad_nueva, motivo, tipo_ajuste } =
    datos;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Obtener cantidad anterior
    const [actual] = await connection.execute(
      "SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = ?",
      [id_producto, id_deposito],
    );
    const cantidadAnterior = actual[0]?.cantidad || 0;
    const diferencia =
      tipo_ajuste === "ENTRADA" ? cantidad_nueva : cantidad_nueva * -1;

    // 2. Actualizar stock
    await connection.execute(
      "UPDATE stock_depositos SET cantidad = cantidad + ? WHERE id_producto = ? AND id_deposito = ?",
      [diferencia, id_producto, id_deposito],
    );

    // 3. Registrar en Kardex
    await connection.execute(
      `INSERT INTO movimientos_inventario 
            (id_producto, tipo_movimiento, cantidad, comentario, referencia_tabla) 
            VALUES (?, ?, ?, ?, 'ajustes')`,
      [id_producto, `AJUSTE_${tipo_ajuste}`, diferencia, motivo],
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
// --- FUNCION: OBTENER HISTORIAL DE CIERRES ---
async function obtenerHistorialCierres() {
  const [rows] = await pool.execute(`
        SELECT 
            c.id, 
            c.fecha_cierre, 
            c.ingresos_totales, 
            c.costo_mercancia, 
            c.utilidad_neta, 
            u.nombre as gerente
        FROM cierres_diarios c
        JOIN usuarios u ON c.usuario_id = u.id
        ORDER BY c.fecha_cierre DESC
    `);
  return rows;
}
// --- NUEVO: REPORTE PARA INVENTARIO MANUAL (TOMA FÍSICA) ---
async function obtenerReporteTomaFisica(idCategoria = null) {
  let query = `
        SELECT p.id, p.codigo, p.nombre as producto, sd.cantidad as stock_sistema, '' as conteo_real
        FROM productos p
        JOIN stock_depositos sd ON p.id = sd.id_producto
        WHERE sd.id_deposito = 1
    `;
  const params = [];
  if (idCategoria) {
    query += ` AND p.id_categoria = ?`;
    params.push(idCategoria);
  }
  const [rows] = await pool.execute(query, params);
  return rows;
}

// --- NUEVO: DATOS PARA GRÁFICO ---
async function obtenerVentasMensuales() {
  const [rows] = await pool.execute(`
        SELECT DATE_FORMAT(fecha_venta, '%Y-%m') as mes, SUM(total) as total_ventas
        FROM ventas
        WHERE fecha_venta >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY mes ORDER BY mes ASC
    `);
  return rows;
}
async function trasladarMercancia(
  idProducto,
  idOrigen,
  idDestino,
  cantidad,
  comentario = "Traslado interno",
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Restar del origen
    const [restar] = await connection.execute(
      "UPDATE stock_depositos SET cantidad = cantidad - ? WHERE id_producto = ? AND id_deposito = ?",
      [cantidad, idProducto, idOrigen],
    );

    // 2. Sumar al destino
    const [sumar] = await connection.execute(
      "UPDATE stock_depositos SET cantidad = cantidad + ? WHERE id_producto = ? AND id_deposito = ?",
      [cantidad, idProducto, idDestino],
    );

    // 3. Registrar el movimiento en el historial (Kardex)
    await connection.execute(
      `INSERT INTO movimientos_inventario 
            (id_producto, tipo_movimiento, cantidad, comentario, referencia_tabla) 
            VALUES (?, 'TRASLADO', ?, ?, 'stock_depositos')`,
      [
        idProducto,
        0,
        `${comentario}: Movidas ${cantidad} unidades del depósito ${idOrigen} al ${idDestino}`,
      ],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function actualizarProducto(req, id, datos) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 🔒 VALIDACIÓN DE PERMISOS: Verificar si el usuario puede modificar precios/stock
    const esAdministrador =
      req.user &&
      req.user.rol &&
      req.user.rol.toLowerCase() === "administrador";

    if (!esAdministrador) {
      // 🚫 Vendedores NO pueden modificar precios ni stock
      const productoActual = await connection.execute(
        "SELECT precio_venta, precio_costo, stock_minimo FROM productos WHERE id = ?",
        [id],
      );

      if (productoActual[0].length > 0) {
        const actual = productoActual[0][0];

        // Verificar si intentan cambiar precios
        if (
          datos.precio_venta != actual.precio_venta ||
          datos.precio_costo != actual.precio_costo
        ) {
          throw new Error(
            "Permisos insuficientes. Solo administradores pueden modificar precios.",
          );
        }

        // Verificar si intentan cambiar stock mínimo
        if (datos.stock_minimo != actual.stock_minimo) {
          throw new Error(
            "Permisos insuficientes. Solo administradores pueden modificar stock mínimo.",
          );
        }
      }
    }

    // Validar que el código no lo tenga OTRO producto diferente al que estamos editando
    const [existe] = await connection.execute(
      "SELECT id FROM productos WHERE codigo = ? AND id != ?",
      [datos.codigo, id],
    );

    if (existe.length > 0) {
      throw new Error(
        `El código ${datos.codigo} ya está siendo usado por otro producto.`,
      );
    }

    // ✏️ Actualizamos todos los campos incluyendo la ubicación en el estante
    const [res] = await connection.execute(
      `UPDATE productos
             SET codigo = ?, nombre = ?, marca = ?, descripcion = ?, precio_venta = ?, precio_costo = ?,
                 id_categoria = ?, stock_minimo = ?, ubicacion = ?
             WHERE id = ?`,
      [
        datos.codigo,
        datos.nombre,
        datos.marca || null,
        datos.descripcion || "",
        datos.precio_venta,
        datos.precio_costo,
        datos.id_categoria || null,
        datos.stock_minimo || 2,
        datos.ubicacion || "Sin ubicación",
        id,
      ],
    );

    await connection.commit();
    return res.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function eliminarProducto(id) {
  // Primero verificamos si tiene movimientos para no romper la integridad
  const [movimientos] = await pool.execute(
    "SELECT id FROM movimientos_inventario WHERE id_producto = ? LIMIT 1",
    [id],
  );

  if (movimientos.length > 0) {
    // Si tiene movimientos, solo lo desactivamos
    const [res] = await pool.execute(
      'UPDATE productos SET estado = "INACTIVO" WHERE id = ?',
      [id],
    );
    return {
      success: true,
      message: "Producto desactivado (tenía historial).",
    };
  } else {
    // Si es nuevo y no tiene nada, se puede borrar
    await pool.execute("DELETE FROM stock_depositos WHERE id_producto = ?", [
      id,
    ]);
    await pool.execute("DELETE FROM productos WHERE id = ?", [id]);
    return { success: true, message: "Producto eliminado definitivamente." };
  }
}
async function procesarDevolucion(datosDevolucion) {
  // Capturamos los datos necesarios del cuerpo de la petición.
  // Es crucial obtener `id_deposito_destino` directamente desde `req.body`
  // para que el sistema respete la elección del usuario (Depósito Principal, Dañados, etc.).
  const {
    id_venta,
    id_producto,
    cantidad,
    motivo,
    usuario_id,
    id_deposito_destino,
  } = datosDevolucion;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 3. Validar la Transacción:
    //    Es vital validar los IDs de depósitos que vienen de fuentes externas para prevenir
    //    intentos de manipulación o errores inesperados. Solo permitimos depósitos válidos.
    if (![1, 2].includes(id_deposito_destino)) {
      throw new Error(
        "ID de depósito de destino inválido para la devolución. Debe ser 1 (Principal) o 2 (Dañados).",
      );
    }

    // 1. Verificar que la venta y el producto existan en el detalle de la venta.
    const [detalle] = await connection.execute(
      "SELECT cantidad, precio_unitario FROM detalle_ventas WHERE id_venta = ? AND id_producto = ?",
      [id_venta, id_producto],
    );

    if (detalle.length === 0) {
      throw new Error(
        "El producto no pertenece a la venta especificada o no existe.",
      );
    }

    if (cantidad > detalle[0].cantidad) {
      throw new Error(
        "La cantidad a devolver supera la cantidad vendida de este producto.",
      );
    }

    // 1. Eliminar actualizaciones manuales de productos.stock:
    //    IMPORTANTE: Ya no se ejecuta `UPDATE productos SET stock = ...`.
    //    Nos apoyamos en los TRIGGERS de la base de datos que actualizan `productos.stock`
    //    automáticamente cada vez que cambia `stock_depositos`. Esto reduce la complejidad
    //    del código en el backend y centraliza la lógica de stock en la DB.

    // 2. Hacer dinámico el Depósito de Destino:
    //    Usamos la sentencia `INSERT ... ON DUPLICATE KEY UPDATE` (UPSERT) en `stock_depositos`.
    //    Esto permite sumar la cantidad al `stock_actual` si el producto ya existe en el
    //    `id_deposito_destino`, o crear una nueva entrada si no existe.
    //    De esta forma, el producto regresa al depósito seleccionado por el usuario.
    const upsertStockSql = `
      INSERT INTO stock_depositos (id_producto, id_deposito, stock_actual)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE stock_actual = stock_actual + VALUES(stock_actual);
    `;
    await connection.execute(upsertStockSql, [
      id_producto,
      id_deposito_destino,
      cantidad,
    ]);

    // 3. Registro en Historial:
    //    El registro en la tabla `movimientos_inventario` DEBE marcar el `id_deposito_destino`
    //    que el usuario eligió. Esto es crucial para la trazabilidad y para que el historial
    //    coincida con el movimiento físico real de la mercancía.
    const comentario = `Devolución Venta #${id_venta}. Motivo: ${motivo}. Regresó a depósito ID: ${id_deposito_destino}`;
    await connection.execute(
      `INSERT INTO movimientos_inventario (id_producto, id_deposito, tipo_movimiento, cantidad, referencia_id, referencia_tabla, comentario)
             VALUES (?, ?, 'DEVOLUCION_CLIENTE', ?, ?, 'ventas', ?)`,
      [id_producto, id_deposito_destino, cantidad, id_venta, comentario],
    );

    await connection.commit();
    return {
      success: true,
      mensaje: "Devolución procesada correctamente y stock actualizado.",
    };
  } catch (error) {
    if (connection) {
      await connection.rollback();
      console.error(
        `Transacción de devolución revertida debido a un error: ${error.message}`,
      );
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
async function obtenerStockPorDepositos() {
  const [rows] = await pool.execute(`
        SELECT 
            p.id, 
            p.codigo, 
            p.nombre as producto,
            SUM(CASE WHEN sd.id_deposito = 1 THEN sd.cantidad ELSE 0 END) as principal,
            SUM(CASE WHEN sd.id_deposito = 2 THEN sd.cantidad ELSE 0 END) as danado,
            SUM(CASE WHEN sd.id_deposito = 3 THEN sd.cantidad ELSE 0 END) as inmovilizado,
            SUM(sd.cantidad) as stock_total
        FROM productos p
        LEFT JOIN stock_depositos sd ON p.id = sd.id_producto
        GROUP BY p.id
    `);
  return rows;
}
async function obtenerValoracionInventario() {
  const [rows] = await pool.execute(`
        SELECT
            c.nombre as categoria,
            COUNT(p.id) as cantidad_productos,
            SUM(sd.cantidad) as unidades_totales,
            SUM(sd.cantidad * p.precio_costo) as inversion_total_costo,
            SUM(sd.cantidad * p.precio_venta) as valor_potencial_venta
        FROM productos p
        INNER JOIN categorias c ON p.id_categoria = c.id
        INNER JOIN stock_depositos sd ON p.id = sd.id_producto
        WHERE sd.id_deposito = 1 -- Valoramos solo lo que está para la venta
        GROUP BY c.id
        ORDER BY inversion_total_costo DESC
    `);
  return rows;
}
async function obtenerGananciasPorCategoria() {
  const query = `
    SELECT 
        c.nombre AS nombre_categoria, 
        SUM((dv.precio_unitario - p.precio_costo) * dv.cantidad) AS total_ganancia
    FROM detalle_ventas dv
    JOIN productos p ON dv.id_producto = p.id
    JOIN categorias c ON p.id_categoria = c.id
    GROUP BY c.nombre
`;
  const [rows] = await pool.execute(query);
  return rows;
}

const buscarProductosPredictivo = async (req, res, next) => {
  const { termino } = req.query;
  if (!termino || termino.length < 2) {
    return res.status(400).json({
      error: "El término de búsqueda debe tener al menos 2 caracteres.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT p.id, p.codigo, p.nombre, p.marca, p.precio_venta, p.precio_costo, p.descripcion, sd.cantidad as stock 
             FROM productos p
             JOIN stock_depositos sd ON p.id = sd.id_producto
             WHERE sd.id_deposito = 1 AND (p.nombre LIKE ? OR p.codigo LIKE ? OR p.marca LIKE ?)
             LIMIT 10`,
      [`%${termino}%`, `%${termino}%`, `%${termino}%`],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// ====================================================================
// CONSULTAR INVENTARIO — Endpoint flexible con filtros y ordenamiento
// ====================================================================
const consultarInventario = async (req, res, next) => {
  const {
    deposito = "todos",
    categoria = "",
    ordenar = "nombre",
    direccion = "ASC",
    modoCliente = "false",
  } = req.query;

  let connection;
  try {
    connection = await pool.getConnection();

    // Columnas permitidas para ORDER BY (prevenir SQL injection)
    const columnasPermitidas = {
      nombre: "p.nombre",
      codigo: "p.codigo",
      precio_venta: "p.precio_venta",
      precio_costo: "p.precio_costo",
      categoria: "c.nombre",
      stock: "sd.cantidad",
    };
    const columnaOrden = columnasPermitidas[ordenar] || "p.nombre";
    const dir = direccion.toUpperCase() === "DESC" ? "DESC" : "ASC";

    let query = `
      SELECT 
        p.id, p.codigo, p.nombre, p.marca, p.descripcion,
        p.precio_venta, p.precio_costo, p.id_categoria,
        p.ubicacion,
        c.nombre AS nombre_categoria,
        sd.cantidad AS stock_actual,
        sd.id_deposito
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      JOIN stock_depositos sd ON p.id = sd.id_producto
    `;

    const where = [];
    const params = [];

    // Filtro por depósito
    if (deposito && deposito !== "todos") {
      where.push("sd.id_deposito = ?");
      params.push(parseInt(deposito));
    }

    // Filtro por categoría
    if (categoria) {
      where.push("p.id_categoria = ?");
      params.push(parseInt(categoria));
    }

    if (where.length > 0) {
      query += " WHERE " + where.join(" AND ");
    }

    query += ` ORDER BY ${columnaOrden} ${dir}`;

    const [rows] = await connection.execute(query, params);

    // Si es modo cliente, eliminamos datos sensibles
    let finalRows = rows;
    if (modoCliente === "true") {
      finalRows = rows.map((r) => {
        const { precio_costo, ubicacion, stock_actual, ...rest } = r;
        // Calculamos disponibilidad para el dot en el backend si se desea,
        // pero el requerimiento pide el indicador visual.
        // Enviamos un flag de disponibilidad simplificado.
        let disponibilidad = "agotado";
        if (stock_actual > 10) disponibilidad = "disponible";
        else if (stock_actual > 0) disponibilidad = "pocas";

        return {
          ...rest,
          disponibilidad,
        };
      });
    }

    res.json({ success: true, data: finalRows });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// ====================================================================
// GENERAR REPORTE PDF DE INVENTARIO — Streaming con PDFKit
// ====================================================================
const generarReporteInventarioPDF = async (req, res, next) => {
  const {
    deposito = "todos",
    categoria = "",
    ordenar = "nombre",
    direccion = "ASC",
    incluirDescripcion = "false",
    incluirConteoFisico = "false",
  } = req.query;

  let connection;
  try {
    // 1. Obtener datos de la empresa (Centralizado desde DB)
    const [empresaData] = await pool.query(
      "SELECT razon_social AS nombre, rif, direccion, telefono, logo_path FROM empresa_datos WHERE id = 1",
    );
    const configEstática = getEmpresaConfig();
    const empresa = empresaData.length > 0 ? empresaData[0] : {
      nombre: configEstática.nombre,
      rif: configEstática.rif,
      direccion: configEstática.direccion,
      telefono: configEstática.telefono,
      logo_path: null
    };
    empresa.email = configEstática.email;

    connection = await pool.getConnection();

    // Construir query
    const columnasPermitidas = {
      nombre: "p.nombre",
      codigo: "p.codigo",
      precio_venta: "p.precio_venta",
      precio_costo: "p.precio_costo",
      categoria: "c.nombre",
      stock: "sd.cantidad",
    };
    const columnaOrden = columnasPermitidas[ordenar] || "p.nombre";
    const dir = direccion.toUpperCase() === "DESC" ? "DESC" : "ASC";

    let query = `
      SELECT 
        p.id, p.codigo, p.nombre, p.marca, p.descripcion,
        p.precio_venta, p.precio_costo,
        c.nombre AS nombre_categoria,
        sd.cantidad AS stock_actual,
        sd.id_deposito
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      JOIN stock_depositos sd ON p.id = sd.id_producto
    `;

    const where = [];
    const params = [];

    if (deposito && deposito !== "todos") {
      where.push("sd.id_deposito = ?");
      params.push(parseInt(deposito));
    }
    if (categoria) {
      where.push("p.id_categoria = ?");
      params.push(parseInt(categoria));
    }
    if (where.length > 0) {
      query += " WHERE " + where.join(" AND ");
    }
    query += ` ORDER BY ${columnaOrden} ${dir}`;

    const [productos] = await connection.execute(query, params);

    const nombresDeposito = {
      1: "Depósito Principal",
      2: "Mercancía Dañada",
      3: "Inmovilizado / Cuarentena",
      todos: "Todos los Depósitos",
    };
    const nombreDeposito = nombresDeposito[deposito] || "Todos los Depósitos";

    let nombreCategoria = "Todas las categorías";
    if (categoria) {
      const [catRow] = await connection.execute(
        "SELECT nombre FROM categorias WHERE id = ?",
        [parseInt(categoria)],
      );
      if (catRow.length > 0) nombreCategoria = catRow[0].nombre;
    }

    const mostrarDescripcion = incluirDescripcion === "true";
    const mostrarConteo = incluirConteoFisico === "true";

    // ======== GENERAR PDF CON JSPDF (Estandarizado) ========
    const doc = new jsPDF();
    doc.setLineWidth(0.01);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- LOGO ---
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error logo Inventario:", e);
      }
    }

    // --- ENCABEZADO ESTANDARIZADO ---
    let currentY = 15;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, currentY, 25, 25);
    }
    
    const textStartX = 45;
    const maxTextWidth = pageWidth - textStartX - 15;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const nombreSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nombreSplit, textStartX, currentY + 5);
    
    currentY += 5 + (nombreSplit.length * 5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);
    
    currentY += 5;
    const dirSplit = doc.splitTextToSize(`Dirección: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);
    
    currentY += (dirSplit.length * 4);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    // Título del reporte y fecha (Derecha) - Ajustado Y para evitar overlap
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE DE INVENTARIO", pageWidth - 15, 35, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 15, 42, { align: "right" });
    
    // Subtítulo de filtros
    currentY = Math.max(currentY + 10, 45);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Depósito: `, 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(nombreDeposito, 32, currentY);
    
    doc.setFont("helvetica", "bold");
    doc.text(`Categoría: `, 80, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(nombreCategoria, 100, currentY);

    // --- TABLA ---
    const headers = [["Código", "Producto", "Marca", "Categoría", "Stock"]];
    if (mostrarConteo) headers[0].push("Conteo Físico");
    
    const body = productos.map(p => {
        const row = [p.codigo, p.nombre, p.marca || "", p.nombre_categoria || "", p.stock_actual];
        if (mostrarConteo) row.push("_______");
        return row;
    });

    doc.autoTable({
        startY: currentY + 5,
        head: headers,
        body: body,
        theme: "grid",
        headStyles: { fillColor: [26, 82, 118], textColor: 255 },
        styles: { fontSize: 8, lineWidth: 0.01 },
        margin: { left: 14, right: 14 }
    });

    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// ====================================================================
// EXPORTAR INVENTARIO A EXCEL — Con fórmulas y formato profesional
// ====================================================================
const exportarInventarioExcel = async (req, res, next) => {
  const {
    deposito = "todos",
    categoria = "",
    ordenar = "nombre",
    direccion = "ASC",
    incluirDescripcion = "false",
  } = req.query;

  let connection;
  try {
    // 1. Obtener datos de la empresa (Centralizado desde DB)
    const [empresaData] = await pool.query(
      "SELECT razon_social AS nombre, rif, direccion, telefono, logo_path FROM empresa_datos WHERE id = 1",
    );
    const configEstática = getEmpresaConfig();
    const empresa = empresaData.length > 0 ? empresaData[0] : {
      nombre: configEstática.nombre,
      rif: configEstática.rif,
      direccion: configEstática.direccion,
      telefono: configEstática.telefono,
      logo_path: null
    };
    empresa.email = configEstática.email;
    connection = await pool.getConnection();

    // Lógica de consulta (IDÉNTICA a consultarInventario para consistencia)
    const columnasPermitidas = {
      nombre: "p.nombre",
      codigo: "p.codigo",
      precio_venta: "p.precio_venta",
      precio_costo: "p.precio_costo",
      categoria: "c.nombre",
      stock: "sd.cantidad",
    };
    const columnaOrden = columnasPermitidas[ordenar] || "p.nombre";
    const dirStr = direccion.toUpperCase() === "DESC" ? "DESC" : "ASC";

    let query = `
      SELECT 
        p.id, p.codigo, p.nombre, p.marca, p.descripcion,
        p.precio_venta, p.precio_costo,
        c.nombre AS nombre_categoria,
        sd.cantidad AS stock_actual,
        sd.id_deposito
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      JOIN stock_depositos sd ON p.id = sd.id_producto
    `;

    const where = [];
    const params = [];

    if (deposito && deposito !== "todos") {
      where.push("sd.id_deposito = ?");
      params.push(parseInt(deposito));
    }
    if (categoria) {
      where.push("p.id_categoria = ?");
      params.push(parseInt(categoria));
    }
    if (where.length > 0) {
      query += " WHERE " + where.join(" AND ");
    }
    query += ` ORDER BY ${columnaOrden} ${dirStr}`;

    const [productos] = await connection.execute(query, params);

    // Sanitizar datos para Excel
    const rowsSanitized = productos.map((row) => {
      const newRow = { ...row };
      Object.keys(newRow).forEach((key) => {
        if (newRow[key] === null || newRow[key] === undefined) {
          newRow[key] = "";
        }
      });
      return newRow;
    });

    // Nombre del depósito para el título
    const nombresDeposito = {
      1: "Depósito Principal",
      2: "Mercancía Dañada",
      3: "Inmovilizado / Cuarentena",
      todos: "Todos los Depósitos",
    };
    const nombreDeposito = nombresDeposito[deposito] || "Todos los Depósitos";

    // Nombre de categoría
    let nombreCategoria = "Todas las categorías";
    if (categoria) {
      const [catRow] = await connection.execute(
        "SELECT nombre FROM categorias WHERE id = ?",
        [parseInt(categoria)],
      );
      if (catRow.length > 0) nombreCategoria = catRow[0].nombre;
    }

    // ======== CREACIÓN DEL LIBRO EXCEL ========
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventario");

    // --- ENCABEZADO CORPORATIVO ---
    const logoPath = path.join(__dirname, "../../Frontend/img/logo.png");
    const logoExists = fs.existsSync(logoPath);

    if (logoExists) {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: "png",
      });
      sheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 100, height: 60 },
      });
    }

    // Datos de la empresa (Filas 1-4)
    sheet.mergeCells("B1:D1");
    const cellNombre = sheet.getCell("B1");
    cellNombre.value = empresa.nombre;
    cellNombre.font = {
      name: "Arial Black",
      size: 14,
      color: { argb: "1A5276" },
    };

    sheet.mergeCells("B2:D2");
    sheet.getCell("B2").value = `RIF: ${empresa.rif}`;
    sheet.mergeCells("B3:D3");
    sheet.getCell("B3").value = empresa.direccion;
    sheet.mergeCells("B4:D4");
    sheet.getCell("B4").value = `Teléfono: ${empresa.telefono} | Email: ${empresa.email || ""}`;

    // Título del Reporte (Derecha)
    sheet.mergeCells("F1:H2");
    const cellTitulo = sheet.getCell("F1");
    cellTitulo.value = "REPORTE DE INVENTARIO";
    cellTitulo.font = { size: 16, bold: true, color: { argb: "1A5276" } };
    cellTitulo.alignment = { horizontal: "right", vertical: "middle" };

    const fechaActual = new Date().toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    sheet.mergeCells("F3:H3");
    const cellFecha = sheet.getCell("F3");
    cellFecha.value = `Fecha: ${fechaActual}`;
    cellFecha.alignment = { horizontal: "right" };
    cellFecha.font = { size: 9, color: { argb: "555555" } };

    // Línea divisoria
    sheet.getRow(6).border = {
      bottom: { style: "thick", color: { argb: "1A5276" } },
    };

    // Filtros
    sheet.getCell("A7").value = "Depósito:";
    sheet.getCell("A7").font = { bold: true, color: { argb: "1A5276" } };
    sheet.getCell("B7").value = nombreDeposito;

    sheet.getCell("E7").value = "Categoría:";
    sheet.getCell("E7").font = { bold: true, color: { argb: "1A5276" } };
    sheet.getCell("F7").value = nombreCategoria;

    sheet.getCell("A8").value = "Orden:";
    sheet.getCell("A8").font = { bold: true, color: { argb: "1A5276" } };
    const ordenTextos = {
      nombre: "Nombre",
      codigo: "Código",
      precio_venta: "Precio Venta",
      precio_costo: "Precio Costo",
      categoria: "Categoría",
      stock: "Stock",
    };
    const currentDir =
      direccion.toUpperCase() === "DESC" ? "Descendente" : "Ascendente";
    sheet.getCell("B8").value =
      `${ordenTextos[ordenar] || "Nombre"} (${currentDir})`;

    sheet.getCell("E8").value = "Total productos:";
    sheet.getCell("E8").font = { bold: true, color: { argb: "1A5276" } };
    sheet.getCell("F8").value = productos.length;

    // --- TABLA DE DATOS (Inicia en fila 10) ---
    const startRow = 10;
    const colsDefinition = [
      { header: "Código", key: "codigo", width: 15 },
      { header: "Producto", key: "nombre", width: 35 },
      { header: "Marca", key: "marca", width: 15 },
      { header: "Categoría", key: "categoria", width: 20 },
    ];

    if (incluirDescripcion === "true") {
      colsDefinition.push({
        header: "Descripción",
        key: "descripcion",
        width: 40,
      });
    }

    colsDefinition.push(
      { header: "Stock", key: "stock", width: 10 },
      { header: "Costo Unit. ($)", key: "costo", width: 15 },
      { header: "Precio Venta ($)", key: "precio", width: 15 },
      { header: "Valor Total Stock ($)", key: "valor_total", width: 20 },
    );

    // Aplicar encabezados
    const headerRow = sheet.getRow(startRow);
    colsDefinition.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      sheet.getColumn(i + 1).key = col.key;
      sheet.getColumn(i + 1).width = col.width;
    });

    // Estilo al encabezado de la tabla
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2C3E50" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Agregar datos
    rowsSanitized.forEach((prod, index) => {
      const rowNum = startRow + index + 1;
      const rowData = {
        codigo: prod.codigo,
        nombre: prod.nombre,
        marca: prod.marca || "—",
        categoria: prod.nombre_categoria || "Sin cat.",
        stock: parseInt(prod.stock_actual || 0),
        costo: parseFloat(prod.precio_costo || 0),
        precio: parseFloat(prod.precio_venta || 0),
        valor_total: {
          formula: `${sheet.getColumn("stock").letter}${rowNum} * ${sheet.getColumn("costo").letter}${rowNum}`,
        },
      };

      if (incluirDescripcion === "true") {
        rowData.descripcion = prod.descripcion || "—";
      }

      const row = sheet.addRow(rowData);
      row.getCell("stock").alignment = { horizontal: "center" };
    });

    // Formatear columnas
    sheet.getColumn("costo").numFmt = '"$"#,##0.00';
    sheet.getColumn("precio").numFmt = '"$"#,##0.00';
    sheet.getColumn("valor_total").numFmt = '"$"#,##0.00';

    // ======== FILA DE TOTALES ========
    const lastDataRow = startRow + productos.length;
    const totalRow = sheet.addRow({});

    const stockColLetter = sheet.getColumn("stock").letter;
    const valorColLetter = sheet.getColumn("valor_total").letter;

    const labelCell = totalRow.getCell(sheet.getColumn("precio").letter);
    labelCell.value = "VALORACIÓN TOTAL:";
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: "right" };

    totalRow.getCell("stock").value = {
      formula: `SUM(${stockColLetter}${startRow + 1}:${stockColLetter}${lastDataRow})`,
    };
    totalRow.getCell("valor_total").value = {
      formula: `SUM(${valorColLetter}${startRow + 1}:${valorColLetter}${lastDataRow})`,
    };

    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "medium" } };
    });
    totalRow.getCell("valor_total").numFmt = '"$"#,##0.00';
    totalRow.getCell("valor_total").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "F1C40F" },
    };

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `inventario_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// ============================================
// FUNCIONES DEL DASHBOARD
// ============================================

/**
 * obtenerVentasMensuales – Últimos 6 meses de ventas agrupados por mes.
 * Usado para el gráfico de líneas "Tendencia de Ventas".
 */
async function obtenerVentasMensuales() {
  const [rows] = await pool.execute(`
    SELECT 
      DATE_FORMAT(v.fecha_venta, '%Y-%m') AS mes,
      DATE_FORMAT(v.fecha_venta, '%b %Y') AS etiqueta,
      COUNT(v.id) AS total_transacciones,
      IFNULL(SUM(v.total), 0) AS total_ventas
    FROM ventas v
    WHERE v.fecha_venta >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY mes, etiqueta
    ORDER BY mes ASC
  `);
  return rows;
}

/**
 * obtenerGananciasHoy – Resumen financiero del día actual.
 * Devuelve ingresos, costo de mercancía y utilidad neta del día.
 */
async function obtenerGananciasHoy() {
  const [rows] = await pool.execute(`
    SELECT 
      COUNT(DISTINCT v.id) AS total_ventas,
      IFNULL(SUM(dv.cantidad * dv.precio_unitario), 0) AS ingresos_totales,
      IFNULL(SUM(dv.cantidad * p.precio_costo), 0) AS costo_mercancia,
      IFNULL(SUM(dv.cantidad * dv.precio_unitario) - SUM(dv.cantidad * p.precio_costo), 0) AS utilidad_neta
    FROM ventas v
    JOIN detalle_ventas dv ON v.id = dv.id_venta
    JOIN productos p ON dv.id_producto = p.id
    WHERE DATE(v.fecha_venta) = CURDATE()
  `);
  return rows[0];
}

/**
 * obtenerLoMasVendido – Top 5 productos para widget.
 */
async function obtenerLoMasVendido() {
  const [rows] = await pool.execute(`
    SELECT 
      p.nombre AS producto,
      p.codigo,
      SUM(dv.cantidad) AS cantidad_vendida,
      SUM(dv.cantidad * dv.precio_unitario) AS total_generado
    FROM detalle_ventas dv
    JOIN productos p ON dv.id_producto = p.id
    JOIN ventas v ON dv.id_venta = v.id
    GROUP BY p.id, p.nombre, p.codigo
    ORDER BY cantidad_vendida DESC
    LIMIT 5
  `);
  return rows;
}

/**
 * obtenerDashboardKPIs – Endpoint combinado para las 4 tarjetas KPI del dashboard.
 * 1. Ventas del Día: sumatoria total de ventas realizadas hoy.
 * 2. Ganancia Estimada del Mes: ingresos – costos del mes actual.
 * 3. Transacciones del día: número de ventas registradas hoy.
 * 4. Producto Top del mes: producto que más utilidad generó este mes.
 */
async function obtenerDashboardKPIs() {
  // 1 & 3. Ventas del día y número de transacciones
  const [ventasDia] = await pool.execute(`
    SELECT 
      COUNT(DISTINCT v.id) AS transacciones_hoy,
      IFNULL(SUM(v.total), 0) AS total_ventas_hoy
    FROM ventas v
    WHERE DATE(v.fecha_venta) = CURDATE()
  `);

  // 2. Ganancia estimada del mes (ingresos - costos)
  const [gananciasMes] = await pool.execute(`
    SELECT 
      IFNULL(SUM(dv.cantidad * dv.precio_unitario), 0) AS ingresos_mes,
      IFNULL(SUM(dv.cantidad * p.precio_costo), 0) AS costo_mes,
      IFNULL(SUM(dv.cantidad * dv.precio_unitario) - SUM(dv.cantidad * p.precio_costo), 0) AS ganancia_estimada
    FROM ventas v
    JOIN detalle_ventas dv ON v.id = dv.id_venta
    JOIN productos p ON dv.id_producto = p.id
    WHERE MONTH(v.fecha_venta) = MONTH(CURDATE()) AND YEAR(v.fecha_venta) = YEAR(CURDATE())
  `);

  // 4. Producto que más utilidad genera este mes
  const [topProducto] = await pool.execute(`
    SELECT 
      p.nombre AS producto,
      IFNULL(SUM((dv.precio_unitario - p.precio_costo) * dv.cantidad), 0) AS utilidad
    FROM detalle_ventas dv
    JOIN productos p ON dv.id_producto = p.id
    JOIN ventas v ON dv.id_venta = v.id
    WHERE MONTH(v.fecha_venta) = MONTH(CURDATE()) AND YEAR(v.fecha_venta) = YEAR(CURDATE())
    GROUP BY p.id, p.nombre
    ORDER BY utilidad DESC
    LIMIT 1
  `);

  return {
    ventas_hoy: parseFloat(ventasDia[0].total_ventas_hoy) || 0,
    transacciones_hoy: parseInt(ventasDia[0].transacciones_hoy) || 0,
    ganancia_estimada_mes: parseFloat(gananciasMes[0].ganancia_estimada) || 0,
    producto_top:
      topProducto.length > 0 ? topProducto[0].producto : "Sin datos",
    producto_top_utilidad:
      topProducto.length > 0 ? parseFloat(topProducto[0].utilidad) : 0,
  };
}

module.exports = {
  procesarNuevaCompra,
  obtenerProductoPorId,
  obtenerTodosLosProductos,
  crearProducto,
  procesarDevolucion,
  obtenerStockPorDepositos,
  actualizarProducto,
  procesarAjusteInventario,
  trasladarMercancia,
  obtenerValoracionInventario,
  obtenerStockCritico,
  obtenerGananciasTienda,
  obtenerGananciasHoy,
  obtenerVentasPorVendedor,
  registrarUsuario,
  obtenerUsuarios,
  actualizarUsuario,
  eliminarUsuario,
  loginUsuario,
  obtenerKardexProducto,
  obtenerHistorialCierres,
  obtenerReporteTomaFisica,
  obtenerVentasMensuales,
  obtenerProductosMasVendidos,
  obtenerVentasPorMetodoPago,
  obtenerInventarioCritico,
  obtenerGananciasPorCategoria,
  obtenerTodasLasCategorias,
  eliminarProducto,
  buscarProductosPredictivo,
  realizarVenta,
  procesarDevolucionInteligente,
  moverAInmovilizado,
  consultarInventario,
  generarReporteInventarioPDF,
  exportarInventarioExcel,
  obtenerLoMasVendido,
  obtenerDashboardKPIs,
};
