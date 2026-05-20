const pool = require("../db");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

// --- CONFIGURACIÓN DE MULTER ---

// 1. Storage para Logos de Empresa
const storageLogo = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `logo_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadLogo = multer({
  storage: storageLogo,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos de imagen"), false);
    }
  },
});

// 2. Storage para Restauración de Base de Datos (SQL)
const storageSql = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `restore_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadSql = multer({
  storage: storageSql,
  limits: { fileSize: 50 * 1024 * 1024 }, // Aumentamos límite a 50MB para BDs grandes
  fileFilter: (req, file, cb) => {
    // Aceptamos .sql y también text/plain o application/octet-stream que a veces asigna el SO
    if (file.originalname.endsWith(".sql") || file.mimetype === "application/sql") {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos de respaldo .sql"), false);
    }
  },
});

// Función auxiliar para sincronizar el archivo estático config/empresa.js
const syncEmpresaConfigFile = (datos) => {
  try {
    const configPath = path.join(__dirname, "../config/empresa.js");
    const content = `/**
 * CONFIGURACIÓN DE LA EMPRESA (Sincronizado automáticamente)
 * ==========================================================
 * ¡Este archivo se actualiza desde el módulo de configuración!
 */

const EMPRESA_CONFIG = {
  nombre: "${datos.razon_social}",
  rif: "${datos.rif}",
  direccion: "${datos.direccion}",
  telefono: "${datos.telefono}",
  email: "${datos.email || ""}",
  logo_path: "${datos.logo_path || ""}"
};

function getEmpresaConfig() {
  return { ...EMPRESA_CONFIG };
}

module.exports = {
  getEmpresaConfig,
  EMPRESA_CONFIG
};
`;
    fs.writeFileSync(configPath, content, "utf8");
    console.log("✅ Archivo config/empresa.js sincronizado.");
  } catch (error) {
    console.error("❌ Error al sincronizar config/empresa.js:", error.message);
  }
};

// Obtener datos de empresa
const obtenerDatosEmpresa = async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM empresa_datos WHERE id = 1");
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Datos de empresa no encontrados" });
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

// Actualizar datos de empresa
const actualizarDatosEmpresa = async (req, res, next) => {
  try {
    const { razon_social, rif, direccion, telefono, email } = req.body;
    let logo_path = null;

    // Si hay archivo, guardar la ruta
    if (req.file) {
      logo_path = `/uploads/${req.file.filename}`;
    }

    // Actualizar o insertar datos (Sin email en la DB por ahora para evitar errores de columna faltante)
    const sql = logo_path
      ? "UPDATE empresa_datos SET razon_social = ?, rif = ?, direccion = ?, telefono = ?, logo_path = ? WHERE id = 1"
      : "UPDATE empresa_datos SET razon_social = ?, rif = ?, direccion = ?, telefono = ? WHERE id = 1";

    const values = logo_path
      ? [razon_social, rif, direccion, telefono, logo_path]
      : [razon_social, rif, direccion, telefono];

    await pool.query(sql, values);

    // 🔄 Sincronizar con el archivo estático
    syncEmpresaConfigFile({ razon_social, rif, direccion, telefono, email, logo_path });

    res.json({ message: "Datos de empresa actualizados correctamente" });
  } catch (error) {
    next(error);
  }
};

// Generar respaldo de base de datos
const generarBackup = async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${timestamp}.sql`;
    const filepath = path.join(__dirname, "../temp", filename);

    // Asegurar que el directorio temp existe
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Obtener todas las tablas
    const [tables] = await connection.execute("SHOW TABLES");
    const tableNames = tables.map((row) => Object.values(row)[0]);

    let sqlContent = `-- Backup generado el ${new Date().toISOString()}
-- Base de datos: ${process.env.DB_NAME || "ferreteria"}
-- Host: ${process.env.DB_HOST || "localhost"}

