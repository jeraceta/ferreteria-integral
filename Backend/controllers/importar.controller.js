/**
 * importar.controller.js
 * ======================
 * ¡Este archivo es súper importante! 🎉
 * Aquí vive toda la lógica para importar productos masivamente desde un
 * archivo Excel (.xlsx) o CSV que preparó la administradora.
 *
 * El flujo es así:
 *  1. El frontend manda el archivo usando un formulario multipart/form-data
 *  2. Nosotros lo leemos con ExcelJS (una librería genial para leer Excel)
 *  3. Por cada fila del Excel, intentamos insertar o actualizar el producto
 *  4. Al final, generamos un reporte PDF con lo que se cargó y lo enviamos
 *
 * Formato esperado del Excel (primera fila = cabeceras):
 * codigo | nombre | marca | descripcion | precio_costo | precio_venta | stock | stock_minimo | ubicacion
 */

// Importamos las herramientas que necesitamos
const pool = require("../db"); // Conexión a MySQL
const ExcelJS = require("exceljs"); // Para leer archivos .xlsx
const jsPDF = require("jspdf"); // Para generar el PDF del reporte
require("jspdf-autotable"); // Tablas bonitas en el PDF
const multer = require("multer"); // Para recibir archivos en el servidor
const path = require("path");
const fs = require("fs");

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️ CONFIGURACIÓN DE MULTER
// Multer es el middleware que se encarga de recibir archivos del frontend.
// Lo configuramos para guardar el archivo en una carpeta temporal.
// ─────────────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  // Carpeta donde se guarda temporalmente el Excel
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "..", "uploads", "temp");
    // Si la carpeta no existe, la creamos
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  // Nombre del archivo: timestamp + nombre original para evitar conflictos
  filename: (req, file, cb) => {
    cb(null, `import_${Date.now()}_${file.originalname}`);
  },
});

// Filtro: solo aceptamos Excel (.xlsx) y CSV (.csv)
const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/csv", // .csv
    "application/csv",
  ];
  // También verificamos la extensión del archivo por si acaso
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(file.mimetype) || ext === ".xlsx" || ext === ".csv") {
    cb(null, true); // ✅ Archivo aceptado
  } else {
    cb(new Error("Solo se aceptan archivos .xlsx o .csv"), false); // ❌ Rechazado
  }
};

// Creamos el middleware de multer con nuestras configuraciones
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Máximo 10 MB
});

// Exportamos el middleware para usarlo en las rutas
const uploadMiddleware = upload.single("archivo"); // "archivo" es el nombre del campo en el form

