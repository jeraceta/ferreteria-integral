/**
 * ajustes.controller.js
 * =====================
 * ¡Hola! Este archivo es el "cerebro" del módulo de Ajuste de Inventario.
 * Aquí vive toda la lógica para registrar correcciones de stock, generar
 * el comprobante PDF con membrete de la empresa y consultar el historial.
 *
 * Pienso en un "ajuste" como cuando el encargado cuenta físicamente los
 * productos y descubre que hay más o menos que lo que dice el sistema.
 * ¡Este módulo soluciona eso! 🎯
 */

// Importamos las herramientas que vamos a necesitar:
const pool = require("../db"); // La conexión a MySQL
// ✨ CORRECCIÓN IMPORTANTE: En Node.js, jsPDF debe importarse con destructuring {}
// Así le decimos: "Quiero la clase jsPDF del paquete jspdf"
const { jsPDF } = require("jspdf"); // Para generar PDFs (correcta sintaxis Node.js)
require("jspdf-autotable"); // Plugin para hacer tablas bonitas en el PDF
const fs = require("fs"); // Para leer archivos del disco (el logo)
const path = require("path"); // Para construir rutas de archivos
const { getEmpresaConfig } = require("../config/empresa");
const { createJsPdf } = require("../utils/pdfFormatHelper");