`;

    // Para cada tabla, obtener la estructura y los datos
    for (const tableName of tableNames) {
      // Obtener CREATE TABLE
      const [createTable] = await connection.execute(
        `SHOW CREATE TABLE \`${tableName}\``,
      );
      sqlContent += `\n-- Estructura de la tabla \`${tableName}\`\n`;
      sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
      sqlContent += createTable[0]["Create Table"] + ";\n\n";

      // Obtener datos de la tabla
      const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        sqlContent += `-- Datos de la tabla \`${tableName}\`\n`;

        // Procesar filas en lotes para evitar problemas de memoria
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const values = batch
            .map((row) => {
              return (
                "(" +
                Object.values(row)
                  .map((value) => {
                    if (value === null) return "NULL";
                    if (typeof value === "string") {
                      return `'${value.replace(/'/g, "''")}'`; // Escapar comillas simples
                    }
                    if (value instanceof Date) {
                      return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
                    }
                    return value;
                  })
                  .join(", ") +
                ")"
              );
            })
            .join(",\n");

          const columns = Object.keys(rows[0])
            .map((col) => `\`${col}\``)
            .join(", ");
          sqlContent += `INSERT INTO \`${tableName}\` (${columns}) VALUES\n${values};\n\n`;
        }
      }
    }

    // Escribir archivo
    fs.writeFileSync(filepath, sqlContent, "utf8");

    // Enviar archivo y luego eliminarlo
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error("Error al enviar archivo:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error al descargar archivo" });
        }
      }
      // Eliminar archivo temporal
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr)
          console.error("Error al eliminar archivo temporal:", unlinkErr);
      });
    });
  } catch (error) {
    console.error("Error general en generarBackup:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  } finally {
    if (connection) connection.release();
  }
};

const { exec } = require("child_process");

// Restaurar base de datos desde archivo
const restaurarBackup = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No se proporcionó archivo de respaldo" });
    }

    const filepath = req.file.path;

    // 1. Preparar el archivo con desactivación de llaves foráneas
    // Esto asegura que la restauración no falle por dependencias circulares o truncado de tablas
    const originalContent = fs.readFileSync(filepath, "utf8");
    const safeContent = `SET FOREIGN_KEY_CHECKS = 0;\n${originalContent}\nSET FOREIGN_KEY_CHECKS = 1;`;
    fs.writeFileSync(filepath, safeContent, "utf8");

    // 2. Construir comando de restauración
    // Intentamos usar el cliente 'mysql' del sistema
    const host = process.env.DB_HOST || "localhost";
    const user = process.env.DB_USER || "root";
    const password = process.env.DB_PASSWORD || "";
    const dbName = process.env.DB_NAME || "ferreteria";

    const passPart = password ? `-p"${password}"` : "";
    
    // Comando para ejecutar el SQL mediante el cliente de línea de comandos de MySQL
    const command = `mysql -h ${host} -u ${user} ${passPart} ${dbName} < "${filepath}"`;

    console.log("Restaurando base de datos mediante comando CLI...");

    exec(command, (error, stdout, stderr) => {
      // Eliminar archivo temporal inmediatamente después de intentar la restauración
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      if (error) {
        console.error("Error al ejecutar restauración CLI:", error);
        console.error("Stderr:", stderr);
        
        // Si el comando 'mysql' falla (ej. no está en el PATH), devolvemos error específico
        return res.status(500).json({ 
          message: "Error al restaurar base de datos mediante CLI", 
          details: error.message,
          hint: "Asegúrese de que el ejecutable 'mysql' esté en el PATH del sistema o configurado correctamente."
        });
      }

      console.log("Restauración exitosa:", stdout);
      res.json({ message: "Base de datos restaurada correctamente mediante comando del sistema" });
    });

  } catch (error) {
    console.error("Error general en restaurarBackup:", error);
    
    // Limpieza de emergencia
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (!res.headersSent) {
      res.status(500).json({
        message: "Fallo crítico al procesar el archivo de restauración",
        details: error.message,
      });
    }
  }
};

module.exports = {
  obtenerDatosEmpresa,
  actualizarDatosEmpresa,
  generarBackup,
  restaurarBackup,
  uploadLogo,
  uploadSql,
};
