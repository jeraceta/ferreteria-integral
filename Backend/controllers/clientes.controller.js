const db = require("../db");

// Obtener todos los clientes
const obtenerClientes = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM clientes ORDER BY nombre ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ error: "Error al obtener clientes" });
  }
};

// Buscar cliente por RIF/Cédula
const buscarCliente = async (req, res) => {
  try {
    const { tipo_documento, rif_cedula } = req.query;
    const [rows] = await db.query(
      "SELECT * FROM clientes WHERE tipo_documento = ? AND rif_cedula = ?",
      [tipo_documento, rif_cedula]
    );

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: "Cliente no encontrado" });
    }
  } catch (error) {
    console.error("Error al buscar cliente:", error);
    res.status(500).json({ error: "Error en la búsqueda" });
  }
};

// Crear un nuevo cliente
const crearCliente = async (req, res) => {
  try {
    const { nombre, tipo_documento, rif_cedula, direccion, telefono } =
      req.body;
    const [result] = await db.query(
      "INSERT INTO clientes (nombre, tipo_documento, rif_cedula, direccion, telefono) VALUES (?, ?, ?, ?, ?)",
      [nombre, tipo_documento, rif_cedula, direccion, telefono]
    );
    res
      .status(201)
      .json({ id: result.insertId, message: "Cliente creado exitosamente" });
  } catch (error) {
    console.error("Error al crear cliente:", error);
    res.status(500).json({ error: "Error al registrar cliente" });
  }
};

// ¡IMPORTANTE! Exportar todas las funciones
module.exports = {
  obtenerClientes,
  buscarCliente,
  crearCliente,
};
