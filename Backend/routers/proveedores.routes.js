const express = require("express");
const router = express.Router();
const proveedoresController = require("../controllers/proveedores.controller");
const { requiereAuth } = require("../middlewares/auth.middleware");

// Rutas específicas primero
router.get("/buscar", requiereAuth, proveedoresController.buscarProveedor);
router.post(
  "/reporte-pdf",
  requiereAuth,
  proveedoresController.generarReportePDF,
);

// Rutas generales y con parámetros
router.get("/", requiereAuth, proveedoresController.obtenerProveedores);
router.post(
  "/registrar",
  requiereAuth,
  proveedoresController.registrarProveedor,
);
router.put("/:id", requiereAuth, proveedoresController.actualizarProveedor);
router.delete("/:id", requiereAuth, proveedoresController.eliminarProveedor);
router.post("/exportar-excel", proveedoresController.exportarExcel);

module.exports = router;
