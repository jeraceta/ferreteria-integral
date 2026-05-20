const { jsPDF } = require("jspdf");

// Umbral máximo de artículos para usar MEDIA CARTA.
const PDF_SIZE_THRESHOLD = 10;

// Este helper decide automáticamente el formato de página basado en la
// cantidad de filas/artículos del reporte. Si hay pocos registros, usamos
// media carta para ahorrar papel y hacer el PDF más compacto. Si hay más
// de 10, subimos a carta completa para mantener legibilidad.
function decidePdfOptions(itemCount, threshold = PDF_SIZE_THRESHOLD) {
  const count = Number(itemCount) || 0;
  const useHalfLetter = count <= threshold;
  const format = useHalfLetter ? [5.5, 8.5] : [8.5, 11];
  const label = useHalfLetter ? "Media Carta" : "Carta Completa";

  return {
    format,
    isHalfLetter: useHalfLetter,
    label,
  };
}

// Crea un documento jsPDF usando el formato adecuado según la cantidad de filas.
// Esta función centraliza la decisión y permite que los controladores se enfoquen
// en el contenido, no en el tamaño de hoja.
function createJsPdf(itemCount, threshold = PDF_SIZE_THRESHOLD) {
  const { format, isHalfLetter, label } = decidePdfOptions(
    itemCount,
    threshold,
  );

  const doc = new jsPDF({ orientation: "p", unit: "in", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  return {
    doc,
    pageWidth,
    pageHeight,
    isHalfLetter,
    format,
    label,
  };
}

// Devuelve la configuración de tamaño para PDFKit según la cantidad de filas.
// Para PDFKit medimos en puntos (72 puntos = 1 pulgada).
function getPdfKitPageSize(itemCount, threshold = PDF_SIZE_THRESHOLD) {
  const { isHalfLetter, label } = decidePdfOptions(itemCount, threshold);
  return {
    size: isHalfLetter ? [396, 612] : "LETTER", // 5.5x8.5 pulgadas o carta completa
    isHalfLetter,
    label,
  };
}

module.exports = {
  decidePdfOptions,
  createJsPdf,
  getPdfKitPageSize,
  PDF_SIZE_THRESHOLD,
};
