const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

/**
 * Servicio centralizado para la generación de reportes en Excel.
 */
const generarExcelExportacion = async ({
  res,
  titulo,
  columnas,
  datos,
  nombreArchivo,
  incluirTotales = false,
  columnasTotales = [],
  empresaData = null,
}) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(titulo);

    // --- 1. CONFIGURACIÓN DE FILAS INICIALES (HEADER CORPORATIVO) ---
    // Reservamos las primeras 5 filas
    for (let i = 1; i <= 5; i++) {
      worksheet.getRow(i).height = 20;
    }

    // --- LOGO (Esquina superior izquierda A1) ---
    const logoPath = path.join(
      __dirname,
      "..",
      "..",
      "Frontend",
      "img",
      "logo.PNG",
    );
    if (fs.existsSync(logoPath)) {
      const logoId = workbook.addImage({
        filename: logoPath,
        extension: "png",
      });
      worksheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 80, height: 80 },
      });
    }

    // --- DATOS DE LA EMPRESA ---
    const empresaRow = worksheet.getRow(1);
    empresaRow.getCell(2).value = empresaData
      ? empresaData.nombre
      : "FERRETERIA XYZ, C.A.";
    empresaRow.getCell(2).font = { bold: true, size: 14 };

    const rifRow = worksheet.getRow(2);
    rifRow.getCell(2).value = empresaData
      ? `RIF: ${empresaData.rif}`
      : "RIF: J-12345678-9";
    rifRow.getCell(2).font = { bold: true, size: 10 };

    const dirRow = worksheet.getRow(3);
    dirRow.getCell(2).value = "Av. Principal, Local 1, Ciudad, Estado";
    dirRow.getCell(2).font = { size: 9 };

    // --- TÍTULO DEL REPORTE (Centrado relativo al contenido) ---
    const totalCols = columnas.length;
    const middleCol = Math.ceil(totalCols / 2);
    const titleCell = worksheet.getCell(4, middleCol > 2 ? middleCol : 3);
    titleCell.value = titulo.toUpperCase();
    titleCell.font = { bold: true, size: 16, color: { argb: "FF1A5276" } };
    titleCell.alignment = { horizontal: "center" };

    // --- FECHA DE GENERACIÓN (Esquina superior derecha) ---
    const dateCell = worksheet.getCell(1, totalCols);
    dateCell.value = `Fecha: ${new Date().toLocaleDateString()}`;
    dateCell.font = { italic: true, size: 10 };
    dateCell.alignment = { horizontal: "right" };

    // --- 2. DEFINICIÓN DE TABLA ---
    const tableStartY = 6;

    // Configurar columnas
    worksheet.columns = columnas.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
    }));

    // Estilo de la cabecera de la tabla (Fila 6)
    const headerRow = worksheet.getRow(tableStartY);
    headerRow.values = columnas.map((col) => col.header);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2C3E50" },
      };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // --- 3. AGREGAR DATOS ---
    datos.forEach((item) => {
      const row = worksheet.addRow(item);
      row.eachCell((cell, colNumber) => {
        const colDef = columnas[colNumber - 1];

        // Bordes
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        // Formato contable si es necesario
        if (colDef.type === "currency") {
          cell.numFmt = '"$"#,##0.00';
          cell.alignment = { horizontal: "right" };
        }
      });
    });

    // --- 4. FILA DE TOTALES (Opcional) ---
    if (incluirTotales && datos.length > 0) {
      const lastRowNumber = worksheet.lastRow.number + 1;
      const totalRow = worksheet.getRow(lastRowNumber);

      columnas.forEach((col, index) => {
        const cell = totalRow.getCell(index + 1);
        if (columnasTotales.includes(col.key)) {
          const colLetter = worksheet.getColumn(index + 1).letter;
          cell.value = {
            formula: `SUM(${colLetter}${tableStartY + 1}:${colLetter}${lastRowNumber - 1})`,
          };
          cell.numFmt = '"$"#,##0.00';
          cell.font = { bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFEBF5FB" },
          };
        } else if (index === 0) {
          cell.value = "TOTALES";
          cell.font = { bold: true };
        }

        cell.border = {
          top: { style: "double" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    // Activar filtros automáticos
    worksheet.autoFilter = {
      from: { row: tableStartY, col: 1 },
      to: { row: tableStartY, col: totalCols },
    };

    // Ajuste automático de columnas (basado en el contenido)
    worksheet.columns.forEach((column) => {
      let maxColumnLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxColumnLength) {
          maxColumnLength = columnLength;
        }
      });
      column.width = maxColumnLength < 12 ? 12 : maxColumnLength + 2;
    });

    // --- 5. STREAMING AL NAVEGADOR ---
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${nombreArchivo}`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error al generar el archivo Excel" });
    }
  }
};

module.exports = {
  generarExcelExportacion,
};
