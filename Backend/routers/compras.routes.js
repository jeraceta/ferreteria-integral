const express = require("express");
const router = express.Router();
const comprasController = require("../controllers/compras.controller");
const { requiereAuth } = require("../middlewares/auth.middleware");

router.post("/registrar", requiereAuth, comprasController.registrarCompra);
router.get("/", requiereAuth, comprasController.obtenerCompras);
router.get("/exportar-excel", requiereAuth, comprasController.exportarExcel);
router.get(
  "/reporte/:id",
  requiereAuth,
  comprasController.generarReporteCompra,
);

module.exports = router;
