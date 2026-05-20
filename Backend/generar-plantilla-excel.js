/**
 * generar-plantilla-excel.js
 * ==========================
 * Script de utilidad: genera un archivo Excel (.xlsx) con el formato
 * correcto para que la administradora pueda llenarlo y luego importarlo.
 *
 * Uso: node Backend/generar-plantilla-excel.js
 * Resultado: Genera "plantilla_importacion_productos.xlsx" en la raíz del proyecto.
 */

const ExcelJS = require("exceljs");
const path = require("path");

async function generarPlantilla() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Ferretería";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Productos", {
    pageSetup: { fitToPage: true, fitToWidth: 1 },
  });

  // ── Definimos las columnas con su ancho y encabezado ──
  ws.columns = [
    { header: "codigo",       key: "codigo",       width: 15 },
    { header: "nombre",       key: "nombre",       width: 35 },
    { header: "marca",        key: "marca",        width: 20 },
    { header: "descripcion",  key: "descripcion",  width: 40 },
    { header: "precio_costo", key: "precio_costo", width: 15 },
    { header: "precio_venta", key: "precio_venta", width: 15 },
    { header: "stock",        key: "stock",        width: 12 },
    { header: "stock_minimo", key: "stock_minimo", width: 14 },
    { header: "ubicacion",    key: "ubicacion",    width: 15 },
  ];

  // ── Estilo del encabezado (fila 1) ──
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17559B" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  headerRow.height = 22;

  // ── Filas de ejemplo para guiar a la administradora ──
  const ejemplos = [
    { codigo: "HER-001", nombre: "Martillo Galponero 20oz", marca: "Total", descripcion: "Mango de goma antideslizante", precio_costo: 12.50, precio_venta: 18.00, stock: 25, stock_minimo: 5, ubicacion: "P1-E3-T2" },
    { codigo: "ELE-015", nombre: "Cable THHN #12 Negro", marca: "Cabel", descripcion: "Rollo 100m 600V", precio_costo: 45.00, precio_venta: 65.00, stock: 10, stock_minimo: 3, ubicacion: "P2-E1-T1" },
    { codigo: "PLO-007", nombre: "Llave de Paso 1/2\"", marca: "Corona", descripcion: "Latón reforzado", precio_costo: 8.00, precio_venta: 14.50, stock: 50, stock_minimo: 10, ubicacion: "P1-E5-T3" },
  ];

  ejemplos.forEach((ej, i) => {
    const row = ws.addRow(ej);
    // Filas alternas: blanco y azul muy claro
    const bgColor = i % 2 === 0 ? "FFF0F7FF" : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.border = {
        top: { style: "hair" }, bottom: { style: "hair" },
        left: { style: "hair" }, right: { style: "hair" },
      };
    });
  });

  // ── Hoja de instrucciones ──
  const wsInfo = workbook.addWorksheet("📋 Instrucciones");
  wsInfo.getColumn(1).width = 80;
  const instrucciones = [
    ["INSTRUCCIONES PARA LLENAR EL EXCEL DE IMPORTACIÓN"],
    [""],
    ["1. Trabaja en la hoja 'Productos' (pestaña de la izquierda)."],
    ["2. NO modifiques ni elimines la fila de cabeceras (fila 1 de color azul)."],
    ["3. Comienza a llenar desde la fila 2 en adelante."],
    ["4. Las columnas OBLIGATORIAS son: codigo, nombre, precio_costo, precio_venta."],
    ["5. Si un código ya existe en el sistema, el producto será ACTUALIZADO."],
    ["6. Si el código es nuevo, el producto será CREADO."],
    [""],
    ["FORMATO DE UBICACIÓN:"],
    ["  P1-E3-T2 significa: Pasillo 1, Estante 3, Tablero 2"],
    ["  Usa guiones para separar cada nivel."],
    [""],
    ["FORMATO DE PRECIOS:"],
    ["  Usa punto (.) como separador decimal. Ej: 12.50 ✓    12,50 ✗"],
    [""],
    ["Las filas de ejemplo en color azul claro son solo de referencia, puedes borrarlas."],
  ];

  instrucciones.forEach(([texto], idx) => {
    const cell = wsInfo.getCell(`A${idx + 1}`);
    cell.value = texto;
    if (idx === 0) {
      cell.font = { bold: true, size: 14, color: { argb: "FF17559B" } };
    } else {
      cell.font = { size: 11 };
    }
  });

  // ── Guardamos el archivo ──
  const outputPath = path.join(__dirname, "..", "plantilla_importacion_productos.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Plantilla generada en: ${outputPath}`);
}

generarPlantilla().catch(console.error);
