/**
 * CONFIGURACIÓN DE LA EMPRESA (Sincronizado automáticamente)
 * ==========================================================
 * ¡Este archivo se actualiza desde el módulo de configuración!
 */

const EMPRESA_CONFIG = {
  nombre: "RAMIREZ SUMINISTROS & MATERIALES 2024, F.P.",
  rif: "V-274852093",
  direccion: "Av. ALGIMIRO GABALDÓN (VIA ALTERNA) BARRIO UNIVERSITARIO. BARCELONA, EDO ANZOATEGUI",
  telefono: "0000-0000000",
  email: "",
  logo_path: "/uploads/logo_1779404699219_logo.png"
};

function getEmpresaConfig() {
  return { ...EMPRESA_CONFIG };
}

module.exports = {
  getEmpresaConfig,
  EMPRESA_CONFIG
};
