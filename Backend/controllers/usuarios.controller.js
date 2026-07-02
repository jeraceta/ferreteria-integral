// Backend/controllers/usuarios.controller.js

// Importa la conexión a la base de datos.
const db = require("../db");
// Importa bcrypt para el hashing seguro de contraseñas.
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10; // Factor de costo para el hashing. 10 es el estándar recomendado.

/**
 * @function listarUsuarios
 * Obtiene y devuelve una lista de todos los usuarios.
 * Nunca devuelve el campo 'password' por seguridad.
 */
const listarUsuarios = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nombre, username, rol, pregunta_seguridad FROM usuarios",
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

/**
 * @function crearUsuario
 * Crea un nuevo usuario en la base de datos con la contraseña encriptada con bcrypt.
 * Valida que el rol sea uno de los permitidos ('Vendedor', 'Administrador').
 * También permite configurar la pregunta y respuesta de seguridad (Capa 1).
 */
const crearUsuario = async (req, res, next) => {
  try {
    const { nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad } = req.body;

    // Validación de campos obligatorios.
    if (!nombre || !username || !password || !rol) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    // Validación del rol permitido por la base de datos (ENUM).
    if (!["Vendedor", "Administrador"].includes(rol)) {
      return res.status(400).json({
        message: "Rol no válido. Debe ser 'Vendedor' o 'Administrador'.",
      });
    }

    // Encriptar la contraseña antes de guardarla en la base de datos.
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Encriptar respuesta de seguridad si se proporciona
    let hashRespuesta = null;
    if (respuesta_seguridad && respuesta_seguridad.trim() !== "") {
      const respuestaNormalizada = respuesta_seguridad.toLowerCase().trim();
      hashRespuesta = await bcrypt.hash(respuestaNormalizada, SALT_ROUNDS);
    }

    const [result] = await db.query(
      "INSERT INTO usuarios (nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad) VALUES (?, ?, ?, ?, ?, ?)",
      [nombre, username, hashedPassword, rol, pregunta_seguridad || null, hashRespuesta],
    );

    // Respuesta exitosa sin devolver datos sensibles.
    res.status(201).json({ id: result.insertId, nombre, username, rol, pregunta_seguridad });
  } catch (error) {
    // Manejo de error para nombres de usuario duplicados.
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "El nombre de usuario ya existe." });
    }
    next(error);
  }
};

/**
 * @function actualizarUsuario
 * Actualiza los datos de un usuario existente.
 * Si se proporciona una nueva contraseña, se encripta antes de guardarla.
 * También permite actualizar la pregunta y respuesta de seguridad.
 */
const actualizarUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad } = req.body;

    // Encriptación de contraseña si se proporciona una nueva.
    let hashedPassword = null;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Encriptar respuesta de seguridad si se proporciona
    let hashRespuesta = null;
    if (respuesta_seguridad && respuesta_seguridad.trim() !== "") {
      const respuestaNormalizada = respuesta_seguridad.toLowerCase().trim();
      hashRespuesta = await bcrypt.hash(respuestaNormalizada, SALT_ROUNDS);
    }

    // Construcción dinámica de la consulta SQL para actualizar solo los campos enviados.
    let query = "UPDATE usuarios SET ";
    const params = [];

    if (nombre) {
      query += "nombre = ?, ";
      params.push(nombre);
    }
    if (username) {
      query += "username = ?, ";
      params.push(username);
    }
    if (rol) {
      if (!["Vendedor", "Administrador"].includes(rol)) {
        return res.status(400).json({
          message: "Rol no válido. Debe ser 'Vendedor' o 'Administrador'.",
        });
      }
      query += "rol = ?, ";
      params.push(rol);
    }
    if (hashedPassword) {
      query += "password = ?, ";
      params.push(hashedPassword);
    }
    if (pregunta_seguridad !== undefined) {
      query += "pregunta_seguridad = ?, ";
      params.push(pregunta_seguridad || null);
    }
    if (hashRespuesta) {
      query += "respuesta_seguridad = ?, ";
      params.push(hashRespuesta);
    }

    // Si no hay parámetros para actualizar, no se hace nada.
    if (params.length === 0) {
      return res
        .status(400)
        .json({ message: "No se proporcionaron datos para actualizar." });
    }

    // Elimina la última coma y espacio, y añade la condición WHERE.
    query = query.slice(0, -2);
    query += " WHERE id = ?";
    params.push(id);

    await db.query(query, params);
    res.json({ message: "Usuario actualizado correctamente" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "El nombre de usuario ya existe." });
    }
    next(error);
  }
};

/**
 * @function eliminarUsuario
 * Elimina un usuario de la base de datos por su ID.
 */
const eliminarUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM usuarios WHERE id = ?", [id]);
    res.status(204).send(); // No content.
  } catch (error) {
    next(error);
  }
};

// Exporta todas las funciones para que las rutas las puedan usar.
module.exports = {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
};
