const express = require("express");
const router = express.Router();
const clientesController = require("../controllers/clientes.controller");
const { requiereAuth } = require("../middlewares/auth.middleware");

router.get("/", requiereAuth, clientesController.obtenerClientes);
router.post("/registrar", requiereAuth, clientesController.registrarCliente);
router.put("/:id", requiereAuth, clientesController.actualizarCliente);
router.delete("/:id", requiereAuth, clientesController.eliminarCliente);
router.get("/buscar", requiereAuth, clientesController.buscarCliente);
router.post("/reporte-pdf", clientesController.generarReportePDF);
router.post("/exportar-excel", clientesController.exportarExcel);

module.exports = router;
