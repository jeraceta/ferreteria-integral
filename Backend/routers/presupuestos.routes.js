const { Router } = require("express");
const {
    crearPresupuesto,
    generarPDFPresupuesto
} = require("../controllers/presupuestos.controller.js");

// Comentario: Se importa el middleware pero se deja comentado en las rutas
// para facilitar el arranque inicial del servidor y la depuración.
// Para activar la seguridad, simplemente descomenta 'authMiddleware' en las rutas de abajo.
const authMiddleware = require("../middlewares/auth.middleware.js");

const router = Router();

/**
 * @route   POST /api/presupuestos/crear
 * @desc    Crea un nuevo presupuesto.
 * @access  Privado (requiere token)
 */
router.post(
    "/crear",
    // authMiddleware, // Descomentar para proteger la ruta
    crearPresupuesto
);

/**
 * @route   GET /api/presupuestos/reporte/:id
 * @desc    Genera y devuelve el PDF de un presupuesto específico.
 * @access  Público (o Privado si se activa el middleware)
 */
router.get(
    "/reporte/:id",
    // authMiddleware, // Opcional: Descomentar si la visualización de presupuestos también debe ser privada
    generarPDFPresupuesto
);

module.exports = router;