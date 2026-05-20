const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { getEmpresaConfig } = require("../config/empresa");
const { generarExcelExportacion } = require("../services/excel.service");

const obtenerClientes = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM clientes ORDER BY razon_social ASC",
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

const registrarCliente = async (req, res, next) => {
  const {
    tipo_documento,
    rif_cedula,
    razon_social,
    telefono,
    email,
    direccion_fiscal,
    tipo_contribuyente,
  } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO clientes (tipo_documento, rif_cedula, razon_social, telefono, email, direccion_fiscal, tipo_contribuyente) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        tipo_documento,
        rif_cedula,
        razon_social,
        telefono,
        email,
        direccion_fiscal,
        tipo_contribuyente,
      ],
    );
    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (error) {
    next(error);
  }
};

const actualizarCliente = async (req, res, next) => {
  const { id } = req.params;
  const {
    tipo_documento,
    rif_cedula,
    razon_social,
    telefono,
    email,
    direccion_fiscal,
    tipo_contribuyente,
  } = req.body;
  try {
    await pool.query(
      "UPDATE clientes SET tipo_documento=?, rif_cedula=?, razon_social=?, telefono=?, email=?, direccion_fiscal=?, tipo_contribuyente=? WHERE id=?",
      [
        tipo_documento,
        rif_cedula,
        razon_social,
        telefono,
        email,
        direccion_fiscal,
        tipo_contribuyente,
        id,
      ],
    );
    res.json({ message: "Cliente actualizado" });
  } catch (error) {
    next(error);
  }
};

const eliminarCliente = async (req, res, next) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM clientes WHERE id=?", [id]);
    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    next(error);
  }
};

const buscarCliente = async (req, res, next) => {
  const { rif_cedula, tipo_documento } = req.query;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM clientes WHERE rif_cedula = ? AND tipo_documento = ?",
      [rif_cedula, tipo_documento],
    );
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: "Cliente no encontrado" });
    }
  } catch (error) {
    next(error);
  }
};

const generarReportePDF = async (req, res, next) => {
  const { columnas, orderBy, orderDir } = req.body;

  try {
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

    // Construcción dinámica de la consulta
    const campos = columnas.map((c) => c.campo).join(", ");
    const query = `SELECT ${campos} FROM clientes ORDER BY ${orderBy} ${orderDir}`;
    const [data] = await pool.query(query);

    // --- GENERACIÓN DEL PDF ---
    const doc = new jsPDF();
    doc.setLineWidth(0.01);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- LOGO ---
    let logoBase64;
    if (empresa.logo_path) {
      try {
        const fullLogoPath = path.join(__dirname, "..", empresa.logo_path);
        if (fs.existsSync(fullLogoPath)) {
          logoBase64 = fs.readFileSync(fullLogoPath).toString("base64");
        }
      } catch (e) {
        console.error("Error al cargar logo dinámico:", e);
      }
    }

    // Marca de agua
    const dibujarMarcaAgua = (doc) => {
      if (logoBase64) {
        const imgProps = doc.getImageProperties(logoBase64);
        const logoWidth = 100;
        const logoHeight = (imgProps.height * logoWidth) / imgProps.width;
        const x = (pageWidth - logoWidth) / 2;
        const y = (pageHeight - logoHeight) / 2;
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.04 }));
        doc.addImage(logoBase64, "PNG", x, y, logoWidth, logoHeight);
        doc.restoreGraphicsState();
      }
    };

    // --- ENCABEZADO ESTANDARIZADO ---
    let currentY = 15;
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, currentY, 25, 25);
    }
    
    const textStartX = 45;
    const maxTextWidth = pageWidth - textStartX - 15;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const nombreSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nombreSplit, textStartX, currentY + 5);
    
    currentY += 5 + (nombreSplit.length * 5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);
    
    currentY += 5;
    const dirSplit = doc.splitTextToSize(`Dirección: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);
    
    currentY += (dirSplit.length * 4);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    // Título (Derecha) - Ajustado Y para evitar overlap
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE DE CLIENTES", pageWidth - 14, 30, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 14, 37, { align: "right" });

    // --- TABLA ---
    const tableHead = [columnas.map((c) => c.titulo)];
    const tableBody = data.map((row) =>
      columnas.map((c) => row[c.campo] || "-"),
    );

    doc.autoTable({
      startY: Math.max(currentY + 10, 45),
      head: tableHead,
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [26, 82, 118] },
      styles: { fontSize: 8 },
      didDrawPage: (data) => {
        dibujarMarcaAgua(doc);
      },
    });

    // Enviar PDF
    const pdfBuffer = doc.output("arraybuffer");
    res.contentType("application/pdf");
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    next(error);
  }
};

const exportarExcel = async (req, res, next) => {
  try {
    const { columnas, orderBy, orderDir } = req.body;

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

    // Fallback por si lo llaman sin cuerpo (POST/GET)
    const orderBySelected = orderBy || "razon_social";
    const orderDirSelected = orderDir || "ASC";

    let campos = "*";
    let colsExcel = [
      { header: "ID", key: "id", width: 10 },
      { header: "RIF/Cédula", key: "rif_cedula", width: 20 },
      { header: "Razón Social/Nombre", key: "razon_social", width: 40 },
      { header: "Teléfono", key: "telefono", width: 20 },
      { header: "Email", key: "email", width: 30 },
      { header: "Dirección", key: "direccion_fiscal", width: 50 },
    ];

    if (columnas && columnas.length > 0) {
      campos = columnas.map((c) => c.campo).join(", ");
      colsExcel = columnas.map((c) => ({
        header: c.titulo,
        key: c.campo,
        width: 30, // Ancho por defecto
      }));
    }

    const query = `SELECT ${campos} FROM clientes ORDER BY ${orderBySelected} ${orderDirSelected}`;
    const [rows] = await pool.query(query);

    // Sanitizar datos para Excel
    const rowsSanitized = rows.map(row => {
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        if (newRow[key] === null || newRow[key] === undefined) {
          newRow[key] = "";
        }
      });
      return newRow;
    });

    await generarExcelExportacion({
      res,
      titulo: "Reporte de Clientes",
      columnas: colsExcel,
      datos: rowsSanitized,
      nombreArchivo: `Reporte_Clientes_${new Date().toISOString().split("T")[0]}.xlsx`,
      empresaData: empresa,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  obtenerClientes,
  registrarCliente,
  actualizarCliente,
  eliminarCliente,
  buscarCliente,
  generarReportePDF,
  exportarExcel,
};
