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
router.post("/registrar", requiereAuth, ventasController.procesarVenta);
// Ruta para buscar historial de ventas por cédula/RIF del cliente
router.get(
  "/buscar-por-cedula/:cedula",
  requiereAuth,
  ventasController.buscarVentasPorCedula,
);
// Ruta para obtener la última tasa de cambio
router.get("/tasa-bcv", requiereAuth, ventasController.obtenerUltimaTasa);
// Ruta para generar el reporte PDF de una venta
router.get("/reporte/:id", requiereAuth, ventasController.generarComprobante);

// NUEVO: Ruta para que el frontend verifique si la caja está cerrada
router.get("/estado-caja", requiereAuth, ventasController.verificarEstadoCaja);
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
// Ruta para anular una venta y restaurar inventario
router.put("/anular/:id", requiereAuth, ventasController.anularVenta);
// Ruta para obtener los detalles originales de una venta (para devoluciones)
router.get(
  "/:id/original-detalles",
  requiereAuth,
  ventasController.obtenerDetallesVenta,
);
router.get(
  "/devolucion-pdf/:id",
  requiereAuth,
  ventasController.generarPDFDevolucion,
);
// Ruta para generar el reporte de devolución (PDF)
router.get(
  "/reporte-devolucion/:id",
  requiereAuth,
  ventasController.generarReporteDevolucion,
);
// Rutas para el control de caja (Reporte X y Z)
router.get("/reporte-x", requiereAuth, ventasController.obtenerReporteX);
router.post(
  "/cierre-z",
  requiereAuth,
  esAdmin,
  ventasController.generarCierreZ,
);

// Rutas para historial de cierres
router.get("/historial-cierres", requiereAuth, esAdmin, ventasController.obtenerHistorialCierres);
router.get("/historial-cierres/:id", requiereAuth, esAdmin, ventasController.obtenerDetalleCierre);

// Exporta el enrutador configurado.
module.exports = router;

