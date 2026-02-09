const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");

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
      [
        id_cliente,
        subtotal,
        impuesto,
        monto_flete || 0.0,
        tasa_bcv,
        total,
      ],
    );
    const id_presupuesto = presupuestoResult.insertId;

    // Inserción de los detalles del presupuesto (sin cambios aquí)
    for (const detalle of detalles) {
      const { id_producto, cantidad, precio_unitario } = detalle;
      if (!id_producto || cantidad <= 0 || precio_unitario === undefined) {
        throw new Error(`El detalle del producto ID ${id_producto} es inválido.`);
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

    // 1. Obtener datos del presupuesto y del cliente.
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

    // --- INICIALIZACIÓN Y CONFIGURACIÓN DEL DOCUMENTO ---
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
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

    // --- MARCA DE AGUA ---
    if (logoBase64) {
      const imgProps = doc.getImageProperties(logoBase64);
      const logoWidth = 120;
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
        doc.addImage(logoBase64, "PNG", x, y, logoWidth, logoHeight);
      }
      doc.restoreGraphicsState();
    }

    // --- ENCABEZADO ---
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 10, 30, 30);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    // Asumiendo un nombre de empresa genérico, se puede cambiar
    doc.text("Ramírez Suministros & Servicios, C.A.", 48, 18);
    doc.text("RIF: J-12345678-9", 48, 24);
    doc.text("Av. Principal, Local 1, Ciudad, Estado", 48, 30);
    doc.text("Teléfono: 0212-1234567", 48, 36);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("PRESUPUESTO", pageWidth - 15, 20, { align: "right" });

    // --- Bloque de control y fechas ---
    const controlId = String(presupuesto.id).padStart(6, "0");
    doc.setFontSize(10);
    doc.text(`N° de Control:`, pageWidth - 60, 30);
    doc.setFont("helvetica", "normal");
    doc.text(controlId, pageWidth - 15, 30, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text(`Fecha de Emisión:`, pageWidth - 60, 36);
    doc.setFont("helvetica", "normal");
    doc.text(
      new Date(presupuesto.fecha_emision).toLocaleDateString("es-VE"),
      pageWidth - 15,
      36,
      { align: "right" },
    );

    doc.setFont("helvetica", "bold");
    doc.text(`Válido hasta:`, pageWidth - 60, 42);
    doc.setFont("helvetica", "normal");
    doc.text(
      new Date(presupuesto.fecha_vencimiento).toLocaleDateString("es-VE"),
      pageWidth - 15,
      42,
      { align: "right" },
    );

    // --- BLOQUE DE CLIENTE ---
    doc.setDrawColor(200);
    doc.rect(14, 48, pageWidth - 28, 25); // Recuadro para el cliente
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", 18, 54);
    doc.setFont("helvetica", "normal");
    doc.text(`Razón Social: ${presupuesto.razon_social}`, 18, 60);
    doc.text(`RIF/Cédula: ${presupuesto.rif_cedula}`, 18, 66);
    doc.text(`Teléfono: ${presupuesto.telefono || "N/A"}`, 120, 60);
    doc.text(`Dirección: ${presupuesto.direccion_fiscal || "N/A"}`, 18, 72);

    // --- TABLA DE ARTÍCULOS ---
    const tableBody = detallesPresupuesto.map((d) => {
      // Combina descripción y marca, solo si la marca existe.
      const descripcionCompleta = d.marca ? `${d.descripcion} (${d.marca})` : d.descripcion;
      return [
        d.codigo,
        descripcionCompleta,
        d.cantidad,
        `$${safeParseFloat(d.precio_unitario).toFixed(2)}`,
        `$${safeParseFloat(d.total).toFixed(2)}`,
      ];
    });

    doc.autoTable({
      startY: 78,
      head: [["Código", "Descripción", "Cantidad", "Precio Unit.", "Total"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [30, 81, 123], // Azul oscuro profesional
        textColor: 255,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 25 }, // Código
        1: { cellWidth: 'auto' }, // Descripción se ajusta
        2: { cellWidth: 20, halign: 'center' }, // Cantidad
        3: { cellWidth: 30, halign: 'right' }, // Precio
        4: { cellWidth: 30, halign: 'right' }, // Total
      },
      styles: { lineWidth: 0.1, lineColor: [220, 220, 220] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // --- BLOQUE DE TOTALES ---
    let finalY = doc.lastAutoTable.finalY;
    const finalYAnchor = pageHeight - 35; // Ancla para el pie de página
    let currentY;

    if (finalY > finalYAnchor - 40) {
      doc.addPage();
      currentY = 40;
    } else {
      currentY = Math.max(finalY + 10, finalYAnchor - 40);
    }

    const totalXAlign = pageWidth - 70;
    const valueXAlign = pageWidth - 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(presupuesto.subtotal).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 7;

    if (presupuesto.monto_flete > 0) {
      doc.text("Flete / Envío:", totalXAlign, currentY, { align: "left" });
      doc.text(
        `$${safeParseFloat(presupuesto.monto_flete).toFixed(2)}`,
        valueXAlign,
        currentY,
        { align: "right" },
      );
      currentY += 7;
    }

    doc.text("IVA (16%):", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(presupuesto.impuesto).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL A PAGAR:", totalXAlign, currentY, { align: "left" });
    doc.text(
      `$${safeParseFloat(presupuesto.total).toFixed(2)}`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 8;

    const totalBolivares =
      safeParseFloat(presupuesto.total) * safeParseFloat(presupuesto.tasa_bcv);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Total en Bolívares (referencial):",
      totalXAlign,
      currentY,
      { align: "left" },
    );
    doc.text(
      `${totalBolivares.toFixed(2)} Bs.`,
      valueXAlign,
      currentY,
      { align: "right" },
    );
    currentY += 6;

    doc.setTextColor(100);
    doc.text(
      `Tasa $ Aplicada: ${safeParseFloat(presupuesto.tasa_bcv).toFixed(
        2,
      )} Bs.`,
      totalXAlign,
      currentY,
      { align: "left" },
    );
    doc.setTextColor(0);

    // --- PIE DE PÁGINA ---
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const footerText =
      "Este presupuesto es válido por 15 días continuos a partir de su fecha de emisión. Los precios están sujetos a cambio sin previo aviso. La disponibilidad de los productos está sujeta a la existencia en inventario al momento de concretar la compra.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 28);
    doc.text(splitFooter, 14, pageHeight - 20);

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
