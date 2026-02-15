const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");

module.exports = {};

const anularVenta = async (req, res, next) => {
  // Nota del Aprendiz: // Estamos normalizando la nomenclatura de la base de datos. Corregimos las referencias a 'id_producto' por 'id' en la tabla de productos y sincronizamos el campo de relación del cierre diario para que la anulación y el cierre definitivo operen sin errores de sintaxis SQL.
  const { id } = req.params; // id de la venta a anular

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validar que la venta exista y no esté ya anulada
    const [ventaRows] = await connection.query(
      "SELECT estado FROM ventas WHERE id = ? FOR UPDATE",
      [id],
    );

    if (ventaRows.length === 0) {
      throw new Error(`La venta con ID ${id} no existe.`);
    }
    if (ventaRows[0].estado === "Anulada") {
      return res
        .status(400)
        .json({ message: "La venta ya ha sido anulada previamente." });
    }

    // Paso A: Cambiar el estado de la venta a 'Anulada'
    await connection.query(
      "UPDATE ventas SET estado = 'Anulada' WHERE id = ?",
      [id],
    );

    // Paso B: Buscar todos los productos de esa venta en detalle_ventas
    const [detalles] = await connection.query(
      "SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = ?",
      [id],
    );

    if (detalles.length === 0) {
      console.warn(
        `La venta ${id} fue anulada pero no tenía detalles asociados para revertir stock.`,
      );
    }

    // Paso C: Devolver las cantidades al inventario (id_deposito = 1, Principal)
    for (const detalle of detalles) {
      await connection.query(
        "UPDATE stock_depositos SET cantidad = cantidad + ? WHERE id_producto = ? AND id_deposito = 1",
        [detalle.cantidad, detalle.id_producto],
      );

      // Recalcular el stock total del producto en la tabla `productos`
      const [totalStockResult] = await connection.query(
        `SELECT SUM(cantidad) AS total_cantidad FROM stock_depositos WHERE id_producto = ?`,
        [detalle.id_producto],
      );
      const totalStock = totalStockResult[0].total_cantidad || 0;

      await connection.query("UPDATE productos SET stock = ? WHERE id = ?", [
        totalStock,
        detalle.id_producto,
      ]);
    }
    await connection.commit();
    res
      .status(200)
      .json({ message: "Venta anulada y stock restaurado exitosamente." });
  } catch (error) {
    await connection.rollback();
    console.error(`Error al anular venta ${id}:`, error.message);
    next(error);
  } finally {
    connection.release();
  }
};

