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

    // 2. Obtener datos de la compra
    const [compraData] = await pool.query(
      `SELECT c.*, p.nombre, p.tipo_documento, p.numero_documento, p.telefono 
       FROM compras c 
       JOIN proveedores p ON c.id_proveedor = p.id 
       WHERE c.id = ?`,
      [id]
    );

    if (compraData.length === 0) {
      return res.status(404).json({ message: "Compra no encontrada" });
    }
    const compra = compraData[0];

    // 3. Obtener detalles de la compra
    const [detalles] = await pool.query(
      `SELECT dc.*, prod.codigo, prod.nombre 
       FROM detalle_compras dc 
       JOIN productos prod ON dc.id_producto = prod.id 
       WHERE dc.id_compra = ?`,
      [id]
    );

    // 4. Inicializar PDF
    const itemCount = detalles.length;
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
        console.error("Error logo Compras:", e);
      }
    }

    // --- ENCABEZADO CON RECEPCIÓN DE COMPRA EN ESQUINA SUPERIOR DERECHA ---
    let currentY = 0.25;

    // Recuadro de RECEPCIÓN DE COMPRA (esquina superior derecha, compacto)
    const compraBoxW = 1.8;
    const compraBoxH = 0.55;
    const compraBoxX = pageWidth - startX - compraBoxW;
    const compraBoxY = currentY;
    doc.setDrawColor(30, 81, 123);
    doc.setLineWidth(0.015);
    doc.rect(compraBoxX, compraBoxY, compraBoxW, compraBoxH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30, 81, 123);
    doc.text("RECEPCIÓN DE COMPRA", compraBoxX + compraBoxW / 2, compraBoxY + 0.12, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(`N° Interno: ${String(compra.id).padStart(6, "0")}`, compraBoxX + 0.08, compraBoxY + 0.25);
    doc.text(`Fecha: ${new Date(compra.fecha_compra).toLocaleDateString()}`, compraBoxX + 0.08, compraBoxY + 0.38);

    // Logo (a la izquierda)
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }
    
    // Datos de empresa (al lado del logo, sin invadir el recuadro)
    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = compraBoxX - textStartX - 0.1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    const nameSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nameSplit, textStartX, currentY + 0.15);
    
    currentY += 0.15 + (nameSplit.length * 0.18);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);
    
    currentY += 0.12;
    const dirSplit = doc.splitTextToSize(`Dir: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);
    
    currentY += (dirSplit.length * 0.12);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    // Asegurar que currentY quede por debajo del recuadro
    currentY = Math.max(currentY + 0.2, compraBoxY + compraBoxH + 0.12);

    // --- CUADRÍCULA: PROVEEDOR (izq) + DATOS DE COMPRA (der) ---
    const boxHeight = 0.85;
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(startX, currentY, pageWidth - 2 * startX, boxHeight);
    
    const midX = pageWidth / 2;
    doc.line(midX, currentY, midX, currentY + boxHeight);
    
    const col1X = startX + 0.08;
    const col2X = midX + 0.08;
    const colWidth = midX - startX - 0.16;
    
    // --- COLUMNA 1: PROVEEDOR ---
    let innerY = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PROVEEDOR", col1X, innerY);
    
    innerY += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const nombreProvSplit = doc.splitTextToSize(`Nombre: ${compra.nombre}`, colWidth);
    doc.text(nombreProvSplit, col1X, innerY);
    
    innerY += nombreProvSplit.length * 0.11;
    doc.text(`RIF: ${compra.tipo_documento}-${compra.numero_documento}`, col1X, innerY);
    
    innerY += 0.11;
    doc.text(`Teléfono: ${compra.telefono || "N/A"}`, col1X, innerY);

    // --- COLUMNA 2: DATOS DE COMPRA ---
    let innerYRight = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DATOS DE COMPRA", col2X, innerYRight);

    innerYRight += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Factura Prov: ${compra.nro_factura_proveedor}`, col2X, innerYRight);

    innerYRight += 0.11;
    doc.text(`Estado: ${compra.estado}`, col2X, innerYRight);

    currentY += boxHeight + 0.12;

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

    // --- CONDICIONES (izquierda) + TOTALES (derecha) — misma altura ---
    currentY = doc.lastAutoTable.finalY + 0.15;

    if (currentY > pageHeight - 1.6) {
      doc.addPage();
      currentY = 0.5;
    }

    const totalsStartY = currentY;

    // TOTALES (lado derecho)
    const lblX = pageWidth - startX - 1.8;
    const valX = pageWidth - startX;
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

    // CONDICIONES Y FIRMAS (lado izquierdo)
    const condMaxWidth = lblX - startX - 0.2;
    
    // Líneas de firmas adaptadas al espacio izquierdo
    const sigLineW = (condMaxWidth / 2) - 0.1;
    const sigY = totalsStartY + 0.35;
    
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.line(startX, sigY, startX + sigLineW, sigY);
    doc.line(startX + sigLineW + 0.2, sigY, startX + condMaxWidth, sigY);
    
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("Recibido por (Almacén)", startX + (sigLineW/2), sigY + 0.1, { align: "center" });
    doc.text("Autorizado por (Administración)", startX + sigLineW + 0.2 + (sigLineW/2), sigY + 0.1, { align: "center" });

    // Pie de Página Dinámico
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80);
    const footerText = "La mercancía aquí detallada ha sido recibida conforme a la factura original del proveedor. El inventario ha sido actualizado en el sistema automáticamente.";
    const splitFooter = doc.splitTextToSize(footerText, condMaxWidth);
    doc.text(splitFooter, startX, sigY + 0.3);
    doc.setTextColor(0);

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
