const express = require("express");
const router = express.Router();
const {
  obtenerDatosEmpresa,
  actualizarDatosEmpresa,
  generarBackup,
  restaurarBackup,
  uploadLogo,
  uploadSql,
} = require("../controllers/configuracion.controller");
const { requiereAuth, esAdmin } = require("../middlewares/auth.middleware");

// Todas las rutas requieren autenticación
router.use(requiereAuth);

// Rutas para datos de empresa
router.get("/empresa", obtenerDatosEmpresa);
router.put("/empresa", uploadLogo.single("logo"), actualizarDatosEmpresa);

// Rutas para backup y restore (solo administradores)
router.get("/backup", esAdmin, generarBackup);
router.post("/restore", esAdmin, uploadSql.single("backup"), restaurarBackup);

module.exports = router;
