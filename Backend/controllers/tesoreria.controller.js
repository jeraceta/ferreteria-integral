const pool = require("../db");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const { getEmpresaConfig } = require("../config/empresa");
const { generarExcelExportacion } = require("../services/excel.service");

/**
 * =======================
 * CXC (Cuentas por Cobrar)
 * =======================
 */

const obtenerCxc = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        cxc.id, 
        cxc.cliente_id,
        cli.razon_social as cliente, 
        cxc.factura, 
        DATE_FORMAT(cxc.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxc.total, 
        cxc.abonado, 
        cxc.estado 
      FROM cxc_cuentas cxc
      JOIN clientes cli ON cxc.cliente_id = cli.id
      ORDER BY cxc.vencimiento ASC
    `;
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
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

const crearCxc = async (req, res, next) => {
  const { cliente_id, factura, vencimiento, total } = req.body;
  try {
    if (!cliente_id || !factura || !vencimiento || !total) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    const query = `
      INSERT INTO cxc_cuentas (cliente_id, factura, vencimiento, total) 
      VALUES (?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      cliente_id,
      factura,
      vencimiento,
      total,
    ]);
    res
      .status(201)
      .json({ message: "Cuenta por cobrar registrada", id: result.insertId });
  } catch (error) {
    next(error);
  }
};

const actualizarCxc = async (req, res, next) => {
  const { id } = req.params;
  const { cliente_id, factura, vencimiento, total } = req.body;
  try {
    const [rows] = await pool.query(
      "SELECT abonado FROM cxc_cuentas WHERE id = ?",
      [id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });

    const abonado = parseFloat(rows[0].abonado);
    const nuevoTotal = parseFloat(total);
    let estado = "Pendiente";
    if (abonado > 0) estado = "Parcial";
    if (abonado >= nuevoTotal) estado = "Pagado";

    await pool.query(
      "UPDATE cxc_cuentas SET cliente_id = ?, factura = ?, vencimiento = ?, total = ?, estado = ? WHERE id = ?",
      [cliente_id, factura, vencimiento, nuevoTotal, estado, id],
    );
    res.json({ message: "Cuenta actualizada correctamente" });
  } catch (error) {
    next(error);
  }
};

const eliminarCxc = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM cxc_cuentas WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });
    res.json({ message: "Cuenta eliminada correctamente" });
  } catch (error) {
    next(error);
  }
};

const registrarAbonoCxC = async (req, res, next) => {
  const { id } = req.params;
  const { monto, soporte } = req.body;

  try {
    const [cxcRows] = await pool.query(
      "SELECT total, abonado FROM cxc_cuentas WHERE id = ?",
      [id],
    );
    if (cxcRows.length === 0)
      return res.status(404).json({ message: "Registro no encontrado" });

    const cxc = cxcRows[0];
    const total = parseFloat(cxc.total);
    const abonadoPrevio = parseFloat(cxc.abonado);
    const abonoMonto = parseFloat(monto);
    const restante = total - abonadoPrevio;

    if (abonoMonto > restante) {
      return res
        .status(400)
        .json({ message: "El abono excede el saldo restante" });
    }

    const nuevoAbonado = abonadoPrevio + abonoMonto;
    let nuevoEstado = "Parcial";
    if (nuevoAbonado >= total) nuevoEstado = "Pagado";

    await pool.query(
      "INSERT INTO cxc_abonos (cxc_id, monto, soporte) VALUES (?, ?, ?)",
      [id, abonoMonto, soporte],
    );

    await pool.query(
      "UPDATE cxc_cuentas SET abonado = ?, estado = ? WHERE id = ?",
      [nuevoAbonado, nuevoEstado, id],
    );

    res.json({ message: "Abono registrado exitosamente" });
  } catch (error) {
    next(error);
  }
};

