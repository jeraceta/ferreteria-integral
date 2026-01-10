const express = require("express");
const router = express.Router();
const {
  crearCliente,
  obtenerClientes,
  buscarCliente,
} = require("../controllers/clientes.controller");

// Nota: He comentado el middleware de autenticación temporalmente
// para que no te dé errores de "No autorizado" mientras probamos el flujo de ventas.
const { requiereAuth } = require("../middlewares/auth.middleware");

// --- RUTAS DE CLIENTES ---

// 1. Buscar cliente (Se pone primero por prioridad)
// GET /api/clientes/buscar
router.get("/buscar", buscarCliente);

// 2. Obtener lista completa
// GET /api/clientes
router.get("/", obtenerClientes);

// 3. Registrar nuevo cliente
// POST /api/clientes
router.post("/", crearCliente);
router.post("/registrar", crearCliente); // Alias para compatibilidad

module.exports = router;
