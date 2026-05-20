/**
 * SCRIPT PARA ACTUALIZAR DATOS DE LA EMPRESA
 * ===========================================
 * ¡Hola! Este script te ayuda a cambiar los datos de tu ferretería.
 *
 * INSTRUCCIONES:
 * 1. Modifica los valores en el objeto empresaData
 * 2. Ejecuta: node actualizar-empresa.js
 * 3. Reinicia el servidor
 *
 * ¡Así de fácil! 🎯
 */

const fs = require("fs");
const path = require("path");

// 🎯 DATOS DE TU EMPRESA - ¡MODIFICA AQUÍ!
const empresaData = {
  nombre: "FERRETERIA TU NOMBRE, C.A.", // ← Cambia por el nombre real de tu ferretería
  rif: "J-12345678-9", // ← Cambia por tu RIF real
  direccion: "Tu dirección completa aquí", // ← Cambia por tu dirección real
  telefono: "0212-1234567", // ← Cambia por tu teléfono real
  email: "tu-email@ferreteria.com", // ← Cambia por tu email real
  sitio_web: "www.tuferreteria.com", // ← Cambia por tu sitio web
  slogan: "Tu ferretería de confianza", // ← Cambia por tu slogan
  representante_legal: "Tu Nombre Completo", // ← Cambia por el representante legal
  registro_mercantil: "123456789", // ← Cambia por tu registro mercantil
};

// 📁 Ruta del archivo de configuración
const configPath = path.join(__dirname, "config", "empresa.js");

// 📖 Leemos el archivo actual
let configContent = fs.readFileSync(configPath, "utf8");

// 🔄 Función para actualizar un valor en el archivo
function actualizarValor(clave, nuevoValor) {
  // Creamos la expresión regular para encontrar la línea
  const regex = new RegExp(`(${clave}: )"[^"]*"`, "g");
  const nuevoTexto = `$1"${nuevoValor}"`;

  // Reemplazamos en el contenido
  configContent = configContent.replace(regex, nuevoTexto);
  console.log(`✅ ${clave}: "${nuevoValor}"`);
}

// 🚀 Actualizamos todos los valores
console.log("🔄 Actualizando datos de la empresa...\n");

actualizarValor("nombre", empresaData.nombre);
actualizarValor("rif", empresaData.rif);
actualizarValor("direccion", empresaData.direccion);
actualizarValor("telefono", empresaData.telefono);
actualizarValor("email", empresaData.email);
actualizarValor("sitio_web", empresaData.sitio_web);
actualizarValor("slogan", empresaData.slogan);
actualizarValor("representante_legal", empresaData.representante_legal);
actualizarValor("registro_mercantil", empresaData.registro_mercantil);

// 💾 Guardamos el archivo actualizado
fs.writeFileSync(configPath, configContent, "utf8");

console.log("\n🎉 ¡Datos de la empresa actualizados exitosamente!");
console.log(
  "📋 Recuerda reiniciar el servidor para que los cambios tomen efecto:",
);
console.log("   cd Backend && npm run dev");
console.log("\n✨ ¡Tu ferretería ahora tiene los datos correctos!");