const exportarCxcPDF = async (req, res, next) => {
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

    const query = `
      SELECT 
        cxc.id, 
        cli.razon_social as cliente, 
        cxc.factura, 
        DATE_FORMAT(cxc.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxc.total, 
        cxc.abonado, 
        cxc.total - cxc.abonado as restante,
        cxc.estado 
      FROM cxc_cuentas cxc
      JOIN clientes cli ON cxc.cliente_id = cli.id
      ORDER BY cli.razon_social ASC
    `;
    const [data] = await pool.query(query);

    const doc = new jsPDF();
    doc.setLineWidth(0.01);
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
        console.error("Error logo CxC:", e);
      }
    }

    // --- ENCABEZADO ESTANDARIZADO (Sin superposición) ---
    let currentY = 15;
    const startX = 14;

    // Recuadro en la esquina superior derecha con el nombre del reporte
    const reportBoxW = 95;
    const reportBoxH = 15;
    const reportBoxX = pageWidth - startX - reportBoxW;
    const reportBoxY = currentY;
    doc.setDrawColor(26, 82, 118);
    doc.setLineWidth(0.3);
    doc.rect(reportBoxX, reportBoxY, reportBoxW, reportBoxH);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 82, 118);
    doc.text("REPORTE DE CUENTAS POR COBRAR", reportBoxX + reportBoxW / 2, reportBoxY + 6, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, reportBoxX + reportBoxW / 2, reportBoxY + 11, { align: "center" });

    // Logo (a la izquierda)
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX, currentY, 20, 20);
    }

    // Datos de empresa (al lado del logo, sin invadir el recuadro)
    let textStartX = logoBase64 ? startX + 22 : startX;
    const maxTextWidth = reportBoxX - textStartX - 5;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    const nombreSplit = doc.splitTextToSize(empresa.nombre, maxTextWidth);
    doc.text(nombreSplit, textStartX, currentY + 5);

    currentY += 5 + (nombreSplit.length * 4);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX, currentY);

    currentY += 4;
    const dirSplit = doc.splitTextToSize(`Dirección: ${empresa.direccion}`, maxTextWidth);
    doc.text(dirSplit, textStartX, currentY);

    currentY += (dirSplit.length * 4);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX, currentY);

    currentY = Math.max(currentY + 5, reportBoxY + reportBoxH + 5);


    const tableHead = [
      [
        "Cliente",
        "Factura",
        "Vencimiento",
        "Total ($)",
        "Abonado ($)",
        "Restante ($)",
      ],
    ];
    const tableBody = data.map((item) => [
      item.cliente,
      item.factura,
      item.vencimiento,
      parseFloat(item.total).toFixed(2),
      parseFloat(item.abonado).toFixed(2),
      parseFloat(item.restante).toFixed(2),
    ]);

    doc.autoTable({
      startY: Math.max(currentY + 10, 45),
      head: tableHead,
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [26, 82, 118] },
      styles: { fontSize: 8 },
    });

    res.contentType("application/pdf");
    res.send(Buffer.from(doc.output("arraybuffer")));
  } catch (error) {
    next(error);
  }
};

