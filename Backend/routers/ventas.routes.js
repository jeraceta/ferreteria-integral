const express = require("express");
const router = express.Router();
const ventasController = require("../controllers/ventas.controller");
const { requiereAuth } = require("../middlewares/auth.middleware");

// --- Rutas Específicas y Estáticas (van primero) ---

// Obtener todas las ventas (ruta general)
router.get("/", requiereAuth, ventasController.obtenerVentas);

// Obtener la última tasa de cambio
router.get("/ultima-tasa", requiereAuth, ventasController.obtenerUltimaTasa);

// Obtener los motivos de devolución para el formulario de devoluciones
router.get("/motivos-devolucion", requiereAuth, ventasController.obtenerMotivosDevolucion);

// Registrar una nueva venta
router.post("/registrar", requiereAuth, ventasController.procesarVenta);

// --- Rutas Dinámicas (van después de las estáticas) ---

// Buscar ventas asociadas a una cédula de cliente
// Se coloca aquí porque es más específica que las rutas con solo :id
router.get("/buscar-por-cedula/:cedula", requiereAuth, ventasController.buscarVentasPorCedula);

// Obtener detalles completos de una venta
router.get("/:id/detalles", requiereAuth, ventasController.obtenerVentaDetalles);

// Obtener los detalles originales de la venta (usado en el modal de devolución)
// Esta ruta ahora funciona porque getSaleDetails se exportó en el controlador.
router.get("/:id/original-detalles", requiereAuth, ventasController.getSaleDetails);

// Generar el reporte PDF de una venta (Nota de Entrega)
router.get("/reporte/:id", ventasController.generarReporte);

// Generar el comprobante PDF de una devolución
router.get("/reporte-devolucion/:id", requiereAuth, ventasController.generarPDFDevolucion);

// Anular una venta (cambia el estado y restaura el stock)
router.put("/anular/:id", requiereAuth, ventasController.anularVenta);

// Procesar una devolución (parcial o total)
router.post("/devolucion/:id", requiereAuth, ventasController.procesarDevolucion);

module.exports = router;
