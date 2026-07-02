const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { createJsPdf } = require("../utils/pdfFormatHelper");
const { getEmpresaConfig } = require("../config/empresa");

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

    // 1. Obtener datos de la empresa (Centralizado desde DB)
    const [empresaData] = await pool.query(
      "SELECT razon_social AS nombre, rif, direccion, telefono, logo_path FROM empresa_datos WHERE id = 1",
    );
    const configEstática = getEmpresaConfig();
    const empresa =
      empresaData.length > 0
        ? empresaData[0]
        : {
            nombre: configEstática.nombre,
            rif: configEstática.rif,
            direccion: configEstática.direccion,
            telefono: configEstática.telefono,
            logo_path: null,
          };
    empresa.email = configEstática.email;

    // 2. Obtener datos de la devolución, la venta original y el cliente.
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

    // 3. Obtener detalles
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

    // --- 📄 DECISIÓN DE TAMAÑO ---
    const itemCount = detallesDevolucion.length;
    const { doc, pageWidth, pageHeight, isHalfLetter, label } =
      createJsPdf(itemCount);
    doc.setProperties({ title: `Devolución - ${label}` });
    const startX = 0.5;

    // --- LOGO ---
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error logo Devolución:", e);
      }
    }

    // --- ENCABEZADO ESTANDARIZADO ---
    let currentY = 0.25;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }

    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = pageWidth - textStartX - startX; // Full width available

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const nameSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nameSplit, textStartX, currentY + 0.15);

    // Espaciado dinámico basado en líneas de nombre (aprox 0.18 por línea a 12pt)
    currentY += 0.15 + nameSplit.length * 0.18;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);

    currentY += 0.12;
    const dirSplit = doc.splitTextToSize(
      `Dir: ${empresa.direccion}`,
      maxTextWidth,
    );
    doc.text(dirSplit, textStartX, currentY);

    currentY += dirSplit.length * 0.12; // aprox 0.12 por línea a 8pt
    doc.text(
      `Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`,
      textStartX,
      currentY,
    );

    // Margen antes de la cuadrícula de información
    currentY += 0.25;

    // 2. Cuadrícula de Cliente y Pago (2 Columnas con Bordes)
    const boxHeight = 1.35; // Altura expandida para contener todos los datos
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(startX, currentY, pageWidth - 2 * startX, boxHeight);

    const midX = pageWidth / 2;
    doc.line(midX, currentY, midX, currentY + boxHeight);

    const col1X = startX + 0.08;
    const col2X = midX + 0.08;
    const colWidth = midX - startX - 0.16;

    // --- COLUMNA 1: CLIENTE ---
    let innerY = currentY + 0.15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CLIENTE", col1X, innerY);

    innerY += 0.14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const nombreSplit = doc.splitTextToSize(
      `Nombre: ${devolucion.razon_social}`,
      colWidth,
    );
    doc.text(nombreSplit, col1X, innerY);

    innerY += nombreSplit.length * 0.12;
    doc.text(`CI/RIF: ${devolucion.rif_cedula}`, col1X, innerY);

    innerY += 0.12;
    doc.text(`Teléfono: ${devolucion.telefono || "N/A"}`, col1X, innerY);

    innerY += 0.12;
    const addrSplit = doc.splitTextToSize(
      `Dirección: ${devolucion.direccion_fiscal || "N/A"}`,
      colWidth,
    );
    doc.text(addrSplit, col1X, innerY);

    // --- COLUMNA 2: COMPROBANTE DE DEVOLUCIÓN ---
    let innerYRight = currentY + 0.15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DEVOLUCIÓN", col2X, innerYRight);

    innerYRight += 0.14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `N° Devolución: ${String(devolucion.id_devolucion).padStart(6, "0")}`,
      col2X,
      innerYRight,
    );

    innerYRight += 0.12;
    doc.text(
      `Fecha: ${new Date(devolucion.fecha).toLocaleDateString()}`,
      col2X,
      innerYRight,
    );

    // Línea separadora horizontal en la columna derecha
    const separatorY = currentY + 0.6;
    doc.setDrawColor(150);
    doc.line(midX, separatorY, pageWidth - startX, separatorY);
    doc.setDrawColor(100); // restaurar color de borde

    // Datos de la Venta de Referencia
    innerYRight = separatorY + 0.15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("VENTA DE REFERENCIA", col2X, innerYRight);

    innerYRight += 0.14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `N° Control original: ${devolucion.numero_control || "S/N"}`,
      col2X,
      innerYRight,
    );

    innerYRight += 0.12;
    doc.text(
      `Fecha original: ${new Date(devolucion.fecha_venta).toLocaleDateString()}`,
      col2X,
      innerYRight,
    );

    currentY += boxHeight + 0.15; // Espacio antes de tabla

    // --- TABLA DE ARTÍCULOS DEVUELTOS - MEDIA CARTA ---
    const tableBody = detallesDevolucion.map((d) => [
      d.cantidad,
      d.descripcion,
      `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
      `$${safeParseFloat(d.total).toFixed(2)}`,
    ]);

    const availableTableWidth = pageWidth - 2 * startX;
    const columnWidthCantidad = 0.5;
    const columnWidthPrecio = 0.8;
    const columnWidthSubtotal = 0.8;
    const columnWidthDescripcion =
      availableTableWidth -
      columnWidthCantidad -
      columnWidthPrecio -
      columnWidthSubtotal;

    doc.autoTable({
      startY: currentY, // Dinámico
      head: [["Cant.", "Descripción", "Precio Unit.", "Subtotal"]],
      body: tableBody,
      theme: "grid",
      margin: { left: startX, right: startX },
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7,
      },
      bodyStyles: {
        fontSize: 6,
        cellPadding: 0.08,
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: columnWidthCantidad, halign: "center" },
        1: { cellWidth: columnWidthDescripcion, overflow: "linebreak" },
        2: { cellWidth: columnWidthPrecio, halign: "right" },
        3: { cellWidth: columnWidthSubtotal, halign: "right" },
      },
      styles: { lineWidth: 0.01, lineColor: [220, 220, 220] },
    });

    // --- BLOQUE DE TOTALES - MEDIA CARTA ---
    let finalY = doc.lastAutoTable.finalY || currentY + 0.5;
    const finalYAnchor = pageHeight - 0.75;
    currentY = Math.max(finalY + 0.1, finalYAnchor - 0.6);

    const montoTotalDevuelto = detallesDevolucion.reduce(
      (sum, item) => sum + safeParseFloat(item.total),
      0,
    );
    const totalDevueltoBs =
      montoTotalDevuelto * safeParseFloat(devolucion.tasa_bcv);

    const labelX = pageWidth - (isHalfLetter ? 2.7 : 3.5);
    const valueX = pageWidth - startX;

    const drawLabelRightValue = (
      label,
      value,
      y,
      { lineHeight = 0.18 } = {},
    ) => {
      const maxLabelWidth = valueX - labelX - 0.1;
      const splitLabel = doc.splitTextToSize(label, maxLabelWidth);
      doc.text(splitLabel, labelX, y);
      doc.text(value, valueX, y, { align: "right" });
      return y + lineHeight * splitLabel.length;
    };

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    currentY = drawLabelRightValue(
      "MONTO TOTAL A FAVOR:",
      `$${montoTotalDevuelto.toFixed(2)}`,
      currentY,
    );

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    currentY = drawLabelRightValue(
      "Equivalente a:",
      `${totalDevueltoBs.toFixed(2)} Bs. (Tasa: ${safeParseFloat(devolucion.tasa_bcv).toFixed(2)})`,
      currentY,
      { lineHeight: 0.22 },
    );

    currentY += 0.22;

    // --- MOTIVO Y COMENTARIOS ---
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Motivo:", startX, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(devolucion.motivo || "No especificado", startX + 0.5, currentY);

    if (devolucion.comentario) {
      currentY += 0.15;
      doc.setFont("helvetica", "italic");
      const splitComentario = doc.splitTextToSize(
        `Comentario: ${devolucion.comentario}`,
        pageWidth - 2 * startX,
      );
      doc.text(splitComentario, startX, currentY);
    }

    // --- PIE DE PÁGINA - MEDIA CARTA ---
    // 🎯 Texto muy pequeño al final
    doc.setFontSize(6); // 🎯 Muy pequeño
    doc.setFont("helvetica", "italic");
    const footerText =
      "Comprobante de devolución y crédito a favor del cliente. Ajuste de inventario procesado.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 0.4);
    doc.text(splitFooter, 0.2, pageHeight - 0.25);

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

const verificarEstadoCaja = async (req, res, next) => {
  try {
    const [cierreHoy] = await pool.query(
      "SELECT id, fecha_cierre FROM cierres_diarios WHERE DATE(fecha_cierre) = CURDATE()",
    );

    if (cierreHoy.length > 0) {
      res.json({
        cajaCerrada: true,
        mensaje: "La caja ya fue cerrada para el día de hoy.",
        fecha_cierre: cierreHoy[0].fecha_cierre,
      });
    } else {
      res.json({
        cajaCerrada: false,
        mensaje: "La caja está abierta.",
      });
    }
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

  // NUEVA VALIDACIÓN: Verificar si la caja ya fue cerrada para el día de hoy.
  // Esta es la barrera de seguridad principal a nivel de servidor.
  try {
    const [cierreHoy] = await pool.query(
      "SELECT id FROM cierres_diarios WHERE DATE(fecha_cierre) = CURDATE()",
    );

    if (cierreHoy.length > 0) {
      return res.status(403).json({
        message:
          "La caja ya está cerrada por el día de hoy. No se pueden realizar más ventas.",
      });
    }
  } catch (dbError) {
    return next(dbError);
  }

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
    if (error.sql) {
      console.error("QUERY FALLIDA:", error.sql);
    }
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

    // 1. Obtener datos de la empresa (Centralizado desde DB)
    const [empresaData] = await pool.query(
      "SELECT razon_social AS nombre, rif, direccion, telefono, logo_path FROM empresa_datos WHERE id = 1",
    );
    const configEstática = getEmpresaConfig();
    const empresa =
      empresaData.length > 0
        ? empresaData[0]
        : {
            nombre: configEstática.nombre,
            rif: configEstática.rif,
            direccion: configEstática.direccion,
            telefono: configEstática.telefono,
            logo_path: null,
          };
    empresa.email = configEstática.email;

    // Inicializar datos de venta y PDF
    const [ventaRows] = await pool.query(
      `SELECT v.*, c.razon_social, c.rif_cedula, c.direccion_fiscal, c.telefono
       FROM ventas v
       LEFT JOIN clientes c ON v.id_cliente = c.id
       WHERE v.id = ?`,
      [id],
    );
    const venta = ventaRows.length > 0 ? ventaRows[0] : {};

    const [detallesVenta] = await pool.query(
      `SELECT dv.*, p.nombre AS descripcion, p.marca
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id
       WHERE dv.id_venta = ?`,
      [id],
    );

    const [pagosData] = await pool.query(
      `SELECT metodo_pago, monto_pago, referencia
       FROM venta_pagos
       WHERE id_venta = ?`,
      [id],
    );

    // Crear documento PDF
    const itemCount = detallesVenta.length;
    const { doc, pageWidth, pageHeight } = createJsPdf(itemCount);
    const startX = 0.5;
    const safeParseFloat = (v) => parseFloat(v) || 0.0;

    // --- LOGO ---
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error logo Ventas:", e);
      }
    }

    // --- ENCABEZADO CON ORDEN DE DESPACHO EN ESQUINA SUPERIOR DERECHA ---
    let currentY = 0.25;

    // Recuadro de ORDEN DE DESPACHO (esquina superior derecha, compacto)
    const despachoBoxW = 1.8;
    const despachoBoxH = 0.55;
    const despachoBoxX = pageWidth - startX - despachoBoxW;
    const despachoBoxY = currentY;
    doc.setDrawColor(0, 92, 168);
    doc.setLineWidth(0.015);
    doc.rect(despachoBoxX, despachoBoxY, despachoBoxW, despachoBoxH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 92, 168);
    doc.text(
      "ORDEN DE DESPACHO",
      despachoBoxX + despachoBoxW / 2,
      despachoBoxY + 0.12,
      { align: "center" },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(
      `N° Control: ${venta.numero_control || "S/N"}`,
      despachoBoxX + 0.08,
      despachoBoxY + 0.25,
    );
    doc.text(
      `Fecha: ${new Date(venta.fecha_venta).toLocaleDateString()}`,
      despachoBoxX + 0.08,
      despachoBoxY + 0.38,
    );

    // Logo (a la izquierda)
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }

    // Datos de empresa (al lado del logo, sin invadir el recuadro de despacho)
    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = despachoBoxX - textStartX - 0.1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    const nameSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nameSplit, textStartX, currentY + 0.15);

    currentY += 0.15 + nameSplit.length * 0.18;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);

    currentY += 0.12;
    const dirSplit = doc.splitTextToSize(
      `Dir: ${empresa.direccion}`,
      maxTextWidth,
    );
    doc.text(dirSplit, textStartX, currentY);

    currentY += dirSplit.length * 0.12;
    doc.text(
      `Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`,
      textStartX,
      currentY,
    );

    // Asegurar que currentY quede por debajo del recuadro de despacho
    currentY = Math.max(currentY + 0.2, despachoBoxY + despachoBoxH + 0.12);

    // --- CUADRÍCULA: CLIENTE (izq) + DATOS DE PAGO (der) ---
    const boxHeight = 0.85;
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(startX, currentY, pageWidth - 2 * startX, boxHeight);

    const midX = pageWidth / 2;
    doc.line(midX, currentY, midX, currentY + boxHeight);

    const col1X = startX + 0.08;
    const col2X = midX + 0.08;
    const colWidth = midX - startX - 0.16;

    // --- COLUMNA 1: CLIENTE ---
    let innerY = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CLIENTE", col1X, innerY);

    innerY += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const nombreSplit = doc.splitTextToSize(
      `Nombre: ${venta.razon_social}`,
      colWidth,
    );
    doc.text(nombreSplit, col1X, innerY);

    innerY += nombreSplit.length * 0.11;
    doc.text(`CI/RIF: ${venta.rif_cedula}`, col1X, innerY);

    innerY += 0.11;
    doc.text(`Teléfono: ${venta.telefono || "N/A"}`, col1X, innerY);

    innerY += 0.11;
    const addrSplit = doc.splitTextToSize(
      `Dirección: ${venta.direccion_fiscal || "N/A"}`,
      colWidth,
    );
    doc.text(addrSplit, col1X, innerY);

    // --- COLUMNA 2: DATOS DE PAGO ---
    let innerYRight = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DATOS DE PAGO", col2X, innerYRight);

    innerYRight += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    const metodos = pagosData.map((p) => p.metodo_pago).join(", ");
    const referencias =
      pagosData
        .filter((p) => p.referencia)
        .map((p) => p.referencia)
        .join(", ") || "N/A";

    doc.text(`Método: ${metodos}`, col2X, innerYRight);

    innerYRight += 0.11;
    doc.text(
      `Tasa $ Aplicada: ${safeParseFloat(venta.tasa_bcv).toFixed(2)} Bs`,
      col2X,
      innerYRight,
    );

    innerYRight += 0.11;
    doc.text(`Referencia: ${referencias}`, col2X, innerYRight);

    currentY += boxHeight + 0.12;

    // 5. Tabla de Artículos
    const tableBody = detallesVenta.map((d) => {
      const descripcionConMarca = d.marca
        ? `${d.descripcion} [${d.marca}]`
        : d.descripcion;
      return [
        d.cantidad,
        descripcionConMarca,
        `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
        `$${safeParseFloat(d.total).toFixed(2)}`,
      ];
    });

    const col0w = 0.5;
    const col2w = 0.8;
    const col3w = 0.8;
    const col1w = pageWidth - 2 * startX - col0w - col2w - col3w;

    doc.autoTable({
      startY: currentY,
      head: [["Cant.", "Descripción", "Precio Unit.", "Total"]],
      body: tableBody,
      theme: "grid",
      margin: { left: startX, right: startX },
      headStyles: {
        fillColor: [0, 92, 168],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 0.05,
      },
      columnStyles: {
        0: { cellWidth: col0w, halign: "center" },
        1: { cellWidth: col1w, overflow: "linebreak" },
        2: { cellWidth: col2w, halign: "right" },
        3: { cellWidth: col3w, halign: "right" },
      },
      styles: { lineWidth: 0.01, lineColor: [200, 200, 200] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    currentY = doc.lastAutoTable.finalY + 0.15;

    if (currentY > pageHeight - 1.2) {
      doc.addPage();
      currentY = 0.5;
    }

    // --- CONDICIONES (izquierda) + TOTALES (derecha) — misma altura ---
    const totalsStartY = currentY;

    // TOTALES (lado derecho)
    const lblX = pageWidth - startX - 1.8;
    const valX = pageWidth - startX;
    const lineH = 0.15;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    doc.text("SUBTOTAL:", lblX, currentY);
    doc.text(`$${safeParseFloat(venta.subtotal).toFixed(2)}`, valX, currentY, {
      align: "right",
    });
    currentY += lineH;

    if (venta.monto_flete > 0) {
      doc.text("FLETE:", lblX, currentY);
      doc.text(
        `$${safeParseFloat(venta.monto_flete).toFixed(2)}`,
        valX,
        currentY,
        { align: "right" },
      );
      currentY += lineH;
    }

    doc.text("IVA (16%):", lblX, currentY);
    doc.text(`$${safeParseFloat(venta.impuesto).toFixed(2)}`, valX, currentY, {
      align: "right",
    });
    currentY += lineH;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", lblX, currentY);
    doc.text(`$${safeParseFloat(venta.total).toFixed(2)}`, valX, currentY, {
      align: "right",
    });
    currentY += lineH;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const totalBolivares =
      safeParseFloat(venta.total) * safeParseFloat(venta.tasa_bcv);
    doc.text("TOTAL EN BS:", lblX, currentY);
    doc.text(`${totalBolivares.toFixed(2)} Bs.`, valX, currentY, {
      align: "right",
    });

    // CONDICIONES (lado izquierdo, a la misma altura que los totales)
    const condMaxWidth = lblX - startX - 0.2;
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80);
    const footerText =
      "CONDICIONES: Cambios o devoluciones por defectos de fábrica dentro de 5 días hábiles. Presenta este comprobante original. ¡Gracias por su compra!";
    const splitFooter = doc.splitTextToSize(footerText, condMaxWidth);
    doc.text(splitFooter, startX, totalsStartY);
    doc.setTextColor(0);

    // Enviar PDF al cliente
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error al generar el presupuesto PDF:", error);
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

/**
 * @function obtenerHistorialCierres
 * Devuelve el historial de todos los cierres Z realizados,
 * incluyendo los datos del usuario que los ejecutó.
 */
const obtenerHistorialCierres = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        cd.id,
        DATE_FORMAT(cd.fecha_cierre, '%Y-%m-%d') AS fecha,
        TIME_FORMAT(cd.fecha_cierre, '%H:%i:%s') AS hora,
        cd.ingresos_totales,
        cd.costo_mercancia,
        cd.utilidad_neta,
        u.nombre AS usuario_cierre
      FROM cierres_diarios cd
      LEFT JOIN usuarios u ON cd.usuario_id = u.id
      ORDER BY cd.fecha_cierre DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

/**
 * @function obtenerDetalleCierre
 * Devuelve el desglose de pagos y resumen de un cierre específico por ID.
 */
const obtenerDetalleCierre = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Datos del cierre
    const [cierreRows] = await pool.query(
      `
      SELECT 
        cd.id,
        DATE_FORMAT(cd.fecha_cierre, '%Y-%m-%d %H:%i:%s') AS fecha_cierre,
        cd.ingresos_totales,
        cd.costo_mercancia,
        cd.utilidad_neta,
        u.nombre AS usuario_cierre
      FROM cierres_diarios cd
      LEFT JOIN usuarios u ON cd.usuario_id = u.id
      WHERE cd.id = ?
    `,
      [id],
    );

    if (cierreRows.length === 0) {
      return res.status(404).json({ message: "Cierre no encontrado" });
    }

    // Desglose de pagos para ese cierre (ventas asociadas al cierre)
    const [desglosePagos] = await pool.query(
      `
      SELECT vp.metodo_pago, IFNULL(SUM(vp.monto_pago), 0) AS total, COUNT(DISTINCT v.id) AS num_ventas
      FROM ventas v
      JOIN venta_pagos vp ON v.id = vp.id_venta
      WHERE v.id_cierre_diario = ?
      GROUP BY vp.metodo_pago
      ORDER BY total DESC
    `,
      [id],
    );

    // Ventas incluidas en ese cierre
    const [ventas] = await pool.query(
      `
      SELECT v.id, v.numero_control, v.total, DATE_FORMAT(v.fecha_venta, '%H:%i') AS hora, c.razon_social AS cliente
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id
      WHERE v.id_cierre_diario = ?
      ORDER BY v.fecha_venta ASC
    `,
      [id],
    );

    res.json({
      cierre: cierreRows[0],
      desglose_pagos: desglosePagos,
      ventas,
    });
  } catch (error) {
    next(error);
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
  obtenerReporteX,
  generarCierreZ,
  obtenerDetallesVenta,
  generarReporteDevolucion: generarPDFDevolucion,
  verificarEstadoCaja,
  obtenerHistorialCierres, // NUEVO: Historial de cierres
  obtenerDetalleCierre, // NUEVO: Detalle de un cierre específico
};
