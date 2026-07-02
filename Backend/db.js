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
  .then(async (conn) => {
    console.log("✅ ¡Conexión a MySQL exitosa!");
    
    try {
      // Verificar si las columnas de seguridad existen en la tabla usuarios
      const [columns] = await conn.query("SHOW COLUMNS FROM usuarios");
      const hasPregunta = columns.some(col => col.Field === "pregunta_seguridad");
      const hasRespuesta = columns.some(col => col.Field === "respuesta_seguridad");

      if (!hasPregunta) {
        console.log("⚠️ Columna 'pregunta_seguridad' no encontrada. Creándola...");
        await conn.query("ALTER TABLE usuarios ADD COLUMN pregunta_seguridad VARCHAR(255) NULL COMMENT 'Pregunta de seguridad'");
        console.log("✅ Columna 'pregunta_seguridad' creada con éxito.");
      }

      if (!hasRespuesta) {
        console.log("⚠️ Columna 'respuesta_seguridad' no encontrada. Creándola...");
        await conn.query("ALTER TABLE usuarios ADD COLUMN respuesta_seguridad VARCHAR(255) NULL COMMENT 'Hash respuesta de seguridad'");
        console.log("✅ Columna 'respuesta_seguridad' creada con éxito.");
      }
    } catch (migError) {
      console.error("❌ Error al verificar/crear columnas de seguridad en la DB:", migError.message);
    }

    conn.release();
  })
  .catch((err) => {
    console.error("❌ Error de conexión en db.js:", err.message);
    console.log(
      "Tip: Asegúrate de que XAMPP/MySQL esté encendido y el archivo .env tenga los datos correctos."
    );
  });

module.exports = pool;
