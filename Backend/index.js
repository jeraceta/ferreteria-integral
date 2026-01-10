require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");

// 1. IMPORTACIÓN DE RUTAS
const clientesRoutes = require("./routers/clientes.routes");
const productosRoutes = require("./routers/productos.routes");
const ventasRoutes = require("./routers/ventas.routes");
const inventarioRoutes = require("./routers/inventario.routes");
// Si tienes compras, descomenta la línea de abajo
// const comprasRoutes = require("./routers/compras.routes");

const app = express();

// 2. MIDDLEWARES
// El puerto 5500 es el que usa Live Server por defecto
app.use(cors({ origin: "http://127.0.0.1:5500" }));
app.use(morgan("dev"));
app.use(express.json());

// 3. RUTAS DE LA API
app.use("/api/clientes", clientesRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/inventario", inventarioRoutes);
// app.use("/api/compras", comprasRoutes);

// 4. MANEJO DE ERRORES GLOBAL
app.use((err, req, res, next) => {
  console.error("❌ Error en el servidor:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Error interno del servidor",
  });
});

// Ruta de prueba base
app.get("/", (req, res) => {
  res.send("🚀 Servidor de la Ferretería Activo. ¡Conexión OK!");
});

// 5. INICIAR EL SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express.js escuchando en el puerto ${PORT}`);
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
});