const exportarCxcExcel = async (req, res, next) => {
  try {
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

    const query = `
      SELECT 
        cxc.id, 
        cli.razon_social as cliente, 
        cxc.factura, 
        DATE_FORMAT(cxc.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxc.total, 
        cxc.abonado, 
        (cxc.total - cxc.abonado) as restante
      FROM cxc_cuentas cxc
      JOIN clientes cli ON cxc.cliente_id = cli.id
      ORDER BY cli.razon_social ASC
    `;
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

    const columnas = [
      { header: "ID", key: "id", width: 10 },
      { header: "Cliente", key: "cliente", width: 40 },
      { header: "Factura", key: "factura", width: 20 },
      { header: "Vencimiento", key: "vencimiento", width: 20 },
      { header: "Total ($)", key: "total", width: 15 },
      { header: "Abonado ($)", key: "abonado", width: 15 },
      { header: "Restante ($)", key: "restante", width: 15 },
    ];

    await generarExcelExportacion({
      res,
      titulo: "Reporte de Cuentas por Cobrar (CxC)",
      columnas,
      datos: rowsSanitized,
      nombreArchivo: `Reporte_CxC_${new Date().toISOString().split("T")[0]}.xlsx`,
      empresaData: empresa,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * =======================
 * CXP (Cuentas por Pagar)
 * =======================
 */

const obtenerCxp = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        cxp.id, 
        cxp.proveedor_id,
        p.nombre as proveedor, 
        p.tipo_documento,
        p.numero_documento,
        cxp.factura, 
        cxp.concepto,
        DATE_FORMAT(cxp.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxp.total, 
        cxp.abonado, 
        cxp.estado 
      FROM cxp_cuentas cxp
      JOIN proveedores p ON cxp.proveedor_id = p.id
      ORDER BY cxp.vencimiento ASC
    `;
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
    // Transform to frontend structure
    const mapped = rows.map((r) => ({
      ...r,
      rif: r.tipo_documento
        ? `${r.tipo_documento}-${r.numero_documento}`
        : r.numero_documento,
    }));
    res.json(mapped);
  } catch (error) {
    next(error);
  }
};

const crearCxp = async (req, res, next) => {
  const { proveedor_id, factura, concepto, vencimiento, total } = req.body;
  try {
    if (!proveedor_id || !concepto || !vencimiento || !total) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    const query = `
      INSERT INTO cxp_cuentas (proveedor_id, factura, concepto, vencimiento, total) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      proveedor_id,
      factura || null,
      concepto,
      vencimiento,
      total,
    ]);
    res
      .status(201)
      .json({ message: "Cuenta por pagar registrada", id: result.insertId });
  } catch (error) {
    next(error);
  }
};

const actualizarCxp = async (req, res, next) => {
  const { id } = req.params;
  const { proveedor_id, factura, concepto, vencimiento, total } = req.body;
  try {
    const [rows] = await pool.query(
      "SELECT abonado FROM cxp_cuentas WHERE id = ?",
      [id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });

    const abonado = parseFloat(rows[0].abonado);
    const nuevoTotal = parseFloat(total);
    let estado = "Pendiente";
    if (abonado > 0) estado = "Parcial";
    if (abonado >= nuevoTotal) estado = "Pagado";

    await pool.query(
      "UPDATE cxp_cuentas SET proveedor_id = ?, factura = ?, concepto = ?, vencimiento = ?, total = ?, estado = ? WHERE id = ?",
      [
        proveedor_id,
        factura || null,
        concepto,
        vencimiento,
        nuevoTotal,
        estado,
        id,
      ],
    );
    res.json({ message: "Cuenta actualizada correctamente" });
  } catch (error) {
    next(error);
  }
};

const eliminarCxp = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM cxp_cuentas WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });
    res.json({ message: "Cuenta eliminada correctamente" });
  } catch (error) {
    next(error);
  }
};

const registrarAbonoCxP = async (req, res, next) => {
  const { id } = req.params;
  const { monto, soporte } = req.body;

  try {
    const [cxpRows] = await pool.query(
      "SELECT total, abonado FROM cxp_cuentas WHERE id = ?",
      [id],
    );
    if (cxpRows.length === 0)
      return res.status(404).json({ message: "Registro no encontrado" });

    const cxp = cxpRows[0];
    const total = parseFloat(cxp.total);
    const abonadoPrevio = parseFloat(cxp.abonado);
    const abonoMonto = parseFloat(monto);
    const restante = total - abonadoPrevio;

    if (abonoMonto > restante) {
      return res
        .status(400)
        .json({ message: "El abono excede el saldo restante" });
    }

    const nuevoAbonado = abonadoPrevio + abonoMonto;
    let nuevoEstado = "Parcial";
    if (nuevoAbonado >= total) nuevoEstado = "Pagado";

    await pool.query(
      "INSERT INTO cxp_abonos (cxp_id, monto, soporte) VALUES (?, ?, ?)",
      [id, abonoMonto, soporte],
    );

    await pool.query(
      "UPDATE cxp_cuentas SET abonado = ?, estado = ? WHERE id = ?",
      [nuevoAbonado, nuevoEstado, id],
    );

    res.json({ message: "Abono registrado exitosamente" });
  } catch (error) {
    next(error);
  }
};

