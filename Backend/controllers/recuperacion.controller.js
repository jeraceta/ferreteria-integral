/**
 * recuperacion.controller.js
 * ==========================
 * Controlador del Sistema de Recuperación de Credenciales por Capas.
 *
 * Este módulo implementa dos herramientas de seguridad:
 *
 * 1. CAPA 1 — Preguntas de Seguridad (self-service):
 *    El usuario configura una pregunta y respuesta secreta desde su perfil.
 *    Cuando olvida su clave, puede verificar su identidad respondiendo
 *    correctamente y así restablecer su contraseña sin intervención del admin.
 *
 * 2. CAPA 2 — Script de Rescate Técnico (soporte):
 *    Un script de consola independiente (`scripts/rescate.js`) que el técnico
 *    de soporte ejecuta manualmente para forzar un reseteo del admin principal.
 *    Este archivo no interactúa con este controlador.
 *
 * NOTA DE SEGURIDAD:
 *    Las respuestas de seguridad se normalizan con `.toLowerCase().trim()`
 *    antes de ser encriptadas (al guardar) y antes de ser comparadas
 *    (al verificar), para evitar bloqueos por diferencia de mayúsculas
 *    o espacios accidentales.
 */

const pool = require("../db");
const bcrypt = require("bcryptjs");

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN 1: guardarPreguntaSeguridad
// Permite al usuario autenticado guardar su pregunta y respuesta secreta.
// La respuesta se normaliza y encripta antes de guardarse en la DB.
// Ruta: PUT /api/recuperacion/configurar
// ─────────────────────────────────────────────────────────────────────────────
const guardarPreguntaSeguridad = async (req, res, next) => {
  try {
    // Obtenemos el ID del usuario desde el token JWT (inyectado por el middleware de auth)
    const id_usuario = req.user?.id;

    // Extraemos la pregunta y respuesta del cuerpo de la petición
    const { pregunta_seguridad, respuesta_seguridad } = req.body;

    // ─── Validación de campos obligatorios ───
    if (!pregunta_seguridad || !respuesta_seguridad) {
      return res.status(400).json({
        ok: false,
        message: "Debes proporcionar una pregunta y una respuesta de seguridad.",
      });
    }

    // ─── Normalización: evita bloqueos por mayúsculas o espacios ───
    // Siempre convertimos a minúsculas y eliminamos espacios al inicio/final
    // antes de encriptar, para que la comparación futura sea consistente.
    const respuestaNormalizada = respuesta_seguridad.toLowerCase().trim();

    // ─── Encriptación con bcrypt (salt de 10 rondas) ───
    const salt = await bcrypt.genSalt(10);
    const hashRespuesta = await bcrypt.hash(respuestaNormalizada, salt);

    // ─── Persistencia en la base de datos ───
    await pool.query(
      "UPDATE usuarios SET pregunta_seguridad = ?, respuesta_seguridad = ? WHERE id = ?",
      [pregunta_seguridad, hashRespuesta, id_usuario]
    );

    res.json({
      ok: true,
      message: "Pregunta de seguridad configurada correctamente.",
    });
  } catch (error) {
    console.error("Error en guardarPreguntaSeguridad:", error.message);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN 2: obtenerPregunta
// Devuelve la pregunta de seguridad de un usuario dado su nombre de usuario.
// No devuelve la respuesta (hash). Es el primer paso del flujo de recuperación.
// Ruta: GET /api/recuperacion/pregunta?username=...
// ─────────────────────────────────────────────────────────────────────────────
const obtenerPregunta = async (req, res, next) => {
  try {
    const { username } = req.query;

    // ─── Validación ───
    if (!username) {
      return res.status(400).json({
        ok: false,
        message: "Debes proporcionar un nombre de usuario.",
      });
    }

    // ─── Búsqueda del usuario en la DB ───
    const [rows] = await pool.query(
      "SELECT pregunta_seguridad FROM usuarios WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      // No revelamos si el usuario existe para mayor seguridad
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado.",
      });
    }

    const pregunta = rows[0].pregunta_seguridad;

    // Verificamos que el usuario ya haya configurado su pregunta
    if (!pregunta) {
      return res.status(404).json({
        ok: false,
        message:
          "Este usuario no tiene una pregunta de seguridad configurada. Contacta al administrador.",
      });
    }

    // ─── Respondemos SOLO con la pregunta, nunca con el hash ───
    res.json({ ok: true, pregunta });
  } catch (error) {
    console.error("Error en obtenerPregunta:", error.message);
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN 3: verificarRespuestaYRestablecerClave
// Segundo y último paso del flujo de recuperación.
// Compara la respuesta del usuario (normalizada) con el hash guardado.
// Si coincide, actualiza la contraseña con la nueva clave proporcionada.
// Ruta: POST /api/recuperacion/restablecer
// ─────────────────────────────────────────────────────────────────────────────
const verificarRespuestaYRestablecerClave = async (req, res, next) => {
  try {
    const { username, respuesta_seguridad, nueva_clave } = req.body;

    // ─── Validación de todos los campos requeridos ───
    if (!username || !respuesta_seguridad || !nueva_clave) {
      return res.status(400).json({
        ok: false,
        message:
          "Se requieren: nombre de usuario, respuesta de seguridad y nueva contraseña.",
      });
    }

    // ─── Obtener los datos del usuario de la DB ───
    const [rows] = await pool.query(
      "SELECT id, respuesta_seguridad FROM usuarios WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
    }

    const usuario = rows[0];

    // Validamos que tenga pregunta configurada
    if (!usuario.respuesta_seguridad) {
      return res.status(400).json({
        ok: false,
        message:
          "Este usuario no tiene una pregunta de seguridad configurada.",
      });
    }

    // ─── Normalización de la respuesta ingresada antes de comparar ───
    // Aplicamos el mismo proceso que al guardar: toLowercase + trim.
    // Así ignoramos diferencias de mayúsculas y espacios accidentales.
    const respuestaNormalizada = respuesta_seguridad.toLowerCase().trim();

    // ─── Comparación segura con bcrypt.compare ───
    const esCorrecta = await bcrypt.compare(
      respuestaNormalizada,
      usuario.respuesta_seguridad
    );

    if (!esCorrecta) {
      // Respuesta incorrecta: no actualizamos nada
      return res.status(401).json({
        ok: false,
        message: "La respuesta de seguridad es incorrecta.",
      });
    }

    // ─── La respuesta es correcta: encriptamos y guardamos la nueva clave ───
    const salt = await bcrypt.genSalt(10);
    const hashNuevaClave = await bcrypt.hash(nueva_clave, salt);

    await pool.query("UPDATE usuarios SET password = ? WHERE id = ?", [
      hashNuevaClave,
      usuario.id,
    ]);

    res.json({
      ok: true,
      message:
        "Contraseña restablecida correctamente. Ya puedes iniciar sesión con tu nueva clave.",
    });
  } catch (error) {
    console.error(
      "Error en verificarRespuestaYRestablecerClave:",
      error.message
    );
    next(error);
  }
};

module.exports = {
  guardarPreguntaSeguridad,
  obtenerPregunta,
  verificarRespuestaYRestablecerClave,
};
