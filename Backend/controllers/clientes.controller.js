const db = require("../db");

// Obtener todos los clientes
const obtenerClientes = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM clientes ORDER BY razon_social ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ error: "Error al obtener clientes" });
  }
};

// Buscar cliente por RIF/Cédula
const buscarCliente = async (req, res, next) => {
  console.log("[buscarCliente] Búsqueda iniciada...");
  try {
    let { rif_cedula, tipo_documento } = req.query;
    console.log(`[buscarCliente] Query params: rif_cedula=${rif_cedula}, tipo_documento=${tipo_documento}`);

    if (!rif_cedula || !tipo_documento) {
        console.log("[buscarCliente] Faltan parámetros de búsqueda.");
        return res.status(400).json({ message: "El RIF/Cédula y el tipo de documento son requeridos." });
    }

    // Limpieza de RIF/Cédula
    const rifCedulaLimpio = rif_cedula.replace(/[-.\s]/g, '');
    console.log(`[buscarCliente] Buscando en BD con: rif_cedula='${rifCedulaLimpio}', tipo_documento='${tipo_documento}'`);

    const [rows] = await db.query(
      "SELECT * FROM clientes WHERE rif_cedula = ? AND tipo_documento = ?",
      [rifCedulaLimpio, tipo_documento]
    );

    console.log(`[buscarCliente] Se encontraron ${rows.length} filas.`);

    if (rows.length > 0) {
      console.log("[buscarCliente] Cliente encontrado:", rows[0]);
      res.json(rows[0]);
    } else {
      console.log("[buscarCliente] Cliente no hallado en la base de datos.");
      res.status(404).json({ message: "Cliente no encontrado" });
    }
  } catch (error) {
    console.error("❌ [buscarCliente] Error catastrófico durante la búsqueda:", error);
    // Pasamos el error al manejador global de Express
    next(error);
  }
};

// Crear un nuevo cliente
const crearCliente = async (req, res, next) => {
  try {
    const { tipo_documento, rif_cedula, razon_social, direccion_fiscal, telefono, email, tipo_contribuyente } = req.body;
    const [result] = await db.query(
      "INSERT INTO clientes (tipo_documento, rif_cedula, razon_social, direccion_fiscal, telefono, email, tipo_contribuyente) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [tipo_documento, rif_cedula, razon_social, direccion_fiscal, telefono, email, tipo_contribuyente]
    );

    // Construir el objeto de respuesta manualmente con los datos del cuerpo de la solicitud y el ID insertado
    const nuevoCliente = {
      id: result.insertId,
      tipo_documento,
      rif_cedula,
      razon_social,
      direccion_fiscal,
      telefono,
      email,
      tipo_contribuyente
    };

    res.status(201).json(nuevoCliente);
  } catch (error) {
    console.error("Error al crear cliente:", error);
    // En lugar de enviar una respuesta de error genérica, pasamos el error al siguiente middleware
    next(error);
  }
};

// ¡IMPORTANTE! Exportar todas las funciones
module.exports = {
  obtenerClientes,
  buscarCliente,
  crearCliente,
};
