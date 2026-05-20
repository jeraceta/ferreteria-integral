/**
 * inventario.js
 * =============
 * Lógica del módulo de Inventario.
 * ¡Ahora con soporte para mostrar la ubicación en el estante! 📦
 *
 * ¿Qué hace este archivo?
 *  - Carga categorías dinámicamente para el filtro
 *  - Consulta el inventario con múltiples filtros
 *  - Renderiza la tabla con columnas opcionales: Descripción, Conteo Físico, Ubicación
 *  - Genera PDF y exporta a Excel con los mismos filtros
 */

document.addEventListener("DOMContentLoaded", () => {
  // ── URL base del API ──
  const API_BASE = window.API_BASE || "http://localhost:3000/api";
  const token = localStorage.getItem("token");

  // ── Referencias a elementos del DOM ──
  const selectDeposito = document.getElementById("selectDeposito");
  const selectCategoria = document.getElementById("selectCategoria");
  const selectOrdenar = document.getElementById("selectOrdenar");
  const selectDireccion = document.getElementById("selectDireccion");
  const chkDescripcion = document.getElementById("chkDescripcion");
  const chkConteoFisico = document.getElementById("chkConteoFisico");
  const chkUbicacion = document.getElementById("chkUbicacion");   // ← ¡NUEVO!
  const btnConsultar = document.getElementById("btnConsultar");
  const btnGenerarPDF = document.getElementById("btnGenerarPDF");
  const btnExportarExcel = document.getElementById("btnExportarExcel");
  const theadInventario = document.getElementById("theadInventario");
  const tbodyInventario = document.getElementById("tbodyInventario");
  const badgeTotal = document.getElementById("badgeTotal");

  // ============================================================
  // 🏷️ FUNCIÓN: cargarCategorias
  // Llama al API para obtener las categorías y poblar el select de filtros.
  // ============================================================
  async function cargarCategorias() {
    try {
      const res = await fetch(`${API_BASE}/categorias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const categorias = await res.json();
      if (Array.isArray(categorias)) {
        categorias.forEach((cat) => {
          const option = document.createElement("option");
          option.value = cat.id;
          option.textContent = cat.nombre;
          selectCategoria.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Error cargando categorías:", error);
    }
  }

  // ============================================================
  // 🔧 FUNCIÓN: obtenerFiltros
  // Recopila los valores actuales de todos los filtros en un objeto.
  // Incluye el nuevo filtro de ubicación.
  // ============================================================
  function obtenerFiltros() {
    return {
      deposito: selectDeposito.value,
      categoria: selectCategoria.value,
      ordenar: selectOrdenar.value,
      direccion: selectDireccion.value,
      incluirDescripcion: chkDescripcion.checked ? "true" : "false",
      incluirConteoFisico: chkConteoFisico.checked ? "true" : "false",
      incluirUbicacion: chkUbicacion.checked ? "true" : "false", // ← ¡NUEVO!
    };
  }

  // ============================================================
  // 🔗 FUNCIÓN: buildQueryString
  // Convierte el objeto de filtros en parámetros de URL.
  // ============================================================
  function buildQueryString(filtros) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, val]) => {
      if (val !== "" && val !== undefined) params.append(key, val);
    });
    return params.toString();
  }

  // ============================================================
  // 📋 FUNCIÓN: actualizarEncabezados
  // Reconstruye los encabezados de la tabla según los checkboxes.
  // Ahora incluye la columna Ubicación si el checkbox está activo.
  // ============================================================
  function actualizarEncabezados() {
    const mostrarDesc = chkDescripcion.checked;
    const mostrarConteo = chkConteoFisico.checked;
    const mostrarUbicacion = chkUbicacion.checked; // ← ¡NUEVO!

    let html = "<tr>";
    html += "<th>Código</th>";
    html += "<th>Producto</th>";
    if (mostrarDesc) html += "<th>Descripción</th>";
    html += "<th>Categoría</th>";
    // ★ Columna de ubicación — aparece antes de precios para que sea visible sin scrollear
    if (mostrarUbicacion) html += '<th><i class="fas fa-map-marker-alt me-1 text-warning"></i>Ubicación</th>';
    html += "<th>P. Venta ($)</th>";
    html += "<th>P. Costo ($)</th>";
    html += "<th>Stock</th>";
    if (mostrarConteo) html += "<th>Conteo Físico</th>";
    html += "</tr>";

    theadInventario.innerHTML = html;
  }

  // ============================================================
  // 🔍 FUNCIÓN: consultarInventario
  // Hace la petición al API con los filtros y actualiza la tabla.
  // ============================================================
  async function consultarInventario() {
    const filtros = obtenerFiltros();
    const qs = buildQueryString({
      deposito: filtros.deposito,
      categoria: filtros.categoria,
      ordenar: filtros.ordenar,
      direccion: filtros.direccion,
    });

    actualizarEncabezados();

    tbodyInventario.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          Consultando inventario...
        </td>
      </tr>`;

    try {
      const res = await fetch(`${API_BASE}/inventario/consulta?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

      const data = await res.json();
      const productos = data.data || [];

      badgeTotal.textContent = `${productos.length} productos`;
      btnGenerarPDF.disabled = productos.length === 0;
      btnExportarExcel.disabled = productos.length === 0;

      if (productos.length === 0) {
        const colCount = 6 +
          (chkDescripcion.checked ? 1 : 0) +
          (chkConteoFisico.checked ? 1 : 0) +
          (chkUbicacion.checked ? 1 : 0);
        tbodyInventario.innerHTML = `
          <tr>
            <td colspan="${colCount}" class="text-center text-muted py-4">
              <i class="fas fa-exclamation-circle me-1"></i>No se encontraron productos con los filtros seleccionados.
            </td>
          </tr>`;
        return;
      }

      renderizarTabla(productos);
    } catch (error) {
      console.error("Error consultando inventario:", error);
      Swal.fire("Error", "No se pudo consultar el inventario.", "error");
    }
  }

  // ============================================================
  // 🖼️ FUNCIÓN: renderizarTabla
  // Dibuja cada fila de la tabla con los datos del producto.
  // Incluye la columna de ubicación con un badge visual.
  // ============================================================
  function renderizarTabla(productos) {
    const mostrarDesc = chkDescripcion.checked;
    const mostrarConteo = chkConteoFisico.checked;
    const mostrarUbicacion = chkUbicacion.checked; // ← ¡NUEVO!

    let html = "";
    productos.forEach((prod) => {
      html += "<tr>";
      html += `<td><code>${prod.codigo || ""}</code></td>`;
      html += `<td class="fw-semibold">${prod.nombre || ""}</td>`;

      if (mostrarDesc) {
        html += `<td class="text-muted small">${(prod.descripcion || "—").substring(0, 50)}</td>`;
      }

      html += `<td>${prod.nombre_categoria || '<span class="text-muted">Sin cat.</span>'}</td>`;

      // ★ Columna Ubicación con badge de color azul
      if (mostrarUbicacion) {
        const ub = prod.ubicacion;
        if (ub && ub !== "Sin ubicación") {
          html += `<td>
            <span style="background:#e8f4ff;color:#0d6efd;border:1px solid #b6d4fe;
              border-radius:4px;padding:2px 8px;font-family:monospace;font-size:0.8rem;font-weight:600;">
              <i class="fas fa-map-marker-alt me-1"></i>${ub}
            </span></td>`;
        } else {
          html += `<td><span class="text-muted small">—</span></td>`;
        }
      }

      html += `<td class="text-end">$${parseFloat(prod.precio_venta || 0).toFixed(2)}</td>`;
      html += `<td class="text-end">$${parseFloat(prod.precio_costo || 0).toFixed(2)}</td>`;

      const stock = parseInt(prod.stock_actual || 0);
      const badgeClass = stock <= 0 ? "bg-danger" : stock <= 5 ? "bg-warning text-dark" : "bg-success";
      html += `<td class="text-center"><span class="badge ${badgeClass}">${stock}</span></td>`;

      // Columna Conteo Físico: un input para que el encargado escriba lo que cuenta
      if (mostrarConteo) {
        html += `<td><input type="number" class="form-control form-control-sm" min="0" placeholder="—" style="max-width:80px;"></td>`;
      }

      html += "</tr>";
    });

    tbodyInventario.innerHTML = html;
  }

  // ============================================================
  // 📄 FUNCIÓN: generarPDF
  // Llama al endpoint del backend para generar el PDF del inventario.
  // ============================================================
  function generarPDF() {
    const filtros = obtenerFiltros();
    const qs = buildQueryString(filtros);

    fetch(`${API_BASE}/inventario/reporte-pdf?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error generando PDF");
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      })
      .catch((err) => {
        console.error("Error generando PDF:", err);
        Swal.fire("Error", "No se pudo generar el reporte PDF.", "error");
      });
  }

  // ============================================================
  // 📊 FUNCIÓN: exportarExcel
  // Descarga el inventario en formato .xlsx con los filtros activos.
  // ============================================================
  function exportarExcel() {
    const filtros = obtenerFiltros();
    const qs = buildQueryString(filtros);
    const fecha = new Date().toISOString().slice(0, 10);

    Swal.fire({
      title: "¿Exportar a Excel?",
      text: `¿Desea descargar el archivo 'inventario_${fecha}.xlsx'?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#28a745",
      confirmButtonText: "Sí, descargar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({ title: "Generando Excel...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      fetch(`${API_BASE}/inventario/exportar-excel?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Error en la descarga");
          return res.blob();
        })
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `inventario_${fecha}.xlsx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          Swal.close();
        })
        .catch((err) => {
          Swal.fire("Error", "No se pudo generar el archivo Excel.", "error");
        });
    });
  }

  // ============================================================
  // 🔗 EVENT LISTENERS
  // ============================================================
  btnConsultar.addEventListener("click", consultarInventario);
  btnGenerarPDF.addEventListener("click", generarPDF);
  btnExportarExcel.addEventListener("click", exportarExcel);

  // Si hay datos en tabla y cambia un checkbox, reconsultamos automáticamente
  const reconsultarSiHayDatos = () => {
    if (tbodyInventario.querySelector("tr td code")) consultarInventario();
    else actualizarEncabezados(); // Solo actualizamos headers si no hay datos
  };

  chkDescripcion.addEventListener("change", reconsultarSiHayDatos);
  chkConteoFisico.addEventListener("change", reconsultarSiHayDatos);
  chkUbicacion.addEventListener("change", reconsultarSiHayDatos); // ← ¡NUEVO!

  [selectDeposito, selectCategoria, selectOrdenar, selectDireccion].forEach((el) => {
    el.addEventListener("change", () => {
      if (tbodyInventario.querySelector("tr td code")) consultarInventario();
    });
  });

  // Cargamos las categorías al abrir la página
  cargarCategorias();
});