const exportarCxpPDF = async (req, res, next) => {
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

    const query = `
      SELECT 
        cxp.id, 
        p.nombre as proveedor, 
        cxp.factura, 
        cxp.concepto,
        DATE_FORMAT(cxp.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxp.total, 
        cxp.abonado, 
        cxp.total - cxp.abonado as restante,
        cxp.estado 
      FROM cxp_cuentas cxp
      JOIN proveedores p ON cxp.proveedor_id = p.id
      ORDER BY p.nombre ASC
    `;
    const [data] = await pool.query(query);

    const doc = new jsPDF();
    doc.setLineWidth(0.01);
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
        console.error("Error logo CxP:", e);
      }
    }

    // --- ENCABEZADO ESTANDARIZADO (Sin superposición) ---
    let currentY = 15;
    const startX2 = 14;

    // Recuadro en la esquina superior derecha con el nombre del reporte
    const reportBoxW2 = 95;
    const reportBoxH2 = 15;
    const reportBoxX2 = pageWidth - startX2 - reportBoxW2;
    const reportBoxY2 = currentY;
    doc.setDrawColor(26, 82, 118);
    doc.setLineWidth(0.3);
    doc.rect(reportBoxX2, reportBoxY2, reportBoxW2, reportBoxH2);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 82, 118);
    doc.text("REPORTE DE CUENTAS POR PAGAR", reportBoxX2 + reportBoxW2 / 2, reportBoxY2 + 6, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, reportBoxX2 + reportBoxW2 / 2, reportBoxY2 + 11, { align: "center" });

    // Logo (a la izquierda)
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", startX2, currentY, 20, 20);
    }

    // Datos de empresa (al lado del logo, sin invadir el recuadro)
    let textStartX2 = logoBase64 ? startX2 + 22 : startX2;
    const maxTextWidth2 = reportBoxX2 - textStartX2 - 5;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    const nombreSplit2 = doc.splitTextToSize(empresa.nombre, maxTextWidth2);
    doc.text(nombreSplit2, textStartX2, currentY + 5);

    currentY += 5 + (nombreSplit2.length * 4);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`RIF: ${empresa.rif}`, textStartX2, currentY);

    currentY += 4;
    const dirSplit2 = doc.splitTextToSize(`Dirección: ${empresa.direccion}`, maxTextWidth2);
    doc.text(dirSplit2, textStartX2, currentY);

    currentY += (dirSplit2.length * 4);
    doc.text(`Tlf: ${empresa.telefono} | Email: ${empresa.email || ""}`, textStartX2, currentY);

    currentY = Math.max(currentY + 5, reportBoxY2 + reportBoxH2 + 5);


    const tableHead = [
      [
        "Proveedor",
        "Factura/Concepto",
        "Vencimiento",
        "Total ($)",
        "Abonado ($)",
        "Restante ($)",
      ],
    ];
    const tableBody = data.map((item) => [
      item.proveedor,
      `${item.factura || "-"} / ${item.concepto}`,
      item.vencimiento,
      parseFloat(item.total).toFixed(2),
      parseFloat(item.abonado).toFixed(2),
      parseFloat(item.restante).toFixed(2),
    ]);

    doc.autoTable({
      startY: Math.max(currentY + 10, 45),
      head: tableHead,
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [26, 82, 118] },
      styles: { fontSize: 8 },
    });

    res.contentType("application/pdf");
    res.send(Buffer.from(doc.output("arraybuffer")));
  } catch (error) {
    next(error);
  }
};

const exportarCxpExcel = async (req, res, next) => {
  try {
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

    const query = `
      SELECT 
        cxp.id, 
        p.nombre as proveedor, 
        cxp.factura, 
        cxp.concepto,
        DATE_FORMAT(cxp.vencimiento, '%Y-%m-%d') as vencimiento, 
        cxp.total, 
        cxp.abonado, 
        (cxp.total - cxp.abonado) as restante
      FROM cxp_cuentas cxp
      JOIN proveedores p ON cxp.proveedor_id = p.id
      ORDER BY p.nombre ASC
    `;
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

    const columnas = [
      { header: "ID", key: "id", width: 10 },
      { header: "Proveedor", key: "proveedor", width: 40 },
      { header: "Factura", key: "factura", width: 15 },
      { header: "Concepto", key: "concepto", width: 30 },
      { header: "Vencimiento", key: "vencimiento", width: 15 },
      { header: "Total ($)", key: "total", width: 15 },
      { header: "Abonado ($)", key: "abonado", width: 15 },
      { header: "Restante ($)", key: "restante", width: 15 },
    ];

    await generarExcelExportacion({
      res,
      titulo: "Reporte de Cuentas por Pagar (CxP)",
      columnas,
      datos: rowsSanitized,
      nombreArchivo: `Reporte_CxP_${new Date().toISOString().split("T")[0]}.xlsx`,
      empresaData: empresa,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  obtenerCxc,
  registrarAbonoCxC,
  exportarCxcPDF,
  exportarCxcExcel,
  crearCxc,
  actualizarCxc,
  eliminarCxc,
  obtenerCxp,
  registrarAbonoCxP,
  exportarCxpPDF,
  exportarCxpExcel,
  crearCxp,
  actualizarCxp,
  eliminarCxp,
};
