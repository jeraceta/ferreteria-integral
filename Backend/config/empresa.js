/**
 * CONFIGURACIÓN DE LA EMPRESA (Sincronizado automáticamente)
 * ==========================================================
 * ¡Este archivo se actualiza desde el módulo de configuración!
 */

const EMPRESA_CONFIG = {
  nombre: "RAMIREZ SUMINISTROS & MATERIALES 2024, F.P.",
  rif: "V-274852093",
  direccion: "Av. ALGIMIRO GABALDO (VIA ALTERNA) BARRIO UNIVERSITARIO (GUARAPERA) BARCELONA, EDO ANZOATEGUI",
  telefono: "0000-0000000",
  email: "",
  logo_path: "/uploads/logo_1778879452460_logo.png"
};

function getEmpresaConfig() {
  return { ...EMPRESA_CONFIG };
}

module.exports = {
  getEmpresaConfig,
  EMPRESA_CONFIG
};
