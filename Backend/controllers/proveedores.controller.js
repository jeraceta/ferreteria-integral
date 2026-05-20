const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { getEmpresaConfig } = require("../config/empresa");
const { generarExcelExportacion } = require("../services/excel.service");

// 📋 Función para obtener TODOS los proveedores de la base de datos
// El frontend espera campos como: rif, razon_social, persona_contacto, etc.
// Pero la BD tiene: tipo_documento, numero_documento, nombre, representante_ventas, etc
// ¡Así que vamos a mapear los campos para que todo funcione perfectamente!
const obtenerProveedores = async (req, res, next) => {
  try {
    // 🔍 Consulta simple: trae todos los proveedores ordenados por nombre
    const [rows] = await pool.query(
      "SELECT * FROM proveedores ORDER BY nombre ASC",
    );

    // 🎯 Mapeamos cada proveedor para que tenga las claves que espera el frontend
    const proveedoresMapeados = rows.map((p) => ({
      id: p.id,
      // ✨ IMPORTANTE: Construimos el RIF virtualmente concatenando tipo_documento y numero_documento
      // Ejemplo: "J" + "-" + "12345678" = "J-12345678"
      rif: `${p.tipo_documento}-${p.numero_documento}`,
      razon_social: p.nombre, // Renombramos 'nombre' a 'razon_social'
      persona_contacto: p.representante_ventas, // Renombramos 'representante_ventas' a 'persona_contacto'
      telefono: p.telefono,
      email: p.email,
      direccion: p.direccion_fiscal, // Renombramos 'direccion_fiscal' a 'direccion'
      tipo_documento: p.tipo_documento,
      numero_documento: p.numero_documento,
    }));

    // 📤 Enviamos el JSON con los campos ya mapeados
    res.json(proveedoresMapeados);
  } catch (error) {
    next(error);
  }
};

// 📝 Función para REGISTRAR un nuevo proveedor
// El frontend envía: tipo_documento, numero_documento, razon_social, etc
// Y los mapeamos a las columnas de la base de datos
const registrarProveedor = async (req, res, next) => {
  const {
    tipo_documento,
    numero_documento,
    razon_social, // Será mapeado a 'nombre' en la BD
    representante_ventas,
    telefono,
    email,
    direccion, // Será mapeado a 'direccion_fiscal' en la BD
  } = req.body;

  // 🛡️ Validación IMPORTANTE: tipo_documento NO puede ser vacío o indefinido
  // Si llega undefined es que el frontend no está enviándolo
  if (!tipo_documento || !numero_documento) {
    return res.status(400).json({
      message:
        "tipo_documento y numero_documento son requeridos. Envía el RIF en formato X-XXXXXXXX",
    });
  }

  // 🎯 Mapeamos los nombres de campos frontend -> backend
  const nombre = razon_social;
  const direccion_fiscal = direccion;

  try {
    // 💾 Insertamos el nuevo proveedor en la base de datos
    const [result] = await pool.query(
      // 📋 Esta query inserta todos los campos requeridos
      "INSERT INTO proveedores (tipo_documento, numero_documento, nombre, telefono, email, direccion_fiscal, representante_ventas) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        tipo_documento,
        numero_documento,
        nombre,
        telefono,
        email,
        direccion_fiscal,
        representante_ventas,
      ],
    );
    // 📤 Respondemos con el nuevo proveedor creado
    res.status(201).json({
      id: result.insertId,
      tipo_documento,
      numero_documento,
      razon_social: nombre, // Mantener compatibilidad con el frontend
      representante_ventas,
      telefono,
      email,
      direccion: direccion_fiscal, // Mantener compatibilidad con el frontend
    });
  } catch (error) {
    next(error);
  }
};

// 🔄 Función para ACTUALIZAR un proveedor existente
// Recibe el ID del proveedor en la URL y los datos actualizados en el body
const actualizarProveedor = async (req, res, next) => {
  const { id } = req.params; // Obtenemos el ID de la URL

  const {
    tipo_documento,
    numero_documento,
    razon_social,
    telefono,
    email,
    direccion,
    representante_ventas,
  } = req.body;

  // 🛡️ Validación CRÍTICA: tipo_documento y numero_documento son obligatorios
  // Si no existen, es probable que el frontend esté enviando datos incompletos
  if (!tipo_documento || !numero_documento) {
    return res.status(400).json({
      message:
        "tipo_documento y numero_documento son requeridos para actualizar un proveedor. Revisa que el RIF esté en formato X-XXXXXXXX",
    });
  }

  // 🎯 Mapeamos los campos frontend -> backend
  const nombre = razon_social;
  const direccion_fiscal = direccion;

  try {
    // 🔧 Ejecutamos la query UPDATE: modifica los datos del proveedor
    // El WHERE id=? asegura que solo se actualice el proveedor correcto
    await pool.query(
      "UPDATE proveedores SET tipo_documento=?, numero_documento=?, nombre=?, telefono=?, email=?, direccion_fiscal=?, representante_ventas=? WHERE id=?",
      [
        tipo_documento,
        numero_documento,
        nombre,
        telefono,
        email,
        direccion_fiscal,
        representante_ventas,
        id,
      ],
    );
    // ✅ Respondemos con un mensaje de éxito
    res.json({ message: "Proveedor actualizado correctamente" });
  } catch (error) {
    next(error);
  }
};

