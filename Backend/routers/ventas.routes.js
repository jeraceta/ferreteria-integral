const express = require('express');
const router = express.Router();
const { procesarVenta, obtenerUltimaTasa } = require('../controllers/ventas.controller'); // Adjusted path to controllers
const { requiereAuth } = require('../middlewares/auth.middleware');
const { body, validationResult } = require('express-validator');

// Ruta para obtener la última tasa de cambio usada
router.get('/ultima-tasa', requiereAuth, obtenerUltimaTasa);

// --- RUTA PARA PROCESAR VENTA ---
// 1. requiereAuth: El usuario debe estar autenticado.
// 2. Middlewares de validación de express-validator.
// 3. procesarVenta: El controlador que maneja la lógica de negocio.
router.post('/registrar',
    requiereAuth,
    [ // Se agrupan las validaciones en un arreglo
        body('datosVenta').isObject().withMessage('datosVenta debe ser un objeto.'),
        body('detalle').isArray({ min: 1 }).withMessage('El detalle debe ser un arreglo con al menos un producto.')
    ],
    (req, res, next) => {
        // Middleware intermedio para manejar los resultados de la validación
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Si hay errores, se crea un objeto de error estructurado y se pasa al siguiente middleware
            const error = new Error('Error de validación en los datos de la venta.');
            error.status = 400;
            error.details = errors.array();
            return next(error);
        }
        // Si la validación es exitosa, se pasa el control al siguiente middleware en la cadena (procesarVenta)
        next();
    },
    procesarVenta // <- Llamada directa al controlador de ventas, que ahora maneja todo el flujo.
);

module.exports = router;