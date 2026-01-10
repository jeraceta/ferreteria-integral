// db.js
const mysql = require("mysql2/promise");
const path = require("path");

// Cargamos el .env asegurando que encuentre la ruta aunque movamos el proyecto
require("dotenv").config({ path: path.join(__dirname, ".env") });

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ferreteria_db",
  port: Number(process.env.DB_PORT) || 3306,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
});

// Prueba de conexión al arrancar (muy útil para saber si XAMPP está activo)
pool
  .getConnection()
  .then((conn) => {
    console.log("✅ ¡Conexión a MySQL exitosa!");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ Error de conexión en db.js:", err.message);
    console.log(
      "Tip: Asegúrate de que XAMPP/MySQL esté encendido y el archivo .env tenga los datos correctos."
    );
  });

module.exports = pool;