const eliminarProveedor = async (req, res, next) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM proveedores WHERE id=?", [id]);
    res.json({ message: "Proveedor eliminado" });
  } catch (error) {
    next(error);
  }
};

const buscarProveedor = async (req, res, next) => {
  const { rif, tipo_documento, numero_documento } = req.query;

  try {
    let query = "SELECT * FROM proveedores WHERE ";
    let params = [];

    if (tipo_documento && numero_documento) {
      query += "tipo_documento = ? AND numero_documento = ?";
      params = [tipo_documento, numero_documento];
    } else if (rif) {
      // Intenta parsear si viene pegado J-12345
      const parts = rif.split("-");
      if (parts.length === 2) {
        query += "tipo_documento = ? AND numero_documento = ?";
        params = [parts[0], parts[1]];
      } else {
        // Fallback inseguro o búsqueda exacta de nro
        query += "numero_documento = ?";
        params = [rif];
      }
    } else {
      return res.status(400).json({ message: "Parámetros insuficientes" });
    }

    const [rows] = await pool.query(query, params);
    if (rows.length > 0) {
      // Map DB back to frontend expected keys if needed, or frontend adapts
      const p = rows[0];
      const mapped = {
        ...p,
        razon_social: p.nombre,
        persona_contacto: p.representante_ventas, // Mapping to representative
        direccion: p.direccion_fiscal,
      };
      res.json(mapped);
    } else {
      res.status(404).json({ message: "Proveedor no encontrado" });
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

    // Mapa de campos frontend -> backend (DB)
    const fieldMap = {
      razon_social: "nombre",
      direccion: "direccion_fiscal",
      persona_contacto: "representante_ventas",
      rif: "CONCAT(tipo_documento, '-', numero_documento)",
    };

    const dbColumns = columnas.map((c) => {
      return fieldMap[c.campo] ? `${fieldMap[c.campo]} AS ${c.campo}` : c.campo;
    });

    let dbOrderBy = orderBy;
    if (fieldMap[orderBy]) dbOrderBy = fieldMap[orderBy];
    if (orderBy === "rif") dbOrderBy = "tipo_documento, numero_documento";

    const campos = dbColumns.join(", ");
    const query = `SELECT ${campos} FROM proveedores ORDER BY ${dbOrderBy} ${orderDir}`;
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
    doc.text("REPORTE DE PROVEEDORES", pageWidth - 14, 30, { align: "right" });
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

    // Mapa de campos frontend -> backend (DB)
    const fieldMap = {
      razon_social: "nombre",
      direccion: "direccion_fiscal",
      persona_contacto: "representante_ventas", // Changed from contacto
      rif: "CONCAT(tipo_documento, '-', numero_documento)", // Virtual field
    };

    // Fallback por si lo llaman sin cuerpo (POST/GET)
    const orderBySelected = orderBy || "nombre";
    let orderDirSelected = orderDir || "ASC";

    let dbOrderBy = orderBySelected;
    if (fieldMap[orderBySelected]) dbOrderBy = fieldMap[orderBySelected];
    if (orderBySelected === "rif")
      dbOrderBy = "tipo_documento, numero_documento";

    let campos = "*";
    let colsExcel = [
      { header: "ID", key: "id", width: 10 },
      { header: "Identidad", key: "identidad", width: 20 },
      { header: "Razón Social", key: "razon_social", width: 40 },
      {
        header: "Representante de Ventas",
        key: "representante_ventas",
        width: 30,
      },
      { header: "Teléfono", key: "telefono", width: 20 },
      { header: "Email", key: "email", width: 30 },
    ];

    if (columnas && columnas.length > 0) {
      const dbColumns = columnas.map((c) => {
        return fieldMap[c.campo]
          ? `${fieldMap[c.campo]} AS ${c.campo}`
          : c.campo;
      });
      campos = dbColumns.join(", ");
      colsExcel = columnas.map((c) => ({
        header: c.titulo,
        key: c.campo,
        width: 30, // Ancho por defecto
      }));
    } else {
      campos =
        "id, CONCAT(tipo_documento, '-', numero_documento) as identidad, nombre as razon_social, representante_ventas, telefono, email";
    }

    const query = `SELECT ${campos} FROM proveedores ORDER BY ${dbOrderBy} ${orderDirSelected}`;
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
      titulo: "Reporte de Proveedores",
      columnas: colsExcel,
      datos: rowsSanitized,
      nombreArchivo: `Reporte_Proveedores_${new Date().toISOString().split("T")[0]}.xlsx`,
      empresaData: empresa,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  obtenerProveedores,
  registrarProveedor,
  actualizarProveedor,
  eliminarProveedor,
  buscarProveedor,
  generarReportePDF,
  exportarExcel,
};
