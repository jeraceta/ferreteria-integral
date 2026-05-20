/**
 * ajustes.routes.js
 * =================
 * Aquí definimos las "puertas de entrada" al módulo de Ajuste de Inventario.
 * Cada ruta conecta una URL con una función del controlador.
 * Es como el directorio de un edificio: indica en qué piso está cada oficina.
 */

const express = require("express");
const router = express.Router();

// Importamos el middleware de autenticación (verifica que el usuario esté logueado)
const { requiereAuth, esAdmin } = require("../middlewares/auth.middleware");

// Importamos las funciones del controlador de ajustes
const {
  procesarAjuste,
  generarComprobanteAjuste,
  obtenerHistorialAjustes,
} = require("../controllers/ajustes.controller");

// 📋 RUTA: GET /api/ajustes/historial
// Devuelve todos los ajustes realizados (para la tabla del historial)
router.get("/historial", esAdmin, obtenerHistorialAjustes);

// 📄 RUTA: GET /api/ajustes/comprobante/:id
// Genera y descarga el PDF de un ajuste específico por su ID
router.get("/comprobante/:id", esAdmin, generarComprobanteAjuste);

// 💾 RUTA: POST /api/ajustes/procesar
// Recibe los datos del nuevo ajuste y los guarda en la base de datos
router.post("/procesar", esAdmin, procesarAjuste);

// Exportamos el router para registrarlo en index.js
module.exports = router;
