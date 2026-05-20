const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { getEmpresaConfig } = require("../config/empresa");
const { generarExcelExportacion } = require("../services/excel.service");
const { createJsPdf } = require("../utils/pdfFormatHelper");
// ============================================================
// REGISTRO DE COMPRA
// ============================================================
const registrarCompra = async (req, res, next) => {
  const {
    id_proveedor,
    nro_factura_proveedor,
    subtotal,
    impuesto,
    total,
    detalles,
  } = req.body;

  const id_usuario = req.user && req.user.id ? req.user.id : 1;

  if (!id_proveedor || !detalles || detalles.length === 0 || !total) {
    return res.status(400).json({ message: "Datos de compra incompletos." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [compraResult] = await connection.query(
      `INSERT INTO compras 
       (id_proveedor, id_usuario, fecha_compra, nro_factura_proveedor, subtotal, impuesto, total, tasa_bcv, estado) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, 1.00, 'COMPLETADA')`,
      [
        id_proveedor,
        id_usuario,
        nro_factura_proveedor,
        subtotal,
        impuesto,
        total,
      ],
    );
    const id_compra = compraResult.insertId;

    for (const det of detalles) {
      await connection.query(
        "INSERT INTO detalle_compras (id_compra, id_producto, cantidad, costo_unitario) VALUES (?, ?, ?, ?)",
        [id_compra, det.id_producto, det.cantidad, det.costo_unitario],
      );

      await connection.query(
        `INSERT INTO stock_depositos (id_producto, id_deposito, cantidad) 
         VALUES (?, 1, ?) 
         ON DUPLICATE KEY UPDATE cantidad = cantidad + ?`,
        [det.id_producto, det.cantidad, det.cantidad],
      );

      await connection.query(
        "UPDATE productos SET stock = stock + ?, precio_costo = ? WHERE id = ?",
        [det.cantidad, det.costo_unitario, det.id_producto],
      );

      await connection.query(
        "INSERT INTO movimientos_inventario (id_producto, id_deposito, tipo_movimiento, cantidad, referencia_id, id_usuario) VALUES (?, 1, 'COMPRA', ?, ?, ?)",
        [det.id_producto, det.cantidad, id_compra, id_usuario],
      );
    }

    await connection.commit();
    res.status(201).json({
      ok: true,
      message: "Compra registrada exitosamente.",
      id_compra,
      numero_control: id_compra,
    });
  } catch (error) {
    if (connection) await connection.rollback();

    // --- Manejo específico de factura duplicada ---
    if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
      return res.status(400).json({
        ok: false,
        message: "Esta factura ya fue registrada anteriormente.",
      });
    }

    console.error("Error en registrarCompra:", error);
    next(error);
  } finally {
    connection.release();
  }
};

// ============================================================
// LISTADO / HISTORIAL DE COMPRAS
// ============================================================
const obtenerCompras = async (req, res, next) => {
  try {
    const { termino } = req.query;
    let query = `
      SELECT c.*, p.nombre AS proveedor_nombre 
      FROM compras c 
      JOIN proveedores p ON c.id_proveedor = p.id
    `;
    const params = [];

    if (termino) {
      query += " WHERE p.nombre LIKE ? OR c.nro_factura_proveedor LIKE ?";
      params.push(`%${termino}%`, `%${termino}%`);
    }

    query += " ORDER BY c.fecha_compra DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerCompras:", error);
    next(error);
  }
};

