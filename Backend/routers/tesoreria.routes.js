const express = require("express");
const router = express.Router();
const tesoreriaController = require("../controllers/tesoreria.controller");
const { requiereAuth, esAdmin } = require("../middlewares/auth.middleware");

// CxC
router.get("/cxc", esAdmin, tesoreriaController.obtenerCxc);
router.post("/cxc", esAdmin, tesoreriaController.crearCxc);
router.put("/cxc/:id", esAdmin, tesoreriaController.actualizarCxc);
router.delete("/cxc/:id", esAdmin, tesoreriaController.eliminarCxc);
router.post("/cxc/:id/abono", esAdmin, tesoreriaController.registrarAbonoCxC);
router.get("/cxc/exportar-pdf", esAdmin, tesoreriaController.exportarCxcPDF);
router.get(
  "/cxc/exportar-excel",
  esAdmin,
  tesoreriaController.exportarCxcExcel,
);

// CxP
router.get("/cxp", esAdmin, tesoreriaController.obtenerCxp);
router.post("/cxp", esAdmin, tesoreriaController.crearCxp);
router.put("/cxp/:id", esAdmin, tesoreriaController.actualizarCxp);
router.delete("/cxp/:id", esAdmin, tesoreriaController.eliminarCxp);
router.post("/cxp/:id/abono", esAdmin, tesoreriaController.registrarAbonoCxP);
router.get("/cxp/exportar-pdf", esAdmin, tesoreriaController.exportarCxpPDF);
router.get(
  "/cxp/exportar-excel",
  esAdmin,
  tesoreriaController.exportarCxpExcel,
);

module.exports = router;