// ─────────────────────────────────────────────────────────────────────────────
// 📊 FUNCIÓN PRINCIPAL: procesarImportacion
// Esta es la función que hace todo el trabajo pesado:
//  - Lee el Excel fila por fila
//  - Por cada producto, decide si crearlo o actualizarlo (UPSERT)
//  - Lleva un registro de éxitos y errores
//  - Genera el PDF del reporte
// ─────────────────────────────────────────────────────────────────────────────
const procesarImportacion = async (req, res, next) => {
  // Verificamos que se haya enviado un archivo
  if (!req.file) {
    return res.status(400).json({ message: "No se recibió ningún archivo." });
  }

  // 1. Obtener datos de la empresa
  const [empresaData] = await pool.query(
    "SELECT razon_social AS nombre, rif, direccion, telefono FROM empresa_datos WHERE id = 1",
  );
  const empresa =
    empresaData.length > 0
      ? empresaData[0]
      : {
          nombre: "FERRETERIA XYZ, C.A.",
          rif: "J-12345678-9",
          direccion: "Av. Principal, Local 1, Ciudad, Estado",
          telefono: "0212-1234567",
        };

  const filePath = req.file.path; // Ruta temporal donde se guardó el archivo
  const resultados = []; // Array donde guardaremos el resultado de cada fila
  let exitosos = 0; // Contador de productos importados exitosamente
  let fallidos = 0; // Contador de productos con error

  try {
    // ── Leemos el archivo Excel con ExcelJS ──
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Tomamos la primera hoja del Excel
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("El archivo Excel no tiene hojas de datos.");
    }

    // Obtenemos las cabeceras de la primera fila (fila 1)
    const cabeceras = [];
    worksheet.getRow(1).eachCell((cell) => {
      // Limpiamos el texto de las cabeceras (minúsculas, sin espacios)
      cabeceras.push(cell.value?.toString().trim().toLowerCase() || "");
    });

    // Verificamos que las columnas necesarias existan en el Excel
    const columnasNecesarias = [
      "codigo",
      "nombre",
      "precio_costo",
      "precio_venta",
    ];
    const faltantes = columnasNecesarias.filter((c) => !cabeceras.includes(c));
    if (faltantes.length > 0) {
      throw new Error(
        `El Excel no tiene las columnas obligatorias: ${faltantes.join(", ")}`,
      );
    }

    // ── Procesamos cada fila de datos (desde la fila 2 en adelante) ──
    const connection = await pool.getConnection();
    try {
      // Iteramos cada fila del Excel saltando la fila 1 (cabeceras)
      for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);

        // Función helper para leer el valor de una celda por nombre de columna
        const getCellValue = (columnName) => {
          const idx = cabeceras.indexOf(columnName);
          if (idx === -1) return null;
          const cell = row.getCell(idx + 1); // Las columnas en ExcelJS son 1-indexed
          const val = cell?.value;
          if (val === null || val === undefined || val === "") return null;
          return val.toString().trim();
        };

        // Extraemos los datos de esta fila
        const codigo = getCellValue("codigo");
        const nombre = getCellValue("nombre");

        // Si la fila está vacía (sin código ni nombre), la saltamos
        if (!codigo && !nombre) continue;

        // Si falta código o nombre, registramos el error y seguimos
        if (!codigo || !nombre) {
          resultados.push({
            fila: rowNum,
            codigo: codigo || "—",
            nombre: nombre || "—",
            estado: "ERROR",
            mensaje: "Falta código o nombre del producto (son obligatorios).",
          });
          fallidos++;
          continue;
        }

        // Construimos el objeto del producto con todos sus campos
        const productoData = {
          codigo,
          nombre,
          marca: getCellValue("marca") || null,
          descripcion: getCellValue("descripcion") || "",
          precio_costo: parseFloat(getCellValue("precio_costo")) || 0,
          precio_venta: parseFloat(getCellValue("precio_venta")) || 0,
          stock: parseInt(getCellValue("stock")) || 0,
          stock_minimo: parseInt(getCellValue("stock_minimo")) || 2,
          ubicacion: getCellValue("ubicacion") || "Sin ubicación",
        };

        try {
          // Buscamos si ya existe un producto con ese código
          const [existente] = await connection.execute(
            "SELECT id FROM productos WHERE codigo = ?",
            [productoData.codigo],
          );

          if (existente.length > 0) {
            // ── El producto EXISTE: lo ACTUALIZAMOS ──
            const idExistente = existente[0].id;
            await connection.execute(
              `UPDATE productos 
               SET nombre = ?, marca = ?, descripcion = ?, precio_venta = ?, precio_costo = ?,
                   stock_minimo = ?, ubicacion = ?
               WHERE id = ?`,
              [
                productoData.nombre,
                productoData.marca,
                productoData.descripcion,
                productoData.precio_venta,
                productoData.precio_costo,
                productoData.stock_minimo,
                productoData.ubicacion,
                idExistente,
              ],
            );

            // También actualizamos el stock si viene en el Excel
            if (productoData.stock > 0) {
              await connection.execute(
                "UPDATE stock_depositos SET cantidad = ? WHERE id_producto = ? AND id_deposito = 1",
                [productoData.stock, idExistente],
              );
              await connection.execute(
                "UPDATE productos SET stock = ? WHERE id = ?",
                [productoData.stock, idExistente],
              );
            }

            resultados.push({
              fila: rowNum,
              codigo: productoData.codigo,
              nombre: productoData.nombre,
              estado: "ACTUALIZADO",
              mensaje: "Producto existente actualizado.",
            });
          } else {
            // ── El producto NO EXISTE: lo CREAMOS ──
            const [newProd] = await connection.execute(
              `INSERT INTO productos 
               (codigo, nombre, marca, descripcion, precio_venta, precio_costo, stock_minimo, stock, ubicacion)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                productoData.codigo,
                productoData.nombre,
                productoData.marca,
                productoData.descripcion,
                productoData.precio_venta,
                productoData.precio_costo,
                productoData.stock_minimo,
                productoData.stock,
                productoData.ubicacion,
              ],
            );

            const nuevoId = newProd.insertId;

            // Inicializamos el stock en los 3 depósitos (principal, dañado, inmovilizado)
            await connection.execute(
              "INSERT INTO stock_depositos (id_producto, id_deposito, cantidad) VALUES (?, 1, ?), (?, 2, 0), (?, 3, 0)",
              [nuevoId, productoData.stock, nuevoId, nuevoId],
            );

            resultados.push({
              fila: rowNum,
              codigo: productoData.codigo,
              nombre: productoData.nombre,
              estado: "CREADO",
              mensaje: "Producto nuevo importado exitosamente.",
            });
          }

          exitosos++;
        } catch (rowError) {
          // Si una fila específica falló, la anotamos pero continuamos con las demás
          resultados.push({
            fila: rowNum,
            codigo: productoData.codigo,
            nombre: productoData.nombre,
            estado: "ERROR",
            mensaje: rowError.message,
          });
          fallidos++;
        }
      }
    } finally {
      connection.release(); // Siempre liberamos la conexión
    }

    // ── Generamos el PDF del reporte ──
    const pdfBuffer = generarReportePDF(
      resultados,
      exitosos,
      fallidos,
      req.file.originalname,
      empresa,
    );

    // Borramos el archivo temporal del servidor (ya no lo necesitamos)
    fs.unlink(filePath, () => {});

    // Enviamos el PDF como respuesta
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="reporte_importacion_${Date.now()}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    // Si ocurrió un error general, borramos el archivo temporal y respondemos con error
    fs.unlink(filePath, () => {});
    console.error("Error en procesarImportacion:", error.message);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 📄 FUNCIÓN AUXILIAR: generarReportePDF
// Genera un PDF con el reporte de la importación: resumen + tabla de resultados
// ─────────────────────────────────────────────────────────────────────────────
function generarReportePDF(
  resultados,
  exitosos,
  fallidos,
  nombreArchivo,
  empresaData = null,
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Intentar cargar el logo ──
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
    logoBase64 = fs.readFileSync(logoPath).toString("base64");
  } catch (_) {
    /* sin logo está bien */
  }

  // ── Encabezado ──
  if (logoBase64) doc.addImage(logoBase64, "PNG", 14, 8, 25, 25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${empresaData ? empresaData.nombre : "FERRETERIA XYZ, C.A."} | RIF: ${empresaData ? empresaData.rif : "J-12345678-9"}`,
    43,
    16,
  );
  doc.text(
    `${empresaData ? empresaData.direccion : "Av. Principal, Local 1"} | Telf: ${empresaData ? empresaData.telefono : "0212-1234567"}`,
    43,
    22,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("REPORTE DE IMPORTACIÓN MASIVA", pageWidth / 2, 12, {
    align: "center",
  });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Archivo: ${nombreArchivo} | Fecha: ${new Date().toLocaleString("es-VE")}`,
    pageWidth / 2,
    18,
    { align: "center" },
  );

  // ── Tarjetas de resumen ──
  const total = exitosos + fallidos;
  doc.setFillColor(230, 255, 230); // Verde claro para éxitos
  doc.rect(14, 32, 55, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 150, 0);
  doc.text(String(exitosos), 41, 45, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("Importados / Actualizados", 41, 50, { align: "center" });

  doc.setFillColor(255, 230, 230); // Rojo claro para errores
  doc.rect(75, 32, 55, 20, "F");
  doc.setTextColor(200, 0, 0);
  doc.setFontSize(18);
  doc.text(String(fallidos), 102, 45, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("Con error", 102, 50, { align: "center" });

  doc.setFillColor(220, 235, 255); // Azul claro para total
  doc.rect(136, 32, 55, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 80, 180);
  doc.text(String(total), 163, 45, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("Total procesadas", 163, 50, { align: "center" });

  // ── Tabla de resultados ──
  const tableBody = resultados.map((r) => [
    r.fila,
    r.codigo,
    r.nombre.substring(0, 35), // Truncamos nombres muy largos
    r.estado,
    r.mensaje.substring(0, 40),
  ]);

  doc.autoTable({
    startY: 60,
    head: [["Fila", "Código", "Nombre", "Estado", "Detalle"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [23, 85, 155],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
    },
    // Color condicional por estado (verde = ok, rojo = error)
    didParseCell: (data) => {
      if (data.column.index === 3 && data.section === "body") {
        const estado = data.cell.raw;
        if (estado === "CREADO") {
          data.cell.styles.textColor = [0, 140, 0];
          data.cell.styles.fontStyle = "bold";
        } else if (estado === "ACTUALIZADO") {
          data.cell.styles.textColor = [0, 100, 200];
          data.cell.styles.fontStyle = "bold";
        } else if (estado === "ERROR") {
          data.cell.styles.textColor = [200, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // ── Pie de página ──
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150);
  doc.text(
    "Los productos marcados como CREADO son nuevos. Los ACTUALIZADO ya existían y se modificaron sus datos.",
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" },
  );

  // Retornamos el PDF como Buffer para enviarlo en la respuesta
  return Buffer.from(doc.output("arraybuffer"));
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Exportamos el middleware y la función principal
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { procesarImportacion, uploadMiddleware };