// ─────────────────────────────────────────────────────────────────────────────
// 📋 FUNCIÓN 1: procesarAjuste
// Esta función recibe la lista de cambios de stock y los aplica a la base
// de datos. Es como el "guardar" final después de que el encargado
// terminó de revisar el inventario físico.
// ─────────────────────────────────────────────────────────────────────────────
const procesarAjuste = async (req, res, next) => {
  // Extraemos los datos que el frontend nos envía en el cuerpo del request
  const { motivo, detalles } = req.body;
  // El usuario que está logueado lo obtenemos del token JWT (middleware de auth)
  const id_usuario = req.user?.id;

  // 🛡️ Validación básica: necesitamos el motivo y al menos un producto
  if (
    !motivo ||
    !detalles ||
    !Array.isArray(detalles) ||
    detalles.length === 0
  ) {
    return res.status(400).json({
      message: "Motivo y al menos un detalle de ajuste son requeridos.",
    });
  }

  // Tomamos una conexión del pool para manejar una transacción (todo o nada)
  const connection = await pool.getConnection();
  try {
    // 🔒 Iniciamos la transacción: si algo falla, nada se guarda
    await connection.beginTransaction();

    // 📊 Generamos un número de ajuste único y secuencial
    // Ej: AJ-000001, AJ-000002, etc.
    const [lastAjuste] = await connection.query(
      "SELECT numero_ajuste FROM ajustes_stock ORDER BY id DESC LIMIT 1",
    );
    let numero_ajuste;
    if (lastAjuste.length > 0 && lastAjuste[0].numero_ajuste) {
      // Si ya hay ajustes, tomamos el último número y le sumamos 1
      const lastNum = parseInt(
        lastAjuste[0].numero_ajuste.replace("AJ-", ""),
        10,
      );
      numero_ajuste = "AJ-" + String(lastNum + 1).padStart(6, "0");
    } else {
      // Si es el primero, empezamos desde AJ-000001
      numero_ajuste = "AJ-000001";
    }

    // 💾 Guardamos el "encabezado" del ajuste: quién, cuándo y por qué
    const [ajusteResult] = await connection.query(
      "INSERT INTO ajustes_stock (id_usuario, motivo, numero_ajuste) VALUES (?, ?, ?)",
      [id_usuario, motivo, numero_ajuste],
    );
    const id_ajuste = ajusteResult.insertId; // El ID del ajuste recién creado

    // 🔄 Ahora procesamos cada producto del ajuste uno por uno
    const detallesCompletos = [];
    for (const detalle of detalles) {
      const { id_producto, ajuste } = detalle;

      // Consultamos el stock actual del producto en el depósito principal (ID=1)
      const [stockRows] = await connection.query(
        "SELECT cantidad FROM stock_depositos WHERE id_producto = ? AND id_deposito = 1 FOR UPDATE",
        [id_producto],
      );

      if (stockRows.length === 0) {
        // Este producto no existe en el depósito 1, error!
        throw new Error(
          `Producto ID ${id_producto} no encontrado en depósito principal.`,
        );
      }

      const stock_anterior = stockRows[0].cantidad;
      // Calculamos el stock nuevo sumando el ajuste (puede ser negativo!)
      const stock_nuevo = stock_anterior + ajuste;

      if (stock_nuevo < 0) {
        throw new Error(
          `El ajuste dejaría el stock del producto ${id_producto} en negativo.`,
        );
      }

      // 📝 Guardamos el detalle del ajuste (antes, cambio, después)
      await connection.query(
        "INSERT INTO ajustes_stock_detalle (id_ajuste, id_producto, stock_anterior, ajuste, stock_nuevo) VALUES (?, ?, ?, ?, ?)",
        [id_ajuste, id_producto, stock_anterior, ajuste, stock_nuevo],
      );

      // 🔧 Actualizamos el stock real en la tabla stock_depositos
      await connection.query(
        "UPDATE stock_depositos SET cantidad = ? WHERE id_producto = ? AND id_deposito = 1",
        [stock_nuevo, id_producto],
      );

      // 🔧 También actualizamos el campo stock general en la tabla productos
      const [totalStock] = await connection.query(
        "SELECT SUM(cantidad) AS total FROM stock_depositos WHERE id_producto = ?",
        [id_producto],
      );
      await connection.query("UPDATE productos SET stock = ? WHERE id = ?", [
        totalStock[0].total || 0,
        id_producto,
      ]);

      // Guardamos los datos completos para el PDF
      const [prodInfo] = await connection.query(
        "SELECT codigo, nombre FROM productos WHERE id = ?",
        [id_producto],
      );
      detallesCompletos.push({
        codigo: prodInfo[0]?.codigo || "",
        nombre: prodInfo[0]?.nombre || "",
        stock_anterior,
        ajuste,
        stock_nuevo,
      });
    }

    // ✅ Si todo salió bien, confirmamos la transacción
    await connection.commit();

    // Respondemos con los datos para que el frontend pueda generar o mostrar el PDF
    res.status(201).json({
      message: "Ajuste procesado exitosamente.",
      id_ajuste,
      numero_ajuste,
      detalles: detallesCompletos,
    });
  } catch (error) {
    // ❌ Si algo falló, revertimos TODO como si nunca hubiera pasado
    await connection.rollback();
    console.error("Error en procesarAjuste:", error.message);
    next(error);
  } finally {
    // Siempre liberamos la conexión de vuelta al pool
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 📄 FUNCIÓN 2: generarComprobanteAjuste
// Genera el PDF del comprobante de ajuste con el membrete de la empresa.
// Es como imprimir el "acta" oficial de los cambios realizados.
// ─────────────────────────────────────────────────────────────────────────────
const generarComprobanteAjuste = async (req, res, next) => {
  try {
    const { id } = req.params; // ID del ajuste que queremos imprimir

    // 📥 Traemos los datos del ajuste (encabezado)
    const [ajusteData] = await pool.query(
      `SELECT a.*, u.nombre as responsable
       FROM ajustes_stock a
       JOIN usuarios u ON a.id_usuario = u.id
       WHERE a.id = ?`,
      [id],
    );

    if (ajusteData.length === 0) {
      return res.status(404).json({ message: "Ajuste no encontrado." });
    }
    const ajuste = ajusteData[0];

    // 📥 Traemos los detalles (los productos ajustados)
    const [detalles] = await pool.query(
      `SELECT d.*, p.codigo, p.nombre
       FROM ajustes_stock_detalle d
       JOIN productos p ON d.id_producto = p.id
       WHERE d.id_ajuste = ?`,
      [id],
    );

    // Usamos el helper para decidir el tamaño del papel según los items
    const itemCount = detalles.length;
    const { doc, pageWidth, pageHeight } = createJsPdf(itemCount);
    const startX = 0.5;

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

    // ─── Intentamos cargar el logo dinámico ───
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error al cargar logo dinámico en Ajustes:", e);
      }
    }

    // --- ENCABEZADO CON COMPROBANTE DE AJUSTE EN ESQUINA SUPERIOR DERECHA ---
    let currentY = 0.25;

    // Recuadro de COMPROBANTE DE AJUSTE (esquina superior derecha, compacto)
    const ajusteBoxW = 1.8;
    const ajusteBoxH = 0.55;
    const ajusteBoxX = pageWidth - startX - ajusteBoxW;
    const ajusteBoxY = currentY;
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.015);
    doc.rect(ajusteBoxX, ajusteBoxY, ajusteBoxW, ajusteBoxH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(44, 62, 80);
    doc.text("AJUSTE DE INVENTARIO", ajusteBoxX + ajusteBoxW / 2, ajusteBoxY + 0.12, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(`N° Ajuste: ${ajuste.numero_ajuste}`, ajusteBoxX + 0.08, ajusteBoxY + 0.25);
    doc.text(`Fecha: ${new Date(ajuste.fecha_ajuste).toLocaleDateString()}`, ajusteBoxX + 0.08, ajusteBoxY + 0.38);

    // Logo (a la izquierda)
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 0.6, 0.6);
    }
    
    // Datos de empresa (al lado del logo, sin invadir el recuadro)
    let textStartX = logoBase64 ? startX + 0.7 : startX;
    const maxTextWidth = ajusteBoxX - textStartX - 0.1;

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
    currentY = Math.max(currentY + 0.2, ajusteBoxY + ajusteBoxH + 0.12);

    // --- CUADRÍCULA: RESPONSABLE (izq) + MOTIVO (der) ---
    const boxHeight = 0.85;
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.rect(startX, currentY, pageWidth - 2 * startX, boxHeight);
    
    const midX = pageWidth / 2;
    doc.line(midX, currentY, midX, currentY + boxHeight);
    
    const col1X = startX + 0.08;
    const col2X = midX + 0.08;
    const colWidth = midX - startX - 0.16;
    
    // --- COLUMNA 1: RESPONSABLE ---
    let innerY = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RESPONSABLE", col1X, innerY);
    
    innerY += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const nombreRespSplit = doc.splitTextToSize(`${ajuste.responsable || "N/A"}`, colWidth);
    doc.text(nombreRespSplit, col1X, innerY);

    // --- COLUMNA 2: MOTIVO ---
    let innerYRight = currentY + 0.12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("MOTIVO DEL AJUSTE", col2X, innerYRight);

    innerYRight += 0.13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const motivoLines = doc.splitTextToSize(ajuste.motivo || "Sin motivo", colWidth);
    doc.text(motivoLines, col2X, innerYRight);

    currentY += boxHeight + 0.12;

    // ─── TABLA con los cambios de stock ───
    const tableBody = detalles.map((d) => [
      d.codigo,
      d.nombre,
      d.stock_anterior,
      d.ajuste > 0 ? `+${d.ajuste}` : d.ajuste, // Mostramos + si es positivo
      d.stock_nuevo,
    ]);

    doc.autoTable({
      startY: currentY,
      head: [["Código", "Producto", "Anterior", "Ajuste", "Nuevo"]],
      body: tableBody,
      theme: "grid",
      margin: { left: startX, right: startX },
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { 
        fontSize: 7,
        cellPadding: 0.05,
      },
      styles: { 
        lineWidth: 0.01,
        lineColor: [200, 200, 200]
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    currentY = doc.lastAutoTable.finalY + 0.3;

    if (currentY > pageHeight - 1.2) {
      doc.addPage();
      currentY = 0.5;
    }

    // ─── Línea de firmas y nota ───
    const sigW = 2.0;
    
    doc.setDrawColor(100);
    doc.setLineWidth(0.01);
    doc.line(startX + 0.2, currentY, startX + 0.2 + sigW, currentY);
    doc.line(pageWidth - startX - 0.2 - sigW, currentY, pageWidth - startX - 0.2, currentY);
    
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("Firma del Responsable", startX + 0.2 + (sigW/2), currentY + 0.1, { align: "center" });
    doc.text("Firma de Aprobación", pageWidth - startX - 0.2 - (sigW/2), currentY + 0.1, { align: "center" });

    // ─── Pie de página ───
    currentY += 0.3;
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80);
    const footerText = "Este comprobante es un registro interno de ajuste de inventario. Conserve para auditoría. Los cambios realizados se han aplicado directamente en el stock general y en el depósito principal.";
    const splitFooter = doc.splitTextToSize(footerText, pageWidth - 2 * startX);
    doc.text(splitFooter, startX, currentY);
    doc.setTextColor(0);

    // 📤 Enviamos el PDF como respuesta
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("Error generando comprobante de ajuste:", error.message);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 📋 FUNCIÓN 3: obtenerHistorialAjustes
// Devuelve la lista de todos los ajustes realizados, con los datos básicos.
// Es para la pantalla de "Historial" donde el admin puede ver y reimprimir.
// ─────────────────────────────────────────────────────────────────────────────
const obtenerHistorialAjustes = async (req, res, next) => {
  try {
    // Traemos todos los ajustes ordenados del más reciente al más antiguo
    const [rows] = await pool.query(
      `SELECT a.id, a.numero_ajuste, a.motivo, a.fecha_ajuste,
              u.nombre AS responsable,
              COUNT(d.id) AS total_productos
       FROM ajustes_stock a
       JOIN usuarios u ON a.id_usuario = u.id
       LEFT JOIN ajustes_stock_detalle d ON d.id_ajuste = a.id
       GROUP BY a.id
       ORDER BY a.fecha_ajuste DESC`,
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// 📦 Exportamos las tres funciones para usarlas en las rutas (routes)
module.exports = {
  procesarAjuste,
  generarComprobanteAjuste,
  obtenerHistorialAjustes,
};