// ============================================================
// GENERACIÓN DE PDF CON PDFKIT — STREAMING (doc.pipe(res))
// Diseño Premium que coincide con la estética del módulo de Ventas.
// No escribe ningún archivo en disco. El PDF se transmite
// directamente al navegador, evitando reinicios de Nodemon.
// ============================================================
const generarReporteCompra = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    // --- LOGO ---
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error logo Compras:", e);
      }
    }

    // --- Info del Ajuste ---
    currentY = 2.0; // Ajustamos Y después del encabezado dinámico
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }
    
    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = (pageWidth / 2) - textStartX - 0.1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const nombreSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nombreSplit, textStartX, currentY + 0.15);
    
    currentY += 0.15 + (nombreSplit.length * 0.15);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);
    
    currentY += 0.12;
    const dirSplit = doc.splitTextToSize(`Dirección: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);
    
    currentY += (dirSplit.length * 0.1);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    // Título y N° (Derecha) - Movido hacia abajo para evitar superposición
    const rightBoxWidth = 1.8;
    const rightBoxX = pageWidth - startX - rightBoxWidth;
    const rightBoxY = 0.8;
    
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(rightBoxX, rightBoxY, rightBoxWidth, 0.5);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("RECEPCIÓN DE COMPRA", rightBoxX + rightBoxWidth / 2, rightBoxY + 0.15, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`N° Interno: ${String(compra.id).padStart(6, "0")}`, rightBoxX + 0.05, rightBoxY + 0.3);
    doc.text(`Fecha: ${new Date(compra.fecha_compra).toLocaleDateString()}`, rightBoxX + 0.05, rightBoxY + 0.4);

    currentY = Math.max(currentY + 0.2, rightBoxY + 0.6);

    // --- Bloque Proveedor e Info (2 Columnas) ---
    const boxHeight = 0.65;
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(startX, currentY, pageWidth - 2 * startX, boxHeight);
    
    const midX = pageWidth / 2;
    doc.line(midX, currentY, midX, currentY + boxHeight);
    
    const col1X = startX + 0.05;
    const col2X = midX + 0.05;
    let innerY = currentY + 0.15;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PROVEEDOR", col1X, innerY);
    doc.text("DATOS DE COMPRA", col2X, innerY);
    
    innerY += 0.15;
    
    doc.setFont("helvetica", "normal");
    const nombreProvSplit = doc.splitTextToSize(`Nombre: ${compra.nombre}`, midX - startX - 0.1);
    doc.text(nombreProvSplit, col1X, innerY);
    
    doc.text(`Factura Prov: ${compra.nro_factura_proveedor}`, col2X, innerY);
    
    innerY += (nombreProvSplit.length * 0.12);
    doc.text(`RIF: ${compra.tipo_documento}-${compra.numero_documento}`, col1X, innerY);
    doc.text(`Estado: ${compra.estado}`, col2X, innerY);
    
    innerY += 0.15;
    doc.text(`Teléfono: ${compra.telefono || "N/A"}`, col1X, innerY);

    currentY += boxHeight + 0.15;

    // --- TABLA DE ARTÍCULOS ---
    const tableBody = detalles.map((d) => [
      d.codigo,
      d.nombre,
      d.cantidad,
      `$${safeParseFloat(d.costo_unitario).toFixed(2)}`,
      `$${(d.cantidad * safeParseFloat(d.costo_unitario)).toFixed(2)}`,
    ]);

    const col0w = 0.6; // Código
    const col2w = 0.4; // Cantidad
    const col3w = 0.7; // Costo
    const col4w = 0.7; // Total
    const col1w = (pageWidth - 2 * startX) - col0w - col2w - col3w - col4w; // Descripción

    doc.autoTable({
      startY: currentY,
      head: [["Código", "Descripción", "Cant.", "Costo Unit.", "Importe"]],
      body: tableBody,
      theme: "grid",
      margin: { left: startX, right: startX },
      headStyles: {
        fillColor: [30, 81, 123],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 0.05,
      },
      columnStyles: {
        0: { cellWidth: col0w },
        1: { cellWidth: col1w, overflow: "linebreak" },
        2: { cellWidth: col2w, halign: "center" },
        3: { cellWidth: col3w, halign: "right" },
        4: { cellWidth: col4w, halign: "right" },
      },
      styles: { lineWidth: 0.01, lineColor: [200, 200, 200] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    // --- BLOQUE DE TOTALES ---
    currentY = doc.lastAutoTable.finalY + 0.2;

    if (currentY > pageHeight - 1.5) {
      doc.addPage();
      currentY = 0.5;
    }

    const lblX = 3.8;
    const valX = 5.2;
    const lineH = 0.15;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    
    doc.text("SUBTOTAL:", lblX, currentY);
    doc.text(`$${safeParseFloat(compra.subtotal).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    doc.text("IVA (16%):", lblX, currentY);
    doc.text(`$${safeParseFloat(compra.impuesto).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL COMPRA:", lblX, currentY);
    doc.text(`$${safeParseFloat(compra.total).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    // Líneas de firmas (si es Carta completa o si hay espacio)
    currentY += 0.4;
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.line(startX + 0.2, currentY, startX + 1.8, currentY);
    doc.line(pageWidth - startX - 1.8, currentY, pageWidth - startX - 0.2, currentY);
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Recibido por (Almacén)", startX + 1.0, currentY + 0.1, { align: "center" });
    doc.text("Autorizado por (Administración)", pageWidth - startX - 1.0, currentY + 0.1, { align: "center" });

    // Pie de Página Dinámico
    currentY += 0.3;
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    const footerText = "La mercancía aquí detallada ha sido recibida conforme a la factura original del proveedor. El inventario ha sido actualizado en el sistema automáticamente.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 2 * startX);
    doc.text(splitFooter, startX, currentY);

    // --- ENVIAR PDF ---
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error en generarReporteCompra:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ ok: false, message: "Error al generar el reporte." });
    }
  }
};


const exportarExcel = async (req, res, next) => {
  try {
    const { termino } = req.query;
    let query = `
      SELECT c.fecha_compra as fecha, c.id as nro_control, c.nro_factura_proveedor, 
             p.nombre as proveedor_nombre, c.subtotal, c.impuesto, c.total
      FROM compras c 
      JOIN proveedores p ON c.id_proveedor = p.id
    `;
    const params = [];

    if (termino) {
      query += " WHERE p.nombre LIKE ? OR c.nro_factura_proveedor LIKE ?";
      params.push(`%${termino}%`, `%${termino}%`);
    }

    query += " ORDER BY c.fecha_compra DESC";

    const [rows] = await pool.query(query, params);

    const [empresaResult] = await pool.query(
      "SELECT razon_social AS nombre, rif, direccion, telefono FROM empresa_datos WHERE id = 1"
    );
    const empresa = empresaResult.length > 0 ? empresaResult[0] : null;

    const columnas = [
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "N° Control", key: "nro_control", width: 15 },
      { header: "Factura Proveedor", key: "nro_factura_proveedor", width: 20 },
      { header: "Proveedor", key: "proveedor_nombre", width: 40 },
      { header: "Subtotal", key: "subtotal", width: 15, type: "currency" },
      { header: "Impuesto", key: "impuesto", width: 15, type: "currency" },
      { header: "Total (USD)", key: "total", width: 15, type: "currency" },
    ];

    await generarExcelExportacion({
      res,
      titulo: "Historial de Compras",
      columnas,
      datos: rows,
      nombreArchivo: `Reporte_Compras_${new Date().toISOString().split("T")[0]}.xlsx`,
      incluirTotales: true,
      columnasTotales: ["subtotal", "impuesto", "total"],
      empresaData: empresa,
    });
  } catch (error) {
    console.error("Error exportando Excel de compras:", error);
    next(error);
  }
};

module.exports = {
  registrarCompra,
  generarReporteCompra,
  obtenerCompras,
  exportarExcel,
};
