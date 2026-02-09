// Backend/controllers/usuarios.controller.js

// Importa la conexión a la base de datos.
const db = require("../db");
// const bcrypt = require('bcryptjs'); // Pendiente: Descomentar cuando se instale bcryptjs

/**
 * @function listarUsuarios
 * Obtiene y devuelve una lista de todos los usuarios.
 * Corrige la consulta SQL para usar 'username' en lugar de 'usuario'.
 */
const listarUsuarios = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nombre, username, rol FROM usuarios",
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

/**
 * @function crearUsuario
 * Crea un nuevo usuario en la base de datos.
 * Valida que el rol sea uno de los permitidos ('Vendedor', 'Administrador').
 */
const crearUsuario = async (req, res, next) => {
  try {
    // Desestructura los datos del cuerpo de la petición.
    const { nombre, username, password, rol } = req.body;

    // Validación de campos obligatorios.
    if (!nombre || !username || !password || !rol) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    // Validación del rol permitido por la base de datos (ENUM).
    // Usamos los roles capitalizados como se definió en migraciones anteriores.
    if (!["Vendedor", "Administrador"].includes(rol)) {
      return res
        .status(400)
        .json({
          message: "Rol no válido. Debe ser 'Vendedor' o 'Administrador'.",
        });
    }

    // TODO: Implementar encriptación con bcrypt cuando esté configurado
    const hashedPassword = password;

    const [result] = await db.query(
      "INSERT INTO usuarios (nombre, username, password, rol) VALUES (?, ?, ?, ?)",
      [nombre, username, hashedPassword, rol],
    );

    // Respuesta exitosa con los datos del usuario creado.
    res.status(201).json({ id: result.insertId, nombre, username, rol });
  } catch (error) {
    // Manejo de error para nombres de usuario duplicados.
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "El nombre de usuario ya existe." });
    }
    // Para otros errores, se pasa al siguiente middleware.
    next(error);
  }
};

/**
 * @function actualizarUsuario
 * Actualiza los datos de un usuario existente.
 */
const actualizarUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, username, password, rol } = req.body;

    // Encriptación de contraseña si se proporciona una nueva.
    let hashedPassword = null;
    if (password) {
      // hashedPassword = bcrypt.hashSync(password, 10); // TODO: Implementar.
      hashedPassword = password; // Solución temporal.
    }

    // Construcción dinámica de la consulta SQL.
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
      // Validación del rol.
      if (!["Vendedor", "Administrador"].includes(rol)) {
        return res
          .status(400)
          .json({
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

    // Si no hay parámetros para actualizar, no se hace nada.
    if (params.length === 0) {
      return res
        .status(400)
        .json({ message: "No se proporcionaron datos para actualizar." });
    }

    // Finaliza la consulta.
    query = query.slice(0, -2); // Elimina la última coma.
    query += " WHERE id = ?";
    params.push(id);

    // Ejecuta la actualización.
    await db.query(query, params);

    res.json({ message: "Usuario actualizado correctamente" });
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
