/**
 * recuperacion.routes.js
 * ======================
 * Define las rutas de la API para el sistema de recuperación de credenciales.
 *
 * Rutas públicas (sin autenticación — el usuario no puede iniciar sesión):
 *   GET  /api/recuperacion/pregunta       → Obtiene la pregunta de seguridad del usuario
 *   POST /api/recuperacion/restablecer    → Verifica respuesta y cambia la contraseña
 *
 * Ruta protegida (requiere token JWT activo — para configurar desde el perfil):
 *   PUT  /api/recuperacion/configurar     → Guarda/actualiza la pregunta de seguridad
 */

const express = require("express");
const router = express.Router();
const {
  guardarPreguntaSeguridad,
  obtenerPregunta,
  verificarRespuestaYRestablecerClave,
} = require("../controllers/recuperacion.controller");

// ─── Middleware de autenticación ───
// Protege la ruta de configuración: solo usuarios ya autenticados pueden
// guardar o modificar su pregunta de seguridad.
const { requiereAuth } = require("../middlewares/auth.middleware");

// ─────────────────────────────────────────────────────────────────────────────
// RUTA PROTEGIDA: configurar pregunta de seguridad (requiere estar logueado)
// PUT /api/recuperacion/configurar
// ─────────────────────────────────────────────────────────────────────────────
router.put("/configurar", requiereAuth, guardarPreguntaSeguridad);

// ─────────────────────────────────────────────────────────────────────────────
// RUTA PÚBLICA: obtener la pregunta de un usuario por su nombre de usuario
// GET /api/recuperacion/pregunta?username=...
// ─────────────────────────────────────────────────────────────────────────────
router.get("/pregunta", obtenerPregunta);

// ─────────────────────────────────────────────────────────────────────────────
// RUTA PÚBLICA: verificar la respuesta y restablecer la contraseña
// POST /api/recuperacion/restablecer
// Body: { username, respuesta_seguridad, nueva_clave }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/restablecer", verificarRespuestaYRestablecerClave);

module.exports = router;
