require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

// 1. IMPORTACIÓN DE RUTAS
const clientesRoutes = require("./routers/clientes.routes");
const productosRoutes = require("./routers/productos.routes");
const ventasRoutes = require("./routers/ventas.routes");
const inventarioRoutes = require("./routers/inventario.routes");
const presupuestosRoutes = require("./routers/presupuestos.routes");
const authRoutes = require("./routers/auth.routes");
const categoriasRoutes = require("./routers/categorias.routes");
const usuariosRoutes = require("./routers/usuarios.routes");
const comprasRoutes = require("./routers/compras.routes");
const proveedoresRoutes = require("./routers/proveedores.routes");
const tesoreriaRoutes = require("./routers/tesoreria.routes");
const ajustesRoutes = require("./routers/ajustes.routes");
const importarRoutes = require("./routers/importar.routes");
const configuracionRoutes = require("./routers/configuracion.routes");

const app = express();

// 2. MIDDLEWARES
// El puerto 5500 es el que usa Live Server por defecto
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Servir archivos estáticos del Frontend
app.use("/frontend", express.static(path.join(__dirname, "../Frontend")));

// 3. RUTAS DE LA API
app.use("/api/clientes", clientesRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use("/api/presupuestos", presupuestosRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/proveedores", proveedoresRoutes);
app.use("/api/tesoreria", tesoreriaRoutes);
app.use("/api/ajustes", ajustesRoutes);
app.use("/api/importar", importarRoutes);
app.use("/api/configuracion", configuracionRoutes);

// 🎯 Endpoint para obtener configuración de la empresa
app.get("/api/empresa", (req, res) => {
  const { getEmpresaConfig } = require("./config/empresa");
  res.json(getEmpresaConfig());
});

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
const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor Express.js escuchando en el puerto ${PORT}`);
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Error: el puerto ${PORT} ya está en uso.`);
    console.error(
      "   Cierra la otra instancia de Node o cambia el puerto en el archivo .env",
    );
    console.error(
      "   Si ya tienes otra ventana de terminal con el servidor abierto, deténla antes de reiniciar nodemon.",
    );
    process.exit(1);
  }

  console.error("❌ Error al iniciar el servidor:", error);
  process.exit(1);
});
