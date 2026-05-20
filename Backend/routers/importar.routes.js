/**
 * importar.routes.js
 * ==================
 * Rutas para la importación masiva de productos desde Excel.
 * Solo administradores pueden usar esta función (es muy poderosa!).
 */

const express = require("express");
const router = express.Router();
const { requiereAuth, esAdmin } = require("../middlewares/auth.middleware");
const { procesarImportacion, uploadMiddleware } = require("../controllers/importar.controller");

// 📤 POST /api/importar/productos
// Recibe el archivo Excel y procesa la importación masiva.
// uploadMiddleware es el middleware de multer que extrae el archivo del request.
router.post(
  "/productos",
  requiereAuth,
  esAdmin,
  (req, res, next) => {
    // Llamamos a multer y manejamos sus posibles errores aquí
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  procesarImportacion
);

module.exports = router;
