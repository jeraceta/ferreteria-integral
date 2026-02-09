const express = require('express');
const router = express.Router();
const controller = require('../controllers/categorias.controller'); // Importamos el objeto completo
const { requiereAuth } = require('../middlewares/auth.middleware'); // O la ruta correcta a tu middleware

// Debug
console.log('Middleware es:', typeof requiereAuth);
console.log('Controller es:', typeof controller.getCategorias);

// Rutas
// GET /api/categorias (Listar)
router.get('/', requiereAuth, controller.getCategorias); 

// POST /api/categorias/crear (Crear)
router.post('/crear', requiereAuth, controller.createCategoria);

module.exports = router;