const buscarVentasPorCedula = async (req, res, next) => {
  // Implementamos el endpoint dedicado de búsqueda por cliente. Usamos un JOIN explícito para vincular el historial de ventas con la identidad del comprador, resolviendo el error 404 y permitiendo al usuario auditar transacciones pasadas rápidamente.
  console.log("Buscando ventas para cédula:", req.params.cedula);
  try {
    const { cedula } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const searchTerm = `%${cedula}%`;

    // Consulta para obtener el número total de ventas que coinciden
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as total
             FROM ventas v 
             INNER JOIN clientes c ON v.id_cliente = c.id 
             WHERE c.rif_cedula LIKE ?`,
      [searchTerm],
    );
    const totalVentas = totalRows[0].total;

    // Consulta para obtener las ventas paginadas
    const [rows] = await pool.query(
      `SELECT v.id, v.numero_control, v.fecha_venta, v.total as total, v.estado, c.razon_social AS cliente_nombre 
             FROM ventas v 
             INNER JOIN clientes c ON v.id_cliente = c.id 
             WHERE c.rif_cedula LIKE ?
             ORDER BY v.fecha_venta DESC
             LIMIT ? OFFSET ?`,
      [searchTerm, limit, offset],
    );

    res.json({
      total: totalVentas,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

const getSaleDetails = async (req, res, next) => {
  try {
    const { id: id_venta } = req.params;

    const [saleDetails] = await pool.query(
      `SELECT 
         dv.id_producto,
         p.nombre AS descripcion,
         dv.cantidad AS cantidad_original,
         dv.precio_unitario
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id
       WHERE dv.id_venta = ?`,
      [id_venta],
    );

    if (saleDetails.length === 0) {
      return res
        .status(404)
        .json({ message: "Detalles de venta no encontrados" });
    }

    res.status(200).json(saleDetails);
  } catch (error) {
    console.error("Error al obtener detalles de la venta:", error);
    next(error);
  }
};

const obtenerDetallesVenta = async (req, res, next) => {
  // Nota del Aprendiz: // Estamos habilitando la lectura de los renglones de la factura. Sin 'obtenerDetallesVenta', el modal de devolución está 'ciego' y no puede mostrar qué artículos están disponibles para retornar al inventario. Con esto, restauramos la trazabilidad completa de la venta.
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
         dv.id_producto,
         p.nombre,
         dv.cantidad AS cantidad_vendida,
         dv.precio_unitario
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id
       WHERE dv.id_venta = ?`,
      [id],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

const procesarDevolucion = async (req, res, next) => {
  const id_venta_num = parseInt(req.params.id, 10);
  const { id_motivo, comentario, id_deposito, detalles } = req.body;

  if (isNaN(id_venta_num)) {
    return res.status(400).json({ error: "ID de venta inválido." });
  }

  if (!id_motivo || !id_deposito || !detalles || !Array.isArray(detalles)) {
    return res.status(400).json({
      error:
        "Faltan datos requeridos: id_motivo, id_deposito y una lista de detalles son obligatorios.",
    });
  }

  const detallesAProcesar = detalles.filter(
    (d) => d.cantidad && parseInt(d.cantidad, 10) > 0,
  );

  if (detallesAProcesar.length === 0) {
    return res.status(400).json({
      error: "Debe ingresar al menos una cantidad válida para procesar",
    });
  }

  const id_deposito_num = parseInt(id_deposito, 10);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [ventaData] = await connection.query(
      "SELECT id_cliente FROM ventas WHERE id = ?",
      [id_venta_num],
    );
    if (ventaData.length === 0) {
      throw new Error(`La venta con ID ${id_venta_num} no fue encontrada.`);
    }
    const id_cliente = ventaData[0].id_cliente;

    const [devolucionResult] = await connection.query(
      "INSERT INTO devoluciones (id_venta, id_cliente, id_motivo, comentario, fecha_devolucion) VALUES (?, ?, ?, ?, ?)",
      [id_venta_num, id_cliente, id_motivo, comentario || "", new Date()],
    );
    const id_devolucion = devolucionResult.insertId;

    for (const producto of detallesAProcesar) {
      const id_producto_num = parseInt(producto.id_producto, 10);
      const cantidad = parseInt(producto.cantidad, 10);

      const [detalleVentaRows] = await connection.query(
        "SELECT precio_unitario FROM detalle_ventas WHERE id_venta = ? AND id_producto = ?",
        [id_venta_num, id_producto_num],
      );

      if (detalleVentaRows.length === 0) {
        throw new Error(
          `El producto con ID ${id_producto_num} no pertenece a la venta original con ID ${id_venta_num} y no puede ser devuelto.`,
        );
      }
      const precio_unitario = detalleVentaRows[0].precio_unitario;

      await connection.query(
        "INSERT INTO detalle_devoluciones (id_devolucion, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)",
        [id_devolucion, id_producto_num, cantidad, precio_unitario],
      );

      await connection.query(
        "INSERT INTO movimientos_inventario (id_producto, id_deposito, tipo_movimiento, cantidad, id_cliente, referencia_id) VALUES (?, ?, 'DEVOLUCION', ?, ?, ?)",
        [id_producto_num, id_deposito_num, cantidad, id_cliente, id_devolucion],
      );

      await connection.query(
        `INSERT INTO stock_depositos (id_producto, id_deposito, cantidad) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE cantidad = cantidad + ?`,
        [id_producto_num, id_deposito_num, cantidad, cantidad],
      );

      if (id_deposito_num === 1) {
        // 1 = Venta (Principal). Solo sumamos al stock general disponible para venta si entra al depósito 1.
        await connection.query(
          "UPDATE productos SET stock = stock + ? WHERE id = ?",
          [cantidad, id_producto_num],
        );
      } else {
        // Si el producto va a "Dañado" (id=2) u otro depósito no comercial,
        // NO actualizamos la tabla 'productos' (stock general), solo 'stock_depositos'.
        console.log(
          `Devolución: Producto ${id_producto_num} enviado a depósito ${id_deposito_num} (No disponible para venta).`,
        );
      }
    }

    // Siempre se marca la venta como 'Devuelta' para reflejar que ha tenido una devolución.
    await connection.query(
      "UPDATE ventas SET estado = 'Devuelta' WHERE id = ?",
      [id_venta_num],
    );

    await connection.commit();
    res
      .status(201)
      .json({ message: "Devolución procesada exitosamente", id_devolucion });
  } catch (error) {
    await connection.rollback();
    console.error(`Error al procesar devolución: ${error.message}`);
    next(error);
  } finally {
    connection.release();
  }
};

const generarPDFDevolucion = async (req, res, next) => {
  try {
    const { id } = req.params; // ID de la devolución

    // 1. Obtener datos de la devolución, la venta original y el cliente.
    const [devolucionData] = await pool.query(
      `SELECT d.id AS id_devolucion, d.fecha, d.comentario,
              v.id AS id_venta, v.numero_control, v.fecha_venta, v.tasa_bcv,
              c.razon_social, c.rif_cedula, c.direccion_fiscal, c.telefono,
              m.motivo
       FROM devoluciones d
       JOIN ventas v ON d.id_venta = v.id
       JOIN clientes c ON v.id_cliente = c.id
       LEFT JOIN motivos_devolucion m ON d.id_motivo = m.id
       WHERE d.id = ?`,
      [id],
    );

    if (devolucionData.length === 0) {
      return res.status(404).json({ message: "Devolución no encontrada" });
    }
    const devolucion = devolucionData[0];

    // 2. Obtener los productos devueltos a partir de los movimientos de inventario
    // y cruzarlos con detalle_ventas para obtener el precio original.
    const [detallesDevolucion] = await pool.query(
      `SELECT 
         mi.cantidad,
         p.nombre AS descripcion,
         dv.precio_unitario,
         (mi.cantidad * dv.precio_unitario) AS total
       FROM movimientos_inventario mi
       JOIN productos p ON mi.id_producto = p.id
       JOIN detalle_ventas dv ON mi.id_producto = dv.id_producto AND dv.id_venta = ?
       WHERE mi.id_referencia_externa = ? AND mi.tipo_movimiento = 'Entrada por Devolución'`,
      [devolucion.id_venta, id],
    );

    // --- INICIALIZACIÓN Y CONFIGURACIÓN DEL DOCUMENTO ---
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const safeParseFloat = (value) => parseFloat(value) || 0.0;

    // --- ENCABEZADO Y TÍTULO ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("COMPROBANTE DE DEVOLUCIÓN", pageWidth / 2, 25, {
      align: "center",
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Devolución N°: ${devolucion.id_devolucion}`, 14, 40);
    doc.text(
      `Fecha Devolución: ${new Date(devolucion.fecha).toLocaleDateString(
        "es-VE",
      )}`,
      14,
      46,
    );

    doc.text(`Venta Original N°: ${devolucion.id_venta}`, pageWidth - 70, 40);
    doc.text(
      `Fecha Venta: ${new Date(devolucion.fecha_venta).toLocaleDateString(
        "es-VE",
      )}`,
      pageWidth - 70,
      46,
    );

    // --- BLOQUE DE CLIENTE ---
    doc.setDrawColor(200);
    doc.rect(14, 52, pageWidth - 28, 22);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE:", 18, 58);
    doc.setFont("helvetica", "normal");
    doc.text(`${devolucion.razon_social}`, 40, 58);
    doc.text(`C.I./RIF: ${devolucion.rif_cedula}`, 18, 64);
    doc.text(`Dirección: ${devolucion.direccion_fiscal || "N/A"}`, 18, 70);

    // --- TABLA DE ARTÍCULOS DEVUELTOS ---
    const tableBody = detallesDevolucion.map((d) => [
      d.cantidad,
      d.descripcion,
      `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
      `$${safeParseFloat(d.total).toFixed(2)}`,
    ]);

    doc.autoTable({
      startY: 78,
      head: [["Cant. Devuelta", "Descripción", "Precio Unit.", "Subtotal"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: 255,
        fontStyle: "bold",
      },
    });

    // --- BLOQUE DE TOTALES ---
    let finalY = doc.lastAutoTable.finalY || 80;
    const montoTotalDevuelto = detallesDevolucion.reduce(
      (sum, item) => sum + safeParseFloat(item.total),
      0,
    );
    const totalDevueltoBs =
      montoTotalDevuelto * safeParseFloat(devolucion.tasa_bcv);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("MONTO TOTAL A FAVOR DEL CLIENTE:", pageWidth - 95, finalY + 15, {
      align: "left",
    });
    doc.text(`$${montoTotalDevuelto.toFixed(2)}`, pageWidth - 15, finalY + 15, {
      align: "right",
    });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Equivalente a: ${totalDevueltoBs.toFixed(2)} Bs. (Tasa: ${safeParseFloat(devolucion.tasa_bcv).toFixed(2)})`,
      pageWidth - 15,
      finalY + 21,
      { align: "right" },
    );

    finalY += 25;

    // --- MOTIVO Y COMENTARIOS ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Motivo de la Devolución:", 14, finalY + 10);
    doc.setFont("helvetica", "normal");
    doc.text(devolucion.motivo || "No especificado", 55, finalY + 10);

    if (devolucion.comentario) {
      doc.setFont("helvetica", "italic");
      const splitComentario = doc.splitTextToSize(
        `Comentario: ${devolucion.comentario}`,
        pageWidth - 28,
      );
      doc.text(splitComentario, 14, finalY + 16);
    }

    // --- PIE DE PÁGINA ---
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const footerText =
      "Este documento certifica la devolución de los artículos listados y el crédito generado a favor del cliente. El ajuste de inventario ha sido procesado.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 28);
    doc.text(splitFooter, 14, pageHeight - 20);

    // --- ENVIAR PDF ---
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error al generar el PDF de devolución:", error);
    next(error);
  }
};

const obtenerVentaDetalles = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT dv.*, p.nombre AS nombre_producto 
             FROM detalle_ventas dv 
             JOIN productos p ON dv.id_producto = p.id 
             WHERE dv.id_venta = ?`,
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Detalles de venta no encontrados." });
    }
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

const obtenerMotivosDevolucion = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM motivos_devolucion");
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

const obtenerVentas = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM ventas ORDER BY fecha DESC LIMIT 100",
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

// Esta función se encarga de procesar una venta completa.
// Es una operación "atómica", lo que significa que o todo sale bien, o no se hace nada.
const procesarVenta = async (req, res, next) => {
  // 1. Log del body recibido para depuración.
  console.log(
    "Procesando venta. Body recibido:",
    JSON.stringify(req.body, null, 2),
  );

  // 2. Estandarizar la extracción de datos del body.
  const {
    id_cliente,
    tasa_bcv,
    pagos, // Recibimos array de pagos
    detalles, // Se espera 'detalles', no 'productos'.
    subtotal,
    impuesto, // Frontend puede enviar 'iva' o 'impuesto', manejamos ambos.
    iva,
    total,
    monto_flete,
  } = req.body;

  const impuestoFinal = impuesto !== undefined ? impuesto : iva;
  const id_usuario = req.user?.id || 1; // Corregido: el token JWT usa 'id', no 'id_usuario'

  // 3. Validación refinada y explícita.
  if (
    id_cliente === undefined ||
    id_cliente === null ||
    !pagos ||
    !Array.isArray(pagos) ||
    pagos.length === 0 ||
    tasa_bcv === undefined ||
    !detalles ||
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    subtotal === undefined ||
    impuestoFinal === undefined ||
    total === undefined
  ) {
    console.error("Fallo de validación en procesarVenta. Datos evaluados:", {
      id_cliente,
      pagos_count: pagos ? pagos.length : 0,
      tasa_bcv,
      has_detalles: !!(detalles && detalles.length > 0),
      subtotal,
      impuesto: impuestoFinal,
      total,
    });
    return res
      .status(400)
      .json({ message: "Datos de venta incompletos o mal formados." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Generación Automática de N° Control
    let numero_control_val;
    const [lastControlNum] = await connection.query(
      "SELECT numero_control FROM ventas ORDER BY id DESC LIMIT 1",
    );

    if (lastControlNum.length > 0 && lastControlNum[0].numero_control) {
      const lastNum = parseInt(lastControlNum[0].numero_control, 10);
      numero_control_val = (lastNum + 1).toString().padStart(5, "0");
    } else {
      numero_control_val = "00001";
    }

    // Inserción en la tabla 'ventas'
    const [ventaResult] = await connection.query(
      `INSERT INTO ventas 
        (id_cliente, id_usuario, subtotal, impuesto, total, tasa_bcv, fecha_venta, numero_control, monto_flete, estado, estado_cierre) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'COMPLETADA', 'PENDIENTE')`,
      [
        id_cliente,
        id_usuario,
        subtotal,
        impuestoFinal,
        total,
        tasa_bcv,
        numero_control_val,
        monto_flete || 0.0,
      ],
    );
    const id_venta = ventaResult.insertId;

    // Procesamiento de Pagos (Tabla 1:N)
    for (const pago of pagos) {
      // Se asume que el objeto pago tiene { metodo, monto, referencia }
      await connection.query(
        "INSERT INTO venta_pagos (id_venta, metodo_pago, monto_pago, referencia) VALUES (?, ?, ?, ?)",
        [id_venta, pago.metodo, pago.monto, pago.referencia || null],
      );
    }

    // Procesamiento de detalles de la venta.
    for (const detalle of detalles) {
      const { id_producto, cantidad, precio_unitario } = detalle;

      if (!id_producto || cantidad <= 0 || precio_unitario === undefined) {
        throw new Error(`El detalle del producto ${id_producto} es inválido.`);
      }

      await connection.query(
        "INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)",
        [id_venta, id_producto, cantidad, precio_unitario],
      );

      const [stockRows] = await connection.query(
        "SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1 FOR UPDATE",
        [id_producto],
      );

      if (stockRows.length === 0 || stockRows[0].cantidad < cantidad) {
        throw new Error(
          `Stock insuficiente para el producto ID: ${id_producto}.`,
        );
      }

      // Restar stock del depósito principal.
      await connection.query(
        "UPDATE stock_depositos SET cantidad = cantidad - ? WHERE id_producto = ? AND id_deposito = 1",
        [cantidad, id_producto],
      );

      // 4. Recalcular y actualizar el stock total en la tabla `productos`.
      const [totalStockResult] = await connection.query(
        `SELECT SUM(cantidad) AS total_cantidad FROM stock_depositos WHERE id_producto = ?`,
        [id_producto],
      );
      const totalStock = totalStockResult[0].total_cantidad || 0;

      await connection.query("UPDATE productos SET stock = ? WHERE id = ?", [
        totalStock,
        id_producto,
      ]);
    }

    await connection.commit();
    res
      .status(201)
      .json({ message: "Venta procesada exitosamente.", id_venta });
  } catch (error) {
    await connection.rollback();
    console.error("Error en procesarVenta:", error.message);
    // Asignar statusCode para el middleware de errores.
    error.statusCode = error.message.startsWith("Stock insuficiente")
      ? 409
      : 400;
    next(error);
  } finally {
    connection.release();
  }
};
const obtenerUltimaTasa = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT tasa FROM tasas_cambio ORDER BY fecha DESC LIMIT 1",
    );
    if (rows.length > 0) {
      return res.json(rows[0]);
    }
    console.warn(
      "No se encontraron tasas en 'tasas_cambio'. Intentando fallback.",
    );
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      console.warn("Tabla 'tasas_cambio' no encontrada. Intentando fallback.");
    } else {
      return next(error);
    }
  }

  // Fallback
  try {
    const [configRows] = await pool.query(
      "SELECT valor FROM configuracion WHERE clave = 'tasa_bcv_predeterminada' LIMIT 1",
    );
    if (configRows.length > 0) {
      const tasa = parseFloat(configRows[0].valor);
      return res.json({ tasa });
    }
  } catch (configError) {
    if (configError.code === "ER_NO_SUCH_TABLE") {
      console.warn("Tabla 'configuracion' de fallback no encontrada.");
    } else {
      console.error("Error al buscar tasa en 'configuracion'.", configError);
    }
  }

  // Si todo lo demás falla
  res.status(404).json({
    message:
      "No se pudo determinar la tasa de cambio. Por favor, configúrela en la base de datos.",
  });
};
const generarComprobante = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Obtener datos de la venta, cliente y pago.
    // Se asume que v.* trae todos los campos necesarios.
    const [ventaData] = await pool.query(
      `SELECT v.id, v.subtotal, v.impuesto, v.total, v.tasa_bcv, v.numero_control, v.fecha_venta, v.monto_flete, c.razon_social, c.rif_cedula, c.direccion_fiscal, c.telefono 
             FROM ventas v 
             JOIN clientes c ON v.id_cliente = c.id 
             WHERE v.id = ?`,
      [id],
    );

    if (ventaData.length === 0) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }
    const venta = ventaData[0];

    // 1.1 Obtener los pagos asociados
    const [pagosData] = await pool.query(
      "SELECT metodo_pago, monto_pago, referencia FROM venta_pagos WHERE id_venta = ?",
      [id],
    );

    // 2. Obtener detalles de la venta, incluyendo la marca del producto.
    const [detallesVenta] = await pool.query(
      `SELECT 
                dv.cantidad, 
                p.nombre AS descripcion,
                p.marca,
                dv.precio_unitario, 
                (dv.cantidad * dv.precio_unitario) AS total
             FROM detalle_ventas dv 
             JOIN productos p ON dv.id_producto = p.id 
             WHERE dv.id_venta = ?`,
      [id],
    );

    // --- INICIALIZACIÓN Y CONFIGURACIÓN DEL DOCUMENTO ---
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- FUNCIÓN DE UTILIDAD PARA EVITAR NaN ---
    const safeParseFloat = (value) => {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0.0 : parsed;
    };

    // --- MANEJO DE IMAGEN (LOGO) ---
    let logoBase64;
    try {
      // La ruta es relativa desde la raíz del proyecto backend
      const logoPath = path.join(
        __dirname,
        "..",
        "..",
        "Frontend",
        "img",
        "logo.PNG",
      );
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = logoBuffer.toString("base64");
    } catch (error) {
      console.error("Error al cargar el logo:", error);
      // No se detiene la ejecución, simplemente no se mostrará el logo.
    }

    // --- MARCA DE AGUA (CON LOGO) ---
    if (logoBase64) {
      const imgProps = doc.getImageProperties(logoBase64);
      const logoWidth = 120;
      const logoHeight = (imgProps.height * logoWidth) / imgProps.width;
      const x = (pageWidth - logoWidth) / 2;
      const y = (pageHeight - logoHeight) / 2;

      doc.saveGraphicsState();
      try {
        // El método preferido para la opacidad en jsPDF
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.addImage(logoBase64, "PNG", x, y, logoWidth, logoHeight);
      } catch (e) {
        console.error(
          "Fallo al aplicar GState para marca de agua. Usando sin opacidad.",
          e,
        );
        doc.addImage(logoBase64, "PNG", x, y, logoWidth, logoHeight);
      }
      doc.restoreGraphicsState();
    }

    // --- ENCABEZADO ---
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 10, 30, 30); // Logo visible
    }

    // Título y Datos de la Empresa
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("FERRETERIA XYZ, C.A.", 48, 18);
    doc.text("RIF: J-12345678-9", 48, 24);
    doc.text("Av. Principal, Local 1, Ciudad, Estado", 48, 30);
    doc.text("Teléfono: 0212-1234567", 48, 36);

    // Título Principal
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("NOTA DE ENTREGA", pageWidth / 1.5, 20, { align: "center" });

    // Datos de Control
    doc.setFontSize(10);
    doc.text(`N° Control:`, pageWidth - 60, 30);
    doc.setFont("helvetica", "normal");
    doc.text(`${venta.numero_control || "S/N"}`, pageWidth - 35, 30);

    doc.setFont("helvetica", "bold");
    doc.text(`Fecha:`, pageWidth - 60, 36);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${new Date(venta.fecha_venta).toLocaleDateString()}`,
      pageWidth - 42,
      36,
    );

    // --- BLOQUE DE CLIENTE Y PAGO ---
    doc.setDrawColor(200);
    doc.rect(14, 48, pageWidth - 28, 25);

    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", 18, 54);
    doc.setFont("helvetica", "normal");
    doc.text(`Razón Social: ${venta.razon_social}`, 18, 60);
    doc.text(`Cédula/RIF: ${venta.rif_cedula}`, 18, 66);
    doc.text(`Dirección: ${venta.direccion_fiscal || "N/A"}`, 18, 72);

    doc.setFont("helvetica", "bold");
    doc.text("MÉTODO DE PAGO", pageWidth / 2, 54);
    doc.setFont("helvetica", "normal");

    // Listar pagos combinados
    let yPago = 60;
    pagosData.forEach((p) => {
      const texto = `${p.metodo_pago}: $${safeParseFloat(p.monto_pago).toFixed(2)} ${p.referencia ? "(Ref: " + p.referencia + ")" : ""}`;
      doc.text(texto, pageWidth / 2, yPago);
      yPago += 6;
    });

    // Ajustar si hay muchos pagos para no solapar (simple fallback)
    if (yPago > 78) {
      // En un caso real, ajustaríamos startY de la tabla dinámicamente
    }

    // --- TABLA DE ARTÍCULOS ---
    const tableBody = detallesVenta.map((d) => {
      // Estrategia de Diseño: se concatena la marca a la descripción si esta existe.
      const descripcionConMarca = d.marca
        ? `${d.descripcion} [Marca: ${d.marca}]`
        : d.descripcion;
      return [
        d.cantidad,
        descripcionConMarca,
        `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
        `$${safeParseFloat(d.total).toFixed(2)}`,
      ];
    });

    doc.autoTable({
      startY: 78,
      head: [["Cant.", "Descripción", "Precio Unit.", "Total"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [0, 128, 128], // Verde azulado
        textColor: 255,
        fontStyle: "bold",
      },
      styles: {
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
      },
    });

    // --- BLOQUE DE TOTALES ---
    const finalYAnchor = pageHeight - 35;
    let currentY = finalYAnchor;

    if (doc.lastAutoTable.finalY > finalYAnchor - 40) {
      doc.addPage();
      currentY = 40;
    } else {
      currentY = Math.max(doc.lastAutoTable.finalY + 8, finalYAnchor - 40);
    }

    const totalXAlign = pageWidth - 65;
    const valueXAlign = pageWidth - 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    doc.text("Subtotal:", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(venta.subtotal).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 6;

    if (venta.monto_flete > 0) {
      doc.text("Flete:", totalXAlign, currentY, { align: "left" });
      doc.text(
        `$${safeParseFloat(venta.monto_flete).toFixed(2)}`,
        valueXAlign,
        currentY,
        { align: "right" },
      );
      currentY += 6;
    }

    doc.text("IVA (16%):", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(venta.impuesto).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    doc.text("TOTAL A PAGAR:", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(venta.total).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const totalBolivares =
      safeParseFloat(venta.total) * safeParseFloat(venta.tasa_bcv);
    doc.text("Total en Bolívares:", totalXAlign, currentY, { align: "left" });
    doc.text(`${totalBolivares.toFixed(2)} Bs.`, valueXAlign, currentY, {
      align: "right",
    });
    currentY += 6;

    doc.setTextColor(100);
    doc.text(
      `Tasa $ Aplicada: ${safeParseFloat(venta.tasa_bcv).toFixed(2)} Bs.`,
      totalXAlign,
      currentY,
      { align: "left" },
    );
    doc.setTextColor(0);

    // --- PIE DE PÁGINA ---
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const footerText =
      "CONDICIONES DE DEVOLUCIÓN: Los cambios o devoluciones se procesan únicamente por defectos de fábrica dentro de los primeros 5 días hábiles tras la compra. Es indispensable presentar esta factura original y el producto en su empaque original sin daños físicos.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 28);
    doc.text(splitFooter, 14, pageHeight - 20);

    // --- ENVIAR PDF ---
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    // Asegurarse de llamar a next para el manejo de errores de Express
    console.error("Error al generar el reporte PDF:", error);
    next(error);
  }
};

// Implementamos la lógica de control de caja. El Reporte X permite auditar las ventas PENDIENTES sin afectar la base de datos, mientras que el Reporte Z formaliza el cierre diario en la tabla cierres_diarios y libera la caja para el siguiente turno.
const obtenerReporteX = async (req, res, next) => {
  try {
    // Consulta principal para los totales
    const [reporte] = await pool.query(`
      SELECT 
        IFNULL(SUM(v.total), 0) as ingresos_totales,
        IFNULL(SUM(dv.cantidad * p.precio_costo), 0) as costo_total_mercancia,
        (IFNULL(SUM(v.total), 0) - IFNULL(SUM(dv.cantidad * p.precio_costo), 0)) as utilidad_neta
      FROM ventas v
      JOIN detalle_ventas dv ON v.id = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id
      WHERE v.estado_cierre = 'PENDIENTE' AND DATE(v.fecha_venta) = CURDATE()
    `);

    // Consulta para el desglose por método de pago
    const [desglosePagos] = await pool.query(`
      SELECT vp.metodo_pago, IFNULL(SUM(vp.monto_pago), 0) as total
      FROM venta_pagos vp
      JOIN ventas v ON vp.id_venta = v.id
      WHERE v.estado_cierre = 'PENDIENTE' AND DATE(v.fecha_venta) = CURDATE()
      GROUP BY vp.metodo_pago
    `);

    res.json({
      success: true,
      tipo: "REPORTE X",
      mensaje: "Lectura parcial de ventas acumuladas.",
      datos: {
        ...reporte[0],
        desglose_pagos: desglosePagos,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Implementamos la lógica de control de caja. El Reporte X permite auditar las ventas PENDIENTES sin afectar la base de datos, mientras que el Reporte Z formaliza el cierre diario en la tabla cierres_diarios y libera la caja para el siguiente turno.
const generarCierreZ = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Obtener los totales y bloquear las filas para el cierre
    const [totales] = await connection.execute(`
      SELECT 
        IFNULL(SUM(v.total), 0) as ingresos_totales,
        IFNULL(SUM(dv.cantidad * p.precio_costo), 0) as costo_total_mercancia
      FROM ventas v
      JOIN detalle_ventas dv ON v.id = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id
      WHERE v.estado_cierre = 'PENDIENTE'
      FOR UPDATE
    `);

    const ingresos = parseFloat(totales[0].ingresos_totales);
    const costos = parseFloat(totales[0].costo_total_mercancia);
    const utilidad = ingresos - costos;

    if (ingresos === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "No hay ventas pendientes para realizar un cierre Z.",
      });
    }

    // 2. Obtener el desglose de pagos para el reporte
    const [desglosePagos] = await connection.execute(`
      SELECT vp.metodo_pago, IFNULL(SUM(vp.monto_pago), 0) as total
      FROM venta_pagos vp
      JOIN ventas v ON vp.id_venta = v.id
      WHERE v.estado_cierre = 'PENDIENTE'
      GROUP BY vp.metodo_pago
    `);

    // 3. Guardar en el historial de cierres usando el ID del usuario autenticado
    const [cierreResult] = await connection.execute(
      `INSERT INTO cierres_diarios (ingresos_totales, costo_mercancia, utilidad_neta, usuario_id, fecha_cierre) 
       VALUES (?, ?, ?, ?, NOW())`,
      [ingresos, costos, utilidad, req.user.id], // req.user.id viene del middleware de auth
    );
    const id_cierre = cierreResult.insertId;

    // 4. Marcar todas las ventas PENDIENTES como CERRADAS
    await connection.execute(
      `
      UPDATE ventas 
      SET estado_cierre = 'CERRADO', id_cierre_diario = ?
      WHERE estado_cierre = 'PENDIENTE'
    `,
      [id_cierre],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Reporte Z generado con éxito. La caja ha sido cerrada.",
      datos: {
        ingresos_totales: ingresos,
        costo_total_mercancia: costos,
        utilidad_neta: utilidad,
        desglose_pagos: desglosePagos,
        fecha_cierre: new Date(),
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  procesarVenta,
  obtenerUltimaTasa,
  generarComprobante,
  obtenerVentas,
  buscarVentasPorCedula,
  obtenerMotivosDevolucion,
  obtenerVentaDetalles,
  procesarDevolucion,
  generarPDFDevolucion,
  anularVenta,
  getSaleDetails,
  obtenerReporteX, // Añadido para el control de caja
  generarCierreZ, // Añadido para el control de caja
  obtenerDetallesVenta,
  generarReporteDevolucion: generarPDFDevolucion, // Alias para cumplir con la ruta solicitada reutilizando la lógica existente
};
