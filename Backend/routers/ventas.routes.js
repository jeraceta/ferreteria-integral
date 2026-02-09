// Importa el framework Express para crear y manejar rutas.
const express = require("express");
// Crea un nuevo objeto de enrutador de Express.
const router = express.Router();

// Importa el controlador de ventas que contiene la lógica de negocio.
const ventasController = require("../controllers/ventas.controller");
// Importa el middleware de autenticación y autorización.
const { requiereAuth, esAdmin } = require("../middlewares/auth.middleware");

// --- DEFINICIÓN DE RUTAS PARA VENTAS ---

// Ruta para procesar una nueva venta
router.post("/procesar", requiereAuth, ventasController.procesarVenta);
// Ruta para obtener la última tasa de cambio
router.get("/tasa-bcv", requiereAuth, ventasController.obtenerUltimaTasa);
// Ruta para generar el reporte PDF de una venta
router.get("/reporte-pdf/:id", requiereAuth, ventasController.generarReporte);
// Rutas para la gestión de devoluciones
router.get(
  "/motivos-devolucion",
  requiereAuth,
  ventasController.obtenerMotivosDevolucion,
);
router.post(
  "/devolucion/:id",
  requiereAuth,
  ventasController.procesarDevolucion,
);
router.get(
  "/devolucion-pdf/:id",
  requiereAuth,
  ventasController.generarPDFDevolucion,
);
// Rutas para el control de caja (Reporte X y Z)
router.get("/reporte-x", requiereAuth, ventasController.obtenerReporteX);
router.post(
  "/cierre-z",
  requiereAuth,
  esAdmin,
  ventasController.generarCierreZ,
);

// Exporta el enrutador configurado.
module.exports = router;
