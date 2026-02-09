const pool = require("../db");
const bcrypt = require("bcrypt");
const { actualizarStockDeposito } = require("../services/inventario.service");

// 1. OBTENER PRODUCTO POR ID
const obtenerProductoPorId = async (req, res, next) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT p.*, c.nombre as nombre_categoria, p.marca,
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
    connection = await pool.getConnection();
    const [rows] = await connection.execute(`
            SELECT 
                p.id, 
                p.codigo, 
                p.nombre, 
                p.marca,
                p.descripcion,
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
    res.status(200).json(rows);
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
      (codigo, nombre, marca, descripcion, precio_venta, precio_costo, id_categoria, stock_minimo, stock) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
            metodo_pago,
            COUNT(id) AS cantidad_transacciones,
            IFNULL(SUM(total), 0) AS total_recaudado  -- CAMBIADO: total_bruto -> total
        FROM ventas
    `;

  const whereConditions = [];
  if (fechaInicio && fechaFin) {
    whereConditions.push(`DATE(fecha_venta) BETWEEN ? AND ?`);
    params.push(fechaInicio, fechaFin);
  } else if (fechaInicio) {
    whereConditions.push(`DATE(fecha_venta) >= ?`);
    params.push(fechaInicio);
  } else if (fechaFin) {
    whereConditions.push(`DATE(fecha_venta) <= ?`);
    params.push(fechaFin);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(" AND ")}`;
  }

  query += `
        GROUP BY metodo_pago
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
async function actualizarProducto(id, datos) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

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

    const [res] = await connection.execute(
      `UPDATE productos 
             SET codigo = ?, nombre = ?, marca = ?, precio_venta = ?, precio_costo = ? 
             WHERE id = ?`,
      [
        datos.codigo,
        datos.nombre,
        datos.marca,
        datos.precio_venta,
        datos.precio_costo,
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
  realizarVenta, // Nueva función
  procesarDevolucionInteligente, // Nueva función
  moverAInmovilizado, // Nueva función
};
