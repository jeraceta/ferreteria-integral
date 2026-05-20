/**
 * @module theme.js
 * @description Módulo de aplicación de tema global (Light / Dark).
 *
 * Este módulo se encarga ÚNICAMENTE de:
 *   1. Leer la preferencia de tema guardada en localStorage.
 *   2. Aplicarla inmediatamente al <body> via `data-theme` para evitar FOUC.
 *
 * El CAMBIO de tema lo gestiona `configuracion.js` a través de los
 * botones "Activar Tema Oscuro" / "Activar Tema Claro" en la pestaña
 * "Tema" de la página de Configuración.
 *
 * Inclusión recomendada: primer <script> en el <head> de CADA página,
 * antes de styles.css.
 *
 * @example HTML en cada página:
 *   <script src="theme.js"></script>
 *   <link rel="stylesheet" href="styles.css" />
 */
(function () {
  "use strict";

  /** @constant {string} Clave de localStorage donde se persiste la preferencia */
  const STORAGE_KEY = "ferreteria_theme";

  /**
   * @function applyTheme
   * @description Aplica el tema al atributo data-theme del documentElement y body.
   * @param {string} theme - "dark" | "light"
   */
  function applyTheme(theme) {
    const validTheme = theme === "dark" ? "dark" : "light";
    // Aplicar a documentElement (disponible inmediatamente en <head>)
    document.documentElement.setAttribute("data-theme", validTheme);
    // Aplicar a body si ya está disponible
    if (document.body) {
      document.body.setAttribute("data-theme", validTheme);
    }
  }

  /**
   * @function resolveTheme
   * @description Determina el tema a aplicar.
   * Prioridad: localStorage → light (predeterminado estricto).
   * @returns {string} "dark" | "light"
   */
  function resolveTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    // Ya no se consulta prefers-color-scheme para cumplir con el requerimiento del usuario
    return "light";
  }

  // Aplicación inmediata en el <head> (afecta a documentElement)
  applyTheme(resolveTheme());

  // Re-aplicar tras DOMContentLoaded para asegurar el body
  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(resolveTheme());
  });
})();
