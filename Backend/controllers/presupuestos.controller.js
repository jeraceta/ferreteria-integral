const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { createJsPdf } = require("../utils/pdfFormatHelper");
const { getEmpresaConfig } = require("../config/empresa");

/**
 * Crea un nuevo presupuesto en la base de datos.
 * Esta operación es puramente informativa y no afecta el stock del inventario.
 */
const crearPresupuesto = async (req, res, next) => {
  console.log(
    "Creando presupuesto. Body recibido:",
    JSON.stringify(req.body, null, 2),
  );

  // Se elimina id_usuario de la desestructuración
  const {
    id_cliente,
    tasa_bcv,
    detalles,
    subtotal,
    impuesto,
    total,
    monto_flete,
  } = req.body;

  // Validación de datos de entrada
  if (
    !id_cliente ||
    !tasa_bcv ||
    !detalles ||
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    subtotal === undefined ||
    impuesto === undefined ||
    total === undefined
  ) {
    return res
      .status(400)
      .json({ message: "Datos de presupuesto incompletos o mal formados." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Consulta INSERT corregida: sin id_usuario, con fechas de emisión/vencimiento
    const [presupuestoResult] = await connection.query(
      `INSERT INTO presupuestos 
        (id_cliente, fecha_emision, fecha_vencimiento, subtotal, impuesto, monto_flete, tasa_bcv, total) 
        VALUES (?, NOW(), NOW() + INTERVAL 15 DAY, ?, ?, ?, ?, ?)`,
      [id_cliente, subtotal, impuesto, monto_flete || 0.0, tasa_bcv, total],
    );
    const id_presupuesto = presupuestoResult.insertId;

    // Inserción de los detalles del presupuesto (sin cambios aquí)
    for (const detalle of detalles) {
      const { id_producto, cantidad, precio_unitario } = detalle;
      if (!id_producto || cantidad <= 0 || precio_unitario === undefined) {
        throw new Error(
          `El detalle del producto ID ${id_producto} es inválido.`,
        );
      }
      await connection.query(
        "INSERT INTO detalle_presupuestos (id_presupuesto, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)",
        [id_presupuesto, id_producto, cantidad, precio_unitario],
      );
    }

    await connection.commit();
    res
      .status(201)
      .json({ message: "Presupuesto creado exitosamente.", id_presupuesto });
  } catch (error) {
    await connection.rollback();
    console.error("Error en crearPresupuesto:", error.message);
    next(error);
  } finally {
    connection.release();
  }
};

/**
 * Genera un reporte en PDF para un presupuesto específico.
 * El diseño es similar al de la factura de venta para consistencia.
 */
const generarPDFPresupuesto = async (req, res, next) => {
  // Corregimos el nombre de la columna a fecha_emision y aplicamos estilos de tabla para coincidir con la imagen corporativa de la factura.
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

    // 2. Obtener datos del presupuesto y del cliente.
    // Se corrige la consulta para usar fecha_emision y traer fecha_vencimiento.
    const [presupuestoData] = await pool.query(
      `SELECT p.id, p.subtotal, p.impuesto, p.total, p.tasa_bcv, p.fecha_emision, p.fecha_vencimiento, p.monto_flete, 
              c.razon_social, c.rif_cedula, c.direccion_fiscal, c.telefono 
       FROM presupuestos p
       JOIN clientes c ON p.id_cliente = c.id 
       WHERE p.id = ?`,
      [id],
    );

    if (presupuestoData.length === 0) {
      return res.status(404).json({ message: "Presupuesto no encontrado" });
    }
    const presupuesto = presupuestoData[0];

    // 2. Obtener detalles del presupuesto, incluyendo el código del producto.
    const [detallesPresupuesto] = await pool.query(
      `SELECT 
         prod.codigo,
         prod.marca,
         dp.cantidad, 
         prod.nombre AS descripcion,
         dp.precio_unitario, 
         (dp.cantidad * dp.precio_unitario) AS total
       FROM detalle_presupuestos dp 
       JOIN productos prod ON dp.id_producto = prod.id 
       WHERE dp.id_presupuesto = ?`,
      [id],
    );

    // --- 📄 DECISIÓN DE TAMAÑO ---
    // El reporte mira la cantidad de filas del presupuesto antes de crear el PDF.
    // Si hay 10 o menos artículos, elegimos Media Carta. Si hay más, Carta Completa.
    const itemCount = detallesPresupuesto.length;
    const { doc, pageWidth, pageHeight, isHalfLetter, label } =
      createJsPdf(itemCount);
    doc.setProperties({ title: `Presupuesto - ${label}` });
    const safeParseFloat = (value) => parseFloat(value) || 0.0;

    // --- MANEJO DE IMAGEN (LOGO) ---
    let logoBase64;
    try {
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
    }

    // --- MARCA DE AGUA - MEDIA CARTA ---
    // 🎯 Calculamos: Logo de fondo = 2.5" (45% del ancho disponible, perfecto para marca de agua)
    // Antes era 120 unidades, ahora es 2.5 pulgadas proporcionadas al tamaño nuevo
    if (logoBase64) {
      const imgProps = doc.getImageProperties(logoBase64);
      const logoWidth = 2.5; // 🎯 Reducido de 120 a 2.5 pulgadas
      const logoHeight = (imgProps.height * logoWidth) / imgProps.width;
      const x = (pageWidth - logoWidth) / 2;
      const y = (pageHeight - logoHeight) / 2;

      doc.saveGraphicsState();
      try {
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.addImage(logoBase64, "PNG", x, y, logoWidth, logoHeight);
      } catch (e) {
        console.error(
          "Fallo al aplicar GState para marca de agua. Usando sin opacidad.",
          e,
        );
        console.error("Error logo Presupuesto:", e);
      }
    }

    // --- ENCABEZADO ESTANDARIZADO ---
    let currentY = 0.25;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }
    
    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = (pageWidth / 2) - textStartX - 0.1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const nameSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nameSplit, textStartX, currentY + 0.15);
    
    currentY += 0.15 + (nameSplit.length * 0.15);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);
    
    currentY += 0.12;
    const dirSplit = doc.splitTextToSize(`Dir: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);
    
    currentY += (dirSplit.length * 0.1);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    // Título y Control (Derecha) - Movido hacia abajo para evitar superposición
    const rightBoxWidth = 1.8;
    const rightBoxX = pageWidth - startX - rightBoxWidth;
    const rightBoxY = 0.8;
    
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(rightBoxX, rightBoxY, rightBoxWidth, 0.5);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PRESUPUESTO", rightBoxX + rightBoxWidth / 2, rightBoxY + 0.18, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`N°: ${String(presupuesto.id).padStart(6, "0")}`, rightBoxX + 0.05, rightBoxY + 0.3);
    doc.text(`Fecha: ${presupuesto.fecha_emision_fmt}`, rightBoxX + 0.05, rightBoxY + 0.4);
    doc.text(`Válido hasta: ${new Date(presupuesto.fecha_vencimiento).toLocaleDateString("es-VE")}`, rightBoxX + 0.05, rightBoxY + 0.5);

    currentY = Math.max(currentY + 0.2, rightBoxY + 0.6);

    // --- Cuadrícula de Cliente y Condiciones (2 Columnas con Bordes) ---
    const boxHeight = 0.8;
    const startX = 0.25;
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
    doc.text("CLIENTE", col1X, innerY);
    doc.text("CONDICIONES", col2X, innerY);
    
    innerY += 0.15;
    
    doc.setFont("helvetica", "normal");
    const nombreSplit = doc.splitTextToSize(`Nombre: ${presupuesto.razon_social}`, midX - startX - 0.1);
    doc.text(nombreSplit, col1X, innerY);
    
    doc.text(`Válido por: 15 días`, col2X, innerY);
    
    innerY += (nombreSplit.length * 0.12);
    doc.text(`CI/RIF: ${presupuesto.rif_cedula}`, col1X, innerY);
    doc.text(`Tasa BCV Ref: ${safeParseFloat(presupuesto.tasa_bcv).toFixed(2)} Bs`, col2X, innerY);
    
    innerY += 0.15;
    doc.text(`Teléfono: ${presupuesto.telefono || "N/A"}`, col1X, innerY);
    
    innerY += 0.15;
    const addrSplit = doc.splitTextToSize(`Dirección: ${presupuesto.direccion_fiscal || "N/A"}`, midX - startX - 0.1);
    doc.text(addrSplit, col1X, innerY);

    currentY += boxHeight + 0.15;

    // --- TABLA DE ARTÍCULOS ---
    const tableBody = detallesPresupuesto.map((d) => {
      const descripcionCompleta = d.marca ? `${d.descripcion} [${d.marca}]` : d.descripcion;
      return [
        d.cantidad,
        descripcionCompleta,
        `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
        `$${safeParseFloat(d.total).toFixed(2)}`,
      ];
    });
    const col0w = 0.5; // Cantidad
    const col2w = 0.8; // Precio Unit.
    const col3w = 0.8; // Total
    const col1w = (pageWidth - 2 * startX) - col0w - col2w - col3w; // Descripción

    doc.autoTable({
      startY: currentY,
      head: [["Cant.", "Descripción", "Precio Unit.", "Total"]],
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
        0: { cellWidth: col0w, halign: "center" },
        1: { cellWidth: col1w, overflow: "linebreak" },
        2: { cellWidth: col2w, halign: "right" },
        3: { cellWidth: col3w, halign: "right" },
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
    doc.text(`$${safeParseFloat(presupuesto.subtotal).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    if (presupuesto.monto_flete > 0) {
      doc.text("FLETE:", lblX, currentY);
      doc.text(`$${safeParseFloat(presupuesto.monto_flete).toFixed(2)}`, valX, currentY, { align: "right" });
      currentY += lineH;
    }

    doc.text("IVA (16%):", lblX, currentY);
    doc.text(`$${safeParseFloat(presupuesto.impuesto).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL A PAGAR:", lblX, currentY);
    doc.text(`$${safeParseFloat(presupuesto.total).toFixed(2)}`, valX, currentY, { align: "right" });
    currentY += lineH;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const totalBolivares = safeParseFloat(presupuesto.total) * safeParseFloat(presupuesto.tasa_bcv);
    doc.text("TOTAL EN BS:", lblX, currentY);
    doc.text(`${totalBolivares.toFixed(2)} Bs.`, valX, currentY, { align: "right" });
    
    doc.setTextColor(100);
    doc.text(
      `Tasa $ Referencial: ${safeParseFloat(presupuesto.tasa_bcv).toFixed(2)} Bs.`,
      pageWidth - 3.5,
      currentY,
      { align: "left" }
    );
    doc.setTextColor(0);

    // Pie de Página Dinámico
    currentY += 0.3;

    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    const footerText = "Nota: Este presupuesto tiene una validez de 15 días continuos. Los precios están sujetos a cambio sin previo aviso. No asegura reserva de mercancía.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 2 * startX);
    doc.text(splitFooter, startX, currentY);

    // --- ENVIAR PDF ---
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error al generar el PDF del presupuesto:", error);
    next(error);
  }
};

// CRÍTICO: Exportar las funciones correctamente.
module.exports = {
  crearPresupuesto,
  generarPDFPresupuesto,
};
