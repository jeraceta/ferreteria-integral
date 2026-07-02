/**
 * scripts/rescate.js — SCRIPT DE RESCATE TÉCNICO
 * ================================================
 * ⚠️  HERRAMIENTA DE SOPORTE TÉCNICO — USO EXCLUSIVO DEL ADMINISTRADOR DEL SISTEMA ⚠️
 *
 * PROPÓSITO:
 *   Este script es la CAPA 2 del sistema de recuperación de credenciales.
 *   Se usa cuando el administrador principal (ID=1) ha perdido su contraseña
 *   Y tampoco recuerda su respuesta de seguridad (Capa 1 falló o no fue configurada).
 *
 * QUÉ HACE:
 *   1. Se conecta directamente a la base de datos MySQL usando las credenciales del .env
 *   2. Actualiza la contraseña del usuario con ID=1 a una clave temporal genérica
 *   3. Limpia (pone NULL) las columnas `pregunta_seguridad` y `respuesta_seguridad`,
 *      obligando al administrador a configurarlas de nuevo al entrar al sistema.
 *
 * CÓMO USARLO:
 *   Desde la carpeta Backend, ejecutar en consola:
 *   > node scripts/rescate.js
 *
 * DESPUÉS DE USARLO:
 *   1. Inicia sesión con la contraseña temporal: AdminTemporal2026*
 *   2. Ve a tu perfil y CAMBIA la contraseña inmediatamente por una segura.
 *   3. Configura nuevamente tu pregunta de seguridad.
 *
 * NOTA DE SEGURIDAD:
 *   Este archivo NUNCA debe ser accesible desde la web ni desde la API.
 *   Solo debe ejecutarse manualmente desde la terminal del servidor.
 */

// ─── Carga de dependencias ───
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const path = require("path");

// Cargamos las variables de entorno del archivo .env que está en la carpeta Backend
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// ─── Contraseña temporal de rescate ───
// Esta es la clave que se asignará al admin. Cámbiala INMEDIATAMENTE al ingresar.
const CLAVE_TEMPORAL = "AdminTemporal2026*";

// ─── Función principal asíncrona ───
const ejecutarRescate = async () => {
  let connection;

  try {
    console.log("\n🚨 ================================================= 🚨");
    console.log("   SCRIPT DE RESCATE TÉCNICO — FERRETERÍA SISTEMA");
    console.log("🚨 ================================================= 🚨\n");

    // ─── Conexión directa a la base de datos ───
    // Usamos las mismas credenciales que usa el servidor Express (desde .env)
    console.log("📡 Conectando a la base de datos...");
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "ferreteria_db",
      port: Number(process.env.DB_PORT) || 3306,
    });
    console.log("✅ Conexión establecida correctamente.\n");

    // ─── Verificamos que el usuario administrador (ID=1) exista ───
    const [usuarios] = await connection.query(
      "SELECT id, username, nombre FROM usuarios WHERE id = 1"
    );

    if (usuarios.length === 0) {
      console.error(
        "❌ Error: No se encontró ningún usuario con ID=1 en la base de datos."
      );
      console.error(
        "   Verifica el ID correcto del administrador en la tabla `usuarios`."
      );
      process.exit(1);
    }

    const admin = usuarios[0];
    console.log(
      `👤 Usuario encontrado: "${admin.nombre}" (username: ${admin.username})\n`
    );

    // ─── Encriptación de la contraseña temporal ───
    // Siempre encriptamos con bcrypt antes de guardar en la DB.
    // Nunca guardamos contraseñas en texto plano.
    console.log("🔐 Generando hash de la contraseña temporal...");
    const salt = await bcrypt.genSalt(10);
    const hashTemporal = await bcrypt.hash(CLAVE_TEMPORAL, salt);
    console.log("✅ Hash generado.\n");

    // ─── Actualización en la base de datos ───
    // 1. Cambiamos la contraseña por el hash temporal.
    // 2. Limpiamos pregunta y respuesta de seguridad para que el admin
    //    deba configurarlas de nuevo (seguridad extra).
    console.log("💾 Aplicando cambios en la base de datos...");
    const [result] = await connection.query(
      `UPDATE usuarios 
       SET password = ?, 
           pregunta_seguridad = NULL, 
           respuesta_seguridad = NULL 
       WHERE id = 1`,
      [hashTemporal]
    );

    if (result.affectedRows === 0) {
      console.error("❌ No se realizaron cambios. Verifica la conexión.");
      process.exit(1);
    }

    // ─── Resultado del rescate ───
    console.log("✅ Cambios aplicados exitosamente.\n");
    console.log("════════════════════════════════════════════════════");
    console.log("  ✅  RESCATE COMPLETADO CON ÉXITO");
    console.log("════════════════════════════════════════════════════");
    console.log(`  👤  Usuario:            ${admin.username}`);
    console.log(`  🔑  Contraseña temporal: ${CLAVE_TEMPORAL}`);
    console.log(`  🔒  Pregunta seguridad:  NULL (limpiada)`);
    console.log("════════════════════════════════════════════════════");
    console.log("\n⚠️  ACCIONES REQUERIDAS INMEDIATAMENTE:");
    console.log("  1. Inicia sesión con la contraseña temporal de arriba.");
    console.log("  2. Cambia la contraseña desde tu perfil a una segura.");
    console.log("  3. Configura tu pregunta de seguridad nuevamente.");
    console.log("\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error durante el rescate:", error.message);

    // Mensajes de ayuda según el tipo de error
    if (error.code === "ECONNREFUSED" || error.code === "ER_ACCESS_DENIED_ERROR") {
      console.error(
        "💡 Verifica que MySQL/XAMPP esté corriendo y que las credenciales en .env sean correctas."
      );
    } else if (error.code === "ER_NO_SUCH_TABLE") {
      console.error(
        "💡 La tabla `usuarios` no existe. Verifica el nombre de la base de datos en .env"
      );
    }

    process.exit(1);
  } finally {
    // Siempre cerramos la conexión al terminar, haya éxito o error
    if (connection) {
      await connection.end();
      console.log("🔌 Conexión cerrada.");
    }
  }
};

// ─── Punto de entrada del script ───
ejecutarRescate();
